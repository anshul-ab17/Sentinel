import { createHash } from "node:crypto";

import { transaction, type Database } from "../../../packages/database/store.ts";
export async function dispatchInApp(db: Database) {
  await transaction(db, async (client) => {
    await client.query(
      "INSERT INTO worker_checkpoints(name,cursor) VALUES('in-app',0) ON CONFLICT DO NOTHING",
    );
    const cursor = (
      await client.query(
        "SELECT cursor::text FROM worker_checkpoints WHERE name='in-app' FOR UPDATE",
      )
    ).rows[0].cursor;
    const rows = (
      await client.query(
        "SELECT id::text,entity_id FROM outbox_events WHERE id>$1 AND topic='signal' AND user_id IS NULL ORDER BY id LIMIT 50",
        [cursor],
      )
    ).rows;
    for (const row of rows) {
      const signal = (
        await client.query("SELECT id,pool_address,status,payload FROM signals WHERE id=$1", [
          row.entity_id,
        ])
      ).rows[0];
      if (signal) {
        const users = (
          await client.query(
            "SELECT DISTINCT w.user_id FROM watchlists w LEFT JOIN notification_preferences p ON p.user_id=w.user_id WHERE w.items ? $1 AND COALESCE(p.in_app,true)",
            [signal.pool_address],
          )
        ).rows;
        for (const { user_id } of users) {
          const key = `${user_id}:${signal.id}:in-app`,
            id = createHash("sha256").update(key).digest("hex");
          const changed = await client.query(
            "INSERT INTO in_app_alerts(id,user_id,signal_id,incident_key,status,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(incident_key) DO UPDATE SET status=excluded.status,payload=excluded.payload,updated_at=now() WHERE in_app_alerts.payload<>excluded.payload OR in_app_alerts.status<>excluded.status RETURNING id",
            [id, user_id, signal.id, key, signal.status, signal.payload],
          );
          if (changed.rowCount)
            await client.query(
              "INSERT INTO outbox_events(user_id,topic,entity_id,payload,dedup_key) VALUES($1,'alert',$2,$3,$4) ON CONFLICT DO NOTHING",
              [
                user_id,
                id,
                { incident_id: id, signal_id: signal.id, status: signal.status },
                `${key}:${row.id}`,
              ],
            );
        }
      }
      await client.query("UPDATE worker_checkpoints SET cursor=$1 WHERE name='in-app'", [row.id]);
    }
  });
}
