use crate::{
    analysis::drain_analysis,
    rpc::Rpc,
    storage::{checkpoint, persist_block},
};
use anyhow::{Context, Result, bail};
use serde_json::json;
use sqlx::PgPool;

pub(crate) async fn reconcile_range(
    db: &PgPool,
    rpc: &Rpc,
    cluster: &str,
    next: &mut u64,
) -> Result<()> {
    drain_analysis(db).await?;
    let tip = rpc
        .call("getSlot", json!([{"commitment":"finalized"}]))
        .await?
        .as_u64()
        .context("invalid finalized slot")?;
    sqlx::query(
        r#"
INSERT INTO provider_checkpoints(cluster,provider,stage,slot)
    VALUES($1,'http-blocks','head',$2::numeric)
    ON CONFLICT(cluster,provider,stage)
    DO UPDATE
    SET slot=excluded.slot,updated_at=now()
"#,
    )
    .bind(cluster)
    .bind(tip.to_string())
    .execute(db)
    .await?;
    if *next > tip {
        return Ok(());
    }

    let end = tip.min(next.saturating_add(31));
    let slots = rpc
        .call("getBlocks", json!([*next, end, {"commitment":"finalized"}]))
        .await?;
    for slot in slots.as_array().context("invalid block range")? {
        let slot = slot.as_u64().context("invalid block slot")?;
        let block = rpc
            .call(
                "getBlock",
                json!([slot, {
                    "encoding": "json",
                    "transactionDetails": "full",
                    "rewards": false,
                    "commitment": "finalized",
                    "maxSupportedTransactionVersion": 1
                }]),
            )
            .await?;
        if block.is_null() {
            bail!("block unavailable: checkpoint not advanced")
        }
        persist_block(db, cluster, slot, &block).await?;
        *next = slot + 1;
    }

    // getBlocks establishes skipped slots within the complete range.
    checkpoint(db, cluster, end).await?;
    *next = end + 1;
    Ok(())
}
