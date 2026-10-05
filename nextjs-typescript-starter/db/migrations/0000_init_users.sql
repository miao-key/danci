-- 0000_init_users.sql
--
-- C 端用户表
--
-- 为什么不复用旧的 "User" 表：
--   1. 表名 "User" 在 Postgres 会被小写成 user，语义混淆；
--   2. 旧表 email 没有 unique 约束，并发注册会产生重复账号；
--   3. 旧表 password 是 VARCHAR(64)，bcrypt hash 恰好 60 字符，零余量；
--   4. 旧表缺少 createdAt / updatedAt 审计字段。
--
-- 本迁移是幂等的：重复执行不会报错，也不会丢数据。
-- 旧表数据搬迁见 0003_migrate_legacy_user.sql。

CREATE TABLE IF NOT EXISTS "users" (
  "id" text PRIMARY KEY,
  "email" text NOT NULL,
  "passwordHash" text NOT NULL,
  "displayName" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

-- 邮箱精确唯一（表级约束）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_email_unique' AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE ("email");
  END IF;
END
$$;

-- 邮箱大小写不敏感唯一：防止 "A@x.com" 与 "a@x.com" 注册成两个账号
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_uidx"
  ON "users" (lower("email"));
