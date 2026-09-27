/* eslint-disable */
// 清空 admin_users + admin_session 两张表（保留单词业务数据）
require("dotenv/config");
const postgres = require("postgres");

(async () => {
  const sql = postgres(process.env.DATABASE_URL, {
    prepare: false,
    max: 1,
    ssl: "require",
  });

  const before = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM admin_users)  AS users,
      (SELECT COUNT(*)::int FROM admin_session) AS sessions
  `;
  console.log("before:", JSON.stringify(before));

  await sql`DELETE FROM admin_session`;
  await sql`DELETE FROM admin_users`;

  const after = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM admin_users)  AS users,
      (SELECT COUNT(*)::int FROM admin_session) AS sessions
  `;
  console.log("after :", JSON.stringify(after));

  await sql.end();
  console.log("OK");
})();
