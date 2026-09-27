/* eslint-disable */
require("dotenv/config");
const postgres = require("postgres");

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  try {
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name IN ('admin_users','admin_session')
      ORDER BY table_name`;
    console.log("tables:", tables.map((t) => t.table_name));
    const types = await sql`
      SELECT typname FROM pg_type WHERE typname='admin_role'`;
    console.log("types:", types.map((t) => t.typname));
    const cols = await sql`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('admin_users','admin_session')
      ORDER BY table_name, ordinal_position`;
    for (const c of cols) {
      console.log(`  ${c.table_name}.${c.column_name} : ${c.data_type}${c.is_nullable==='NO'?' NOT NULL':''}`);
    }
  } finally {
    await sql.end();
  }
})();
