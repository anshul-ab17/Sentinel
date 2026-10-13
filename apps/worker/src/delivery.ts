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
        await client.query(
          "SELECT id,pool_address,rule_id,severity,status,payload FROM signals WHERE id=$1",
          [row.entity_id],
        )
      ).rows[0];
      if (signal) {
        const users = (
          await client.query(
            `SELECT DISTINCT w.user_id,r.enabled,r.minimum_severity,r.cooldown_seconds
               FROM watchlists w
               LEFT JOIN notification_preferences p ON p.user_id=w.user_id
               LEFT JOIN alert_rule_preferences r
                 ON r.user_id=w.user_id AND r.rule_id=$2
              WHERE w.items ? $1 AND COALESCE(p.in_app,true)
                AND COALESCE(r.enabled,true)
                AND CASE $3::text WHEN 'critical' THEN 4 WHEN 'high' THEN 3
                    WHEN 'medium' THEN 2 ELSE 1 END >=
                    CASE COALESCE(r.minimum_severity,'low') WHEN 'critical' THEN 4
                    WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END`,
            [signal.pool_address, signal.rule_id, signal.severity],
          )
        ).rows;
        for (const { user_id, cooldown_seconds } of users) {
          const key = `${user_id}:${signal.id}:in-app`,
            id = createHash("sha256").update(key).digest("hex");
          const existing = await client.query("SELECT 1 FROM in_app_alerts WHERE incident_key=$1", [
            key,
          ]);
          if (!existing.rowCount && cooldown_seconds > 0) {
            const recent = await client.query(
              `SELECT 1 FROM in_app_alerts a JOIN signals s ON s.id=a.signal_id
                WHERE a.user_id=$1 AND s.rule_id=$2 AND a.updated_at >
                  now()-make_interval(secs=>$3) LIMIT 1`,
              [user_id, signal.rule_id, cooldown_seconds],
            );
            if (recent.rowCount) continue;
          }
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
