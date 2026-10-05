-- 0003_migrate_legacy_user.sql
--
-- 一次性数据搬迁：旧 "User" 表 → 新 "users" 表
--
-- ⚠️ 本文件**不会**删除旧表。删除必须人工确认后手工执行：
--
--     DROP TABLE IF EXISTS "User";
--
-- 本迁移是**条件执行**的：若旧表 "User" 不存在（例如全新环境，
-- 或旧表已被清理），整段搬迁会安全跳过并记为已完成，不报错。
--
-- 搬迁前请先自查（期望 0 行，即无大小写重复邮箱）：
--
--     SELECT lower(email) AS e, count(*)
--     FROM "User" WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
--
-- 搬迁后校验行数一致：
--
--     SELECT (SELECT count(*) FROM "User")  AS old_cnt,
--            (SELECT count(*) FROM "users") AS new_cnt;
--
-- 搬迁前务必确认旧表的 password 列确实是 bcrypt hash（以 $2a$ / $2b$ / $2y$ 开头），
-- 新系统沿用 bcrypt 校验，因此可原样搬运；若旧数据是明文或其他算法，需先转换策略。

DO $$
BEGIN
  IF to_regclass('public."User"') IS NULL THEN
    RAISE NOTICE '旧表 "User" 不存在，跳过数据搬迁。';
    RETURN;
  END IF;

  INSERT INTO "users" ("id", "email", "passwordHash", "displayName", "createdAt", "updatedAt")
  SELECT
    'usr-' || u.id::text                                        AS "id",
    lower(u.email)                                                AS "email",
    u.password                                                   AS "passwordHash",
    NULL                                                          AS "displayName",
    now()                                                         AS "createdAt",
    now()                                                         AS "updatedAt"
  FROM "User" u
  WHERE u.email IS NOT NULL
    AND u.password IS NOT NULL
    -- 幂等：目标表已有同邮箱（不区分大小写）则跳过
    AND NOT EXISTS (
      SELECT 1 FROM "users" t WHERE lower(t.email) = lower(u.email)
    );

  RAISE NOTICE '已从旧表 "User" 搬迁数据到 users。';
END
$$;
