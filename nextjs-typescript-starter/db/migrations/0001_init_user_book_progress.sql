-- 0001_init_user_book_progress.sql
--
-- 用户 × 单词书 的学习进度
--
-- 支撑两个功能：
--   - 首页「最近学习」：按 lastStudiedAt 倒序取第一条
--   - 我的页「学习进度」：列出该用户所有进度行
--
-- 设计要点：
--   1. "bookId" **不加外键**（与 danci-admin 的既有决策一致）。
--      加 CASCADE 会在后台删书时连带清空用户学习记录；
--      不加 CASCADE 又可能因历史脏数据导致删书失败。
--      保持弱关联 —— 删书后进度行成为孤儿数据，
--      前端用 LEFT JOIN 查到书名为 null 时不展示即可。
--   2. "lastWordRank" 冗余：学习页要"从上次单词的**下一个**开始"，
--      有 rank 就能直接 WHERE wordRank > ?，不必载入整本书再线性查找。
--   3. "lastWordId" 可空：用户点进学习页又退出时，不必写脏进度。

CREATE TABLE IF NOT EXISTS "user_book_progress" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "bookId" text NOT NULL,
  "lastWordId" bigint,
  "lastWordRank" integer,
  "lastStudiedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "learnedCount" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,

  -- 同一用户同一本书只允许一条进度（upsert 的冲突目标）
  CONSTRAINT "user_book_progress_user_book_uniq" UNIQUE ("userId", "bookId"),

  -- 用户注销时级联清理进度
  CONSTRAINT "user_book_progress_user_fk"
    FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
);

-- 支撑「最近学习」：WHERE "userId" = ? ORDER BY "lastStudiedAt" DESC LIMIT 1
CREATE INDEX IF NOT EXISTS "user_book_progress_user_recent_idx"
  ON "user_book_progress" ("userId", "lastStudiedAt");
