/**
 * 端到端接口验证：真的起 HTTP 请求，验证鉴权与真实数据。
 * 用 Node 而非 PowerShell，避免 PowerShell 5.1 的 ANSI 编码问题。
 */
const BASE = process.env.E2E_BASE ?? 'http://localhost:3111';

/**
 * React SSR 会在相邻文本节点之间插入 `<!-- -->`，
 * 所以 `第 {1} / {130} 个` 实际渲染成 `第<!-- -->1<!-- --> / <!-- -->130<!-- --> 个`。
 * 断言中文文案前必须先剥掉这些标记，否则永远匹配不上。
 */
const deComment = (html: string) => html.replace(/<!-- -->/g, '');

let pass = 0;
let fail = 0;
function check(ok: boolean, label: string, extra = '') {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${label} ${extra}`);
  }
}

const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(res: Response) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

/**
 * 开跑前先探一下服务在不在。
 *
 * 本脚本**不会**自己启动 Next.js —— 它只负责打 HTTP 请求。
 * 服务没起时，fetch 会抛 ECONNREFUSED，若不拦就会甩一坨
 * "AggregateError [ECONNREFUSED]" 堆栈，看起来像代码坏了，其实只是没起服务。
 */
async function preflight(): Promise<void> {
  const res = await fetch(`${BASE}/api/auth/session`, {
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);

  if (res === null) {
    console.error(
      `\n✗ 连不上 ${BASE}\n` +
        '  E2E 需要先有一个 Next.js 服务在跑（本脚本只发请求，不负责启动）。\n\n' +
        '  另开一个终端，执行：\n' +
        '    npm run build\n' +
        '    npx next start -p 3111\n\n' +
        '  然后再跑本脚本。若端口不同，用环境变量指定：\n' +
        '    $env:E2E_BASE="http://localhost:3000"; npm run test:e2e\n',
    );
    process.exit(1);
  }

  // 能连上但被鉴权挡了也算服务正常（/api/auth/session 未登录时返回 200 + null）
  console.log(`  服务可达：${BASE}（/api/auth/session → ${res.status}）`);
}

/**
 * 直连真库，只用于两件事：建测试账号、清理测试账号。
 * 提到模块作用域，是因为 cleanupTestUsers 在 main 的 finally 里也要用。
 */
const { default: postgres } = await import('postgres');
const sql = postgres(process.env.POSTGRES_URL!, {
  prepare: false,
  max: 1,
  ssl: 'require',
  onnotice: () => {},
});

async function req(
  path: string,
  init: RequestInit & { redirect?: string } = {},
) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: init.redirect ?? 'manual',
    headers: {
      ...(init.headers ?? {}),
      Cookie: cookieHeader(),
    },
  });
  storeCookies(res);
  const text = await res.text();
  return { status: res.status, text };
}

/** 脚本退出码：0 全过，1 有失败或崩溃。 */
async function main(): Promise<number> {
  const email = `e2e-${Date.now()}@test.local`;
  const password = 'e2epassword123';

  try {
    await run(email, password);
  } finally {
    // 无论跑完、断言失败还是中途抛异常，都清掉测试账号。
    // 调试期间正是"崩了就留孤儿"踩了坑，所以放在 finally。
    await cleanupTestUsers(email);
  }

  console.log(`\n${'-'.repeat(50)}`);
  console.log(`E2E result: ${pass} passed / ${fail} failed`);
  console.log(`${'-'.repeat(50)}\n`);
  return fail > 0 ? 1 : 0;
}

async function run(email: string, password: string) {
  console.log(`\n=== E2E (${BASE}) ===\n`);
  await preflight();
  console.log(`test account: ${email}\n`);

  /* ---------- 未登录 ---------- */
  console.log('[unauthenticated]');

  let r = await req('/api/study/recent');
  check(r.status === 401, 'GET /api/study/recent -> 401', `got ${r.status}`);
  check(
    r.text.includes('UNAUTHORIZED'),
    '  body has error code UNAUTHORIZED',
    r.text.slice(0, 120),
  );

  r = await req('/api/study/PEPXiaoXue6_1/cards?limit=5');
  check(r.status === 401, 'GET /api/study/[bookId]/cards -> 401', `got ${r.status}`);

  r = await req('/api/study/recent', { method: 'POST' });
  check(r.status === 400, 'POST /api/study/recent -> 400', `got ${r.status}`);

  // 验收 A6: 未登录首页不应有「最近学习」
  r = await req('/');
  const RECENT = '\u6700\u8fd1\u5b66\u4e60';
  const ALL_BOOKS = '\u5168\u90e8\u5355\u8bcd\u4e66';
  check(r.status === 200, 'GET / -> 200', `got ${r.status}`);
  check(!r.text.includes(RECENT), 'no "recent study" block (A6)');
  check(r.text.includes(ALL_BOOKS), 'has "all books" block');

  // 未登录点书应跳 /me?login=1
  check(
    r.text.includes('/me?login=1'),
    'guest book link points to /me?login=1',
  );

  /* ---------- 注册并登录 ---------- */
  console.log('\n[register + login]');

  // 通过 NextAuth credentials 端点登录。先注册：走 Server Action 不便，
  // 这里直接用真实 HTTP 调 registerAction 的等价路径 —— 通过
  // /api/auth/callback/credentials 登录前需先有账号，故先建账号。
  // 为避免在测试里复刻注册逻辑，这里用 DB 直连建测试账号（仅 e2e 用）。
  const { hashSync } = await import('bcrypt-ts');
  await sql`INSERT INTO "users" ("id","email","passwordHash")
            VALUES (${`usr-e2e-${Date.now().toString(36)}`}, ${email}, ${hashSync(password, 10)})`;
  console.log('  (created account directly in DB for login)');

  // 取 CSRF token
  r = await req('/api/auth/csrf');
  const csrf = (JSON.parse(r.text) as { csrfToken: string }).csrfToken;
  check(!!csrf, 'got csrf token');

  const form = new URLSearchParams({
    csrfToken: csrf,
    email,
    password,
    callbackUrl: `${BASE}/`,
  });
  r = await req('/api/auth/callback/credentials', {
    method: 'POST',
    body: form.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const loggedIn = jar.has('authjs.session-token');
  check(loggedIn, 'login succeeded (session cookie set)', `status ${r.status}`);

  if (!loggedIn) {
    // 登录拿不到 session cookie。若服务端日志有 UntrustedHost，
    // 说明请求的 Host 不是 localhost/127.0.0.1（例如从容器或反向代理访问），
    // 临时带上 AUTH_TRUST_HOST 重启服务即可。给句人话提示，
    // 免得看到一堆 401 还要去翻服务端日志。
    console.error(
      '\n⚠️  登录失败。若服务端日志里有 "[auth][error] UntrustedHost"，\n' +
        '    说明请求的 Host 不可信，临时带变量重启服务：\n' +
        "      $env:AUTH_TRUST_HOST='true'; npx next start -p 3111\n",
    );
  }

  /* ---------- 已登录：最近学习（无数据） ---------- */
  console.log('\n[authenticated: no progress yet]');

  r = await req('/api/study/recent');
  check(r.status === 200, 'GET /api/study/recent -> 200', `got ${r.status}`);
  const j0 = JSON.parse(r.text) as { data: unknown };
  check(j0.data === null, 'data is null for brand-new user');
  check(
    !r.text.includes('UNAUTHORIZED'),
    'new user sees no recent block (A6)',
  );

  r = await req('/');
  check(!r.text.includes(RECENT), 'home has no "recent study" block (A6)');
  check(r.text.includes(ALL_BOOKS), 'home has "all books" block');

  /* ---------- 已登录：词卡分批 ---------- */
  console.log('\n[authenticated: cards paging]');

  r = await req('/api/study/PEPXiaoXue6_1/cards?limit=10');
  check(r.status === 200, 'GET cards -> 200', `got ${r.status}`);
  const j1 = JSON.parse(r.text) as {
    data: {
      bookId: string;
      bookTitle: string;
      wordCount: number;
      afterRank: number;
      nextAfterRank: number;
      hasMore: boolean;
      cards: {
        wordId: string;
        bizWordId: string;
        wordRank: number;
        headWord: string;
        usphone: string | null;
        firstTranCn: string | null;
      }[];
    };
  };
  const d1 = j1.data;
  check(d1.bookId === 'PEPXiaoXue6_1', 'bookId echoed');
  check(d1.wordCount === 130, 'wordCount = 130 (from words table)', `got ${d1.wordCount}`);
  check(d1.cards.length === 10, 'limit respected', `got ${d1.cards.length}`);
  check(d1.cards[0].wordRank === 1, 'starts at rank 1');
  check(d1.cards[0].headWord === 'science', 'first word is science');
  check(d1.cards[0].bizWordId === 'PEPXiaoXue6_1_1', 'bizWordId present');
  check(d1.cards[0].firstTranCn === '科学', 'has first translation');
  check(d1.cards[0].usphone === 'ˈsaɪəns', 'phonetic normalized', `got ${d1.cards[0].usphone}`);
  check(d1.hasMore === true, 'hasMore = true');
  check(d1.nextAfterRank === 10, 'nextAfterRank = 10');
  check(
    d1.cards.every((c) => !JSON.stringify(c).includes('"content"')),
    'cards do NOT include full content JSON (perf req A12)',
  );

  // 第二批衔接
  r = await req(`/api/study/PEPXiaoXue6_1/cards?afterRank=${d1.nextAfterRank}&limit=10`);
  const j2 = JSON.parse(r.text) as typeof j1;
  check(j2.data.cards[0].wordRank === 11, 'batch 2 starts at 11 (no overlap)');

  // 末尾
  r = await req('/api/study/PEPXiaoXue6_1/cards?afterRank=125&limit=50');
  const j3 = JSON.parse(r.text) as typeof j1;
  check(j3.data.cards.length === 5, 'tail batch has 5 cards', `got ${j3.data.cards.length}`);
  check(j3.data.hasMore === false, 'tail batch hasMore = false (triggers "finish")');

  // 学完后为空
  r = await req('/api/study/PEPXiaoXue6_1/cards?afterRank=130');
  const j4 = JSON.parse(r.text) as typeof j1;
  check(j4.data.cards.length === 0, 'past end returns 0 cards');
  check(j4.data.hasMore === false, 'past end hasMore = false');

  // 大书分页
  r = await req('/api/study/CET4_2/cards?limit=200');
  const j5 = JSON.parse(r.text) as typeof j1;
  check(j5.data.wordCount === 3739, 'CET4_2 wordCount = 3739', `got ${j5.data.wordCount}`);
  check(j5.data.cards.length === 200, 'CET4_2 first batch = 200');
  check(j5.data.hasMore === true, 'CET4_2 hasMore = true (not prematurely finished)');

  // 参数边界
  r = await req('/api/study/PEPXiaoXue6_1/cards?limit=99999');
  const j6 = JSON.parse(r.text) as typeof j1;
  check(j6.data.cards.length <= 200, 'limit clamped to 200', `got ${j6.data.cards.length}`);

  // 垃圾参数应回退到默认值，而不是 500 或返回错乱数据：
  // limit=abc → 50，afterRank=xyz → 0，所以应从第 1 个开始、给 50 条。
  r = await req('/api/study/PEPXiaoXue6_1/cards?limit=abc&afterRank=xyz');
  check(r.status === 200, 'garbage params -> 200', `got ${r.status}`);
  const j7 = JSON.parse(r.text) as typeof j1;
  check(j7.data.cards.length === 50, '  limit=abc falls back to 50', `got ${j7.data.cards.length}`);
  check(j7.data.afterRank === 0, '  afterRank=xyz falls back to 0', `got ${j7.data.afterRank}`);
  check(j7.data.cards[0]?.wordRank === 1, '  starts from rank 1', `got ${j7.data.cards[0]?.wordRank}`);

  // 越界值应被夹住，而不是穿透到 SQL
  r = await req('/api/study/PEPXiaoXue6_1/cards?limit=-999');
  const jNeg = JSON.parse(r.text) as typeof j1;
  check(jNeg.data.cards.length >= 1, 'limit=-999 clamped to >=1', `got ${jNeg.data.cards.length}`);

  r = await req('/api/study/PEPXiaoXue6_1/cards?afterRank=-5');
  const jNegRank = JSON.parse(r.text) as typeof j1;
  check(jNegRank.data.afterRank === 0, 'afterRank=-5 clamped to 0', `got ${jNegRank.data.afterRank}`);

  r = await req('/api/study/NO_SUCH_BOOK/cards');
  check(r.status === 404, 'unknown book -> 404', `got ${r.status}`);

  /* ---------- 学习页 HTML ---------- */
  console.log('\n[study page HTML]');

  r = await req('/study/PEPXiaoXue6_1');
  check(r.status === 200, 'GET /study/PEPXiaoXue6_1 -> 200', `got ${r.status}`);
  const h1 = deComment(r.text);
  check(h1.includes('science'), 'study page renders first word');
  check(h1.includes('第 1 / 130 个'), 'progress denominator = 130 (words table, not redunant)', h1.slice(0, 0));
  check(h1.includes('下一个'), 'button says "next" (hasMore, not finished)');
  check(!h1.includes('完成本课'), 'does NOT say "finish lesson" prematurely');
  check(h1.includes('ˈsaɪəns'), 'phonetic rendered normalized');

  r = await req('/study/CET4_2');
  check(r.status === 200, 'GET /study/CET4_2 -> 200', `got ${r.status}`);
  check(deComment(r.text).includes('第 1 / 3739 个'), 'CET4_2 denominator = 3739');
  check(!deComment(r.text).includes('完成本课'), 'CET4_2 not finished after 1 batch');

  r = await req('/study/NO_SUCH_BOOK');
  check(r.status === 404, 'unknown book study page -> 404', `got ${r.status}`);

  /* ---------- 模拟学习：写进度后看续学 ---------- */
  console.log('\n[progress round-trip]');

  const uid = [...jar.keys()].length; // placeholder, real uid fetched below
  const meRows = await sql`SELECT "id" FROM "users" WHERE "email" = ${email}`;
  const realUid = meRows[0].id as string;

  // 模拟「学完 3 个词」：调用 repo 层写明细 + 进度
  const { touchWordRecord, finishLesson, findProgress } = await import(
    '../lib/progress-repo.ts'
  );
  const cards = d1.cards;
  await touchWordRecord({ userId: realUid, wordId: cards[0].wordId, bookId: 'PEPXiaoXue6_1', wordRank: cards[0].wordRank });
  await touchWordRecord({ userId: realUid, wordId: cards[1].wordId, bookId: 'PEPXiaoXue6_1', wordRank: cards[1].wordRank });
  await finishLesson({ userId: realUid, bookId: 'PEPXiaoXue6_1', lastWordId: cards[2].wordId, lastWordRank: cards[2].wordRank });

  // 进度：最后一个词也进了明细（原 Bug 的修复点）
  const p = await findProgress(realUid, 'PEPXiaoXue6_1');
  check(p?.lastWordRank === 3, 'progress lastWordRank = 3');
  check(p?.learnedCount === 3, 'learnedCount = 3 (last word included, was 2 before fix)', `got ${p?.learnedCount}`);

  // 首页最近学习
  r = await req('/api/study/recent');
  const j8 = JSON.parse(r.text) as { data: { title: string; learnedCount: number; percent: number; lastWordRank: number } };
  check(j8.data !== null, 'recent now has data');
  check(j8.data.learnedCount === 3, 'recent learnedCount = 3');
  check(j8.data.lastWordRank === 3, 'recent lastWordRank = 3');
  check(j8.data.percent === 2, `percent = 2 (3/130), got ${j8.data.percent}`);

  r = await req('/');
  check(r.text.includes(RECENT), 'home NOW shows "recent study" block');
  check(deComment(r.text).includes('\u4e0a\u6b21\u5b66\u5230\uff1a\u7b2c 3 \u4e2a\u5355\u8bcd \u00b7 \u5171 130 \u4e2a'), 'shows "last studied at word 3 of 130" copy');

  // 续学：从第 4 个开始
  r = await req('/api/study/PEPXiaoXue6_1/cards?from=last&limit=5');
  const j9 = JSON.parse(r.text) as typeof j1;
  check(j9.data.afterRank === 3, 'from=last uses stored progress', `got ${j9.data.afterRank}`);
  check(j9.data.cards[0].wordRank === 4, 'resumes at rank 4 (skips studied)', `got ${j9.data.cards[0].wordRank}`);

  r = await req('/study/PEPXiaoXue6_1');
  check(deComment(r.text).includes('第 4 / 130 个'), 'study page resumes at word 4');

  // 我的页
  r = await req('/me');
  check(r.status === 200, 'GET /me -> 200');
  const hm = deComment(r.text);
  check(hm.includes(email), 'me page shows email');
  check(hm.includes('已学 3 / 130'), 'me page shows "learned 3 / 130"', 'look for 已学 3 / 130');
  check(hm.includes('aria-valuenow="2"'), 'me page progress bar = 2%');
}

/**
 * 清理测试账号。
 *
 * 为什么放在 finally 而不是 run() 末尾：
 * 断言失败不会抛异常（check() 只是记数），但**中途崩溃会**——
 * 网络抖动、JSON.parse 失败、被 Ctrl+C，都会直接跳过末尾的 DELETE，
 * 在真库留下孤儿账号。调试期间就踩过这个坑。
 *
 * 兜底删除按邮箱后缀 + id 前缀双重匹配，真实用户邮箱不会命中。
 * user_book_progress / user_word_records 有 ON DELETE CASCADE，会自动跟着走。
 */
async function cleanupTestUsers(email: string) {
  try {
    const del = await sql`
      DELETE FROM "users"
      WHERE "email" = ${email}
         OR "email" LIKE '%@test.local'
         OR "id" LIKE 'usr-e2e-%'
      RETURNING "id"`;
    console.log(`\n  (已清理测试账号 ${del.length} 个)`);
  } catch (e) {
    console.error('\n  ⚠️ 清理测试账号失败：', e);
  }
}

main()
  .then((code) => sql.end().then(() => process.exit(code)))
  .catch(async (e) => {
    console.error('\nE2E crashed:', e);
    await sql.end();
    process.exit(1);
  });
