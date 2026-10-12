# Run Sentinel

Requirements: Node 24, pnpm 11.9, Rust 1.98, Docker with PostgreSQL support.
Copy `.env.example` to `.env` once. Never put credentials in browser variables.

Development:

```powershell
docker compose up -d postgres
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
pnpm worker:start
pnpm engine:dev
```

All backend containers: `docker compose up --build -d`.
Including Next.js: `docker compose --profile web up --build -d`.
Published ports can be changed with DATABASE_PORT, API_PORT, WEB_PORT.
The web profile runs the development server for local preview, not production hosting.

API health: `/health/live`, `/health/ready`. Schema: `/v1/openapi.json`.
`/api/snapshot` preserves the dashboard contract, from PostgreSQL. This compatibility
view only displays wrapped-SOL quote pools; `/v1` retains every covered quote asset.
Every v1 data envelope describes coverage/freshness. Holders/quotes/positions have
explicit unavailable states until their required indices and protocol math exist.

## Live mode

Live mode is the default. Set `SOLANA_CLUSTER` and use `SOLANA_HTTP_URL` for your
primary RPCFast, Solami RPC, or another standard Solana JSON-RPC endpoint.
`SOLANA_HTTP_FALLBACK_URLS` accepts comma-separated endpoints; requests fail over
in order. When no primary is set, the cluster's public Solana RPC is used. The
default mainnet genesis hash is verified on every configured HTTP endpoint; set
`SOLANA_GENESIS_HASH` explicitly for other clusters. Public endpoints can be
rate-limited, so configure provider endpoints for sustained indexing.

`SOLANA_WS_URLS` accepts comma-separated standard Solana WebSocket endpoints
(`SOLANA_WS_URL` remains supported as a single-endpoint alias). Each stream
reconnects independently and receipts are deduplicated before hydration. The
default is the matching public cluster WebSocket. The engine checks genesis on
every configured HTTP endpoint and checks the executable DBC account. START_SLOT
sets the historical boundary; absent START_SLOT starts at the
current finalized tip with 16 slots of bootstrap overlap, explicitly excluding earlier history. RPC must support
getBlocks/getBlock with full inner instructions, loaded addresses and version-1
blocks. The Anchor decoder supports legacy/v0 DBC transactions; DBC transactions
of newer versions are quarantined, not counted as trades.

Finalized `logsSubscribe` streams store raw receipts and hydration jobs atomically,
bound the durable backlog, reconnect after failures and hydrate through HTTP.
Receipt order never overrides finalized block order. Use providers with the needed
finalized history and quotas. HTTP/WebSocket ingestion is not a Yellowstone or
Solami Blur adapter; those decoded stream protocols need a validated ingestion
path and do not become canonical evidence automatically.
Only finalized effects are published: provisional/fork rollback is not claimed.
Supported variants are pinned in `backend/protocol-lock.json`. On-chain upgrades
require a decoder/IDL review; executable validation alone does not prove bytecode
matches an upstream Git revision. Never enable unreviewed variants as safe.

## Tests and generation

```powershell
pnpm typecheck
pnpm test
pnpm test:integration
cargo test --workspace --locked
node --env-file=.env --import ./scripts/register-aliases.mjs --experimental-strip-types scripts/generate-api.mjs
cargo run --locked -p sentinel-engine -- --decode fixtures/recorded/dbc-swap.json
```

Integration tests need a migrated disposable PostgreSQL database. Set DATABASE_URL
to that database; tests insert synthetic and private test data, never delete live
evidence. Recorded devnet manifests name real public signatures, genesis and payload
hashes. `scripts/capture-chain.mjs` captures bounded public samples; provider limits
can stop capture. Sample decoding is not a sustained live/provider benchmark.

## Recovery and monitoring

Engine commits a complete block, canonical evidence, pending analysis, invalidations
and recovery checkpoints in one transaction. Failed/null block fetches stop that
boundary. Restart replays 16-slot overlap; logical event/outbox uniqueness prevents
duplicate accounting. SQL jobs retry expired leases and dead-letter after 5 attempts.
Worker completion uses the lease token as a fence. Check checkpoint age, open
coverage intervals, dead jobs and the outbox lag before declaring readiness.

Back up with `pg_dump` using your configured connection. Restore into a separate
database, run migrations, then replay recorded evidence and compare canonical IDs.
Do not prune observations referenced by canonical events or investigations.
No raw retention deletion is automatic in this version. SQL roles and production
secrets are deployment responsibilities; the local compose credentials are local-only.
Migration 003 creates NOLOGIN service roles. Live API/engine/worker select their
restricted role; deploy separate login accounts granted only the corresponding
role. Jobs and outbox use role-based row policies. Fixture seeding runs with the
local migration owner and must not be enabled in production. The migration user
must be allowed to create roles. Never give production runtime logins superuser.

## Acceptance still required

Continuous provider disconnect/load/restore measurements; Yellowstone and
provisional finality; complete owner index/funding history; pinned historical
quote parity; DAMM migrations/position locks; Token-2022 variants; production
login/role deployment audit; external notifications and their SSRF/idempotency tests;
Jev evaluation quality on a labelled frozen dataset. Missing coverage remains
unknown. AI defaults off and shadow results never alter deterministic signals.
