import postgres from "postgres";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(connectionString, { prepare: false, max: 1, ssl: "require" });

try {
  const tables = await client`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;
  console.log("=== Tables and columns ===");
  for (const row of tables) {
    console.log(`${row.table_name}.${row.column_name} : ${row.data_type}${row.is_nullable === "NO" ? " NOT NULL" : ""}`);
  }

  const indexes = await client`
    SELECT schemaname, tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `;
  console.log("\n=== Indexes ===");
  for (const row of indexes) {
    console.log(`${row.tablename}.${row.indexname}`);
    console.log("  ", row.indexdef);
  }

  const bookRowCount = await client`SELECT count(*)::int as n FROM books`;
  console.log("\n=== Books row count ===", bookRowCount[0].n);

  const wordRowCount = await client`SELECT count(*)::int as n FROM words`;
  console.log("=== Words row count ===", wordRowCount[0].n);
} finally {
  await client.end();
}
