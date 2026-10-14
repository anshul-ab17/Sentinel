import type { FastifyInstance } from "fastify";

import { listPantaMarkets, PantaProviderError } from "../providers/panta.ts";
import type { RuntimeConfig } from "../../../../packages/config/runtime.ts";

const querySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: { type: "string", minLength: 1, maxLength: 40 },
    status: { type: "string", enum: ["primary", "secondary", "resolved", "cancelled"] },
    cursor: { type: "string", minLength: 1, maxLength: 128 },
    limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
  },
};

export function registerPantaRoutes(app: FastifyInstance, config: RuntimeConfig) {
  app.get("/v1/providers/panta/status", async () => ({
    provider: "panta",
    configured: Boolean(config.pantaApiKey),
    capability: "read_only_prediction_market_catalog",
    role: "external market context; not Solana RPC or Meteora DBC evidence",
  }));

  app.get<{
    Querystring: {
      category?: string;
      status?: "primary" | "secondary" | "resolved" | "cancelled";
      cursor?: string;
      limit?: number;
    };
  }>(
    "/v1/providers/panta/markets",
    { schema: { querystring: querySchema } },
    async (request, reply) => {
      try {
        const result = await listPantaMarkets(config.pantaApiKey, {
          category: request.query.category,
          status: request.query.status,
          cursor: request.query.cursor,
          limit: request.query.limit ?? 20,
        });
        return {
          provider: "panta",
          fetched_at: new Date().toISOString(),
          source_scope: "Panta USDC prediction market catalog",
          chain_evidence: false,
          ...result,
        };
      } catch (error) {
        const status = error instanceof PantaProviderError ? error.httpStatus : 503;
        const code = error instanceof PantaProviderError ? error.code : "upstream_unavailable";
        return reply.code(status).send({ error: code, provider: "panta" });
      }
    },
  );
}
