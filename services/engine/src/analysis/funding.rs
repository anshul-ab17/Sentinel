use anyhow::{Context, Result};
use serde_json::{Value, json};
use sqlx::{PgPool, Row};
use std::collections::{BTreeMap, BTreeSet};

use super::{
    FUNDING_LOOKBACK_SECONDS, LARGE_TRANSFER_LAMPORTS, SHARED_FUNDING_MIN_BUYERS,
    SHARED_FUNDING_MIN_SHARE_BPS, SignalRecord, digest, persist_signal,
};

pub(super) struct Evaluation<'a> {
    pub db: &'a PgPool,
    pub cluster: &'a str,
    pub pool: &'a str,
    pub start: u64,
    pub timestamp: u64,
    pub created_id: &'a Value,
    pub volumes: &'a BTreeMap<String, u128>,
    pub first_buy: &'a BTreeMap<String, u64>,
    pub buyer_evidence: &'a BTreeMap<String, Vec<String>>,
}

pub(super) async fn evaluate(input: Evaluation<'_>) -> Result<()> {
    let Evaluation {
        db,
        cluster,
        pool,
        start,
        timestamp,
        created_id,
        volumes,
        first_buy,
        buyer_evidence,
    } = input;
    let buyer_wallets = first_buy.keys().cloned().collect::<Vec<_>>();
    if buyer_wallets.is_empty() {
        return Ok(());
    }
    let transfers = sqlx::query(
        "SELECT event_id,source_wallet,recipient_wallet,lamports::text,block_time FROM wallet_transfers WHERE cluster=$1 AND active AND ((recipient_wallet=ANY($2::text[])) OR (source_wallet=ANY($2::text[]))) AND block_time >= $3::bigint AND block_time <= $4::bigint ORDER BY block_time,event_id",
    )
    .bind(cluster)
    .bind(&buyer_wallets)
    .bind(start.saturating_sub(FUNDING_LOOKBACK_SECONDS).to_string())
    .bind(start.saturating_add(90).to_string())
    .fetch_all(db)
    .await?;

    let total = volumes
        .values()
        .try_fold(0u128, |sum, amount| sum.checked_add(*amount))
        .context("quote volume overflow")?;
    if total == 0 {
        return Ok(());
    }
    let mut source_buyers = BTreeMap::<String, Vec<(String, String)>>::new();
    for transfer in &transfers {
        let source: String = transfer.get("source_wallet");
        let recipient: String = transfer.get("recipient_wallet");
        let block_time: Option<i64> = transfer.get("block_time");
        let Some(block_time) = block_time.and_then(|time| u64::try_from(time).ok()) else {
            continue;
        };
        if source == recipient
            || first_buy
                .get(&recipient)
                .is_none_or(|buy| block_time >= *buy)
        {
            continue;
        }
        let event_id: String = transfer.get("event_id");
        source_buyers
            .entry(source)
            .or_default()
            .push((recipient, event_id));
    }

    for (source, linked) in source_buyers {
        let linked_wallets = linked
            .iter()
            .map(|(wallet, _)| wallet.clone())
            .collect::<BTreeSet<_>>();
        let linked_volume = linked_wallets
            .iter()
            .filter_map(|wallet| volumes.get(wallet))
            .try_fold(0u128, |sum, amount| sum.checked_add(*amount))
            .context("shared funding volume overflow")?;
        let share = linked_volume
            .checked_mul(10_000)
            .context("shared funding share overflow")?
            / total;
        if linked_wallets.len() < SHARED_FUNDING_MIN_BUYERS || share < SHARED_FUNDING_MIN_SHARE_BPS
        {
            continue;
        }
        let mut evidence = vec![created_id.clone()];
        for wallet in &linked_wallets {
            if let Some(ids) = buyer_evidence.get(wallet) {
                evidence.extend(ids.iter().cloned().map(Value::String));
            }
        }
        evidence.extend(linked.iter().map(|(_, id)| Value::String(id.clone())));
        let id = digest(format!(
            "{cluster}:{pool}:shared-funding:0.1.0:{start}:{source}"
        ));
        let payload = json!({
            "id":id,"pool":pool,
            "rule":{"id":"shared-funding","version":"0.1.0"},
            "severity":"medium","timestamp":timestamp,
            "title":"Buyers share an observed funder",
            "observation":format!("{} early buyers received native SOL from one observed source before buying; they account for {} basis points of covered early quote input.",linked_wallets.len(),share),
            "interpretation":"A shared funder can be an exchange or service. The transfer does not establish coordination or common ownership.",
            "evidence":evidence,
            "metrics":{"source":source,"linkedWalletCount":linked_wallets.len(),"shareBps":share,"windowSeconds":90,"fundingLookbackSeconds":FUNDING_LOOKBACK_SECONDS},
            "coverage":"partial","commitment":"finalized"
        });
        persist_signal(
            db,
            SignalRecord {
                cluster,
                pool,
                id: &id,
                rule_id: "shared-funding",
                severity: "medium",
                status: "active",
                payload: &payload,
            },
        )
        .await?;
    }

    for transfer in transfers {
        let source: String = transfer.get("source_wallet");
        let recipient: String = transfer.get("recipient_wallet");
        let amount: String = transfer.get("lamports");
        let block_time: Option<i64> = transfer.get("block_time");
        let Ok(value) = amount.parse::<u128>() else {
            continue;
        };
        let Some(block_time) = block_time.and_then(|time| u64::try_from(time).ok()) else {
            continue;
        };
        if value < LARGE_TRANSFER_LAMPORTS
            || block_time < start.saturating_sub(FUNDING_LOOKBACK_SECONDS)
            || block_time > start.saturating_add(90)
            || (!first_buy.contains_key(&source) && !first_buy.contains_key(&recipient))
        {
            continue;
        }
        let event_id: String = transfer.get("event_id");
        let id = digest(format!("{cluster}:{pool}:large-transfer:0.1.0:{event_id}"));
        let payload = json!({
            "id":id,"pool":pool,
            "rule":{"id":"large-transfer","version":"0.1.0"},
            "severity":"medium","timestamp":block_time,
            "title":"Large SOL transfer near observed buyers",
            "observation":format!("A {amount} lamport transfer touched a wallet with covered early DBC buying."),
            "interpretation":"The transfer is transaction evidence only. Its purpose and wallet ownership are unknown.",
            "evidence":[event_id],
            "metrics":{"source":source,"recipient":recipient,"lamports":amount,"thresholdLamports":LARGE_TRANSFER_LAMPORTS.to_string()},
            "coverage":"partial","commitment":"finalized"
        });
        persist_signal(
            db,
            SignalRecord {
                cluster,
                pool,
                id: &id,
                rule_id: "large-transfer",
                severity: "medium",
                status: "active",
                payload: &payload,
            },
        )
        .await?;
    }
    Ok(())
}
