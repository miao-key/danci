/**
 * 学习进度仓储（`user_book_progress` + `user_word_records`）。
 *
 * 与 docs/design.md 5.2 的签名一致，数据来自 Supabase Postgres。
 *
 * ## 三个设计要点（在 db/schema.ts 注释里有对应，此处复述以便对照）
 *
 * 1. **bookId 不加外键**（与 danci-admin 一致）：后台删书时不会连带清空用户
 *    学习记录。代价是可能产生"孤儿进度"，所以查询一律用 LEFT JOIN，
 *    `title` 为 null 的行由调用方决定是否展示（前端不展示）。
 * 2. **lastWordRank 冗余**：学习页需要"从上次单词的**下一个**开始"，
 *    有 rank 就能直接 `WHERE wordRank > ?`，不必把整本书载入内存。
 * 3. **bigint 序列化**：words.id 是 bigint，这里统一转 string 再出仓储层。
 */
import { db } from '@/db';
import { books, userBookProgress, userWordRecords } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';

export interface ProgressWithBook {
  bookId: string;
  title: string | null;
  coverUrl: string | null;
  wordCount: number;
  /** words.id 主键 */
  lastWordId: string | null;
  lastWordRank: number | null;
  lastStudiedAt: string;
  learnedCount: number;
}

/**
 * 「最近学习」：取最近学过的 1 本书。
 *
 * LEFT JOIN books —— 书被后台删掉时 title 为 null，
 * 调用方（首页）应把这种行当"无数据"处理。
 */
export async function getRecentProgress(
  userId: string,
): Promise<ProgressWithBook | null> {
  const all = await listProgress(userId);
  return all[0] ?? null;
}

/** 「我的」页的学习进度列表，按最近学习时间倒序 */
export async function listProgress(
  userId: string,
): Promise<ProgressWithBook[]> {
  const rows = await db
    .select({
      bookId: userBookProgress.bookId,
      lastWordId: userBookProgress.lastWordId,
      lastWordRank: userBookProgress.lastWordRank,
      lastStudiedAt: userBookProgress.lastStudiedAt,
      learnedCount: userBookProgress.learnedCount,
      title: books.title,
      coverUrl: books.coverUrl,
      wordCount: books.wordCount,
    })
    .from(userBookProgress)
    .leftJoin(books, eq(books.bookId, userBookProgress.bookId))
    .where(eq(userBookProgress.userId, userId))
    .orderBy(desc(userBookProgress.lastStudiedAt));

  return rows.map((r) => ({
    bookId: r.bookId,
    title: r.title,
    coverUrl: r.coverUrl,
    wordCount: r.wordCount ?? 0,
    lastWordId: r.lastWordId === null ? null : String(r.lastWordId),
    lastWordRank: r.lastWordRank,
    lastStudiedAt:
      r.lastStudiedAt instanceof Date
        ? r.lastStudiedAt.toISOString()
        : String(r.lastStudiedAt),
    learnedCount: r.learnedCount,
  }));
}

/** 查某本书的进度；没有则 null（= 从头开始学） */
export async function findProgress(
  userId: string,
  bookId: string,
): Promise<{
  lastWordId: string | null;
  lastWordRank: number | null;
  lastStudiedAt: string;
  learnedCount: number;
} | null> {
  const all = await listProgress(userId);
  return all.find((p) => p.bookId === bookId) ?? null;
}

/**
 * 写回进度（upsert）。点「下一个」和「完成本课」都会调用。
 * 依赖 (userId, bookId) 唯一约束做冲突合并。
 *
 * learnedCount 一律**从明细表实时聚合**写入，不沿用旧值。
 * 原因：学习页的调用顺序是「先 N 次 touchWordRecord，最后一次 saveProgress」
 * （见 components/word-card.tsx），若 saveProgress 沿用旧值，
 * 首次学习时新插入的行会带着 learnedCount=0，把已学单词数清零。
 */
export async function saveProgress(input: {
  userId: string;
  bookId: string;
  /** words.id 主键（字符串形式） */
  lastWordId: string;
  lastWordRank: number | null;
}): Promise<void> {
  const now = new Date();
  const lastWordId = Number(input.lastWordId);
  const learnedCount = await countStudiedInBook(input.userId, input.bookId);

  await db
    .insert(userBookProgress)
    .values({
      id: `ubp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId,
      bookId: input.bookId,
      lastWordId,
      lastWordRank: input.lastWordRank,
      learnedCount,
      lastStudiedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userBookProgress.userId, userBookProgress.bookId],
      set: {
        lastWordId,
        lastWordRank: input.lastWordRank,
        learnedCount,
        lastStudiedAt: now,
        updatedAt: now,
      },
    });
}

/**
 * 记录单词明细。v1 每次点「下一个」调一次。
 *
 * 学完之后同步刷新 user_book_progress.learnedCount ——
 * 这是「已学 X / Y」和首页「最近学习」文案的唯一数据来源
 * （design.md 3.4 明确指出这一点）。
 */
export async function touchWordRecord(input: {
  userId: string;
  /** words.id 主键 */
  wordId: string;
  bookId: string;
  wordRank: number | null;
}): Promise<void> {
  const now = new Date();
  const wordId = Number(input.wordId);

  await db
    .insert(userWordRecords)
    .values({
      id: `uwr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      userId: input.userId,
      wordId,
      bookId: input.bookId,
      wordRank: input.wordRank,
      status: 'learning',
      studyCount: 1,
      lastStudiedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userWordRecords.userId, userWordRecords.wordId],
      set: {
        studyCount: sql`${userWordRecords.studyCount} + 1`,
        lastStudiedAt: now,
        updatedAt: now,
      },
    });

  // learnedCount 统一由 saveProgress 聚合写入（见该函数注释），
  // 这里不单独 UPDATE，避免与 saveProgress 的写入顺序耦合。
}

/** 统计某本书的已学单词数（用于「已学 X / Y」） */
export async function countStudiedInBook(
  userId: string,
  bookId: string,
): Promise<number> {
  const rows = (await db.execute(sql`
    SELECT count(*)::text AS value FROM "user_word_records"
    WHERE "userId" = ${userId} AND "bookId" = ${bookId}
  `)) as unknown as { value: string }[];
  return Number(rows[0]?.value ?? 0);
}
