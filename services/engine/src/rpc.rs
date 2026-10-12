use anyhow::{Result, bail};
use reqwest::Client;
use serde_json::{Value, json};
use std::time::Duration;

#[derive(Clone)]
pub(crate) struct Rpc {
    pub(crate) client: Client,
    pub(crate) urls: Vec<String>,
    pub(crate) gate: std::sync::Arc<tokio::sync::Mutex<tokio::time::Instant>>,
    pub(crate) interval: Duration,
}

impl Rpc {
    pub(crate) async fn call(&self, method: &str, params: Value) -> Result<Value> {
        let mut code = "transport".to_string();
        for url in &self.urls {
            {
                let mut next = self.gate.lock().await;
                tokio::time::sleep_until(*next).await;
                *next = tokio::time::Instant::now() + self.interval;
            }
            let response = self
                .client
                .post(url)
                .json(&json!({"jsonrpc":"2.0","id":1,"method":method,"params":params}))
                .send()
                .await;
            let Ok(response) = response else { continue };
            if !response.status().is_success()
                || response
                    .content_length()
                    .is_some_and(|n| n > 64 * 1024 * 1024)
            {
                code = response.status().as_u16().to_string();
                continue;
            }
            let Ok(value) = response.json::<Value>().await else {
                continue;
            };
            if value.get("error").is_none() && value.get("result").is_some() {
                return Ok(value["result"].clone());
            }
            code = value["error"]["code"].to_string();
        }
        // Do not log credential-bearing provider URLs or upstream errors.
        bail!("RPC {method} unavailable across configured providers (status {code})")
    }
}
