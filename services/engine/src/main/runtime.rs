use anyhow::{Context, Result, bail};
use reqwest::Client;
use sentinel_engine::PROGRAM;
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use std::{env, time::Duration};

use crate::{health, hydration::run_hydration, reconciler::reconcile_range, rpc::Rpc, stream};

pub async fn run() -> Result<()> {
    let health_port = env::var("ENGINE_HEALTH_PORT")
        .unwrap_or_else(|_| "4101".into())
        .parse::<u16>()?;
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
    let primary = ["SOLANA_HTTP_URL", "RPCFAST_HTTP_URL", "SOLAMI_HTTP_URL"]
        .iter()
        .find_map(|key| env::var(key).ok().filter(|url| !url.trim().is_empty()))
        .unwrap_or_else(|| default_http.into());
    let mut urls = vec![primary];
    for key in [
        "RPCFAST_HTTP_URL",
        "SOLAMI_HTTP_URL",
        "SOLANA_HTTP_FALLBACK_URLS",
        "SOLANA_HTTP_FALLBACK_URL",
    ] {
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
    let mut websocket_urls = ["SOLANA_WS_URLS", "SOLANA_WS_URL"]
        .iter()
        .find_map(|key| env::var(key).ok().filter(|value| !value.trim().is_empty()))
        .unwrap_or_else(|| default_websocket.into())
        .split(',')
        .map(str::trim)
        .filter(|url| !url.is_empty())
        .map(str::to_owned)
        .collect::<Vec<_>>();
    for key in ["RPCFAST_WS_URL", "SOLAMI_WS_URL"] {
        if let Ok(url) = env::var(key)
            && !url.trim().is_empty()
        {
            websocket_urls.push(url);
        }
    }
    websocket_urls.dedup();
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
