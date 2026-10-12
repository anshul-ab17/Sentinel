import pg from "pg";

import type { PoolClient } from "pg";
export const createDatabase = (url: string, role?: "sentinel_api" | "sentinel_worker") =>
  new pg.Pool({
    connectionString: url,
    options: role ? `-c role=${role}` : undefined,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  });
export type Database = ReturnType<typeof createDatabase>;
export async function transaction<T>(
  db: Database,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export async function claimJob(db: Database, token: string) {
  const result = await db.query(
    `WITH candidate AS (
    SELECT id FROM processing_jobs WHERE kind='assessment' AND attempts < 5 AND available_at <= now()
    AND (status='pending' OR (status='running' AND lease_until < now()))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE processing_jobs j SET status='running', attempts=attempts+1,
    lease_token=$1, lease_until=now()+interval '30 seconds' FROM candidate c
    WHERE j.id=c.id RETURNING j.*`,
    [token],
  );
  return result.rows[0];
}
