import { metadata } from "../repository.ts";

import type { FastifyInstance } from "fastify";
import type { RuntimeConfig } from "../../../../packages/config/runtime.ts";
import type { Database } from "../../../../packages/database/store.ts";

const publicKey = "^[1-9A-HJ-NP-Za-km-z]{32,44}$";
const params = {
  type: "object",
  required: ["address"],
  properties: { address: { type: "string", pattern: publicKey } },
};

function curveProgress(payload: Record<string, unknown>) {
  const reserve = payload.quote_reserve_amount;
  const threshold = payload.migration_threshold;
  if (
    typeof reserve !== "string" ||
    typeof threshold !== "string" ||
    !/^\d+$/.test(reserve) ||
    !/^\d+$/.test(threshold) ||
    BigInt(threshold) === 0n
  )
    return null;
  const reserveRaw = BigInt(reserve);
  const thresholdRaw = BigInt(threshold);
  return {
    reserve_raw: reserve,
    threshold_raw: threshold,
    remaining_raw: (thresholdRaw > reserveRaw ? thresholdRaw - reserveRaw : 0n).toString(),
    threshold_progress_bps: ((reserveRaw * 10000n) / thresholdRaw).toString(),
  };
}

export function registerPoolHistoryRoutes(
  app: FastifyInstance,
  db: Database,
  config: RuntimeConfig,
) {
  const cluster = config.mode === "fixture" ? "fixture" : config.cluster;
  const envelope = async (data: unknown) => ({ ...(await metadata(db, config)), data });

  app.get<{
    Params: { address: string };
    Querystring: { limit?: number; cursor?: string; kind?: string };
  }>(
    "/v1/pools/:address/history",
    {
      schema: {
        params,
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
            cursor: { type: "string", maxLength: 128 },
            kind: {
              type: "string",
              enum: ["pool_created", "swap", "curve_complete", "fee_claim", "creator_changed"],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const exists = await db.query("SELECT 1 FROM pools WHERE cluster=$1 AND address=$2", [
        cluster,
        request.params.address,
      ]);
      if (!exists.rowCount) return reply.code(404).send({ error: "pool_not_found" });
      const { limit = 100, cursor, kind } = request.query;
      const rows = (
        await db.query(
          `SELECT event_id,kind,slot::text,signature,instruction_path,transaction_index,
                  ordinal,payload,observation_id
             FROM canonical_events
            WHERE cluster=$1 AND pool_address=$2 AND active AND commitment='finalized'
              AND ($3::text IS NULL OR kind=$3)
              AND ($4::text IS NULL OR (slot,transaction_index,instruction_path,ordinal,event_id) >
                (SELECT slot,transaction_index,instruction_path,ordinal,event_id
                   FROM canonical_events WHERE cluster=$1 AND event_id=$4))
            ORDER BY slot,transaction_index,instruction_path,ordinal,event_id LIMIT $5`,
          [cluster, request.params.address, kind ?? null, cursor ?? null, limit + 1],
        )
      ).rows;
      return envelope({
        pool: request.params.address,
        items: rows.slice(0, limit).map((row) => ({
          ...row,
          curve: curveProgress(row.payload),
        })),
        next_cursor: rows.length > limit ? rows[limit - 1].event_id : null,
        ordering: "finalized block transaction/instruction order",
        limitations: [
          "History begins at the first indexed slot",
          "Curve progress is threshold progress only and is unavailable without compatible reserve fields",
          "USD price, executable depth and DAMM position/lock state are not inferred",
        ],
      });
    },
  );
}
