/* eslint-disable */
// 端到端冒烟测试（清空 DB 后从空表开始完整跑一遍）
require("dotenv/config");

const BASE = "http://localhost:3000";

let cookieJar = "";

function pickCookie(setCookie) {
  if (!setCookie) return;
  // 多条 set-cookie 用逗号分隔（HttpOnly），每条格式：name=value; ...
  const parts = setCookie.split(/,(?=[^ ]+=)/);
  for (const p of parts) {
    const m = p.match(/danci_admin_session=[^;]+/);
    if (m) {
      cookieJar = m[0];
      return;
    }
  }
}

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookieJar) headers.cookie = cookieJar;
  const res = await fetch(BASE + path, { ...opts, headers, redirect: "manual" });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) pickCookie(setCookie);
  let body;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) body = await res.json();
  else body = await res.text();
  return {
    status: res.status,
    body,
    location: res.headers.get("location"),
  };
}

let pass = 0, fail = 0;
function check(label, ok, hint) {
  if (ok) { pass++; console.log(`  [PASS] ${label}${hint ? " -- " + hint : ""}`); }
  else { fail++; console.log(`  [FAIL] ${label}`); }
}

(async () => {
  // 每次 e2e 开始先把 admin_users/admin_session 清空，确保可重现。
  const { default: postgres } = await import("postgres");
  const adm = postgres(process.env.DATABASE_URL, {
    prepare: false,
    max: 1,
    ssl: "require",
  });
  await adm`DELETE FROM admin_session`;
  await adm`DELETE FROM admin_users`;
  await adm.end();

  console.log("\n[1] / 初次无管理员 → /signup");
  cookieJar = "";
  let r = await req("/");
  check("status 307", r.status === 307, `got ${r.status}`);
  check("location /signup", r.location === "/signup", `got ${r.location}`);

  console.log("\n[2] /signup 200");
  r = await req("/signup");
  check("status 200", r.status === 200, `got ${r.status}`);

  console.log("\n[3] POST /api/auth/signup 创建 super");
  r = await req("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "超级管理员",
      email: "e2e-super@danci.test",
      password: "super123",
      confirmPassword: "super123",
    }),
  });
  check("status 200", r.status === 200, `got ${r.status}`);
  check("role=super", r.body?.user?.role === "super", `got ${r.body?.user?.role}`);
  check("cookie set", !!cookieJar);

  console.log("\n[4] / 登录后 → /books");
  r = await req("/");
  check("status 307", r.status === 307, `got ${r.status}`);
  check("location /books", r.location === "/books", `got ${r.location}`);

  console.log("\n[5a] /signup 已登录 → /books");
  r = await req("/signup");
  check("status 307", r.status === 307, `got ${r.status}`);
  check("location /books", r.location === "/books", `got ${r.location}`);

  console.log("\n[5b] signout 后 /signup 再次 → /signin");
  await req("/api/auth/signout", { method: "POST" });
  cookieJar = "";
  r = await req("/signup");
  check("status 307", r.status === 307, `got ${r.status}`);
  check("location /signin", r.location === "/signin", `got ${r.location}`);

  console.log("\n[5c] 未登录访问 /signin → 200");
  r = await req("/signin");
  check("status 200", r.status === 200, `got ${r.status}`);

  // 重新以 super 登录，给后续步骤用
  r = await req("/api/auth/signin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "e2e-super@danci.test",
      password: "super123",
    }),
  });
  check("super re-login", r.status === 200 && r.body?.user?.role === "super");

  console.log("\n[6] 再次 POST /api/auth/signup → 403");
  r = await req("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "x", email: "x@x.com", password: "xxxxxx", confirmPassword: "xxxxxx",
    }),
  });
  check("status 403", r.status === 403, `got ${r.status}`);

  console.log("\n[7] GET /api/admins (super)");
  r = await req("/api/admins");
  check("status 200", r.status === 200, `got ${r.status}`);
  check("returns array", Array.isArray(r.body.admins));

  console.log("\n[8] POST 创建 normal");
  r = await req("/api/admins", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "普通编辑",
      email: "e2e-normal@danci.test",
      password: "normal123",
      role: "normal",
    }),
  });
  check("status 200", r.status === 200, `got ${r.status}`);
  const normalId = r.body?.admin?.id;
  check("normal id returned", !!normalId);

  console.log("\n[9] super 改自己 role → 400");
  const meR = await req("/api/auth/me");
  const selfId = meR.body?.user?.id;
  r = await req(`/api/admins/${selfId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "normal" }),
  });
  check("status 400", r.status === 400, `got ${r.status}`);

  console.log("\n[10] super 提升 normal → super");
  r = await req(`/api/admins/${normalId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "super" }),
  });
  check("status 200", r.status === 200, `got ${r.status}`);
  check("now super", r.body?.admin?.role === "super");

  console.log("\n[11] 把 normal 降回 normal（还有另一位 super 兜底）");
  r = await req(`/api/admins/${normalId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "normal" }),
  });
  check("status 200", r.status === 200, `got ${r.status}`);

  console.log("\n[12] normal 登录后 GET /api/admins → 403");
  await req("/api/auth/signout", { method: "POST" });
  cookieJar = "";
  r = await req("/api/auth/signin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "e2e-normal@danci.test",
      password: "normal123",
    }),
  });
  check("normal signed in", r.status === 200 && r.body?.user?.role === "normal");
  r = await req("/api/admins");
  check("status 403", r.status === 403, `got ${r.status}`);

  console.log("\n[13] normal PATCH → 403");
  r = await req(`/api/admins/${normalId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "hijack" }),
  });
  check("status 403", r.status === 403, `got ${r.status}`);

  console.log("\n[14] normal 访问 /admin-users → 307 /books");
  r = await req("/admin-users");
  check("status 307", r.status === 307, `got ${r.status}`);
  check("location /books", r.location === "/books", `got ${r.location}`);

  console.log("\n[15] normal GET /api/books → 200（业务允许）");
  r = await req("/api/books");
  check("status 200", r.status === 200, `got ${r.status}`);

  console.log("\n[16] normal 错误密码 → 401");
  r = await req("/api/auth/signin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "e2e-normal@danci.test",
      password: "wrong-pwd",
    }),
  });
  check("status 401", r.status === 401, `got ${r.status}`);

  console.log("\n[17] normal signout → me 401");
  r = await req("/api/auth/signout", { method: "POST" });
  check("signout 200", r.status === 200, `got ${r.status}`);
  // 清掉 cookie 让下一次 me 真的拿不到会话
  cookieJar = "";
  r = await req("/api/auth/me");
  check("status 401", r.status === 401, `got ${r.status}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})();
