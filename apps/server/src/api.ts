import Fastify from "fastify";
import swagger from "@fastify/swagger";

import { registerPublicRoutes } from "./routes/public.ts";
import { registerPrivateRoutes } from "./routes/private.ts";
import { registerStreamRoutes } from "./routes/stream.ts";
import { registerSharkRoutes } from "./routes/sharks.ts";
import { registerAnomalyRoutes } from "./routes/anomalies.ts";
import { registerPoolHistoryRoutes } from "./routes/pool-history.ts";
import { loadConfig, type RuntimeConfig } from "../../../packages/config/runtime.ts";
import { createDatabase, type Database } from "../../../packages/database/store.ts";
import { registerAuth } from "./auth.ts";
import { persistedSnapshot, seedFixtures } from "./repository.ts";
import { handleRequest } from "./handler.ts";
import { createRedisInfrastructure } from "./redis.ts";

export async function buildApi(
  config: RuntimeConfig = loadConfig(),
  db: Database = createDatabase(
    config.databaseUrl,
    config.mode === "live" ? "sentinel_api" : undefined,
  ),
) {
  const app = Fastify({
    logger: { redact: ["req.headers.cookie", "req.headers.authorization", "req.body.signature"] },
    bodyLimit: 16384,
    requestTimeout: 15000,
    // The API is only exposed through the loopback-bound reverse proxy.
    trustProxy: true,
  });
  const redis = createRedisInfrastructure(config.redisUrl, db);
  try {
    await redis.connect();
  } catch (error) {
    await db.end();
    throw error;
  }
  await app.register(swagger, {
    openapi: {
      info: { title: "Sentinel API", version: "0.1.0" },
      servers: [{ url: config.origin }],
    },
  });
  app.addSchema({
    $id: "sentinel.coverage.v1",
    type: "object",
    additionalProperties: true,
    required: ["as_of_slot", "commitment", "observed_at", "freshness", "coverage", "data"],
    properties: {
      as_of_slot: { type: ["string", "null"] },
      commitment: { type: "string" },
      observed_at: { type: ["string", "null"] },
      freshness: {
        type: "string",
        enum: ["fresh", "stale", "warming_up", "degraded", "synthetic"],
      },
      coverage: {
        type: "object",
        additionalProperties: true,
        required: ["mode", "status"],
        properties: {
          mode: { type: "string" },
          status: { type: "string" },
          limitations: { type: "array", items: { type: "string" } },
        },
      },
      data: {},
    },
  });
  app.addHook("onRoute", (options) => {
    const path = options.url;
    if (
      path.startsWith("/v1/") &&
      !path.startsWith("/v1/auth/") &&
      !["/v1/me", "/v1/stream", "/v1/openapi.json"].includes(path) &&
      !path.endsWith("/analyze") &&
      options.method !== "DELETE"
    ) {
      options.schema = {
        ...options.schema,
        response: {
          ...((options.schema?.response as Record<string, unknown>) ?? {}),
          [options.method === "POST" ? 201 : 200]: { $ref: "sentinel.coverage.v1#" },
        },
      };
    }
  });
  await seedFixtures(db, config);
  app.addHook("onRequest", async (request, reply) => {
    const key = request.ip + (request.url.startsWith("/v1/auth") ? ":auth" : ":api");
    try {
      const result = await redis.checkRateLimit(key, key.endsWith(":auth") ? 20 : 300, 60);
      if (!result.allowed)
        return reply
          .code(429)
          .header("Retry-After", String(result.retryAfter))
          .send({ error: "rate_limited" });
    } catch (error) {
      request.log.error({ error }, "Redis rate limiter unavailable");
      return reply.code(503).send({ error: "rate_limiter_unavailable" });
    }

    if (request.method !== "GET" || !isCacheableRead(request.url)) return;
    try {
      const cached = await redis.getCached(request.url);
      if (cached !== null)
        return reply
          .header("X-Sentinel-Cache", "HIT")
          .header("Content-Type", "application/json; charset=utf-8")
          .send(cached);
    } catch (error) {
      request.log.warn({ error }, "Redis response cache unavailable");
    }
  });
  app.addHook("onSend", async (request, reply, payload) => {
    if (request.method !== "GET" || reply.statusCode !== 200 || !isCacheableRead(request.url))
      return payload;
    try {
      await redis.setCached(
        request.url,
        Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload),
      );
    } catch (error) {
      request.log.warn({ error }, "Redis response cache write failed");
    }
    return payload;
  });
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    request.log.error({ error: error.message }, "Request failed");
    reply.code(error.statusCode ?? 500).send({
      error: error.statusCode && error.statusCode < 500 ? "invalid_request" : "service_unavailable",
    });
  });
  registerAuth(app, db, config);
  registerPublicRoutes(app, db, config, () => redis.ping());
  registerSharkRoutes(app, db, config);
  registerAnomalyRoutes(app, db, config);
  registerPoolHistoryRoutes(app, db, config);
  registerPrivateRoutes(app, db, config);
  registerStreamRoutes(app, db, redis);
  app.all("/api/*", async (request, reply) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers))
      if (typeof value === "string") headers.set(key, value);
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : JSON.stringify(request.body);
    const response = await handleRequest(
      new Request(`http://localhost${request.url}`, { method: request.method, headers, body }),
      await persistedSnapshot(db, config),
    );
    reply.code(response.status);
    for (const [key, value] of response.headers) reply.header(key, value);
    return reply.send(Buffer.from(await response.arrayBuffer()));
  });
  app.addHook("onClose", async () => {
    await redis.close();
    await db.end();
  });
  return app;
}

function isCacheableRead(url: string) {
  const path = url.split("?", 1)[0];
  return (
    path === "/api/snapshot" ||
    path === "/api/pools" ||
    path === "/api/alerts" ||
    path === "/v1/sharks/activity" ||
    path === "/v1/sharks/wallets" ||
    /^\/api\/(?:pools|wallets)\/[^/]+(?:\/[^/]+)?$/.test(path) ||
    /^\/v1\/(?:launches|signals|pools|evidence\/[^/]+|pools\/[^/]+(?:\/events)?|tokens\/[^/]+\/(?:dossier|holders)|wallets\/[^/]+(?:\/graph)?)$/.test(
      path,
    )
  );
}
