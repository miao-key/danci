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
import { db, getSql } from '@/db';
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
 * 完成本课：把**最后一个单词**记入明细，并写回进度。
 *
 * ## 为什么单独抽一个函数（修复「最后一个词永远不写明细」的 Bug）
 *
 * 原先学习页的「完成本课」只调 `saveProgress`，没调 `touchWordRecord`，
 * 于是每学完一课，`user_word_records` 就**永远少最后一条**。而
 * `saveProgress` 的 learnedCount 是从明细表实时聚合的，所以：
 *   - 「已学 X / Y」的 X 永远等于实际学的词数 - 1；
 *   - 整本书的最后一个词在任何时候都没有学习记录。
 *
 * 两者必须**放在同一个事务**里：若 touch 成功而 save 失败，明细会多出一条；
 * 反之则进度里的 lastWordId 指向一个没有明细的词。
 */
export async function finishLesson(input: {
  userId: string;
  bookId: string;
  /** words.id 主键（字符串形式） */
  lastWordId: string;
  lastWordRank: number | null;
}): Promise<void> {
  const wordId = Number(input.lastWordId);
  const now = new Date();
  const uwrId = `uwr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const ubpId = `ubp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const sqlClient = getSql();

  // 三步走事务（sql.begin 走专属连接，绕开 Drizzle 0.29 + max>1 的
  // UNSAFE_TRANSACTION 限制）：
  //   1) upsert user_word_records
  //   2) upsert user_book_progress，learnedCount 用子查询在 DO UPDATE 里
  //      实时聚合（不另发一次 count(*) round-trip）。
  await sqlClient.begin((txSql) => [
    txSql`
      INSERT INTO "user_word_records" (
        "id", "userId", "wordId", "bookId", "wordRank", "status",
        "studyCount", "lastStudiedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${uwrId}, ${input.userId}, ${wordId}, ${input.bookId}, ${input.lastWordRank},
        'learning', 1, ${now}, ${now}, ${now}
      )
      ON CONFLICT ("userId", "wordId") DO UPDATE SET
        "studyCount" = "user_word_records"."studyCount" + 1,
        "lastStudiedAt" = EXCLUDED."lastStudiedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `,
    txSql`
      INSERT INTO "user_book_progress" (
        "id", "userId", "bookId", "lastWordId", "lastWordRank",
        "learnedCount", "lastStudiedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${ubpId}, ${input.userId}, ${input.bookId}, ${wordId}, ${input.lastWordRank},
        0, ${now}, ${now}, ${now}
      )
      ON CONFLICT ("userId", "bookId") DO UPDATE SET
        "lastWordId" = EXCLUDED."lastWordId",
        "lastWordRank" = EXCLUDED."lastWordRank",
        "learnedCount" = (SELECT count(*)::text::int FROM "user_word_records"
                          WHERE "userId" = ${input.userId} AND "bookId" = ${input.bookId}),
        "lastStudiedAt" = EXCLUDED."lastStudiedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `,
  ]);
}

