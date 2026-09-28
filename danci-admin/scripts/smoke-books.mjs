/**
 * 直接用 postgres-js 跑一遍 books CRUD 的 SQL 流程，
 * 验证：表结构 + unique 约束 + 索引 + 字段读写都正常。
 *
 * 用法：node scripts/smoke-books.mjs
 */
import "dotenv/config";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = postgres(connectionString, { prepare: false, max: 1, ssl: "require" });

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log("  ✅", msg);
  } else {
    fail++;
    console.log("  ❌", msg);
  }
}

async function main() {
  console.log("[smoke-books] connected");

  // 用一个独特的 bookId 防止和历史数据冲突
  const TEST_BOOK_ID = `__smoke_${Date.now().toString(36)}__`;
  const TEST_ID = `book-smoke-${Date.now().toString(36)}`;

  try {
    console.log("\n=== 1. INSERT ===");
    await sql`
      INSERT INTO books (id, title, "wordCount", "coverUrl", "bookId", tags, "createdAt", "updatedAt")
      VALUES (
        ${TEST_ID},
        ${"Smoke Test Book"},
        ${42},
        ${"https://example.com/cover.jpg"},
        ${TEST_BOOK_ID},
        ${JSON.stringify(["smoke", "test"])},
        now(),
        now()
      )
    `;
    ok(true, "插入成功");

    console.log("\n=== 2. SELECT ===");
    const rows = await sql`SELECT * FROM books WHERE id = ${TEST_ID}`;
    ok(rows.length === 1, "查询到 1 行");
    ok(rows[0].title === "Smoke Test Book", "title 正确");
    ok(rows[0].wordCount === 42, "wordCount 正确");
    ok(rows[0].bookId === TEST_BOOK_ID, "bookId 正确");
    ok(rows[0].coverUrl === "https://example.com/cover.jpg", "coverUrl 正确");
    ok(rows[0].tags === '["smoke","test"]', "tags 是 JSON 字符串");

    console.log("\n=== 3. UPDATE ===");
    await sql`
      UPDATE books
      SET title = ${"Smoke Test Book v2"}, "wordCount" = ${100}, "updatedAt" = now()
      WHERE id = ${TEST_ID}
    `;
    const updated = await sql`SELECT * FROM books WHERE id = ${TEST_ID}`;
    ok(updated[0].title === "Smoke Test Book v2", "title 已更新");
    ok(updated[0].wordCount === 100, "wordCount 已更新");
    ok(updated[0].bookId === TEST_BOOK_ID, "bookId 不变");

    console.log("\n=== 4. UNIQUE 约束 ===");
    try {
      await sql`
        INSERT INTO books (id, "bookId", "createdAt", "updatedAt")
        VALUES (${"book-dup-" + Date.now()}, ${TEST_BOOK_ID}, now(), now())
      `;
      ok(false, "应当报 unique 冲突");
    } catch (err) {
      const msg = String(err.message);
      ok(msg.includes("books_bookId_unique") || msg.includes("duplicate key"), "报 unique 冲突: " + msg.slice(0, 80));
    }

    console.log("\n=== 5. 关联 words 表查询（bookId 软关联）===");
    // 验证 words 表里已有 CET4_2 / PEPXiaoXue6_1 数据，可通过 bookId 关联
    const cet4Count = await sql`
      SELECT count(*)::int AS n FROM words WHERE "bookId" = 'CET4_2'
    `;
    ok(cet4Count[0].n > 0, `CET4_2 在 words 表里有 ${cet4Count[0].n} 条数据`);

    const pepCount = await sql`
      SELECT count(*)::int AS n FROM words WHERE "bookId" = 'PEPXiaoXue6_1'
    `;
    ok(pepCount[0].n > 0, `PEPXiaoXue6_1 在 words 表里有 ${pepCount[0].n} 条数据`);

    console.log("\n=== 6. DELETE ===");
    const deleted = await sql`DELETE FROM books WHERE id = ${TEST_ID} RETURNING id`;
    ok(deleted.length === 1, "删除成功");
  } finally {
    await sql.end();
  }

  console.log(`\n=== 结果: ${pass} passed, ${fail} failed ===`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("crashed:", e);
  process.exitCode = 1;
});
