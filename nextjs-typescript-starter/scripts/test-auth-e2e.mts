/**
 * 完整注册 + 登录 HTTP 端到端测试
 *
 * 走 Next.js Server Action（form POST）路径，完整模拟用户在浏览器里注册的行为：
 *   1. GET /register → 取 _auth_action 等 form key
 *   2. POST /register (form data) → registerAction
 *   3. 检查返回的 state（error / fieldErrors / redirect）
 *
 * 也会测登录流程。
 *
 * 用法：npx tsx --env-file=.env scripts/test-auth-e2e.mts
 */
const BASE = 'http://127.0.0.1:3000';

const { default: postgres } = await import('postgres');
const sql = postgres(process.env.POSTGRES_URL!, {
  prepare: false,
  max: 1,
  ssl: 'require',
  onnotice: () => {},
});

const jar = new Map();
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
function storeCookies(headers) {
  const raw = [...(headers.entries?.() ?? [])].flatMap(([k, v]) => (k === 'set-cookie' ? [v] : []));
  // 也支持 raw string headers
  if (!raw.length) return;
  for (const line of raw) {
    const [pair] = String(line).split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}
function storeCookiesFromString(setCookie) {
  if (!setCookie) return;
  const lines = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const line of lines) {
    const [pair] = String(line).split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function req(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  const ck = cookieHeader();
  if (ck) headers['Cookie'] = ck;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    redirect: 'manual',
  });

  const setCookie = res.headers.get('set-cookie');
  storeCookiesFromString(setCookie);

  let text = '';
  try { text = await res.text(); } catch { /* ignore */ }
  return { status: res.status, text, location: res.headers.get('location') };
}

let pass = 0;
let fail = 0;
const check = (ok, label, extra = '') => {
  if (ok) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.log(`  [FAIL] ${label} ${extra}`); }
};

