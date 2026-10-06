/**
 * 单词 / 单词书只读仓储（真实数据库）。
 *
 * 与 docs/design.md 5.3 的签名一致。数据一律来自 Supabase Postgres，
 * 经 Drizzle 访问。
 *
 * ## 返回类型约定
 *
 * 所有 Date / BigInt 都在这里归一化成 string / number，
 * 避免 `JSON.stringify` 在 Server Component 边界抛错（design.md 5.2 的坑）。
 */
import { db } from '@/db';
import { books, words } from '@/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { normalizePhonetic, parseWordContent, type ParsedWord } from './word-content';

export interface BookListItem {
  bookId: string;
  title: string;
  /** 演示用描述；真实表无此列，为 null 时 UI 不渲染描述行 */
  description: string | null;
  coverUrl: string | null;
  wordCount: number;
  tags: string[];
}

export interface BookDetail extends BookListItem {}

/**
 * 学习页要用的「词卡数据」：只要 6 个标量字段。
 * **不取完整 content** —— 一本书的 content 有几百 KB（design.md 10.1）。
 */
export interface StudyCard {
  /** words.id 主键（进度表 lastWordId 存的是它） */
  wordId: string;
  /** 业务单词 ID content.word.wordId（详情页路由用） */
  bizWordId: string;
  wordRank: number;
  headWord: string;
  usphone: string | null;
  ukphone: string | null;
  /** 第一条中文释义 */
  firstTranCn: string | null;
}

/** `books.tags` 是 JSON 数组字符串，解析失败一律当空数组 */
function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

/* ========================================================================== *
 * 单词书
 * ========================================================================== */

/** 单词书列表，按 createdAt、bookId 升序 */
export async function listBookList(): Promise<BookListItem[]> {
  const rows = await db
    .select({
      bookId: books.bookId,
      title: books.title,
      coverUrl: books.coverUrl,
      wordCount: books.wordCount,
      tags: books.tags,
    })
    .from(books)
    .orderBy(asc(books.createdAt), asc(books.bookId));

  return rows.map((r) => ({
    bookId: r.bookId,
    title: r.title ?? r.bookId,
    description: null,
    coverUrl: r.coverUrl,
    wordCount: r.wordCount ?? 0,
    tags: parseTags(r.tags),
  }));
}

/** 单本书；不存在返回 null */
export async function findBook(bookId: string): Promise<BookDetail | null> {
  const rows = await db.select().from(books).where(eq(books.bookId, bookId)).limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    bookId: r.bookId,
    title: r.title ?? r.bookId,
    description: null,
    coverUrl: r.coverUrl,
    wordCount: r.wordCount ?? 0,
    tags: parseTags(r.tags),
  };
}

/* ========================================================================== *
 * 单词
 * ========================================================================== */

/**
 * 取学习页的词卡列表。
 *
 * @param afterRank 只取 wordRank > afterRank 的单词。
 *                  需求「从最近学习的单词的**下一个**开始」就是靠这个参数
 *                  在 SQL 层实现的，不必把整本书载入内存（design.md 3.3 要点 2）。
 *                  传 0 表示从头开始。
 */
export async function listStudyCards(
  bookId: string,
  afterRank = 0,
  limit = 200,
): Promise<StudyCard[]> {
  // `#>>` 对 json / jsonb 都有效，作用在按 bookId 过滤后的行上性能没问题
  // （design.md 10.2：json 建不了 GIN 索引，所以只做等值查询）。
  const rows = (await db.execute(sql`
    SELECT
      "id"::text                                   AS "wordId",
      "content"#>>'{word,wordId}'                 AS "bizWordId",
      "wordRank"                                  AS "wordRank",
      "headWord"                                  AS "headWord",
      "content"#>>'{word,content,usphone}'        AS "usphone",
      "content"#>>'{word,content,ukphone}'        AS "ukphone",
      "content"#>>'{word,content,trans,0,tranCn}' AS "firstTranCn"
    FROM "words"
    WHERE "bookId" = ${bookId}
      AND "wordRank" > ${afterRank}
    ORDER BY "wordRank" ASC
    LIMIT ${limit}
  `)) as unknown as {
    wordId: string;
    bizWordId: string | null;
    wordRank: number;
    headWord: string | null;
    usphone: string | null;
    ukphone: string | null;
    firstTranCn: string | null;
  }[];

  return rows.map((r) => ({
    wordId: String(r.wordId),
    bizWordId: r.bizWordId ?? String(r.wordId),
    wordRank: Number(r.wordRank),
    headWord: r.headWord ?? r.bizWordId ?? '',
    // 音标同样要规范化：SQL 层原样取出的 `'`、`,`、`;` 直接渲染会很脏。
    // 详见 lib/word-content.ts 的 normalizePhonetic 注释（别 strip 掉重音符）。
    usphone: normalizePhonetic(r.usphone),
    ukphone: normalizePhonetic(r.ukphone),
    firstTranCn: r.firstTranCn,
  }));
}

/**
 * 统计某本书**实际**的单词数。
 *
 * ## 为什么不能只信 books.wordCount
 *
 * `books.wordCount` 是后台维护的冗余字段，可能与 `words` 表实际行数不一致
 * （漏导入、删书残留、手工改过）。学习页要据此判断「是不是真的学完了」，
 * 一旦冗余值偏大就会出现「词已学完但仍有剩余」或反之的空状态，
 * 所以这里以 `words` 表的 count(*) 为准。
 */
export async function countWordsInBook(bookId: string): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT count(*)::text AS value FROM "words" WHERE "bookId" = ${bookId}
  `)) as unknown as { value: string }[];
  return Number(rows[0]?.value ?? 0);
}

/**
 * 单词详情：按业务 wordId 查完整 content。
 *
 * ⚠️ 路由里的 `[wordId]` 用的是**业务 ID**（content.word.wordId，如
 *    "PEPXiaoXue6_1_1"），不是 words.id 主键 —— 因为详情页链接从学习页的
 *    词卡直接拼出来，业务 ID 更可读且跨库稳定。
 *    因为 content 是 `json` 建不了索引，只能先按 bookId 拉出该书
 *    的 (id, bizWordId) 再在内存里过滤（design.md 5.3 的注意事项）。
 */
export async function findWordDetail(
  bookId: string,
  wordId: string,
): Promise<{
  wordId: string;
  wordRank: number;
  headWord: string;
  word: ParsedWord;
} | null> {
  const toResult = (row: {
    wordRank: number | null;
    headWord: string | null;
    content: unknown;
  }) => {
    const parsed = parseWordContent(row.content, row.headWord);
    if (!parsed) return null;
    return {
      wordId: parsed.wordId,
      wordRank: row.wordRank ?? 0,
      headWord: parsed.wordHead,
      word: parsed,
    };
  };

  // 允许用 words.id 主键直接命中，省一次全表扫
  if (/^\d+$/.test(wordId)) {
    const rows = await db
      .select()
      .from(words)
      .where(and(eq(words.bookId, bookId), eq(words.id, Number(wordId))))
      .limit(1);
    return rows[0] ? toResult(rows[0]) : null;
  }

  const rows = await db
    .select({
      wordRank: words.wordRank,
      headWord: words.headWord,
      content: words.content,
    })
    .from(words)
    .where(eq(words.bookId, bookId));

  for (const row of rows) {
    const parsed = parseWordContent(row.content, row.headWord);
    if (parsed?.wordId === wordId) return toResult(row);
  }
  return null;
}
