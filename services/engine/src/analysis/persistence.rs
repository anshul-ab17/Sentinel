use anyhow::Result;
use sentinel_engine::digest;
use serde_json::{Value, json};
use sqlx::PgPool;

pub(super) struct SignalRecord<'a> {
    pub cluster: &'a str,
    pub pool: &'a str,
    pub id: &'a str,
    pub rule_id: &'a str,
    pub severity: &'a str,
    pub status: &'a str,
    pub payload: &'a Value,
}

pub(super) async fn persist_signal(db: &PgPool, signal: SignalRecord<'_>) -> Result<()> {
    let mut tx = db.begin().await?;
    let changed = sqlx::query(
        r#"
INSERT INTO signals(id,cluster,pool_address,rule_id,rule_version,severity,status,payload)
VALUES($1,$2,$3,$4,'0.1.0',$5,$6,$7)
ON CONFLICT(id) DO UPDATE
SET status=excluded.status,payload=excluded.payload,updated_at=now()
WHERE signals.payload<>excluded.payload OR signals.status<>excluded.status
RETURNING id
"#,
    )
    .bind(signal.id)
    .bind(signal.cluster)
    .bind(signal.pool)
    .bind(signal.rule_id)
    .bind(signal.severity)
    .bind(signal.status)
    .bind(signal.payload)
    .fetch_optional(&mut *tx)
    .await?;
    if changed.is_some() {
        sqlx::query("INSERT INTO signal_revisions(signal_id,payload) VALUES($1,$2)")
            .bind(signal.id)
            .bind(signal.payload)
            .execute(&mut *tx)
            .await?;
        sqlx::query(
            "INSERT INTO outbox_events(topic,entity_id,payload,dedup_key) VALUES('signal',$1,$2,$3) ON CONFLICT DO NOTHING",
        )
        .bind(signal.id)
        .bind(json!({"id":signal.id,"pool":signal.pool,"status":signal.status}))
        .bind(digest(format!("{}:{}:{}", signal.id, signal.payload, signal.status)))
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}
