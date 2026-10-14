use anyhow::{Context, Result, bail};
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use sqlx::{PgPool, Row};
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;

use super::{
    connection::{Socket, connect},
    persistence::persist,
};

pub(crate) async fn run(
    db: PgPool,
    cluster: String,
    url: String,
    mut connected: Option<(Socket, Vec<Value>)>,
) {
    loop {
        let session = if let Some(session) = connected.take() {
            Ok(session)
        } else {
            connect(&url).await
        };
        if let Ok((mut socket, buffered)) = session {
            let result: Result<()> = async {
                for notification in buffered {
                    persist(&db, &cluster, &notification).await?;
                }
                loop {
                    let backlog:i64=sqlx::query_scalar("SELECT count(*) FROM processing_jobs WHERE kind='hydrate' AND payload->>'cluster'=$1 AND status IN ('pending','running')")
                        .bind(&cluster)
                        .fetch_one(&db)
                        .await?;
                    if backlog >= 5000 {
                        bail!("durable hydration backlog limit")
                    }
                    let message = tokio::time::timeout(Duration::from_secs(60), socket.next())
                        .await?
                        .context("stream disconnected")??;
                    match message {
                        Message::Text(text) => {
                            if text.len() > 1024 * 1024 {
                                bail!("notification size limit")
                            }
                            let value = serde_json::from_str(&text)?;
                            persist(&db, &cluster, &value).await?;
                        }
                        Message::Ping(value) => socket.send(Message::Pong(value)).await?,
                        Message::Close(_) => bail!("stream closed"),
                        _ => {}
                    }
                }
            }.await;
            if result.is_err() {
                tracing::warn!("WebSocket paused; HTTP reconciler retains recovery responsibility");
            }
        }
        tokio::time::sleep(Duration::from_secs(5)).await;
    }
}
pub(crate) async fn claim_hydration(
    db: &PgPool,
    cluster: &str,
) -> Result<Option<(String, String, Value)>> {
    let job=sqlx::query(r#"
WITH candidate AS (SELECT id
    FROM processing_jobs
    WHERE kind='hydrate'
    AND payload->>'cluster'=$1
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
        .bind(cluster)
        .fetch_optional(db)
        .await?;
    Ok(job.map(|row| (row.get("id"), row.get("lease_token"), row.get("payload"))))
}