/**
 * 记录单词明细，并同步刷新 user_book_progress。
 *
 * v1 每次点「下一个」调一次。
 *
 * ## 为什么同步写 user_book_progress（修复「中途不更新 lastWordRank」Bug）
 *
 * 原实现只 upsert `user_word_records`，`user_book_progress` 只在
 * 「完成本课」时才更新。但一本 3739 词的书（如 CET4_2）用户几乎
 * 不会一次学完，期间重新进入学习页时：
 *   - `fromLast` 读 `lastWordRank` → 仍是 0
 *   - `listStudyCards(afterRank=0)` → 又从第 1 个开始
 * 即使用户已经学到第 200 个，「查看详情 → 返回」或「退出单词书 → 重进」
 * 之后都会回到第 1 个。
 *
 * 修法：「下一个」时把 `lastWordId/lastWordRank/lastStudiedAt/learnedCount`
 * 一起 upsert。`learnedCount` 仍从明细表实时聚合（不沿用旧值，理由同 saveProgress）。
 *
 * ## 为什么用 `sql.begin()` 而非 `db.transaction()`（UNSAFE_TRANSACTION 修复）
 *
 * postgres-js 3.4.x 的 `db.transaction()`（Drizzle 0.29 包装）会间接触发
 * `UNSAFE_TRANSACTION: Only use sql.begin, sql.reserved or max: 1` 拦截。
 * 根因是 Drizzle 0.29 的事务路径不持有 pg 驱动的 reserved connection，
 * 详见 https://github.com/porsager/postgres/issues/823 #1189 #1218。
 *
 * 直走 `sql.begin()` 拿事务专属 Sql 实例，所有语句都在同一条连接上，
 * 绕开驱动层的安全检查。配合 `db/index.ts` 里 `max_pipeline: 1` 一起
 * 解决（不能用 0 —— `execute()` 末尾的 `&& sent.length < max_pipeline`
 * 会让 `onexecute` 短路跳过，BEGIN 跑到未 reserved 的连接上）。
 *
 * ## 「第 0 个」风险（早期误改引入）
 *
 * 直接 `lastWordRank = input.wordRank` 看似简单，但若上游误传
 * `wordRank=0`（甚至 null），就会在首页出现「上次学到：第 0 个单词」。
 * 所以这里把 0/null 视为「未知」，**不创建进度行**；这是与原
 * `touchWordRecord 不应凭空建 book 进度行` 测试用例的延续 —— 只是
 * 现在能写时一定写的是「该单词已学」的合法 rank，不再是 0。
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
  const uwrId = `uwr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  // 学习页词卡 wordRank 从 1 开始；0/null 视为上游漏传，不写进度行
  const safeRank =
    typeof input.wordRank === 'number' && input.wordRank > 0
      ? input.wordRank
      : null;

  const sqlClient = getSql();

  if (safeRank === null) {
    // 仍然记明细（保持旧行为：明细永远写），但跳过进度行
    // 单条 upsert 走事务也行，但为了不引入多余的 BEGIN/COMMIT，
    // 这里用普通 sql（无事务）；失败的影响只限于这条记录。
    await sqlClient`
      INSERT INTO "user_word_records" (
        "id", "userId", "wordId", "bookId", "wordRank", "status",
        "studyCount", "lastStudiedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${uwrId}, ${input.userId}, ${wordId}, ${input.bookId}, ${input.wordRank},
        'learning', 1, ${now}, ${now}, ${now}
      )
      ON CONFLICT ("userId", "wordId") DO UPDATE SET
        "studyCount" = "user_word_records"."studyCount" + 1,
        "lastStudiedAt" = EXCLUDED."lastStudiedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
    return;
  }

  const ubpId = `ubp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // learnedCount 用子查询在 DO UPDATE 里自算（不另发一次 count(*) round-trip）。
  // 走 sql.begin() 而非 db.transaction()，绕开 Drizzle 0.29 + pg 驱动的
  // UNSAFE_TRANSACTION 拦截。
  await sqlClient.begin((txSql) => [
    txSql`
      INSERT INTO "user_word_records" (
        "id", "userId", "wordId", "bookId", "wordRank", "status",
        "studyCount", "lastStudiedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${uwrId}, ${input.userId}, ${wordId}, ${input.bookId}, ${safeRank},
        'learning', 1, ${now}, ${now}, ${now}
      )
      ON CONFLICT ("userId", "wordId") DO UPDATE SET
        "studyCount" = "user_word_records"."studyCount" + 1,
        "lastStudiedAt" = EXCLUDED."lastStudiedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `,
    txSql`
      INSERT INTO "user_book_progress" (
        "id", "userId", "bookId", "lastWordId", "lastWordRank",
        "learnedCount", "lastStudiedAt", "createdAt", "updatedAt"
      ) VALUES (
        ${ubpId}, ${input.userId}, ${input.bookId}, ${wordId}, ${safeRank},
        0, ${now}, ${now}, ${now}
      )
      ON CONFLICT ("userId", "bookId") DO UPDATE SET
        "lastWordId" = EXCLUDED."lastWordId",
        "lastWordRank" = EXCLUDED."lastWordRank",
        "learnedCount" = (SELECT count(*)::text::int FROM "user_word_records"
                          WHERE "userId" = ${input.userId} AND "bookId" = ${input.bookId}),
        "lastStudiedAt" = EXCLUDED."lastStudiedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `,
  ]);
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
