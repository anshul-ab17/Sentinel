use anyhow::Result;
use sqlx::{PgPool, Row};
use std::{sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::Semaphore,
};
pub async fn serve(db: PgPool, cluster: String, fixture: bool, port: u16) -> Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", port)).await?;
    let permits = Arc::new(Semaphore::new(16));
    loop {
        let (mut socket, _) = listener.accept().await?;
        let Ok(permit) = permits.clone().try_acquire_owned() else {
            continue;
        };
        let db = db.clone();
        let cluster = cluster.clone();
        tokio::spawn(async move {
            let _permit = permit;
            let mut bytes = [0u8; 2048];
            let read = tokio::time::timeout(Duration::from_secs(2), socket.read(&mut bytes)).await;
            let Ok(Ok(size)) = read else { return };
            let first = String::from_utf8_lossy(&bytes[..size]);
            let path = first.split_whitespace().nth(1).unwrap_or("");
            let (code, body) = match path {
                "/health/live" => (200, "{\"status\":\"alive\"}".to_string()),
                "/health/ready" => {
                    let connected = sqlx::query(
                        r#"
SELECT 1
"#,
                    )
                    .execute(&db)
                    .await
                    .is_ok();
                    let fresh = if fixture {
                        true
                    } else {
                        sqlx::query(
                            r#"
SELECT EXISTS(SELECT 1
    FROM provider_checkpoints f
    JOIN provider_checkpoints h ON h.cluster=f.cluster
    AND h.stage='head'
    WHERE f.cluster=$1
    AND f.stage='finalized'
    AND f.updated_at>now()-interval '60 seconds'
    AND h.slot-f.slot<=150) AS fresh
"#,
                        )
                        .bind(&cluster)
                        .fetch_one(&db)
                        .await
                        .map(|r| r.get::<bool, _>("fresh"))
                        .unwrap_or(false)
                    };
                    if connected && fresh {
                        (200, "{\"status\":\"ready\"}".into())
                    } else {
                        (503, "{\"status\":\"not_ready\"}".into())
                    }
                }
                _ => (404, "{\"error\":\"not_found\"}".into()),
            };
            let status = if code == 200 {
                "OK"
            } else if code == 503 {
                "Service Unavailable"
            } else {
                "Not Found"
            };
            let response = format!(
                "HTTP/1.1 {code} {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = tokio::time::timeout(
                Duration::from_secs(2),
                socket.write_all(response.as_bytes()),
            )
            .await;
        });
    }
}
pub async fn shutdown() {
    #[cfg(unix)]
    {
        if let Ok(mut signal) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            tokio::select! {_=signal.recv()=>{},_=tokio::signal::ctrl_c()=>{}};
            return;
        }
    }
    let _ = tokio::signal::ctrl_c().await;
}
