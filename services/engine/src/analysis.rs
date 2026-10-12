use anyhow::{Context, Result};
use sentinel_engine::digest;
use serde_json::{Value, json};
use sqlx::{PgPool, Row};

pub(crate) async fn drain_analysis(db: &PgPool) -> Result<()> {
    for _ in 0..100 {
        let job = sqlx::query(r#"
WITH candidate AS (SELECT id
    FROM processing_jobs
    WHERE kind='analysis'
    AND attempts<5
    AND available_at<=now()
    AND (status='pending' OR (status='running'
    AND lease_until<now()))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE processing_jobs j
    SET status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '30 seconds'
    FROM candidate c
    WHERE j.id=c.id
    RETURNING j.id::text,j.lease_token::text,j.payload
"#)
            .fetch_optional(db).await?;
        let Some(job) = job else { break };
        let id: String = job.get("id");
        let token: String = job.get("lease_token");
        let payload: Value = job.get("payload");
        let result = analyze(
            db,
            payload["cluster"].as_str().context("job cluster")?,
            payload["pool"].as_str().context("job pool")?,
        )
        .await;
        if result.is_ok() {
            sqlx::query(
                r#"
UPDATE processing_jobs
    SET status='completed',lease_until=NULL,lease_token=NULL
    WHERE id=$1::uuid
    AND lease_token=$2::uuid
"#,
            )
            .bind(id)
            .bind(token)
            .execute(db)
            .await?;
        } else {
            sqlx::query(r#"
UPDATE processing_jobs
    SET status=CASE WHEN attempts>=5 THEN 'dead' ELSE 'pending' END,available_at=now()+interval '10 seconds',last_error='analysis_failed',lease_until=NULL,lease_token=NULL
    WHERE id=$1::uuid
    AND lease_token=$2::uuid
"#)
                .bind(id)
                    .bind(token)
                    .execute(db)
                    .await?;
        }
    }
    Ok(())
}

async fn analyze(db: &PgPool, cluster: &str, pool: &str) -> Result<()> {
    let rows = sqlx::query(
        r#"
SELECT payload
    FROM canonical_events
    WHERE cluster=$1
    AND pool_address=$2
    AND active
    AND kind IN ('pool_created','swap')
    ORDER BY slot,transaction_index,instruction_path,ordinal LIMIT 10000
"#,
    )
    .bind(cluster)
    .bind(pool)
    .fetch_all(db)
    .await?;
    let events: Vec<Value> = rows.iter().map(|r| r.get::<Value, _>("payload")).collect();
    let Some(created) = events.iter().find(|e| e["kind"] == "pool_created") else {
        return Ok(());
    };
    let Some(start) = created["timestamp"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
    else {
        return Ok(());
    };
    let mut volumes = std::collections::BTreeMap::<String, u128>::new();
    let mut evidence = vec![created["event_id"].clone()];
    let mut timestamp = start;
    for event in &events {
        if event["kind"] != "swap" || event["trade_direction"] != 1 {
            continue;
        }
        let Some(time) = event["timestamp"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok())
        else {
            continue;
        };
        if time < start || time > start.saturating_add(90) {
            continue;
        }
        let Some(trader) = event["trader"].as_str() else {
            return Ok(());
        }; // attribution gap: abstain
        let amount = event["amount_raw"]
            .as_str()
            .context("amount missing")?
            .parse::<u128>()?;
        let volume = volumes.entry(trader.to_string()).or_default();
        *volume = volume.checked_add(amount).context("volume overflow")?;
        evidence.push(event["event_id"].clone());
        timestamp = timestamp.max(time);
    }
    if volumes.len() < 5 {
        return Ok(());
    }
    let mut ranked = volumes.values().copied().collect::<Vec<_>>();
    ranked.sort_unstable_by(|a, b| b.cmp(a));
    let total = ranked
        .iter()
        .try_fold(0u128, |s, v| s.checked_add(*v))
        .context("total overflow")?;
    if total == 0 {
        return Ok(());
    }
    let top = ranked
        .iter()
        .take(3)
        .try_fold(0u128, |s, v| s.checked_add(*v))
        .context("top overflow")?;
    let share = top.checked_mul(10000).context("share overflow")? / total;
    let id = digest(format!(
        "{cluster}:{pool}:early-buyer-concentration:0.1.0:{start}"
    ));
    let status = if share >= 7500 { "active" } else { "retracted" };
    let payload = json!({
        "id":id,
        "pool":pool,
        "rule":{"id":"early-buyer-concentration","version":"0.1.0"},
        "severity":"high",
        "timestamp":timestamp,

            "title":"Early buying is concentrated",
        "observation":format!("The top 3 of {} attributed buyers account for {} basis points of covered early quote input.",volumes.len(),share),

            "interpretation":"Volume concentration is not supply ownership or proof of manipulation. Only directly attributed swaps in the indexed window are included.",
        "evidence":evidence,

            "metrics":{"buyerCount":volumes.len(),"topBuyerCount":3,"shareBps":share as u64,"windowSeconds":90,"totalQuoteRaw":total.to_string()},
        "coverage":"partial",
        "commitment":"finalized"
    });
    let mut tx = db.begin().await?;
    let changed = sqlx::query(r#"
INSERT INTO signals(id,cluster,pool_address,rule_id,rule_version,severity,status,payload) SELECT $1,$2,$3,'early-buyer-concentration','0.1.0','high',$4,$5
    WHERE $4='active' OR EXISTS(SELECT 1
    FROM signals
    WHERE id=$1)
    ON CONFLICT(id)
    DO UPDATE
    SET status=excluded.status,payload=excluded.payload,updated_at=now()
    WHERE signals.payload<>excluded.payload OR signals.status<>excluded.status
    RETURNING id
"#)
        .bind(&id)
            .bind(cluster)
            .bind(pool)
            .bind(status)
            .bind(&payload)
            .fetch_optional(&mut *tx)
            .await?;
    if changed.is_some() {
        sqlx::query(
            r#"
INSERT INTO signal_revisions(signal_id,payload)
    VALUES($1,$2)
"#,
        )
        .bind(&id)
        .bind(&payload)
        .execute(&mut *tx)
        .await?;
        sqlx::query(
            r#"
INSERT INTO outbox_events(topic,entity_id,payload,dedup_key)
    VALUES('signal',$1,$2,$3)
    ON CONFLICT DO NOTHING
"#,
        )
        .bind(&id)
        .bind(json!({"id":id,"pool":pool,"status":status}))
        .bind(digest(format!("{id}:{payload}:{status}")))
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}