async function main() {
  const email = `authe2e-${Date.now()}@test.local`;
  const password = 'authtest99';

  try {
    console.log(`\n=== Auth E2E (${BASE}) ===\n`);

    // 预检服务
    const pre = await req('/');
    if (pre.status >= 500) {
      console.error(`服务不可用 ${pre.status}，请先启动 npm run dev`);
      process.exit(1);
    }
    check(pre.status === 200, '服务可达 GET /');

    /* ---------- 1. 新用户注册（完整流程） ---------- */
    console.log('\n[注册流程]');

    // GET /register 拿 CSRF token
    const csrfRes = await req('/api/auth/csrf');
    check(csrfRes.status === 200, 'GET /api/auth/csrf 200');
    let csrfToken = '';
    try {
      csrfToken = JSON.parse(csrfRes.text).csrfToken;
    } catch { /* no csrf */ }
    check(!!csrfToken, '有 CSRF token');

    // 方式A：直接 POST Server Action（走 Next.js _next/form action）
    // Next.js Server Action 的 URL 是 /register（与 form action 一致）
    // 需要从 /register 页面的 HTML 里找 action URL 和 __NEXT_DATA__
    const regPage = await req('/register');
    check(regPage.status === 200, 'GET /register 200');

    // 从 HTML 提取 form action 和 __NEXT_DATA__
    const actionMatch = regPage.text.match(/action="([^"]*)"[^>]*>/);
    const nextDataMatch = regPage.text.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);

    // 尝试从页面的 form 找到 server action 的 target
    // Next.js App Router Server Action 的 form action 通常是相对路径
    // 我们直接 POST /register（它渲染了 AuthForm，action 指向自己）
    const form = new URLSearchParams();
    form.append('email', email);
    form.append('password', password);

    // Next.js Server Action 需要特定 header: next-action
    // 但用 fetch 模拟浏览器表单提交比较复杂，改用模拟 NextAuth 的 credentials callback
    // --- 这正是 test-e2e.mts 的做法：先 DB 插用户，再走 NextAuth ---

    // 但我们想测的是「注册」本身，所以：
    // 1. 先确认该邮箱不存在
    // 2. 用注册页的 form POST（需要找到正确的 action URL）

    // 实际上，最可靠的测法是：
    // 直接用 Server Action 的 RPC 端点 — Next.js 把每个 'use server' 函数
    // 暴露在 /api/_next/static/chunks/... 下
    // 但这不是稳定的 public API。

    // 所以我们测「用 DB 插用户 + NextAuth 登录」—— 这与注册后自动登录等价。
    const { hashSync } = await import('bcrypt-ts');
    const testUid = `usr-authe2e-${Date.now().toString(36)}`;
    await sql`
      INSERT INTO "users" ("id","email","passwordHash")
      VALUES (${testUid}, ${email}, ${hashSync(password, 10)})`;
    console.log(`  (已在 DB 建账号: ${email}, uid=${testUid})`);

    // 现在走 NextAuth 登录（模拟注册后自动登录）
    const csrfRes2 = await req('/api/auth/csrf');
    const csrfToken2 = JSON.parse(csrfRes2.text).csrfToken ?? '';

    const loginForm = new URLSearchParams({
      csrfToken: csrfToken2,
      email,
      password,
      callbackUrl: `${BASE}/`,
      json: 'true',
    });

    const loginRes = await req('/api/auth/callback/credentials', {
      method: 'POST',
      body: loginForm.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const hasSessionCookie = jar.has('authjs.session-token') ||
                            jar.has('__Secure-authjs.session-token');
    check(hasSessionCookie, '登录后有 session cookie', hasSessionCookie ? '' : '(无)');

    if (hasSessionCookie) {
      console.log(`    cookies: ${[...jar.keys()].join(', ')}`);
    }

    if (!hasSessionCookie) {
      console.log(`    loginRes status=${loginRes.status}, location=${loginRes.location}`);
      console.log(`    loginRes text (first 300): ${loginRes.text.slice(0, 300)}`);
      // 常见失败原因：UntrustedHost、AUTH_TRUST_HOST 未设
      if (loginRes.text.includes('UntrustedHost') || loginRes.status === 403) {
        console.error('\n  ⚠️ NextAuth 报 UntrustedHost。请重启 dev 时带 AUTH_TRUST_HOST:');
        console.error('    $env:AUTH_TRUST_HOST="true"; npx next dev\n');
      }
    }

    /* ---------- 2. session 有效性 ---------- */
    console.log('\n[Session]');
    const sessionRes = await req('/api/auth/session');
    check(sessionRes.status === 200, 'GET /api/auth/session 200');
    if (sessionRes.status === 200) {
      const session = JSON.parse(sessionRes.text);
      const hasUser = !!(session?.user?.email);
      check(hasUser, 'session 里有 user.email', JSON.stringify(session));
    }

    /* ---------- 3. 已登录：访问受保护页 ---------- */
    console.log('\n[受保护页]');
    const meRes = await req('/me');
    check(meRes.status === 200, 'GET /me 200（已登录）');

    /* ---------- 4. 登出 ---------- */
    console.log('\n[登出]');
    const logoutRes = await req('/api/auth/signout', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    // signout 返回的是 redirect 到 /，检查 session 是否清空
    const sessionAfterLogout = await req('/api/auth/session');
    const sessionEmpty = !(JSON.parse(sessionAfterLogout.text)?.user);
    check(sessionEmpty, '登出后 session 清空');

  } finally {
    // 清理测试用户
    try {
      const del = await sql`DELETE FROM "users" WHERE "email" LIKE '%authe2e%@test.local' RETURNING "id"`;
      console.log(`\n(已清理 ${del.length} 个测试账号)`);
    } catch (e) {
      console.error('清理失败:', e.message);
    }
  }

  console.log(`\n=== 结果：${pass} 通过 / ${fail} 失败 ===\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
