/**
 * 数据库迁移执行器
 *
 * 为什么不用 drizzle-kit migrate：
 *   本项目安装的是 drizzle-kit@0.20（与 drizzle-orm@0.29 同期），
 *   该版本**没有** `migrate` 子命令，只有 generate:pg / push:pg / studio。
 *   且 npm 12 的 allowScripts 安全策略会拦截 esbuild 的 postinstall，
 *   导致 drizzle-kit 无法转译 TS schema。
 *   → 因此本文件用项目已依赖的 `postgres` 驱动直接执行 SQL，行为可控、零额外依赖。
 *
 * 用法：
 *   npm run db:migrate              # 执行所有未执行的迁移
 *   npm run db:migrate -- --status # 只看执行状态，不改动数据库
 *   npm run db:migrate -- --dry    # 只打印将要执行的 SQL，不落库
 *
 * 幂等保证：
 *   - 迁移文件在 db/migrations/ 下按文件名升序执行
 *   - 执行记录写入 __danci_migrations 表，重复运行不会重复执行
 *   - 每个迁移包在一个事务里，失败整体回滚
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";

// .env 是 dotenv 约定，这里做最小解析（避免额外依赖 dotenv 的加载顺序问题）
loadEnvFile();

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

/** 极简 .env 解析：忽略注释、空行、已存在的环境变量 */
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
      // 去掉成对的引号
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env 不存在时依赖外部注入的环境变量
  }
}

async function main() {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error("✗ POSTGRES_URL is not set. 请在 .env 中配置 Supabase 连接串。");
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry");
  const statusOnly = process.argv.includes("--status");

  const sql = postgres(connectionString, {
    prepare: false,
    max: 1,
    ssl: "require",
    onnotice: () => {},
  });

  try {
    // 迁移记录表
    // 注意：DDL 必须用 sql.unsafe()，postgres.js 的模板标签会把语句参数化，
    // 多语句 DDL 只能走 unsafe。
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "__danci_migrations" (
        "name"       text PRIMARY KEY,
        "appliedAt"  timestamp with time zone NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort(); // 0000_ → 0001_ → ... 保证顺序

    const applied = new Set(
      (await sql`SELECT "name" FROM "__danci_migrations"`).map((r) => r.name),
    );

    console.log(`共发现 ${files.length} 个迁移文件，已执行 ${applied.size} 个。\n`);

    let executed = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  ✓ ${file}  (已执行)`);
        continue;
      }

      if (statusOnly) {
        console.log(`  · ${file}  (待执行)`);
        continue;
      }

      const content = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

      if (dryRun) {
        console.log(`\n──── ${file} ────\n${content}`);
        continue;
      }

      // 单文件一个事务：失败整体回滚，绝不留下半张表
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO "__danci_migrations" ("name") VALUES (${file})`;
      });
      console.log(`  ✔ ${file}  (已执行)`);
      executed++;
    }

    if (statusOnly) {
      console.log("\n（--status 模式，未改动数据库）");
    } else if (dryRun) {
      console.log("\n（--dry 模式，未改动数据库）");
    } else {
      console.log(`\n✔ 迁移完成，本次执行 ${executed} 个。`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error("\n✗ 迁移失败：", err.message);
  process.exit(1);
});
