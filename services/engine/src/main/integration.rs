use anyhow::Result;
use sentinel_engine::PROGRAM;
use serde_json::{Value, json};
use sqlx::postgres::PgPoolOptions;
use std::env;

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
        "../../../../fixtures/recorded/dbc-initialize-block.json"
    ))?;
    let swap: Value = serde_json::from_str(include_str!(
        "../../../../fixtures/recorded/dbc-swap-block.json"
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
    for index in 0..6 {
        let wallet = format!("fixture-buyer-{index}");
        let event_id = format!("fixture-swap-{cluster}-{index}");
        let signature = format!("fixture-swap-signature-{cluster}-{index}");
        let timestamp = start + 1 + index;
        let reserve = if index == 0 {
            "1000000000"
        } else {
            "700000000"
        };
        let payload = json!({
            "event_id":event_id,"kind":"swap","pool":pool,"trader":wallet,
            "trade_direction":1,"amount_raw":"1000000000","timestamp":timestamp.to_string(),
            "quote_reserve_amount":reserve
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
    for index in 0..4 {
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
            .bind(start)
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
    assert!(found_rules.iter().any(|rule| rule == "early-buy-burst"));
    assert!(found_rules.iter().any(|rule| rule == "liquidity-shift"));
    let before: i64 = sqlx::query_scalar("SELECT count(*) FROM canonical_events WHERE cluster=$1")
        .bind(&cluster)
        .fetch_one(&db)
        .await?;
    assert!(before >= 2);
    persist_block(&db, &cluster, 510342920, &initialize["result"]).await?;
    persist_block(&db, &cluster, 510343149, &swap["result"]).await?;
    let after: i64 = sqlx::query_scalar("SELECT count(*) FROM canonical_events WHERE cluster=$1")
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
