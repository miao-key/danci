/* eslint-disable */
// 应用 0001_colorful_dazzler.sql 到 Supabase（追加 status 字段）
require("dotenv/config");
const fs = require("node:fs");
const path = require("node:path");
const postgres = require("postgres");

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  // 找到最新的非 meta migration 文件
  const dir = path.join(__dirname, "..", "db", "migrations");
  const file = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .pop();
  if (!file) {
    console.error("no migration file found");
    process.exit(1);
  }
  const sqlPath = path.join(dir, file);
  const raw = fs.readFileSync(sqlPath, "utf8");
  const statements = raw
    .split(/-->\s*statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    for (const stmt of statements) {
      console.log("→", stmt.split("\n")[0].slice(0, 80));
      await sql.unsafe(stmt);
    }
    console.log("\n✓ migration applied:", file);
  } catch (err) {
    console.error("✗ failed:", err.message);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
})();
