import { metadata } from "../repository.ts";

import type { FastifyInstance } from "fastify";
import type { RuntimeConfig } from "../../../../packages/config/runtime.ts";
import type { Database } from "../../../../packages/database/store.ts";

const publicKey = "^[1-9A-HJ-NP-Za-km-z]{32,44}$";
const addressParams = {
  type: "object",
  required: ["address"],
  properties: { address: { type: "string", pattern: publicKey } },
};
const pageQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
    cursor: { type: "string", maxLength: 128 },
    poolId: { type: "string", pattern: publicKey },
    mint: { type: "string", pattern: publicKey },
    quoteMint: { type: "string", pattern: publicKey },
    sinceSlot: { type: "string", pattern: "^[0-9]{1,20}$" },
  },
};

type Page = {
  limit?: number;
  cursor?: string;
  poolId?: string;
  mint?: string;
  quoteMint?: string;
  sinceSlot?: string;
};

export function registerSharkRoutes(app: FastifyInstance, db: Database, config: RuntimeConfig) {
  const cluster = config.mode === "fixture" ? "fixture" : config.cluster;
  const envelope = async (data: unknown) => ({ ...(await metadata(db, config)), data });

  app.get<{
    Params: { address: string };
    Querystring: { limit?: number };
  }>(
    "/v1/pools/:address/funding-graph",
    {
      schema: {
        params: addressParams,
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: { limit: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
        },
      },
    },
    async (request, reply) => {
      const exists = await db.query("SELECT 1 FROM pools WHERE cluster=$1 AND address=$2", [
        cluster,
        request.params.address,
      ]);
      if (!exists.rowCount) return reply.code(404).send({ error: "pool_not_found" });
      const rows = (
        await db.query(
          `WITH buyers AS (
             SELECT payload->>'trader' AS wallet,
                    min((payload->>'timestamp')::bigint) AS first_buy_at
               FROM canonical_events
              WHERE cluster=$1 AND pool_address=$2 AND active
                AND commitment='finalized' AND kind='swap'
                AND payload->>'trade_direction'='1'
                AND payload->>'trader' IS NOT NULL
                AND payload->>'timestamp' ~ '^[0-9]+$'
              GROUP BY payload->>'trader'
           )
           SELECT t.event_id,t.source_wallet,t.recipient_wallet,t.lamports::text,
                  t.signature,t.slot::text,t.block_time,b.wallet AS buyer
             FROM buyers b
             JOIN wallet_transfers t ON t.cluster=$1 AND t.active
               AND t.recipient_wallet=b.wallet
               AND t.block_time < b.first_buy_at
               AND t.block_time >= b.first_buy_at-86400
            ORDER BY t.slot DESC,t.transaction_index DESC,t.event_id DESC LIMIT $3`,
          [cluster, request.params.address, request.query.limit ?? 50],
        )
      ).rows;
      return envelope({
        pool: request.params.address,
        edges: rows.map((row) => ({
          id: row.event_id,
          source: row.source_wallet,
          wallet: row.buyer,
          recipient: row.recipient_wallet,
          lamports: row.lamports,
          signature: row.signature,
          slot: row.slot,
          timestamp: row.block_time,
          relationship: "observed_pre_buy_transfer",
          ownership_claim: false,
        })),
        window_seconds: 86_400,
        limitations: [
          "Direct native SOL transfers to attributed buyers in the 24 hours before their first observed buy",
          "SPL transfers, prior indexed history and multi-hop buyer attribution are not included",
          "Shared transfers do not prove common wallet ownership or coordination",
        ],
      });
    },
  );

  app.get<{ Querystring: Page }>(
    "/v1/sharks/activity",
    { schema: { querystring: pageQuery } },
    async (request) => {
      const { limit = 25, cursor, poolId, mint, quoteMint, sinceSlot } = request.query;
      const rows = (
        await db.query(
          `SELECT e.event_id,e.pool_address,e.signature,e.slot::text,e.payload
             FROM canonical_events e
            WHERE e.cluster=$1 AND e.active AND e.commitment='finalized' AND e.kind='swap'
              AND e.payload->>'trader' IS NOT NULL
              AND ($2::text IS NULL OR e.pool_address=$2)
              AND ($3::text IS NULL OR e.payload->>'base_mint'=$3)
              AND ($4::text IS NULL OR e.payload->>'quote_mint'=$4)
              AND ($5::numeric IS NULL OR e.slot >= $5)
              AND ($6::text IS NULL OR (e.slot,e.event_id) <
                (SELECT slot,event_id FROM canonical_events
                  WHERE cluster=$1 AND event_id=$6))
            ORDER BY e.slot DESC,e.event_id DESC LIMIT $7`,
          [
            cluster,
            poolId ?? null,
            mint ?? null,
            quoteMint ?? null,
            sinceSlot ?? null,
            cursor ?? null,
            limit + 1,
          ],
        )
      ).rows;
      return envelope({
        items: rows.slice(0, limit).map((row) => ({
          event_id: row.event_id,
          pool: row.pool_address,
          signature: row.signature,
          slot: row.slot,
          wallet: row.payload.trader,
          quote_mint: row.payload.quote_mint ?? null,
          direction: Number(row.payload.trade_direction) === 1 ? "buy" : "sell",
          quote_amount_raw:
            Number(row.payload.trade_direction) === 1
              ? (row.payload.amount_raw ?? null)
              : (row.payload.output_amount ?? null),
          event: row.payload,
        })),
        next_cursor: rows.length > limit ? rows[limit - 1].event_id : null,
        ordering: "finalized slot descending, stable event ID tie-breaker",
        coverage: "covered finalized DBC swaps with a directly attributed trader",
      });
    },
  );

  app.get<{
    Querystring: Page & {
      sort?: "trades" | "buy_volume" | "sell_volume";
      segment?: "all" | "above_threshold";
      thresholdRaw?: string;
    };
  }>(
    "/v1/sharks/wallets",
    {
      schema: {
        querystring: {
          ...pageQuery,
          properties: {
            ...pageQuery.properties,
            sort: { type: "string", enum: ["trades", "buy_volume", "sell_volume"] },
            segment: { type: "string", enum: ["all", "above_threshold"] },
            thresholdRaw: { type: "string", pattern: "^[0-9]{1,38}$" },
          },
        },
      },
    },
    async (request) => {
      const {
        limit = 25,
        poolId,
        quoteMint,
        sort = "trades",
        segment = "all",
        thresholdRaw = "0",
      } = request.query;
      const order =
        sort === "buy_volume"
          ? "buy_quote_raw DESC, trade_count DESC, wallet ASC"
          : sort === "sell_volume"
            ? "sell_quote_raw DESC, trade_count DESC, wallet ASC"
            : "trade_count DESC, wallet ASC";
      const rows = (
        await db.query(
          `WITH observed AS (
             SELECT payload->>'trader' AS wallet,
                    payload->>'quote_mint' AS quote_mint,
                    CASE WHEN payload->>'trade_direction'='1'
                      THEN COALESCE(payload->>'amount_raw','0')::numeric ELSE 0 END AS buy_raw,
                    CASE WHEN payload->>'trade_direction'='0'
                      THEN COALESCE(payload->>'output_amount','0')::numeric ELSE 0 END AS sell_raw
               FROM canonical_events
              WHERE cluster=$1 AND active AND commitment='finalized' AND kind='swap'
                AND payload->>'trader' IS NOT NULL
                AND ($2::text IS NULL OR pool_address=$2)
                AND ($3::text IS NULL OR payload->>'quote_mint'=$3)
           ), totals AS (
             SELECT wallet,quote_mint,count(*)::integer AS trade_count,
                    sum(buy_raw)::text AS buy_quote_raw,
                    sum(sell_raw)::text AS sell_quote_raw
               FROM observed GROUP BY wallet,quote_mint
           )
           SELECT *, (buy_quote_raw::numeric + sell_quote_raw::numeric)::text AS total_quote_raw
             FROM totals
            WHERE $4::text='all'
               OR (buy_quote_raw::numeric + sell_quote_raw::numeric) >= $5::numeric
            ORDER BY ${order} LIMIT $6`,
          [cluster, poolId ?? null, quoteMint ?? null, segment, thresholdRaw, limit],
        )
      ).rows;
      return envelope({
        items: rows.map((row) => ({
          wallet: row.wallet,
          quote_mint: row.quote_mint,
          trade_count: row.trade_count,
          buy_quote_raw: row.buy_quote_raw,
          sell_quote_raw: row.sell_quote_raw,
          total_quote_raw: row.total_quote_raw,
          segment: segment === "all" ? "unclassified" : "above_user_threshold",
        })),
        next_cursor: null,
        filters: {
          pool_id: poolId ?? null,
          quote_mint: quoteMint ?? null,
          segment,
          threshold_raw: thresholdRaw,
        },
        threshold_version: "user-supplied-raw-quote-v1",
        limitations: [
          "Only finalized DBC swaps with direct trader attribution are counted",
          "Amounts are raw units and remain grouped by quote mint",
          "This is an observed activity segment, not a wallet wealth or skill label",
        ],
      });
    },
  );

  app.get<{ Params: { address: string }; Querystring: Page }>(
    "/v1/wallets/:address/trades",
    { schema: { params: addressParams, querystring: pageQuery } },
    async (request) => {
      const { limit = 25, cursor, poolId, mint, quoteMint, sinceSlot } = request.query;
      const rows = (
        await db.query(
          `SELECT e.event_id,e.pool_address,e.signature,e.slot::text,e.payload
             FROM canonical_events e
            WHERE e.cluster=$1 AND e.active AND e.commitment='finalized' AND e.kind='swap'
              AND e.payload->>'trader'=$2
              AND ($3::text IS NULL OR e.pool_address=$3)
              AND ($4::text IS NULL OR e.payload->>'base_mint'=$4)
              AND ($5::text IS NULL OR e.payload->>'quote_mint'=$5)
              AND ($6::numeric IS NULL OR e.slot >= $6)
              AND ($7::text IS NULL OR (e.slot,e.event_id) <
                (SELECT slot,event_id FROM canonical_events
                  WHERE cluster=$1 AND event_id=$7))
            ORDER BY e.slot DESC,e.event_id DESC LIMIT $8`,
          [
            cluster,
            request.params.address,
            poolId ?? null,
            mint ?? null,
            quoteMint ?? null,
            sinceSlot ?? null,
            cursor ?? null,
            limit + 1,
          ],
        )
      ).rows;
      return envelope({
        address: request.params.address,
        items: rows.slice(0, limit).map((row) => ({
          event_id: row.event_id,
          pool: row.pool_address,
          signature: row.signature,
          slot: row.slot,
          quote_mint: row.payload.quote_mint ?? null,
          direction: Number(row.payload.trade_direction) === 1 ? "buy" : "sell",
          quote_amount_raw:
            Number(row.payload.trade_direction) === 1
              ? (row.payload.amount_raw ?? null)
              : (row.payload.output_amount ?? null),
          event: row.payload,
        })),
        next_cursor: rows.length > limit ? rows[limit - 1].event_id : null,
        limitations: ["This is indexed DBC activity, not complete wallet history or realized PnL"],
      });
    },
  );

  app.get<{ Params: { address: string } }>(
    "/v1/wallets/:address/overview",
    { schema: { params: addressParams } },
    async (request) => {
      const rows = (
        await db.query(
          `SELECT payload->>'quote_mint' AS quote_mint,
                  count(*)::integer AS trade_count,
                  sum(CASE WHEN payload->>'trade_direction'='1'
                    THEN COALESCE(payload->>'amount_raw','0')::numeric ELSE 0 END)::text AS buy_raw,
                  sum(CASE WHEN payload->>'trade_direction'='0'
                    THEN COALESCE(payload->>'output_amount','0')::numeric ELSE 0 END)::text AS sell_raw,
                  min(slot)::text AS first_slot,max(slot)::text AS last_slot
             FROM canonical_events
            WHERE cluster=$1 AND active AND commitment='finalized' AND kind='swap'
              AND payload->>'trader'=$2
            GROUP BY payload->>'quote_mint' ORDER BY quote_mint`,
          [cluster, request.params.address],
        )
      ).rows;
      return envelope({
        address: request.params.address,
        observed_quote_flows: rows,
        holdings: null,
        realized_pnl: null,
        segment: { status: "unclassified", reason: "No complete wealth or owner inventory index" },
        limitations: [
          "Observed finalized DBC swaps only; wallet history and holdings are incomplete",
        ],
      });
    },
  );

  app.get<{
    Params: { address: string };
    Querystring: { limit?: number; cursor?: string; sinceSlot?: string };
  }>(
    "/v1/wallets/:address/funding",
    {
      schema: {
        params: addressParams,
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            cursor: { type: "string", maxLength: 128 },
            sinceSlot: { type: "string", pattern: "^[0-9]{1,20}$" },
          },
        },
      },
    },
    async (request) => {
      const { limit = 25, cursor, sinceSlot } = request.query;
      const rows = (
        await db.query(
          `SELECT event_id,signature,slot::text,transaction_index,instruction_path,
                  source_wallet,recipient_wallet,lamports::text,block_time
             FROM wallet_transfers e
            WHERE e.cluster=$1 AND e.active
              AND (e.source_wallet=$2 OR e.recipient_wallet=$2)
              AND ($3::numeric IS NULL OR e.slot >= $3)
              AND ($4::text IS NULL OR (e.slot,e.event_id) <
                (SELECT slot,event_id FROM wallet_transfers WHERE cluster=$1 AND event_id=$4))
            ORDER BY e.slot DESC,e.transaction_index DESC,e.event_id DESC LIMIT $5`,
          [cluster, request.params.address, sinceSlot ?? null, cursor ?? null, limit + 1],
        )
      ).rows;
      return envelope({
        address: request.params.address,
        edges: rows.slice(0, limit).map((row) => ({
          source: row.source_wallet,
          recipient: row.recipient_wallet,
          lamports: row.lamports,
          evidence_id: row.event_id,
          signature: row.signature,
          slot: row.slot,
          timestamp: row.block_time,
          instruction_path: row.instruction_path,
          relationship: "observed_transfer",
          ownership_claim: false,
        })),
        next_cursor: rows.length > limit ? rows[limit - 1].event_id : null,
        hops: 1,
        coverage: "finalized native SOL system transfers from the indexed slot range",
        limitations: [
          "Only native SOL system transfers are included; SPL token transfers are not indexed",
          "A transfer is not proof of wallet ownership or common control",
          "History begins at the configured indexer start slot",
        ],
      });
    },
  );
}
