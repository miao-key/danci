/**
 * 清理之前测试遗留的孤儿用户 + 查看 12345678@qq.com 状态。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadEnvFile() {
  try {
    const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
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
  } catch { /* */ }
}
loadEnvFile();

const { default: postgres } = await import('postgres');
const sql = postgres(process.env.POSTGRES_URL!, {
  prepare: false,
  max: 1,
  ssl: 'require',
  onnotice: () => {},
});

try {
  console.log('\n=== 当前 users 表里的所有用户 ===\n');
  const all = await sql`SELECT "id", "email", "displayName", "createdAt" FROM "users" ORDER BY "createdAt"`;
  for (const r of all) {
    console.log(`  ${r.id}  ${r.email}  ${r.displayName ?? '(null)'}  ${r.createdAt.toISOString()}`);
  }
  console.log(`\n共 ${all.length} 个用户`);

  // 清理测试遗留
  const testEmails = [
    '%@test.local',                       // 我们所有测试账号
    '%@qq.com',                           // 你那个 "12345678@qq.com"（询问后决定）
  ];
  // 默认不动真实 qq.com 账号，留给用户决定
  console.log('\n=== 清理 test.local 后缀的测试账号 ===');
  const del = await sql`DELETE FROM "users" WHERE "email" LIKE ${'%@test.local'} RETURNING "id", "email"`;
  console.log(`  删除 ${del.length} 个 test.local 账号`);
  for (const r of del) console.log(`    ${r.id}  ${r.email}`);

  console.log('\n=== 清理后剩余用户 ===\n');
  const after = await sql`SELECT "id", "email", "displayName" FROM "users" ORDER BY "createdAt"`;
  for (const r of after) {
    console.log(`  ${r.id}  ${r.email}  ${r.displayName ?? '(null)'}`);
  }
} finally {
  await sql.end();
}
