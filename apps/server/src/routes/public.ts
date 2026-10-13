import { metadata } from "../repository.ts";

import type { FastifyInstance } from "fastify";
import type { RuntimeConfig } from "../../../../packages/config/runtime.ts";
import type { Database } from "../../../../packages/database/store.ts";

const addressParams = {
  type: "object",
  required: ["address"],
  properties: { address: { type: "string", minLength: 1, maxLength: 128 } },
};
const pageQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    cursor: { type: "string", maxLength: 128 },
    quote: { type: "string", maxLength: 128 },
    lifecycle: { type: "string", maxLength: 32 },
  },
};
export function registerPublicRoutes(
  app: FastifyInstance,
  db: Database,
  config: RuntimeConfig,
  checkRedis: () => Promise<string> = async () => "PONG",
) {
  const cluster = config.mode === "fixture" ? "fixture" : config.cluster;
  const envelope = async (data: unknown) => ({ ...(await metadata(db, config)), data });
  app.get("/health/live", async () => ({ status: "ok", mode: config.mode }));
  app.get("/v1/openapi.json", async () => app.swagger());
  app.get("/health/ready", async (_request, reply) => {
    let databaseReady = false;
    try {
      await db.query("SELECT 1");
      databaseReady = true;
      await checkRedis();
      const meta = await metadata(db, config);
      if (config.mode === "live" && meta.freshness !== "fresh")
        return reply.code(503).send({
          status: "not_ready",
          database: "ready",
          provider: "stale_or_unverified",
          ...meta,
        });
      return { status: "ready", database: "ready", redis: "ready", ...meta };
    } catch {
      return reply.code(503).send({
        status: "not_ready",
        database: databaseReady ? "ready" : "unavailable",
        redis: databaseReady ? "unavailable" : "unknown",
      });
    }
  });
  app.get<{ Querystring: { limit: number; cursor?: string; quote?: string; lifecycle?: string } }>(
    "/v1/launches",
    { schema: { querystring: pageQuery } },
    async (request) => {
      const { limit = 25, cursor, quote, lifecycle } = request.query;
      const rows = (
        await db.query(
          "SELECT address,base_mint,quote_mint,config_address,creator,lifecycle,state,slot::text FROM pools WHERE cluster=$1 AND ($2::text IS NULL OR address>$2) AND ($3::text IS NULL OR quote_mint=$3) AND ($4::text IS NULL OR lifecycle=$4) ORDER BY address LIMIT $5",
          [cluster, cursor ?? null, quote ?? null, lifecycle ?? null, limit + 1],
        )
      ).rows;
      return envelope({
        items: rows.slice(0, limit),
        next_cursor: rows.length > limit ? rows[limit - 1].address : null,
      });
    },
  );
  app.get<{ Params: { address: string } }>(
    "/v1/pools/:address",
    { schema: { params: addressParams } },
    async (request, reply) => {
      const pool = (
        await db.query(
          "SELECT address,base_mint,quote_mint,config_address,creator,lifecycle,state,slot::text FROM pools WHERE cluster=$1 AND address=$2",
          [cluster, request.params.address],
        )
      ).rows[0];
      return pool ? envelope(pool) : reply.code(404).send({ error: "pool_not_found" });
    },
  );
  app.get<{ Querystring: { limit: number; cursor?: string } }>(
    "/v1/signals",
    { schema: { querystring: pageQuery } },
    async (request) => {
      const limit = request.query.limit ?? 25;
      const rows = (
        await db.query(
          "SELECT id,payload,status FROM signals WHERE cluster=$1 AND ($2::text IS NULL OR id>$2) ORDER BY id LIMIT $3",
          [cluster, request.query.cursor ?? null, limit + 1],
        )
      ).rows;
      return envelope({
        items: rows.slice(0, limit),
        next_cursor: rows.length > limit ? rows[limit - 1].id : null,
      });
    },
  );
  app.get<{ Params: { id: string } }>("/v1/evidence/:id", async (request, reply) => {
    const row =
      (
        await db.query(
          "SELECT e.payload,o.raw,o.provider,o.block_hash,o.received_at FROM canonical_events e JOIN chain_observations o ON o.id=e.observation_id WHERE e.cluster=$1 AND (e.event_id=$2 OR e.payload->>'event_id'=$2) AND e.active",
          [cluster, request.params.id],
        )
      ).rows[0] ??
      (
        await db.query(
          `SELECT jsonb_build_object(
                    'event_id',t.event_id,'kind','native_sol_transfer',
                    'source',t.source_wallet,'recipient',t.recipient_wallet,
                    'lamports',t.lamports::text,'slot',t.slot::text,
                    'signature',t.signature,'instruction_path',t.instruction_path,
                    'block_time',t.block_time) AS payload,
                  o.raw,o.provider,o.block_hash,o.received_at
             FROM wallet_transfers t JOIN chain_observations o ON o.id=t.observation_id
            WHERE t.cluster=$1 AND t.event_id=$2 AND t.active`,
          [cluster, request.params.id],
        )
      ).rows[0] ??
      (
        await db.query(
          "SELECT id,raw,provider,block_hash,received_at,status FROM chain_observations WHERE cluster=$1 AND id=$2",
          [cluster, request.params.id],
        )
      ).rows[0];
    return row ? envelope(row) : reply.code(404).send({ error: "evidence_not_found" });
  });
  app.get<{ Params: { pool: string }; Querystring: { limit?: number; cursor?: string } }>(
    "/v1/replay/:pool",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
            cursor: { type: "string", maxLength: 128 },
          },
        },
      },
    },
    async (request) => {
      const limit = request.query.limit ?? 100;
      const rows = (
        await db.query(
          "SELECT payload,event_id,slot::text,instruction_path,ordinal FROM canonical_events WHERE cluster=$1 AND pool_address=$2 AND active AND ($3::text IS NULL OR (slot,transaction_index,instruction_path,ordinal,event_id) > (SELECT slot,transaction_index,instruction_path,ordinal,event_id FROM canonical_events WHERE event_id=$3)) ORDER BY slot,transaction_index,instruction_path,ordinal,event_id LIMIT $4",
          [cluster, request.params.pool, request.query.cursor ?? null, limit + 1],
        )
      ).rows;
      return envelope({
        items: rows.slice(0, limit),
        next_cursor: rows.length > limit ? rows[limit - 1].event_id : null,
        ordering: "slot/transaction_index/instruction_path/ordinal; finalized block order",
      });
    },
  );
  app.get<{ Params: { mint: string } }>("/v1/tokens/:mint/dossier", async (request, reply) => {
    const pools = (
      await db.query(
        "SELECT address,lifecycle,state,slot::text FROM pools WHERE cluster=$1 AND base_mint=$2 LIMIT 100",
        [cluster, request.params.mint],
      )
    ).rows;
    if (!pools.length) return reply.code(404).send({ error: "token_not_found" });
    const signals = (
      await db.query(
        "SELECT payload FROM signals WHERE cluster=$1 AND pool_address=ANY($2::text[]) AND status='active' LIMIT 100",
        [cluster, pools.map((p) => p.address)],
      )
    ).rows;
    return envelope({
      mint: request.params.mint,
      pools,
      signals: signals.map((s) => s.payload),
      risk: {
        score: null,
        status: "unknown",
        reason: "Ownership, authority and liquidity coverage incomplete",
      },
    });
  });
  app.get<{ Params: { mint: string } }>("/v1/tokens/:mint/holders", async (request, reply) =>
    reply.code(503).send({
      ...(await metadata(db, config)),
      error: "holders_unavailable",
      mint: request.params.mint,
      reason: "Complete owner-aggregated token-account index is not established",
    }),
  );
  app.get<{ Params: { address: string } }>(
    "/v1/pools/:address/liquidity",
    async (request, reply) => {
      const row = (
        await db.query(
          "SELECT lifecycle,state,slot::text FROM pools WHERE cluster=$1 AND address=$2",
          [cluster, request.params.address],
        )
      ).rows[0];
      if (!row) return reply.code(404).send({ error: "pool_not_found" });
      const reserve = row.state.quote_reserve_amount,
        threshold = row.state.migration_threshold;
      const progress =
        reserve && threshold && BigInt(threshold) > 0n
          ? (BigInt(reserve) * 10000n) / BigInt(threshold)
          : null;
      return envelope({
        ...row,
        threshold_progress_bps:
          progress === null ? null : (progress > 10000n ? 10000n : progress).toString(),
        depth_quotes: null,
        locked_liquidity: null,
        limitations: ["Historical quote state and DAMM v2 positions unavailable"],
      });
    },
  );
  app.get<{ Params: { address: string } }>("/v1/wallets/:address", async (request) => {
    const rows = (
      await db.query(
        "SELECT payload FROM canonical_events WHERE cluster=$1 AND active AND (payload->>'trader'=$2 OR payload->>'wallet'=$2 OR payload->>'source'=$2 OR payload->>'recipient'=$2) ORDER BY slot DESC LIMIT 100",
        [cluster, request.params.address],
      )
    ).rows;
    return envelope({
      address: request.params.address,
      events: rows.map((row) => row.payload),
      holdings: null,
      realized_pnl: null,
      limitations: ["Bounded covered activity; not complete wallet history"],
    });
  });
  app.get<{ Params: { address: string }; Querystring: { hops?: number; limit?: number } }>(
    "/v1/wallets/:address/graph",
    {
      schema: {
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            hops: { type: "integer", minimum: 1, maximum: 3, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
          },
        },
      },
    },
    async (request) => {
      const hops = request.query.hops ?? 1;
      const limit = request.query.limit ?? 25;
      const rows = (
        await db.query(
          `WITH RECURSIVE adjacency AS (
             SELECT t.event_id,t.cluster,t.source_wallet,t.recipient_wallet,t.lamports::text,
                    t.signature,t.slot::text,t.block_time,t.source_wallet AS wallet,
                    t.recipient_wallet AS next_wallet,
                    row_number() OVER (PARTITION BY t.cluster,t.source_wallet ORDER BY t.slot DESC,t.event_id) AS degree_rank
               FROM wallet_transfers t WHERE t.active
             UNION ALL
             SELECT t.event_id,t.cluster,t.source_wallet,t.recipient_wallet,t.lamports::text,
                    t.signature,t.slot::text,t.block_time,t.recipient_wallet AS wallet,
                    t.source_wallet AS next_wallet,
                    row_number() OVER (PARTITION BY t.cluster,t.recipient_wallet ORDER BY t.slot DESC,t.event_id) AS degree_rank
               FROM wallet_transfers t WHERE t.active
           ), walk AS (
             SELECT t.event_id,t.source_wallet,t.recipient_wallet,t.lamports,
                    t.signature,t.slot,t.block_time,t.next_wallet,
                    ARRAY[$2::text,t.next_wallet] AS path_wallets,
                    ARRAY[t.event_id] AS path_events,1 AS hop
               FROM adjacency t
              WHERE t.cluster=$1 AND t.wallet=$2 AND t.degree_rank<=25
             UNION ALL
             SELECT t.event_id,t.source_wallet,t.recipient_wallet,t.lamports,
                    t.signature,t.slot,t.block_time,t.next_wallet,
                    w.path_wallets || t.next_wallet,w.path_events || t.event_id,w.hop+1
               FROM walk w
               JOIN adjacency t ON t.cluster=$1 AND t.wallet=w.next_wallet AND t.degree_rank<=25
              WHERE w.hop<$3
                AND NOT (t.event_id=ANY(w.path_events))
                AND NOT (t.next_wallet=ANY(w.path_wallets))
           )
           SELECT event_id,source_wallet,recipient_wallet,lamports,signature,slot,
                  block_time,path_wallets,hop
             FROM walk ORDER BY hop,slot DESC,event_id LIMIT $4`,
          [cluster, request.params.address, hops, limit],
        )
      ).rows;
      return envelope({
        address: request.params.address,
        edges: rows.map((row) => ({
          source: row.source_wallet,
          recipient: row.recipient_wallet,
          lamports: row.lamports,
          signature: row.signature,
          slot: row.slot,
          timestamp: row.block_time,
          hop: row.hop,
          path: row.path_wallets,
          evidence_id: row.event_id,
          relationship: "observed_native_sol_transfer",
          ownership_claim: false,
        })),
        hops,
        maximum_supported_hops: 3,
        limitations: [
          "Only native SOL system transfers are indexed; SPL token transfers are not included",
          "Graph paths show transfers, not wallet ownership or common control",
          "Traversal is bounded to 25 newest transfer edges per wallet, requested hop count, and edge limit",
        ],
      });
    },
  );
}
