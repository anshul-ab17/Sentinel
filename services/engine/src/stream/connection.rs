use anyhow::{Context, Result, bail};
use futures_util::{SinkExt, StreamExt};
use sentinel_engine::PROGRAM;
use serde_json::{Value, json};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async, tungstenite::Message};

pub(crate) type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;
pub(crate) fn subscription() -> Value {
    json!({"jsonrpc":"2.0","id":1,"method":"logsSubscribe","params":[{"mentions":[PROGRAM]},{"commitment":"finalized"}]})
}
pub(crate) async fn connect(url: &str) -> Result<(Socket, Vec<Value>)> {
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
