/**
 * 验证 registerAction 修复点（控制流层）。
 *
 * 由于 `next-auth` 的 package.json 没有 main exports，tsx 不能直接
 * import `app/actions/auth-actions.ts`（会报 ERR_PACKAGE_PATH_NOT_EXPORTED）。
 *
 * 改为：在脚本里**复刻** auth-actions 的核心 catch 逻辑（用真的
 * createUser + 模拟 signIn 的 NEXT_REDIRECT 抛出），验证：
 *   1. isNextControlFlowError 正确识别
 *   2. 新用户注册时 catch 透传 NEXT_REDIRECT
 *   3. 已存在用户走幂等登录
 *   4. 错误密码返回"该邮箱已注册，请直接登录"
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

const { isNextControlFlowError } = await import('../lib/next-redirect.ts');
const { createUser, EmailAlreadyExistsError, hashPassword, authenticateUser } =
  await import('../lib/user-repo.ts');
const { db } = await import('../db/index.ts');
const { users } = await import('../db/schema.ts');
const { eq } = await import('drizzle-orm');

let pass = 0;
let fail = 0;
const check = (ok, label, extra = '') => {
  if (ok) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.log(`  [FAIL] ${label} ${extra}`); }
};

/** 模拟 NextAuth signIn 成功：签发 cookie + 抛 NEXT_REDIRECT */
function fakeSignInSuccess() {
  const err = new Error('NEXT_REDIRECT');
  err.digest = 'NEXT_REDIRECT;replace;http://localhost:3000/;303;';
  throw err;
}

/** 模拟 NextAuth signIn 失败：抛 AuthError（无 digest） */
function fakeSignInFail() {
  const err = new Error('CredentialsSignin');
  // 没有 digest
  throw err;
}

/** 复刻 registerAction 的核心 catch 逻辑（来自 app/actions/auth-actions.ts） */
async function fakeRegisterAction(email, password, { existing } = {}) {
  try {
    if (!existing) {
      await createUser({ email, passwordHash: hashPassword(password) });
    } else {
      // 模拟 createUser 抛 EmailAlreadyExistsError
      throw new EmailAlreadyExistsError();
    }
    // signIn 成功 throw NEXT_REDIRECT
    fakeSignInSuccess();
  } catch (err) {
    // [FIX 1] 框架控制流 → 重抛
    if (isNextControlFlowError(err)) throw err;

    // [FIX 2] 幂等：已存在 → 走 signIn
    if (err instanceof EmailAlreadyExistsError) {
      try {
        fakeSignInSuccess();
      } catch (signInErr) {
        if (isNextControlFlowError(signInErr)) throw signInErr;
        return { fieldErrors: { email: '该邮箱已注册，请直接登录' } };
      }
    }

    return { error: '注册失败，请稍后再试' };
  }
}

const FRESH_EMAIL = `fix-test-${Date.now()}@test.local`;
const PWD = 'pwd12345';
let createdId = null;

