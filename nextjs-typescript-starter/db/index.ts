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
      // PgBouncer / Supavisor 事务模式必需
      prepare: false,
      // dev + serverless 兼容：dev 并发少，serverless 多了会快速 fail-fast。
      // 2 太紧、跟浏览器 long-poll 撞就 Connection closed。
      max: 4,
      // 浏览器发呆 & RSC 流式响应时不要被服务端掐 socket
      idle_timeout: 20,
      // 长查询保护：60s 远小于 Neon free 池的 socket 闲置上限
      max_lifetime: 60,
      // Supabase pooler（事务模式）要求 SSL；直连也兼容
      ssl: "require",
      // 握手兜底 + TCP keepalive，防中间 NLB 5min RST
      connection: {
        connect_timeout: 10,
        keepAlive: true,
        // 客户端 driver 的 statement_timeout: 0 只是让 postgres-js 不发
        // startup `SET statement_timeout = 0` —— Supavisor 事务模式**拒绝**
        // 这种 session 级语句（事务模式下每个事务是独立会话），driver 的设
        // 置会被丢弃，落到 Supabase 角色自带的默认值（`postgres` 角色 2min、
        // `authenticator` 8s、`anon/authenticated` 更短）。
        // 冷启动首请求超时的根因：Next dev 编译 + 建连 + middleware + SQL 累计
        // 超过默认 10s。改后：
        //   1) 在 Supabase SQL Editor 跑一次：
        //        alter role postgres set statement_timeout = '60s';
        //      （或用 session 模式端口 5432 直连，绕过 pooler）
        //   2) 或单独把 `authenticator` 角色调长。
        // 这里只让字段置 0、注释说清意图，实际生效靠上述 1)。
        statement_timeout: 0,
      },
      onnotice: () => {},
      // 【修复】关掉 postgres-js 默认的 pipelining（max_pipeline: 100）。
      // Supavisor 事务模式会在两次 pipeline 之间把后端连接换走，导致
      // 「promise 卡死 / 收不到响应」「Connection closed」。这是已知上游
      // 冲突，Supabase 文档对 postgres-js 的明确建议。
      // 性能上无损失：dev 并发低，PgBouncer 自身已做连接多路复用。
      // 不用 0：postgres-js 3.4.9 的 execute() 在 max_pipeline:0 时会
      // 短路跳过 onexecute，导致 sql.begin() 抛 UNSAFE_TRANSACTION
      // （https://github.com/porsager/postgres/issues/823 #1189 #1218），
      // 1 已经能消除 Supavisor 副作用。
      // ⚠️ postgres@3.4.x 的类型声明里没有这个字段（运行时支持，src/index.js:448
      //    会解析），用 as any 兜一下，不引入类型噪音。
      ...({ max_pipeline: 1 } as Record<string, number>),
    });

  const db = drizzle(client);

  // 关键：production 也要缓存 client。
  // 否则 Vercel 每个 lambda 冷启动都新建连接，PgBouncer session 模式很快限流。
  globalForDb.__danciPg = client;
  globalForDb.__danciDrizzle = db;

  return db;
}

/**
 * 拿到 postgres-js 原始 `sql` 客户端。
 *
 * 仅供需要**显式事务**的仓储函数使用。postgres-js 在 `max > 1` 时会拦截
 * 「连接池上的事务」（抛 `UNSAFE_TRANSACTION: Only use sql.begin,
 * sql.reserved or max: 1`），因为 Drizzle 0.29 的 `db.transaction()`
 * 与 postgres-js 的事务锁协议不完全兼容 —— 直接走 `sql.begin()` 才稳。
 *
 * 普通查询继续用 `db` 即可，只有「必须原子」的写才走 `sql`。
 */
export function getSql(): PostgresClient {
  if (!globalForDb.__danciPg) {
    // 触发 getDb() 里的懒初始化路径
    getDb();
  }
  return globalForDb.__danciPg as PostgresClient;
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