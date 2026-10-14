use anyhow::{Context, Result, bail};
use reqwest::Client;
use sentinel_engine::decode_transaction;
use serde_json::{Value, json};
use std::{env, time::Duration};

pub async fn handle() -> Result<bool> {
    let health_port = env::var("ENGINE_HEALTH_PORT")
        .unwrap_or_else(|_| "4101".into())
        .parse::<u16>()?;
    if env::args().nth(1).as_deref() == Some("--health") {
        let response = Client::new()
            .get(format!("http://127.0.0.1:{health_port}/health/ready"))
            .timeout(Duration::from_secs(3))
            .send()
            .await?;
        if !response.status().is_success() {
            bail!("engine not ready")
        }
        return Ok(true);
    }
    if env::args().nth(1).as_deref() == Some("--decode") {
        let file = env::args()
            .nth(2)
            .context("--decode requires a recorded JSON file")?;
        let payload: Value = serde_json::from_str(&std::fs::read_to_string(file)?)?;
        let raw = payload.get("result").unwrap_or(&payload);
        let (events, unsupported) = decode_transaction(raw)?;
        println!("{}", json!({"events":events,"unsupported":unsupported}));
        return Ok(true);
    }
    Ok(false)
}
