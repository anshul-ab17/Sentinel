use anyhow::{Context, Result, bail};
use futures_util::{SinkExt, StreamExt};
use sentinel_engine::{PROGRAM, digest};
use serde_json::{Value, json};
use sqlx::{PgPool, Row};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async, tungstenite::Message};
type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;
pub fn subscription() -> Value {
    json!({"jsonrpc":"2.0","id":1,"method":"logsSubscribe","params":[{"mentions":[PROGRAM]},{"commitment":"finalized"}]})
}
pub async fn connect(url: &str) -> Result<(Socket, Vec<Value>)> {
    let (mut socket, _) =
        tokio::time::timeout(Duration::from_secs(15), connect_async(url)).await??;
    socket
        .send(Message::Text(subscription().to_string().into()))
        .await?;
    let mut buffered = vec![];
    loop {
        let message = tokio::time::timeout(Duration::from_secs(15), socket.next())
            .await?
            .context("subscription closed")??;
        if let Message::Text(text) = message {
            let value: Value = serde_json::from_str(&text)?;
            if value["id"] == 1 {
                if !value["result"].is_number() {
                    bail!("WebSocket subscription rejected")
                };
                return Ok((socket, buffered));
            }
            if buffered.len() >= 64 {
                bail!("subscription bootstrap buffer exceeded")
            };
            buffered.push(value);
        }
    }
}
pub async fn persist(db: &PgPool, cluster: &str, notification: &Value) -> Result<()> {
    if notification["method"] != "logsNotification" {
        return Ok(());
    }
    let result = &notification["params"]["result"];
    let signature = result["value"]["signature"]
        .as_str()
        .context("notification signature missing")?;
    let slot = result["context"]["slot"]
        .as_u64()
        .context("notification slot missing")?;
    let id = digest(format!("{cluster}:{signature}:{slot}:websocket"));
    let mut tx = db.begin().await?;
    sqlx::query(
        r#"
INSERT INTO chain_observations(id,cluster,signature,slot,block_hash,provider,commitment,raw)
    VALUES($1,$2,$3,$4::numeric,NULL,'websocket','finalized',$5)
    ON CONFLICT DO NOTHING
"#,
    )
    .bind(&id)
    .bind(cluster)
    .bind(signature)
    .bind(slot.to_string())
    .bind(notification)
    .execute(&mut *tx)
    .await?;
    if result["value"]["err"].is_null() {
        sqlx::query(r#"
INSERT INTO processing_jobs(id,kind,dedup_key,payload)
    VALUES(gen_random_uuid(),'hydrate',$1,$2)
    ON CONFLICT DO NOTHING
"#)
            .bind(format!("hydrate:{id}"))
                .bind(json!({"cluster":cluster,"signature":signature,"observation_id":id,"slot":slot.to_string()}))
                .execute(&mut *tx)
                .await?;
    }
    // A notification's slot is not a complete recovery boundary. The HTTP
    // reconciler alone advances durable complete checkpoints.
    tx.commit().await?;
    Ok(())
}
pub async fn run(
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
pub async fn claim_hydration(
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
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finalized_subscription_is_program_bounded() {
        let request = subscription();
        assert_eq!(request["params"][0]["mentions"], json!([PROGRAM]));
        assert_eq!(request["params"][1]["commitment"], "finalized");
    }
    #[tokio::test]
    async fn reconnect_buffers_pre_ack_receipts_and_deduplicates_durable_jobs() -> Result<()> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        let notification = json!({
            "jsonrpc":"2.0",
            "method":"logsNotification",
            "params":{"subscription":7,"result":{"context":{"slot":77},"value":{"signature":"fixture-ws-signature","err":null,"logs":[]}}}
        });
        let emitted = notification.clone();
        let server = tokio::spawn(async move {
            for _ in 0..2 {
                let (socket, _) = listener.accept().await.unwrap();
                let mut socket = tokio_tungstenite::accept_async(socket).await.unwrap();
                let request = socket.next().await.unwrap().unwrap();
                assert_eq!(
                    serde_json::from_str::<Value>(request.to_text().unwrap()).unwrap(),
                    subscription()
                );
                socket
                    .send(Message::Text(emitted.to_string().into()))
                    .await
                    .unwrap();
                socket
                    .send(Message::Text(
                        json!({"jsonrpc":"2.0","id":1,"result":7})
                            .to_string()
                            .into(),
                    ))
                    .await
                    .unwrap();
            }
        });
        let (_, first) = connect(&format!("ws://{address}")).await?;
        let (_, second) = connect(&format!("ws://{address}")).await?;
        assert_eq!(first, vec![notification.clone()]);
        assert_eq!(first, second);
        server.await?;
        dotenvy::dotenv().ok();
        if let Ok(url) = std::env::var("DATABASE_URL") {
            let db = sqlx::postgres::PgPoolOptions::new()
                .max_connections(2)
                .connect(&url)
                .await?;
            let cluster = format!(
                "test-ws-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)?
                    .as_nanos()
            );
            persist(&db, &cluster, &first[0]).await?;
            persist(&db, &cluster, &second[0]).await?;
            let jobs: i64 = sqlx::query_scalar(
                "SELECT count(*) FROM processing_jobs WHERE payload->>'cluster'=$1",
            )
            .bind(&cluster)
            .fetch_one(&db)
            .await?;
            let checkpoints: i64 =
                sqlx::query_scalar("SELECT count(*) FROM provider_checkpoints WHERE cluster=$1")
                    .bind(&cluster)
                    .fetch_one(&db)
                    .await?;
            assert_eq!(jobs, 1);
            assert_eq!(checkpoints, 0);
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
    FROM chain_observations
    WHERE cluster=$1
"#,
            )
            .bind(&cluster)
            .execute(&db)
            .await?;
            db.close().await;
        }
        Ok(())
    }
}
