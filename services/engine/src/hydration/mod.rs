use crate::{rpc::Rpc, stream};
use anyhow::{Context, bail};
use sentinel_engine::digest;
use serde_json::json;
use sqlx::PgPool;
use std::time::Duration;

pub(crate) async fn run_hydration(db: PgPool, rpc: Rpc, cluster: String) {
    loop {
        let job = stream::claim_hydration(&db, &cluster).await;
        if let Ok(Some((id, token, payload))) = job {
            let signature = payload["signature"].as_str().unwrap_or("");
            let response = tokio::time::timeout(
                Duration::from_secs(8),
                rpc.call(
                    "getTransaction",
                    json!([signature, {
                        "encoding": "json",
                        "commitment": "finalized",
                        "maxSupportedTransactionVersion": 1
                    }]),
                ),
            )
            .await;
            let result = async {
                let raw = response??;
                if raw.is_null() {
                    bail!("transaction not available")
                }
                let slot = raw["slot"].as_u64().context("hydration slot missing")?;
                let observation = digest(format!(
                    "{cluster}:{signature}:{slot}:hydrated:{}",
                    digest(raw.to_string())
                ));
                let mut tx = db.begin().await?;
                let lease = sqlx::query(
                    r#"
SELECT id
    FROM processing_jobs
    WHERE id=$1::uuid
    AND lease_token=$2::uuid
    AND lease_until>now() FOR UPDATE
"#,
                )
                .bind(&id)
                .bind(&token)
                .fetch_optional(&mut *tx)
                .await?;
                if lease.is_none() {
                    return Ok::<(), anyhow::Error>(());
                }
                sqlx::query(
                    r#"
INSERT INTO chain_observations(id,cluster,signature,slot,block_hash,provider,commitment,raw)
    VALUES($1,$2,$3,$4::numeric,NULL,'http-hydration','finalized',$5)
    ON CONFLICT DO NOTHING
"#,
                )
                .bind(&observation)
                .bind(&cluster)
                .bind(signature)
                .bind(slot.to_string())
                .bind(raw)
                .execute(&mut *tx)
                .await?;
                sqlx::query(
                    r#"
UPDATE processing_jobs
    SET status='completed',lease_until=NULL,lease_token=NULL
    WHERE id=$1::uuid
    AND lease_token=$2::uuid
"#,
                )
                .bind(&id)
                .bind(&token)
                .execute(&mut *tx)
                .await?;
                // Hydration preserves evidence. Canonical order/facts still require
                // the finalized block reconciler; receipt order is never used.
                tx.commit().await?;
                Ok(())
            }
            .await;
            if result.is_err() {
                let _=sqlx::query(r#"
UPDATE processing_jobs
    SET status=CASE WHEN attempts>=5 THEN 'dead' ELSE 'pending' END,available_at=now()+interval '10 seconds',lease_until=NULL,lease_token=NULL,last_error='hydration_unavailable'
    WHERE id=$1::uuid
    AND lease_token=$2::uuid
"#)
                    .bind(&id)
                    .bind(&token)
                    .execute(&db)
                    .await;
            }
        } else {
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
    }
}
