use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use sentinel_engine::PROGRAM;
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;

#[test]
fn finalized_subscription_is_program_bounded() {
    let request = super::connection::subscription();
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
                super::connection::subscription()
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
    let (_, first) = super::connection::connect(&format!("ws://{address}")).await?;
    let (_, second) = super::connection::connect(&format!("ws://{address}")).await?;
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
        super::persistence::persist(&db, &cluster, &first[0]).await?;
        super::persistence::persist(&db, &cluster, &second[0]).await?;
        let jobs: i64 =
            sqlx::query_scalar("SELECT count(*) FROM processing_jobs WHERE payload->>'cluster'=$1")
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
