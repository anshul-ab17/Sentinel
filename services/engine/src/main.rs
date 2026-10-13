use anyhow::{Context, Result, bail};
use reqwest::Client;
use sentinel_engine::{PROGRAM, decode_transaction};
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;
use std::{env, time::Duration};
mod analysis;
mod health;
mod hydration;
mod reconciler;
mod rpc;
mod storage;
use hydration::run_hydration;
use reconciler::reconcile_range;
use rpc::Rpc;
mod stream;

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();
    let health_port = env::var("ENGINE_HEALTH_PORT")
        .unwrap_or_else(|_| "4101".into())
        .parse::<u16>()?;
    if env::args().nth(1).as_deref() == Some("--health") {
        let response = Client::new()
            .get(format!("http://127.0.0.1:{health_port}/health/ready"))
            .timeout(Duration::from_secs(3))
            .send()
            .await?;
        if !response.status().is_success() {
            bail!("engine not ready")
        }
        return Ok(());
    }
    if env::args().nth(1).as_deref() == Some("--decode") {
        let file = env::args()
            .nth(2)
            .context("--decode requires a recorded JSON file")?;
        let payload: Value = serde_json::from_str(&std::fs::read_to_string(file)?)?;
        let raw = payload.get("result").unwrap_or(&payload);
        let (events, unsupported) = decode_transaction(raw)?;
        println!("{}", json!({"events":events,"unsupported":unsupported}));
        return Ok(());
    }
    let mode = env::var("APP_MODE").unwrap_or_else(|_| "live".into());
    let restricted = mode == "live";
    let db = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .after_connect(move |connection, _| {
            Box::pin(async move {
                if restricted {
                    sqlx::query(
                        r#"
SET ROLE sentinel_engine
"#,
                    )
                    .execute(connection)
                    .await?;
                }
                Ok(())
            })
        })
        .connect(&env::var("DATABASE_URL").context("DATABASE_URL required")?)
        .await?;
    let cluster = env::var("SOLANA_CLUSTER").unwrap_or_else(|_| "mainnet-beta".into());
    let health_db = db.clone();
    let health_cluster = cluster.clone();
    tokio::spawn(async move {
        if let Err(error) = health::serve(health_db, health_cluster, !restricted, health_port).await
        {
            tracing::error!(error=%error,"engine health listener stopped");
        }
    });
    if mode == "fixture" {
        tracing::info!("fixture engine: live transport disabled");
        health::shutdown().await;
        return Ok(());
    }
    if mode != "live" {
        bail!("APP_MODE must be fixture or live")
    }
    if !["mainnet-beta", "devnet", "testnet"].contains(&cluster.as_str()) {
        bail!("unsupported cluster")
    }
    let default_http = match cluster.as_str() {
        "mainnet-beta" => "https://api.mainnet.solana.com",
        "devnet" => "https://api.devnet.solana.com",
        "testnet" => "https://api.testnet.solana.com",
        _ => bail!("unsupported cluster"),
    };
    let primary = env::var("SOLANA_HTTP_URL")
        .ok()
        .filter(|url| !url.trim().is_empty())
        .unwrap_or_else(|| default_http.into());
    let mut urls = vec![primary];
    for key in ["SOLANA_HTTP_FALLBACK_URLS", "SOLANA_HTTP_FALLBACK_URL"] {
        if let Ok(configured) = env::var(key) {
            urls.extend(
                configured
                    .split(',')
                    .map(str::trim)
                    .filter(|url| !url.is_empty())
                    .map(str::to_owned),
            );
        }
    }
    urls.dedup();
    let rpc = Rpc {
        client: Client::builder().timeout(Duration::from_secs(20)).build()?,
        urls,
        gate: std::sync::Arc::new(tokio::sync::Mutex::new(tokio::time::Instant::now())),
        interval: Duration::from_millis(
            env::var("RPC_MIN_INTERVAL_MS")
                .unwrap_or_else(|_| "200".into())
                .parse::<u64>()?
                .clamp(10, 5000),
        ),
    };
    let expected = env::var("SOLANA_GENESIS_HASH").unwrap_or_else(|_| {
        if cluster == "mainnet-beta" {
            "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d".into()
        } else {
            String::new()
        }
    });
    if expected.is_empty() {
        bail!("SOLANA_GENESIS_HASH required to verify non-mainnet deployment cluster")
    }
    for url in &rpc.urls {
        let provider = Rpc {
            client: rpc.client.clone(),
            urls: vec![url.clone()],
            gate: rpc.gate.clone(),
            interval: rpc.interval,
        };
        if provider.call("getGenesisHash", json!([])).await?.as_str() != Some(&expected) {
            bail!("provider genesis hash mismatch")
        }
    }
    if env::var("DBC_PROGRAM_ID").unwrap_or_else(|_| PROGRAM.into()) != PROGRAM {
        bail!("DBC_PROGRAM_ID differs from pinned Anchor program")
    }
    let program = rpc
        .call(
            "getAccountInfo",
            json!([PROGRAM,{"encoding":"base64","commitment":"finalized"}]),
        )
        .await?;
    if program["value"]["executable"] != true {
        bail!("DBC program not executable")
    }
    // One engine per cluster until ownership is explicitly sharded.
    let mut owner = db.acquire().await?;
    let acquired: bool = sqlx::query_scalar("SELECT pg_try_advisory_lock(hashtext($1))")
        .bind(format!("engine:{cluster}"))
        .fetch_one(&mut *owner)
        .await?;
    if !acquired {
        bail!("engine already owns this cluster")
    }
    let default_websocket = match cluster.as_str() {
        "mainnet-beta" => "wss://api.mainnet-beta.solana.com",
        "devnet" => "wss://api.devnet.solana.com",
        "testnet" => "wss://api.testnet.solana.com",
        _ => bail!("unsupported cluster"),
    };
    let websocket_urls = env::var("SOLANA_WS_URLS")
        .or_else(|_| env::var("SOLANA_WS_URL"))
        .unwrap_or_else(|_| default_websocket.into())
        .split(',')
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    // Each configured stream reconnects independently. Finalized HTTP
    // reconciliation remains the durable source of complete slot coverage.
    let stream_tasks = websocket_urls
        .into_iter()
        .map(|url| tokio::spawn(stream::run(db.clone(), cluster.clone(), url, None)))
        .collect::<Vec<_>>();
    let hydration_task = tokio::spawn(run_hydration(db.clone(), rpc.clone(), cluster.clone()));
    let tip = rpc
        .call("getSlot", json!([{"commitment":"finalized"}]))
        .await?
        .as_u64()
        .context("invalid slot")?;
    let existing: Option<String> = sqlx::query_scalar("SELECT slot::text FROM provider_checkpoints WHERE cluster=$1 AND provider='http-blocks' AND stage='finalized'")
        .bind(&cluster)
        .fetch_optional(&db)
        .await?;
    let mut next = if let Some(existing) = existing {
        existing.parse::<u64>()?.saturating_sub(16)
    } else {
        let start = env::var("START_SLOT")
            .ok()
            .filter(|s| !s.is_empty())
            .map(|s| s.parse::<u64>())
            .transpose()?
            .unwrap_or(tip.saturating_sub(16));
        sqlx::query(r#"
INSERT INTO coverage_intervals(cluster,start_slot,status,detail)
    VALUES($1,$2::numeric,'partial','Finalized HTTP ingestion begins here; earlier history is not indexed')
"#)
            .bind(&cluster)
            .bind(start.to_string())
            .execute(&db)
            .await?;
        start
    };
    let shutdown = health::shutdown();
    tokio::pin!(shutdown);
    tracing::info!(
        start_slot = next,
        "Anchor DBC finalized reconciliation started"
    );
    let mut retry_delay = 2u64;
    loop {
        let work = async {
            reconcile_range(&db, &rpc, &cluster, &mut next).await?;
            Ok::<(), anyhow::Error>(())
        };
        tokio::select! { _ = &mut shutdown => break, result = work => {
            if let Err(error) = result {
                tracing::warn!(error=%error,"ingestion paused; retrying same recovery boundary");
                let _=sqlx::query(r#"
INSERT INTO coverage_intervals(cluster,start_slot,status,detail) SELECT $1,$2::numeric,'gap',$3
    WHERE NOT EXISTS(SELECT 1
    FROM coverage_intervals
    WHERE cluster=$1
    AND start_slot=$2::numeric
    AND status='gap'
    AND end_slot IS NULL)
"#)
                    .bind(&cluster)
                    .bind(next.to_string())
                    .bind(error.to_string())
                    .execute(&db)
                    .await;
                retry_delay=retry_delay.saturating_mul(2).min(60);
            } else {
                retry_delay=2;
                let _=sqlx::query(r#"
UPDATE coverage_intervals
    SET end_slot=$2::numeric,status='recovered'
    WHERE cluster=$1
    AND status='gap'
    AND end_slot IS NULL
    AND start_slot<$3::numeric
"#)
                    .bind(&cluster)
                    .bind(next.saturating_sub(1).to_string())
                    .bind(next.to_string())
                    .execute(&db)
                    .await;
            }
        } }
        tokio::select! { _ = &mut shutdown => break, _ = tokio::time::sleep(Duration::from_secs(retry_delay)) => {} }
    }
    for task in stream_tasks {
        task.abort();
        let _ = task.await;
    }
    hydration_task.abort();
    let _ = hydration_task.await;
    sqlx::query(
        r#"
UPDATE processing_jobs
    SET status='pending',lease_until=NULL,lease_token=NULL
    WHERE kind IN ('analysis','hydrate')
    AND payload->>'cluster'=$1
    AND status='running'
"#,
    )
    .bind(&cluster)
    .execute(&db)
    .await?;
    sqlx::query(
        r#"
SELECT pg_advisory_unlock(hashtext($1))
"#,
    )
    .bind(format!("engine:{cluster}"))
    .execute(&mut *owner)
    .await?;
    db.close().await;
    Ok(())
}

#[cfg(test)]
mod integration {
    use super::*;
    use crate::storage::persist_block;
    #[tokio::test]
    async fn recorded_blocks_survive_restart_overlap_without_duplicate_volume() -> Result<()> {
        dotenvy::dotenv().ok();
        let Ok(url) = env::var("DATABASE_URL") else {
            eprintln!("PostgreSQL integration not run: set DATABASE_URL");
            return Ok(());
        };
        let db = PgPoolOptions::new()
            .max_connections(5)
            .connect(&url)
            .await?;
        let cluster = format!(
            "test-recorded-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)?
                .as_nanos()
        );
        let initialize: Value = serde_json::from_str(include_str!(
            "../../../fixtures/recorded/dbc-initialize-block.json"
        ))?;
        let swap: Value = serde_json::from_str(include_str!(
            "../../../fixtures/recorded/dbc-swap-block.json"
        ))?;
        persist_block(&db, &cluster, 510342920, &initialize["result"]).await?;
        persist_block(&db, &cluster, 510343149, &swap["result"]).await?;
        let (pool, observation, start) = sqlx::query_as::<_, (String, String, String)>(
            "SELECT pool_address,observation_id,payload->>'timestamp' FROM canonical_events WHERE cluster=$1 AND kind='pool_created' LIMIT 1",
        )
        .bind(&cluster)
        .fetch_one(&db)
        .await?;
        let start = start.parse::<i64>()?;
        for index in 0..5 {
            let wallet = format!("fixture-buyer-{index}");
            let event_id = format!("fixture-swap-{cluster}-{index}");
            let signature = format!("fixture-swap-signature-{cluster}-{index}");
            let timestamp = start + 10 + index;
            let payload = json!({
                "event_id":event_id,"kind":"swap","pool":pool,"trader":wallet,
                "trade_direction":1,"amount_raw":"1000000000","timestamp":timestamp.to_string()
            });
            sqlx::query(
                "INSERT INTO canonical_events(event_id,cluster,pool_address,kind,slot,signature,instruction_path,ordinal,commitment,observation_id,payload,transaction_index) VALUES($1,$2,$3,'swap',$4::numeric,$5,$6,0,'finalized',$7,$8,100)",
            )
            .bind(&event_id)
            .bind(&cluster)
            .bind(&pool)
            .bind((510343150 + index).to_string())
            .bind(&signature)
            .bind(json!([index]))
            .bind(&observation)
            .bind(payload)
            .execute(&db)
            .await?;
        }
        for index in 0..3 {
            let source = "fixture-shared-funder";
            let recipient = format!("fixture-buyer-{index}");
            let event_id = format!("fixture-funding-{cluster}-{index}");
            sqlx::query(
                "INSERT INTO wallet_transfers(event_id,cluster,signature,slot,transaction_index,instruction_path,source_wallet,recipient_wallet,lamports,block_time,observation_id) VALUES($1,$2,$3,$4::numeric,0,'[0]'::jsonb,$5,$6,$7::numeric,$8,$9)",
            )
            .bind(&event_id)
            .bind(&cluster)
            .bind(format!("fixture-funding-signature-{cluster}-{index}"))
            .bind((510343140 + index).to_string())
            .bind(source)
            .bind(recipient)
            .bind(if index == 0 { "100000000000" } else { "1000" })
            .bind(start + 2)
            .bind(&observation)
            .execute(&db)
            .await?;
        }
        crate::analysis::analyze_pool_for_test(&db, &cluster, &pool).await?;
        let found_rules: Vec<String> = sqlx::query_scalar(
            "SELECT DISTINCT rule_id FROM signals WHERE cluster=$1 AND status='active'",
        )
        .bind(&cluster)
        .fetch_all(&db)
        .await?;
        assert!(found_rules.iter().any(|rule| rule == "shared-funding"));
        assert!(found_rules.iter().any(|rule| rule == "large-transfer"));
        let before: i64 =
            sqlx::query_scalar("SELECT count(*) FROM canonical_events WHERE cluster=$1")
                .bind(&cluster)
                .fetch_one(&db)
                .await?;
        assert!(before >= 2);
        persist_block(&db, &cluster, 510342920, &initialize["result"]).await?;
        persist_block(&db, &cluster, 510343149, &swap["result"]).await?;
        let after: i64 =
            sqlx::query_scalar("SELECT count(*) FROM canonical_events WHERE cluster=$1")
                .bind(&cluster)
                .fetch_one(&db)
                .await?;
        assert_eq!(before, after);
        let completed: String = sqlx::query_scalar(
            "SELECT slot::text FROM provider_checkpoints WHERE cluster=$1 AND stage='finalized'",
        )
        .bind(&cluster)
        .fetch_one(&db)
        .await?;
        assert_eq!(completed, "510343149");
        assert!(persist_block(&db,&cluster,510343150,&json!({"blockhash":"invalid-test","transactions":[{"transaction":{"message":{"accountKeys":[PROGRAM]}}}]})).await.is_err());
        let completed_after_failure: String = sqlx::query_scalar(
            "SELECT slot::text FROM provider_checkpoints WHERE cluster=$1 AND stage='finalized'",
        )
        .bind(&cluster)
        .fetch_one(&db)
        .await?;
        assert_eq!(completed, completed_after_failure);
        // This unique test namespace is the only target of cleanup.
        sqlx::query(
            r#"
DELETE
    FROM outbox_events
    WHERE dedup_key IN (SELECT 'event:'||event_id||':'||o.block_hash
    FROM canonical_events e
    JOIN chain_observations o ON o.id=e.observation_id
    WHERE e.cluster=$1)
"#,
        )
        .bind(&cluster)
        .execute(&db)
        .await?;
        sqlx::query(
            r#"
DELETE
    FROM processing_jobs
    WHERE payload->>'cluster'=$1
"#,
        )
        .bind(&cluster)
        .execute(&db)
        .await?;
        sqlx::query(
            r#"
DELETE
    FROM signal_revisions
    WHERE signal_id IN (SELECT id FROM signals WHERE cluster=$1)
"#,
        )
        .bind(&cluster)
        .execute(&db)
        .await?;
        sqlx::query(
            r#"
DELETE
    FROM outbox_events
    WHERE entity_id IN (SELECT id FROM signals WHERE cluster=$1)
"#,
        )
        .bind(&cluster)
        .execute(&db)
        .await?;
        sqlx::query("DELETE FROM signals WHERE cluster=$1")
            .bind(&cluster)
            .execute(&db)
            .await?;
        sqlx::query(
            r#"
DELETE
    FROM canonical_events
    WHERE cluster=$1
"#,
        )
        .bind(&cluster)
        .execute(&db)
        .await?;
        sqlx::query(
            r#"
DELETE
    FROM wallet_transfers
    WHERE cluster=$1
"#,
        )
        .bind(&cluster)
        .execute(&db)
        .await?;
        sqlx::query(
            r#"
DELETE
    FROM chain_observations
    WHERE cluster=$1
"#,
        )
        .bind(&cluster)
        .execute(&db)
        .await?;
        sqlx::query(
            r#"
DELETE
    FROM pools
    WHERE cluster=$1
"#,
        )
        .bind(&cluster)
        .execute(&db)
        .await?;
        sqlx::query(
            r#"
DELETE
    FROM provider_checkpoints
    WHERE cluster=$1
"#,
        )
        .bind(&cluster)
        .execute(&db)
        .await?;
        sqlx::query(
            r#"
DELETE
    FROM coverage_intervals
    WHERE cluster=$1
"#,
        )
        .bind(&cluster)
        .execute(&db)
        .await?;
        db.close().await;
        Ok(())
    }
}