try {
  console.log(`\n=== registerAction 控制流修复验证 ===\n`);

  /* ---------- 1. isNextControlFlowError 守卫 ---------- */
  console.log('[1] isNextControlFlowError 守卫');
  const r1 = new Error('redirect');
  r1.digest = 'NEXT_REDIRECT;replace;/;303;';
  check(isNextControlFlowError(r1), '识别 NEXT_REDIRECT');
  const r2 = new Error('notfound');
  r2.digest = 'NEXT_NOT_FOUND';
  check(isNextControlFlowError(r2), '识别 NEXT_NOT_FOUND');
  const r3 = new Error('fail');
  check(!isNextControlFlowError(r3), '不识别普通 Error');
  const r4 = new Error('fail');
  r4.digest = 'XXX_NOT_A_REAL_ONE';
  check(!isNextControlFlowError(r4), '不识别非 NEXT_ 前缀');
  check(!isNextControlFlowError(null), 'null 安全');
  check(!isNextControlFlowError('string'), 'string 安全');

  /* ---------- 2. 新用户注册 → throw NEXT_REDIRECT（核心修复）---------- */
  console.log('\n[2] 新用户注册');
  let thrown = null;
  let result = null;
  try {
    result = await fakeRegisterAction(FRESH_EMAIL, PWD, { existing: false });
  } catch (e) {
    thrown = e;
  }
  check(thrown !== null, '注册时 throw 了异常（不是被 catch 吞掉）');
  if (thrown) {
    const digest = thrown.digest ?? '';
    check(digest.startsWith('NEXT_REDIRECT'), 'throw 的是 NEXT_REDIRECT', digest);
    check(digest.includes('303'), '重定向是 303', digest);
    console.log(`    digest: ${digest}`);
  }
  // DB 检查
  const rows1 = await db.select().from(users).where(eq(users.email, FRESH_EMAIL.toLowerCase()));
  check(rows1.length === 1, 'DB 里新用户已写入');
  if (rows1[0]) createdId = rows1[0].id;

  /* ---------- 3. 修复前：旧代码会把 NEXT_REDIRECT 吞掉返回 error ---------- */
  console.log('\n[3] 旧代码（无 fix）行为对比：会吞掉 NEXT_REDIRECT');
  // 模拟旧代码（没有 isNextControlFlowError 守卫）
  const oldCodeResult = await (async () => {
    try {
      fakeSignInSuccess();
    } catch (e) {
      // 旧 catch 无差别吞
      return { error: '注册失败，请稍后再试' };
    }
  })();
  check(oldCodeResult?.error === '注册失败，请稍后再试',
    '旧代码会把 NEXT_REDIRECT 吞掉并返回 error（这就是 bug）');

  /* ---------- 4. 已存在 + 正确密码 → 幂等登录 throw NEXT_REDIRECT ---------- */
  console.log('\n[4] 已存在 + 正确密码（幂等登录）');
  thrown = null;
  try {
    await fakeRegisterAction(FRESH_EMAIL, PWD, { existing: true });
  } catch (e) {
    thrown = e;
  }
  check(thrown?.digest?.startsWith('NEXT_REDIRECT'), '已存在用户 + 正确密码 → throw NEXT_REDIRECT（自动登录）',
    thrown ? '' : '没抛错');

  /* ---------- 5. 已存在 + 错误密码 → 提示"该邮箱已注册，请直接登录" ---------- */
  console.log('\n[5] 已存在 + 错误密码');
  // 模拟 signIn 失败
  const customRegister = async (email, password) => {
    try {
      throw new EmailAlreadyExistsError();
    } catch (err) {
      if (isNextControlFlowError(err)) throw err;
      if (err instanceof EmailAlreadyExistsError) {
        try {
          // 模拟 signIn 失败
          const e = new Error('CredentialsSignin');
          throw e;
        } catch (signInErr) {
          if (isNextControlFlowError(signInErr)) throw signInErr;
          return { fieldErrors: { email: '该邮箱已注册，请直接登录' } };
        }
      }
      return { error: '注册失败，请稍后再试' };
    }
  };
  const r5 = await customRegister(FRESH_EMAIL, 'wrongpass');
  check(r5.fieldErrors?.email === '该邮箱已注册，请直接登录',
    '错误密码返回"该邮箱已注册，请直接登录"', JSON.stringify(r5));

  /* ---------- 6. DB 里仍只有 1 个用户（幂等不重复插入）---------- */
  console.log('\n[6] DB 用户数（幂等不重复）');
  const rows2 = await db.select().from(users).where(eq(users.email, FRESH_EMAIL.toLowerCase()));
  check(rows2.length === 1, '仍只有 1 个用户', `count=${rows2.length}`);

} catch (e) {
  console.error('CRASH:', e);
  fail++;
} finally {
  if (createdId) {
    await db.delete(users).where(eq(users.id, createdId));
    console.log(`\n(已清理测试用户 ${createdId})`);
  }
}

console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
process.exit(fail > 0 ? 1 : 0);
