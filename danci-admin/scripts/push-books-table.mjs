/**
 * 一键把 books 表推到 Supabase。
 *
 * 跟 drizzle-kit push 等价的极简实现：直接连库跑 SQL。
 * 这个脚本是幂等的：如果表已经存在，会跳过 CREATE，
 * 但索引不存在时会补建。
 *
 * 用法：
 *   node scripts/push-books-table.mjs
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. 请配置 .env");
  process.exit(1);
}

// 读 drizzle-kit 生成的迁移 SQL（单一事实来源，避免重复维护）
const migrationPath = resolve(
  __dirname,
  "..",
  "db",
  "migrations",
  "0003_cloudy_enchantress.sql",
);
const sqlText = readFileSync(migrationPath, "utf8");

const client = postgres(connectionString, {
  prepare: false,
  max: 1,
  ssl: "require",
});

  console.log("[books-push] Connecting to Supabase...");

try {
  // drizzle 生成的 SQL 用 --> statement-breakpoint 分隔成多个语句
  const statements = sqlText
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    console.log("[books-push] 执行:", stmt.slice(0, 60).replace(/\s+/g, " "), "...");
    // IF NOT EXISTS 让脚本幂等
    const guarded = stmt.replace(
      /^CREATE INDEX\b/i,
      "CREATE INDEX IF NOT EXISTS",
    );
    try {
      await client.unsafe(guarded);
    } catch (err) {
      const msg = String(err?.message ?? err);
      // 表已存在是幂等的，不需要当作错误
      if (msg.includes("already exists")) {
        console.log("[books-push] (已存在, 跳过)");
        continue;
      }
      throw err;
    }
  }

  console.log("[books-push] ✅ 完成。可以到 Supabase 后台 Table Editor 看到 books 表。");
} catch (err) {
  console.error("[books-push] ❌ 失败:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
