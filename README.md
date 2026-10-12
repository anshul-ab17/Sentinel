# Sentinel

Backend setup and current coverage: [operations](backend/OPERATIONS.md),
[architecture](backend/IMPLEMENTATION.md), [acceptance](backend/ACCEPTANCE.md),
and [messaging decision](backend/MESSAGING.md). The Fastify API, PostgreSQL storage,
Anchor-based Rust DBC decoder and leased TypeScript worker power the live mainnet
dashboard. Fixture data is available only when `APP_MODE=fixture` is explicitly
set for isolated development and tests.

### Real-Time Solana Launch Intelligence & On-Chain Anomaly Detection

**Monitor launches. Track whales. Investigate suspicious activity. Verify the evidence.**

Sentinel is an AI-assisted blockchain intelligence platform designed to monitor new token launches, analyze wallet behavior, detect unusual on-chain activity, and generate evidence-backed investigation reports on Solana.

Built with a focus on **Meteora Dynamic Bonding Curve (DBC)** launches, Sentinel aims to help traders, researchers, developers, and launchpad operators understand what is happening behind token activity—not just what appears on a price chart.
