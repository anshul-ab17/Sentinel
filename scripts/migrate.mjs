import { readdir, readFile } from "node:fs/promises";

import pg from "pg";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = await db.connect();
try {
  await client.query("SELECT pg_advisory_lock(73638412)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    if ((await client.query("SELECT 1 FROM schema_migrations WHERE version=$1", [name])).rowCount)
      continue;
    await client.query("BEGIN");
    try {
      await client.query(await readFile(new URL("../migrations/" + name, import.meta.url), "utf8"));
      await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [name]);
      await client.query("COMMIT");
      console.log("Applied", name);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(73638412)");
  client.release();
  await db.end();
}
