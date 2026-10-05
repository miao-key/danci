-- 0002_init_user_word_records.sql
--
-- 用户 × 单词 的学习明细
--
-- v1 需求只要求"记住学到哪"，本表不是必需的；
-- 但它是以下能力的**唯一数据来源**：
--   - 我的页「已学 X / Y」进度百分比
--   - v2 间隔重复算法（SRS）所需的复习历史
-- 现在建表的成本远低于以后补建 —— 历史数据无法回溯。
--
-- "status" 语义（v1 全部写 'learning'，为 SRS 预留）：
--   learning — 学习中 / 刚接触
--   known    — 已掌握（v2 由 SRS 或用户标记写入）
--   unknown  — 不认识（v2 预留）
--
-- "bookId" 冗余：统计"某本书已学多少词"时一次索引扫描即可，无需 join words。
-- "wordId" 是弱关联（不加外键到 words），理由同 user_book_progress.bookId。

CREATE TABLE IF NOT EXISTS "user_word_records" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "wordId" bigint NOT NULL,
  "bookId" text NOT NULL,
  "wordRank" integer,
  "status" text DEFAULT 'learning' NOT NULL,
  "studyCount" integer DEFAULT 1 NOT NULL,
  "lastStudiedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,

  -- 同一用户同一单词只一条记录（upsert 的冲突目标）
  CONSTRAINT "user_word_records_user_word_uniq" UNIQUE ("userId", "wordId"),

  -- 约束 status 取值范围，避免脏数据进入 SRS 统计
  CONSTRAINT "user_word_records_status_check"
    CHECK ("status" IN ('learning', 'known', 'unknown')),

  -- 用户注销时级联清理明细
  CONSTRAINT "user_word_records_user_fk"
    FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE
);

-- 支撑按书统计：WHERE "userId" = ? AND "bookId" = ? GROUP BY "status"
CREATE INDEX IF NOT EXISTS "user_word_records_user_book_status_idx"
  ON "user_word_records" ("userId", "bookId", "status");
