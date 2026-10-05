/**
 * Drizzle ORM 客户端（Supabase / Postgres）
 *
 * 本文件与 danci-admin/db/index.ts 保持一致的三条约定：
 *
 *   1. globalThis 单例 —— 避免 Next.js dev HMR 反复建连耗尽 Supabase 连接池。
 *   2. prepare: false —— Supabase 走 PgBouncer 代理时必须禁用 prepared
 *      statement，否则事务模式下会报 "prepared statement already exists"。
 *   3. 懒初始化（Proxy）—— 不在模块顶层 throw。
 *
 * 为什么第 3 条重要：Next.js 在 `Collecting page data` 阶段会静态扫所有路由模块，
 * 凡是 import 本文件的路由，顶层 throw 都会导致**构建期**崩溃
 * （即使已配好 Vercel env，scp 缓存/编译时机也可能先于此执行）。
 * 用 Proxy 把 env 检查推迟到第一次真正执行 SQL 时。
 *
 * 用法：
 *   import { db } from "@/db";
 *   import { books } from "@/db/schema";
 *   const rows = await db.select().from(books);
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

type PostgresClient = ReturnType<typeof postgres>;
type DrizzleDb = ReturnType<typeof drizzle>;

const globalForDb = globalThis as unknown as {
  __danciPg?: PostgresClient;
  __danciDrizzle?: DrizzleDb;
};

/** 真正建连的内部函数 —— 仅在第一次执行 SQL 时触发。 */
function getDb(): DrizzleDb {
  if (globalForDb.__danciDrizzle) {
    return globalForDb.__danciDrizzle;
  }

  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      "POSTGRES_URL is not set. 请在 .env 中配置 Supabase 的连接串。",
    );
  }

  const client =
    globalForDb.__danciPg ??
    postgres(connectionString, {
      // PgBouncer 事务模式必需
      prepare: false,
      // Serverless 场景严格控制连接数：max 越小，池排队越快失败而不是耗尽
      max: 2,
      // lambda 闲置时立刻释放回 pool
      idle_timeout: 5,
      // 连接生命周期 <= 30s，强制回收，避免 PgBouncer session 模式锁住
      max_lifetime: 30,
      // Supabase pooler（事务模式）要求 SSL；直连也兼容
      ssl: "require",
    });

  const db = drizzle(client);

  // 关键：production 也要缓存 client。
  // 否则 Vercel 每个 lambda 冷启动都新建连接，PgBouncer session 模式很快限流。
  globalForDb.__danciPg = client;
  globalForDb.__danciDrizzle = db;

  return db;
}

/**
 * db 的 Proxy 包装 —— 让 `import { db } from "@/db"` 在构建期安全。
 *
 * 任何 `db.xxx()` 调用都会先经过 getDb()，从而触发 env 检查与建连。
 * 已建立的连接在 dev 模式下通过 globalThis 复用，避免 HMR 反复建连耗尽连接池。
 */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    // 方法需绑定真实 db，防止 this 丢失
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type { PostgresClient, DrizzleDb };
