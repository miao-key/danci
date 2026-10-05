import { defineConfig } from "drizzle-kit";
import "dotenv/config";

/**
 * drizzle-kit 配置
 *
 * 注意两点：
 *
 * 1. 环境变量名：本项目沿用 starter 的 POSTGRES_URL，
 *    而 danci-admin 用的是 DATABASE_URL。两者指向同一个 Supabase 库，但变量名不同，
 *    迁移脚本请以本文件的 POSTGRES_URL 为准。
 *
 * 2. driver 字段必填：drizzle-kit@0.20 的 defineConfig 是**判别联合类型**，
 *    Postgres 分支要求 `driver: "pg"`，此时 dbCredentials 接收 `connectionString`。
 *    漏掉 driver 时 TS 会误推断到 SQLite 分支并报
 *    "'url' does not exist in type '{ wranglerConfigPath, dbName }'"。
 *
 * 版本对照：admin 用的是 drizzle-kit@0.31（命令名无 :pg 后缀、且不需要 driver），
 * 本项目是 0.20，命令名带 :pg 后缀。升级到 0.31+ 时本文件需同步调整。
 */
const databaseUrl = process.env.POSTGRES_URL;
if (!databaseUrl) {
  throw new Error(
    "POSTGRES_URL is not set. 请在 .env 中配置 Supabase 的连接串，例如：\n" +
      'POSTGRES_URL="postgresql://postgres.<ref>:<password>@<ref>.pooler.supabase.com:6543/postgres"',
  );
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  // driver: "pg" 已隐含 dialect: "postgresql"，两者同时写会报 TS2353
  driver: "pg",
  dbCredentials: {
    connectionString: databaseUrl,
  },
});
