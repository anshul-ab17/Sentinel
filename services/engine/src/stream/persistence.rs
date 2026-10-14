use anyhow::{Context, Result};
use sentinel_engine::digest;
use serde_json::{Value, json};
use sqlx::PgPool;

pub(crate) async fn persist(db: &PgPool, cluster: &str, notification: &Value) -> Result<()> {
    if notification["method"] != "logsNotification" {
        return Ok(());
    }
    let result = &notification["params"]["result"];
    let signature = result["value"]["signature"]
        .as_str()
        .context("notification signature missing")?;
    let slot = result["context"]["slot"]
        .as_u64()
        .context("notification slot missing")?;
    let id = digest(format!("{cluster}:{signature}:{slot}:websocket"));
    let mut tx = db.begin().await?;
    sqlx::query(
        r#"
INSERT INTO chain_observations(id,cluster,signature,slot,block_hash,provider,commitment,raw)
    VALUES($1,$2,$3,$4::numeric,NULL,'websocket','finalized',$5)
    ON CONFLICT DO NOTHING
"#,
    )
    .bind(&id)
    .bind(cluster)
    .bind(signature)
    .bind(slot.to_string())
    .bind(notification)
    .execute(&mut *tx)
    .await?;
    if result["value"]["err"].is_null() {
        sqlx::query(r#"
INSERT INTO processing_jobs(id,kind,dedup_key,payload)
    VALUES(gen_random_uuid(),'hydrate',$1,$2)
    ON CONFLICT DO NOTHING
"#)
            .bind(format!("hydrate:{id}"))
                .bind(json!({"cluster":cluster,"signature":signature,"observation_id":id,"slot":slot.to_string()}))
                .execute(&mut *tx)
                .await?;
    }
    // A notification's slot is not a complete recovery boundary. The HTTP
    // reconciler alone advances durable complete checkpoints.
    tx.commit().await?;
    Ok(())
}
