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
 * 3. **懒初始化**：不模块顶层 throw，参见下方说明。
 *
 * 用法（业务代码中）：
 *   import { db } from "@/db";
 *   import { books } from "@/db/schema";
 *   const rows = await db.select().from(books);
 */

type PostgresClient = ReturnType<typeof postgres>;
type DrizzleDb = ReturnType<typeof drizzle>;

const globalForDb = globalThis as unknown as {
  __danciPg?: PostgresClient;
  __danciDrizzle?: DrizzleDb;
};

/**
 * 真正建连的内部函数 —— 仅在第一次调用 SQL 时触发。
 *
 * 为什么不做"模块顶层 throw"：
 *   Next.js 16 在 `Collecting page data` 阶段会静态扫所有路由模块，
 *   凡是 `import { db } from "@/db"` 的路由文件，顶层 throw 会导致
 *   **构建期**就崩（即便设置了 Vercel env，scp 缓存/编译时机也可能先于此执行）。
 *   因此我们用 Proxy 包裹 `db`，把 env 检查推迟到第一次真正执行 SQL 时。
 */
function getDb(): DrizzleDb {
  if (globalForDb.__danciDrizzle) {
    return globalForDb.__danciDrizzle;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. 请在 .env 中配置 Supabase 的连接串。",
    );
  }

  const client =
    globalForDb.__danciPg ??
    postgres(connectionString, {
      prepare: false,
      // Supabase 直连默认端口 5432；如果走 pooler 端口（6543）也兼容。
      max: 10,
      // Supabase pooler（事务模式）要求 SSL；直连也兼容。
      ssl: "require",
    });

  const db = drizzle(client);

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__danciPg = client;
    globalForDb.__danciDrizzle = db;
  }

  return db;
}

/**
 * Proxy db —— 让 `import { db } from "@/db"` 在构建期安全。
 *
 * 任何对 `db.xxx()` 的调用都会先经过 getDb()，从而触发 env 检查/建连。
 * 已建立的连接在 dev 模式下通过 globalThis 单例复用，避免 HMR 反复建连耗尽 pool。
 */
export const db = new Proxy({} as DrizzleDb, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    // 方法需绑定真实 db（防止 this 丢失）
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export type { PostgresClient, DrizzleDb };