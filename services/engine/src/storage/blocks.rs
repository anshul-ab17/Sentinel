use super::queries::*;
use anyhow::{Context, Result, bail};
use sentinel_engine::{
    DECODER, PROGRAM, account_keys, decode_system_transfers, decode_transaction, digest,
};
use serde_json::{Value, json};
use sqlx::PgPool;

pub(crate) async fn persist_block(
    db: &PgPool,
    cluster: &str,
    slot: u64,
    block: &Value,
) -> Result<()> {
    let block_hash = block["blockhash"].as_str().context("block hash missing")?;
    let transactions = block["transactions"]
        .as_array()
        .context("full block transactions missing")?;
    let mut tx = db.begin().await?;
    let mut affected = std::collections::BTreeSet::new();
    for (tx_index, raw) in transactions.iter().enumerate() {
        let keys = account_keys(raw);
        let has_dbc = keys.iter().any(|key| key.as_str() == Some(PROGRAM));
        let transfers = decode_system_transfers(raw);
        if !has_dbc && transfers.is_empty() {
            continue;
        }
        let signature = raw["transaction"]["signatures"][0]
            .as_str()
            .context("signature missing")?;
        let (events, unsupported) = if has_dbc {
            decode_transaction(raw)?
        } else {
            (vec![], vec![])
        };
        let observation = digest(format!(
            "{cluster}:{signature}:{slot}:{block_hash}:finalized"
        ));
        sqlx::query(INSERT_OBSERVATION)
            .bind(&observation)
            .bind(cluster)
            .bind(signature)
            .bind(slot.to_string())
            .bind(block_hash)
            .bind(raw)
            .execute(&mut *tx)
            .await?;
        if !unsupported.is_empty() {
            sqlx::query(RECORD_UNSUPPORTED_COVERAGE)
                .bind(cluster)
                .bind(slot.to_string())
                .bind(format!("{signature}: {}", unsupported.join("; ")))
                .execute(&mut *tx)
                .await?;
        }
        let block_time = block["blockTime"].as_i64();
        for transfer in transfers {
            let path = json!(transfer.path);
            let event_id = digest(format!("{cluster}:{signature}:{path}:system-transfer-v1"));
            sqlx::query(UPSERT_WALLET_TRANSFER)
                .bind(&event_id)
                .bind(cluster)
                .bind(signature)
                .bind(slot.to_string())
                .bind(tx_index as i32)
                .bind(&path)
                .bind(&transfer.source)
                .bind(&transfer.recipient)
                .bind(&transfer.lamports)
                .bind(block_time)
                .bind(&observation)
                .execute(&mut *tx)
                .await?;
            sqlx::query(
                "INSERT INTO outbox_events(topic,entity_id,payload,dedup_key) VALUES('transfer',$1,$2,$3) ON CONFLICT DO NOTHING",
            )
            .bind(&event_id)
            .bind(json!({"event_id":event_id,"slot":slot.to_string()}))
            .bind(format!("transfer:{event_id}:{block_hash}"))
            .execute(&mut *tx)
            .await?;
        }
        for mut event in events {
            let ordinal = 0;
            let path = event["instruction_path"].clone();
            let id = digest(format!("{cluster}:{signature}:{path}:{ordinal}"));
            let pool = event["pool"]
                .as_str()
                .context("event pool missing")?
                .to_string();
            let kind = event["kind"].as_str().unwrap().to_string();
            event["schema_version"] = json!("sentinel.event.v1");
            event["event_id"] = json!(id);
            event["cluster"] = json!(cluster);
            event["signature"] = json!(signature);
            event["slot"] = json!(slot.to_string());
            event["transaction_index"] = json!(tx_index);
            event["commitment"] = json!("finalized");
            event["protocol"] = json!("meteora_dbc");
            event["decoder_version"] = json!(DECODER);
            event["source_observation_ids"] = json!([observation]);
            event["coverage"] = json!("partial");
            // Raw amount has a named input mint; decimals remain unknown until a
            // verified compatible mint account has been read. Never assume SOL.
            event["decimals"] = Value::Null;
            let contract: sentinel_engine::domain::CanonicalEvent =
                serde_json::from_value(event.clone()).context("canonical event contract")?;
            if contract.schema_version != "sentinel.event.v1"
                || contract.amount_raw.parse::<u128>().is_err()
                || contract.slot.parse::<u64>().is_err()
            {
                bail!("invalid canonical integer contract")
            }
            if event.get("timestamp").is_none() {
                event["timestamp"] = block["blockTime"]
                    .as_u64()
                    .map(|t| json!(t.to_string()))
                    .unwrap_or(Value::Null);
            }
            sqlx::query(UPSERT_CANONICAL_EVENT)
                .bind(&id)
                .bind(cluster)
                .bind(&pool)
                .bind(&kind)
                .bind(slot.to_string())
                .bind(signature)
                .bind(&path)
                .bind(ordinal)
                .bind(&observation)
                .bind(&event)
                .bind(tx_index as i32)
                .execute(&mut *tx)
                .await?;
            let lifecycle = match kind.as_str() {
                "swap" => "active_curve",
                "curve_complete" => "curve_complete",
                _ => "discovered",
            };
            if kind == "pool_created" {
                event["created_at"] = event["timestamp"].clone();
            }
            sqlx::query(UPSERT_POOL_STATE)
                .bind(cluster)
                .bind(&pool)
                .bind(event["base_mint"].as_str())
                .bind(event["quote_mint"].as_str())
                .bind(event["config"].as_str())
                .bind(event["new_creator"].as_str().or(event["creator"].as_str()))
                .bind(lifecycle)
                .bind(&event)
                .bind(slot.to_string())
                .execute(&mut *tx)
                .await?;
            // INSERT RETURNING could distinguish new rows, but dedup_key also makes
            // reconnect overlap safe for public invalidations.
            sqlx::query(INSERT_POOL_OUTBOX)
                .bind(&pool)
                    .bind(json!({"pool":pool,"event_id":id,"slot":slot.to_string(),"commitment":"finalized"}))
                    .bind(format!("event:{id}:{block_hash}"))
                    .execute(&mut *tx)
                    .await?;
            affected.insert(pool);
        }
    }
    for stage in ["received", "persisted", "decoded", "finalized"] {
        sqlx::query(ADVANCE_FINALIZED_CHECKPOINT)
            .bind(cluster)
            .bind(stage)
            .bind(slot.to_string())
            .execute(&mut *tx)
            .await?;
    }
    for pool in affected {
        sqlx::query(ENQUEUE_POOL_ANALYSIS)
            .bind(format!("analysis:{cluster}:{pool}:{slot}"))
            .bind(json!({"cluster":cluster,"pool":pool}))
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}
