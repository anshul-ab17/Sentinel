# Backend implementation

## Audit and sequence

The Next.js dashboard reads `/api/snapshot` from PostgreSQL. The Rust engine
reconciles finalized Solana blocks through configured JSON-RPC endpoints and can
fan in standard finalized log subscriptions; the TypeScript worker evaluates
persisted evidence. Fixture data remains available only for explicit tests.

The Anchor decoder is pinned to supported Meteora DBC event variants. Provider
protocols outside standard Solana JSON-RPC/WebSocket, including Yellowstone and
Solami Blur, need dedicated adapters and validation before they can add canonical
events. Additional protocol variants fail closed.

## ADR 001: one public API, one migration owner

Fastify owns browser sessions and authorization. Rust owns chain observations,
canonical events, checkpoint reconciliation and deterministic live signals.
PostgreSQL owns evidence, jobs and stream cursors. The TypeScript worker owns
asynchronous assessments. SQL in `migrations/` is the sole migration authority;
Prisma tooling does not push or independently migrate the runtime database.

HTTP finalized-block reconciliation is the initial recovery transport. It records
an explicit start slot and commits each complete block with its checkpoint. Optional
streaming transports require separate acceptance; HTTP polling does not claim
Yellowstone latency. Unsupported decoders, missing historical states and holder
coverage are surfaced explicitly. No synthetic fallback is allowed in live mode.
