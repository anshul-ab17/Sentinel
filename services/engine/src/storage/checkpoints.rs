use super::queries::CHECKPOINT_STAGE;
use anyhow::Result;
use sqlx::PgPool;

pub(crate) async fn checkpoint(db: &PgPool, cluster: &str, slot: u64) -> Result<()> {
    for stage in ["received", "persisted", "decoded", "finalized"] {
        sqlx::query(CHECKPOINT_STAGE)
            .bind(cluster)
            .bind(stage)
            .bind(slot.to_string())
            .execute(db)
            .await?;
    }
    Ok(())
}
