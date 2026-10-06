/**
 * 完整注册链路复现：
 * 模拟 registerAction 的两个步骤：
 *   1. createUser (已修好，现在抛 EmailAlreadyExistsError)
 *   2. 手动调 signIn 的 authorize 回调等效逻辑（authenticateUser）
 *
 * 同时测：如果用户已存在，signIn 是否能正常登录。
 *
 * 用法：npx tsx --env-file=.env scripts/test-signin.mts
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

const { hashSync } = await import('bcrypt-ts');
const { authenticateUser, createUser, hashPassword, EmailAlreadyExistsError } =
  await import('../lib/user-repo.ts');
const { db } = await import('../db/index.ts');
const { users } = await import('../db/schema.ts');
const { eq } = await import('drizzle-orm');

// 测试邮箱：不存在 / 存在 两种场景
const FRESH_EMAIL = `signin-test-fresh-${Date.now()}@test.local`;
const KNOWN_EMAIL = `signin-test-known-${Date.now()}@test.local`;
const PASSWORD = 'testpass123';
const KNOWN_UID = `usr-known-${Date.now().toString(36)}`;

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

try {
  /* ---------- A. 新邮箱：注册 + 立即用同密码登录 ---------- */
  console.log('\n=== A. 新邮箱注册 → 立即登录 ===\n');
  const u1 = await createUser({
    email: FRESH_EMAIL,
    passwordHash: hashPassword(PASSWORD),
    displayName: 'signin-test-fresh',
  });
  check(u1.email === FRESH_EMAIL.toLowerCase(), '新用户注册成功', `got ${u1.email}`);

  const authed = await authenticateUser(FRESH_EMAIL, PASSWORD);
  check(authed !== null, '注册后立即用同密码登录成功');
  if (authed) {
    check(authed.id === u1.id, '登录返回的 id 与注册 id 一致');
  }

  /* ---------- B. 已知邮箱：直接用正确密码登录 ---------- */
  console.log('\n=== B. 已有账号直接登录 ===\n');
  // 用底层 db 直插一个用户（模拟用户之前注册过）
  await db.insert(users).values({
    id: KNOWN_UID,
    email: KNOWN_EMAIL.toLowerCase(),
    passwordHash: hashSync(PASSWORD, 10),
    displayName: 'signin-test-known',
  });
  const u2 = await authenticateUser(KNOWN_EMAIL, PASSWORD);
  check(u2 !== null, '已有账号用正确密码登录成功');
  if (u2) {
    check(u2.id === KNOWN_UID, '登录返回 id 与建账 id 一致');
    check(u2.email === KNOWN_EMAIL.toLowerCase(), '登录返回 email 正确');
  }

  /* ---------- C. 已有账号 + 错误密码 ---------- */
  console.log('\n=== C. 已有账号 + 错误密码 ===\n');
  const wrong = await authenticateUser(KNOWN_EMAIL, 'wrongpassword');
  check(wrong === null, '错误密码返回 null（防枚举）');

  /* ---------- D. 不存在的邮箱 ---------- */
  console.log('\n=== D. 不存在的邮箱 ===\n');
  const ghost = await authenticateUser('nobody@test.local', PASSWORD);
  check(ghost === null, '不存在的邮箱返回 null');

  /* ---------- E. 大小写不敏感登录 ---------- */
  console.log('\n=== E. 邮箱大小写不敏感 ===\n');
  const caseInsensitive = await authenticateUser(KNOWN_EMAIL.toUpperCase(), PASSWORD);
  check(caseInsensitive !== null, '大写邮箱也能登录');

  /* ---------- F. 密码哈希校验一致性（bcrypt） ---------- */
  console.log('\n=== F. bcrypt 哈希一致性 ===\n');
  const { compare } = await import('bcrypt-ts');
  const rawHash = hashSync(PASSWORD, 10);
  const ok = await compare(PASSWORD, rawHash);
  check(ok, 'bcrypt.compare 同密码为 true');
  const bad = await compare('wrong', rawHash);
  check(!bad, 'bcrypt.compare 错误密码为 false');
} catch (e) {
  console.error('CRASH:', e);
  fail++;
} finally {
  // 清理测试用户
  await db.delete(users).where(eq(users.email, FRESH_EMAIL.toLowerCase()));
  await db.delete(users).where(eq(users.email, KNOWN_EMAIL.toLowerCase()));
  console.log('\n(已清理测试用户)');
  console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}
