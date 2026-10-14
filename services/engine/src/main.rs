mod analysis;
#[path = "main/commands.rs"]
mod commands;
mod health;
mod hydration;
mod reconciler;
mod rpc;
#[path = "main/runtime.rs"]
mod runtime;
mod storage;
mod stream;

#[cfg(test)]
#[path = "main/integration.rs"]
mod integration;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    if commands::handle().await? {
        return Ok(());
    }

    runtime::run().await
}
