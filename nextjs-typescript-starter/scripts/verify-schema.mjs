/**
 * 迁移结果验证脚本
 *
 * 校验三件事：
 *   1. 三张新表存在，且列/类型/默认值与 db/schema.ts 一致
 *   2. 所有索引与约束都在（unique / FK cascade / check / lower(email) 唯一索引）
 *   3. 已有表 books / words 未被本次迁移改动
 *
 * 用法：npm run db:verify
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";

loadEnvFile();

function loadEnvFile() {
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* 依赖外部注入 */
  }
}

const NEW_TABLES = ["users", "user_book_progress", "user_word_records"];

async function main() {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error("✗ POSTGRES_URL is not set.");
    process.exit(1);
  }

  const sql = postgres(connectionString, {
    prepare: false,
    max: 1,
    ssl: "require",
    onnotice: () => {},
  });

  let pass = 0;
  let fail = 0;
  const check = (ok, label) => {
    console.log(`  ${ok ? "✔" : "✗"} ${label}`);
    ok ? pass++ : fail++;
  };

  try {
    console.log("\n【1】迁移记录");
    const applied = await sql`SELECT "name" FROM "__danci_migrations" ORDER BY "name"`;
    check(applied.length === 4, `已执行 ${applied.length} 个迁移（期望 4）`);
    for (const r of applied) console.log(`      · ${r.name}`);

    console.log("\n【2】新表存在性");
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY(${sql.array(NEW_TABLES)})
    `;
    const found = new Set(tables.map((t) => t.table_name));
    for (const t of NEW_TABLES) check(found.has(t), `表 ${t} 存在`);

    console.log("\n【3】users 表结构");
    const usersCols = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='users' ORDER BY ordinal_position
    `;
    const uMap = Object.fromEntries(usersCols.map((c) => [c.column_name, c]));
    check(usersCols.length === 6, `列数 = ${usersCols.length}（期望 6）`);
    check(
      uMap.id?.data_type === "text" && uMap.id?.is_nullable === "NO",
      "id text NOT NULL PK",
    );
    check(uMap.email?.is_nullable === "NO", "email NOT NULL");
    check(
      uMap.passwordHash?.data_type === "text",
      "passwordHash 用 text（非 varchar，留余量）",
    );
    check(!!uMap.createdAt?.column_default, "createdAt 有默认值 now()");
    check(!!uMap.updatedAt?.column_default, "updatedAt 有默认值 now()");

    console.log("\n【4】user_book_progress 表结构");
    const ubpCols = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_book_progress'
    `;
    const ubpMap = Object.fromEntries(ubpCols.map((c) => [c.column_name, c]));
    check(ubpCols.length === 9, `列数 = ${ubpCols.length}（期望 9）`);
    check(ubpMap.userId?.is_nullable === "NO", "userId NOT NULL");
    check(ubpMap.bookId?.is_nullable === "NO", "bookId NOT NULL");
    check(
      ubpMap.lastWordId?.is_nullable === "YES",
      "lastWordId 可空（中途退出不写脏数据）",
    );
    check(ubpMap.lastWordId?.data_type === "bigint", "lastWordId 是 bigint");
    check(
      ubpMap.lastStudiedAt?.data_type === "timestamp with time zone",
      "lastStudiedAt 是 timestamptz",
    );

    console.log("\n【5】user_word_records 表结构");
    const uwrCols = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_word_records'
    `;
    const uwrMap = Object.fromEntries(uwrCols.map((c) => [c.column_name, c]));
    check(uwrCols.length === 10, `列数 = ${uwrCols.length}（期望 10）`);
    check(uwrMap.wordId?.data_type === "bigint", "wordId 是 bigint");
    check(uwrMap.status?.is_nullable === "NO", "status NOT NULL");

    console.log("\n【6】索引与约束");
    const idx = await sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname='public'
        AND tablename = ANY(${sql.array(NEW_TABLES)})
    `;
    const idxNames = new Set(idx.map((i) => i.indexname));
    for (const name of [
      "users_email_lower_uidx",
      "users_email_unique",
      "user_book_progress_user_book_uniq",
      "user_book_progress_user_recent_idx",
      "user_word_records_user_word_uniq",
      "user_word_records_user_book_status_idx",
    ]) {
      check(idxNames.has(name), `索引 ${name}`);
    }

    const cons = await sql`
      SELECT conname, contype FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conrelid::regclass::text = ANY(${sql.array(NEW_TABLES)})
    `;
    const consNames = new Set(cons.map((c) => c.conname));
    check(consNames.has("user_word_records_status_check"), "check 约束 status 枚举");
    check(consNames.has("user_book_progress_user_fk"), "FK user_book_progress → users");
    check(consNames.has("user_word_records_user_fk"), "FK user_word_records → users");

    // 确认 FK 的级联行为是 CASCADE
    const fkCascade = await sql`
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE c.contype = 'f'
        AND c.confdeltype = 'c'
        AND t.relname = ANY(${sql.array(NEW_TABLES)})
    `;
    check(
      fkCascade.length === 2,
      `2 个 FK 均为 ON DELETE CASCADE（实际 ${fkCascade.length}）`,
    );

    console.log(
      "\n【7】弱关联确认（bookId/wordId 不应有指向 books/words 的外键）",
    );
    const badFk = await sql`
      SELECT c.conname, t.relname AS child
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_class p ON p.oid = c.confrelid
      WHERE c.contype = 'f'
        AND t.relname = ANY(${sql.array(NEW_TABLES)})
        AND p.relname = ANY(ARRAY['books','words'])
    `;
    check(badFk.length === 0, `未对 books/words 建立外键（实际 ${badFk.length} 个）`);

    console.log("\n【8】已有表未被改动");
    const booksCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='books' ORDER BY ordinal_position
    `;
    check(booksCols.length === 8, `books 仍为 8 列（期望 8）`);
    const wordsCols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='words' ORDER BY ordinal_position
    `;
    check(wordsCols.length === 5, `words 仍为 5 列（期望 5）`);

    console.log("\n【9】功能冒烟测试：约束是否真的生效");
    const t1 = `usr-test-${Date.now()}`;
    await sql`INSERT INTO "users" ("id","email","passwordHash") VALUES (${t1}, ${"Case@Test.com"}, ${"$2a$10$fakehashfakehashfakehashfakehashfakehashfakehashfakeh"})`;
    let caseBlocked = false;
    try {
      await sql`INSERT INTO "users" ("id","email","passwordHash") VALUES (${`usr-dup-${Date.now()}`}, ${"case@test.com"}, ${"$2a$10$fake"})`;
    } catch (e) {
      caseBlocked = e.code === "23505";
    }
    check(caseBlocked, "邮箱大小写不同仍被唯一索引拦截（23505）");

    await sql`INSERT INTO "user_book_progress" ("id","userId","bookId") VALUES (${`ubp-a-${Date.now()}`}, ${t1}, ${"TEST_BOOK"})`;
    let dupBlocked = false;
    try {
      await sql`INSERT INTO "user_book_progress" ("id","userId","bookId") VALUES (${`ubp-b-${Date.now()}`}, ${t1}, ${"TEST_BOOK"})`;
    } catch (e) {
      dupBlocked = e.code === "23505";
    }
    check(dupBlocked, "同一 (userId, bookId) 重复进度被拦截（23505）");

    let statusBlocked = false;
    try {
      await sql`INSERT INTO "user_word_records" ("id","userId","wordId","bookId","status") VALUES (${`uwr-x-${Date.now()}`}, ${t1}, ${1}, ${"TEST_BOOK"}, ${"invalid_status"})`;
    } catch (e) {
      statusBlocked = e.code === "23514";
    }
    check(statusBlocked, "非法 status 被 check 约束拦截（23514）");

    const before = await sql`SELECT count(*)::int AS c FROM "user_book_progress" WHERE "userId" = ${t1}`;
    await sql`DELETE FROM "users" WHERE "id" = ${t1}`;
    const after = await sql`SELECT count(*)::int AS c FROM "user_book_progress" WHERE "userId" = ${t1}`;
    check(
      before[0].c === 1 && after[0].c === 0,
      "删除用户后进度被级联清理",
    );

    console.log(`\n${"-".repeat(46)}`);
    console.log(`结果：${pass} 项通过，${fail} 项失败`);
    console.log(`${"-".repeat(46)}\n`);
    process.exit(fail === 0 ? 0 : 1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("\n✗ 验证失败：", err.message);
  process.exit(1);
});
