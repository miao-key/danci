/* eslint-disable */
// 清空 admin_users / admin_session 用于 e2e 测试
require("dotenv/config");
const postgres = require("postgres");

(async () => {
  const sql = postgres(process.env.DATABASE_URL, {
    prepare: false,
    max: 1,
    ssl: "require",
  });
  try {
    await sql`DELETE FROM admin_session`;
    await sql`DELETE FROM admin_users`;
    const [{ value: u }] = await sql`SELECT COUNT(*)::int AS value FROM admin_users`;
    const [{ value: s }] = await sql`SELECT COUNT(*)::int AS value FROM admin_session`;
    console.log(`✓ users=${u} sessions=${s}`);
  } finally {
    await sql.end();
  }
})();
