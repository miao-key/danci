import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Drizzle ORM 客户端（Supabase / Postgres）
 *
 * 按 README 第 71-74 行约定：db/index.ts 负责数据库配置、链接并返回 db 操作句柄。
 *
 * 关键约定：
 * 1. globalThis 单例：避免 Next.js dev HMR 反复创建连接耗尽 Supabase 连接池。
 * 2. `prepare: false`：Supabase 通过 PgBouncer 代理时，禁用 prepared statement，
 *    避免事务模式下 "prepared statement already exists" 类错误。
 *    若你直连（无 pgbouncer），可以把这行注释掉。
 *
 * 用法（业务代码中）：
 *   import { db } from "@/db";
 *   import { wordBooks } from "@/db/schema";
 *   const rows = await db.select().from(wordBooks);
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. 请在 .env 中配置 Supabase 的连接串。",
  );
}

type PostgresClient = ReturnType<typeof postgres>;
type DrizzleDb = ReturnType<typeof drizzle>;

const globalForDb = globalThis as unknown as {
  __danciPg?: PostgresClient;
  __danciDrizzle?: DrizzleDb;
};

const client =
  globalForDb.__danciPg ??
  postgres(connectionString, {
    prepare: false,
    // Supabase 直连默认端口 5432；如果走 pooler 端口（6543）也兼容。
    max: 10,
    // Supabase pooler（事务模式）要求 SSL；直连也兼容。
    ssl: "require",
  });

const db = globalForDb.__danciDrizzle ?? drizzle(client);

if (process.env.NODE_ENV !== "production") {
  globalForDb.__danciPg = client;
  globalForDb.__danciDrizzle = db;
}

export { db };
export type { PostgresClient, DrizzleDb };
