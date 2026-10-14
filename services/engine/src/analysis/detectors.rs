use anyhow::{Context, Result};
use sentinel_engine::digest;
use serde_json::{Value, json};
use sqlx::PgPool;

use super::persistence::{SignalRecord, persist_signal};

pub(super) struct ObservedSwap {
    pub(super) timestamp: u64,
    pub(super) wallet: String,
    pub(super) event_id: String,
    pub(super) quote_reserve: Option<u128>,
}

pub(super) async fn evaluate_early_buy_burst(
    db: &PgPool,
    cluster: &str,
    pool: &str,
    start: u64,
    timestamp: u64,
    swaps: &[ObservedSwap],
) -> Result<()> {
    const WINDOW_SECONDS: u64 = 10;
    const MIN_SWAPS: usize = 6;
    const MIN_WALLETS: usize = 4;
    let burst = swaps
        .iter()
        .filter(|swap| swap.timestamp < start.saturating_add(WINDOW_SECONDS))
        .collect::<Vec<_>>();
    let wallets = burst
        .iter()
        .map(|swap| swap.wallet.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    if burst.len() < MIN_SWAPS || wallets.len() < MIN_WALLETS {
        return Ok(());
    }
    let id = digest(format!("{cluster}:{pool}:early-buy-burst:0.1.0:{start}"));
    let evidence = burst
        .iter()
        .map(|swap| swap.event_id.as_str())
        .collect::<Vec<_>>();
    let payload = json!({
        "id":id,
        "pool":pool,
        "rule":{"id":"early-buy-burst","version":"0.1.0"},
        "severity":"medium",
        "timestamp":timestamp,
        "title":"Several wallets bought in a short launch window",
        "observation":format!("{} observed buy transactions from {} attributed wallets landed in the first {} seconds.",burst.len(),wallets.len(),WINDOW_SECONDS),
        "interpretation":"Fast activity may be ordinary launch demand or automation. This is a timing observation, not evidence of coordination or intent.",
        "evidence":evidence,
        "metrics":{"swapCount":burst.len(),"walletCount":wallets.len(),"windowSeconds":WINDOW_SECONDS},
        "coverage":"partial",
        "commitment":"finalized"
    });
    persist_signal(
        db,
        SignalRecord {
            cluster,
            pool,
            id: &id,
            rule_id: "early-buy-burst",
            severity: "medium",
            status: "active",
            payload: &payload,
        },
    )
    .await
}

pub(super) async fn evaluate_liquidity_shift(
    db: &PgPool,
    cluster: &str,
    pool: &str,
    start: u64,
    timestamp: u64,
    events: &[Value],
    swaps: &[ObservedSwap],
) -> Result<()> {
    const SHIFT_THRESHOLD_BPS: u128 = 2_500;
    if events.iter().any(|event| event["kind"] == "curve_complete") {
        return Ok(());
    }
    let mut peak: Option<(u128, &ObservedSwap)> = None;
    let mut shift: Option<(&ObservedSwap, &ObservedSwap, u128)> = None;
    for swap in swaps {
        let Some(reserve) = swap.quote_reserve else {
            continue;
        };
        if let Some((peak_reserve, peak_event)) = peak
            && peak_reserve > 0
            && reserve < peak_reserve
        {
            let drop_bps = (peak_reserve - reserve)
                .checked_mul(10_000)
                .context("reserve shift overflow")?
                / peak_reserve;
            if drop_bps >= SHIFT_THRESHOLD_BPS {
                shift = Some((peak_event, swap, drop_bps));
                break;
            }
        }
        if peak.is_none_or(|(peak_reserve, _)| reserve > peak_reserve) {
            peak = Some((reserve, swap));
        }
    }
    let Some((before, after, drop_bps)) = shift else {
        return Ok(());
    };
    let id = digest(format!("{cluster}:{pool}:liquidity-shift:0.1.0:{start}"));
    let payload = json!({
        "id":id,
        "pool":pool,
        "rule":{"id":"liquidity-shift","version":"0.1.0"},
        "severity":"high",
        "timestamp":timestamp,
        "title":"Observed quote reserve dropped sharply",
        "observation":format!("The indexed DBC quote reserve fell {} basis points between two observed swaps.",drop_bps),
        "interpretation":"This measures DBC quote-reserve movement only. Pool migration, ordinary sells, and incomplete indexing can explain the change; it is not a full liquidity or withdrawal measurement.",
        "evidence":[before.event_id,after.event_id],
        "metrics":{"dropBps":drop_bps.to_string(),"beforeReserveRaw":before.quote_reserve.map(|value|value.to_string()),"afterReserveRaw":after.quote_reserve.map(|value|value.to_string())},
        "coverage":"partial",
        "commitment":"finalized"
    });
    persist_signal(
        db,
        SignalRecord {
            cluster,
            pool,
            id: &id,
            rule_id: "liquidity-shift",
            severity: "high",
            status: "active",
            payload: &payload,
        },
    )
    .await
}
