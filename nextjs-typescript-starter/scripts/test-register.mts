/**
 * 注册链路最小复现：直接调 createUser + authenticateUser，
 * 验证 user-repo 这一层能否完成"注册→立即用同密码登录"以及
 * "重复邮箱被翻译为 EmailAlreadyExistsError"。
 *
 * 用法：npx tsx --env-file=.env scripts/test-register.mts
 *
 * 成功判据：
 *   [1] createUser 新邮箱成功
 *   [2] authenticateUser 同密码立即成功
 *   [3] createUser 重复邮箱抛 EmailAlreadyExistsError（不是裸 PostgresError）
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
  } catch {
    /* 依赖外部注入 */
  }
}
loadEnvFile();

const email = `regtest-${Date.now()}@test.local`;
const password = 'regtest1234';
const displayName = 'regtest';

const { createUser, authenticateUser, hashPassword, EmailAlreadyExistsError } =
  await import('../lib/user-repo.ts');
const { db } = await import('../db/index.ts');
const { users } = await import('../db/schema.ts');
const { eq } = await import('drizzle-orm');

let pass = 0;
let fail = 0;
const check = (ok: boolean, label: string, extra = '') => {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${label} ${extra}`);
  }
};

let createdId: string | null = null;
try {
  console.log('\n=== 注册链路（数据层）===\n');

  console.log('[1] createUser 新邮箱');
  const u = await createUser({
    email,
    passwordHash: hashPassword(password),
    displayName,
  });
  createdId = u.id;
  check(u.id.startsWith('usr-'), '返回的 id 是 usr- 前缀', `got ${u.id}`);
  check(u.email === email, 'email 落库正确', `got ${u.email}`);

  console.log('\n[2] authenticateUser 同邮箱同密码立即登录');
  const authed = await authenticateUser(email, password);
  check(authed !== null, '登录返回非空');
  if (authed) check(authed.id === u.id, '登录返回的 id 与注册一致');

  console.log('\n[3] 重复邮箱 createUser 应抛 EmailAlreadyExistsError');
  let threwRightError = false;
  let threwAnyError = false;
  try {
    await createUser({
      email,
      passwordHash: hashPassword(password),
      displayName,
    });
  } catch (e) {
    threwAnyError = true;
    threwRightError = e instanceof EmailAlreadyExistsError;
    if (!threwRightError) {
      console.log(
        `        实际抛: ${(e as Error).constructor.name}: ${(e as Error).message}`,
      );
    }
  }
  check(threwAnyError, '抛了异常');
  check(threwRightError, '抛的是 EmailAlreadyExistsError（不是裸 PostgresError）');
} catch (e) {
  console.error('CRASH:', e);
  fail++;
} finally {
  if (createdId) {
    await db.delete(users).where(eq(users.id, createdId));
    console.log(`\n(已清理测试用户 ${createdId})`);
  }
  console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}
