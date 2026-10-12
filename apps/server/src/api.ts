import Fastify from "fastify";
import swagger from "@fastify/swagger";

import { registerPublicRoutes } from "./routes/public.ts";
import { registerPrivateRoutes } from "./routes/private.ts";
import { registerStreamRoutes } from "./routes/stream.ts";
import { loadConfig, type RuntimeConfig } from "../../../packages/config/runtime.ts";
import { createDatabase, type Database } from "../../../packages/database/store.ts";
import { registerAuth } from "./auth.ts";
import { persistedSnapshot, seedFixtures } from "./repository.ts";
import { handleRequest } from "./handler.ts";

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
    trustProxy: false,
  });
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
  const rate = new Map<string, { count: number; reset: number }>();
  app.addHook("onRequest", async (request, reply) => {
    const key = request.ip + (request.url.startsWith("/v1/auth") ? ":auth" : ":api");
    const now = Date.now();
    if (rate.size > 10000) for (const [ip, state] of rate) if (state.reset < now) rate.delete(ip);
    const state = rate.get(key) ?? { count: 0, reset: now + 60000 };
    if (state.reset < now) {
      state.count = 0;
      state.reset = now + 60000;
    }
    rate.set(key, state);
    if (++state.count > (key.endsWith(":auth") ? 20 : 300))
      return reply.code(429).header("Retry-After", "60").send({ error: "rate_limited" });
  });
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    request.log.error({ error: error.message }, "Request failed");
    reply.code(error.statusCode ?? 500).send({
      error: error.statusCode && error.statusCode < 500 ? "invalid_request" : "service_unavailable",
    });
  });
  registerAuth(app, db, config);
  registerPublicRoutes(app, db, config);
  registerPrivateRoutes(app, db, config);
  registerStreamRoutes(app, db);
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
    await db.end();
  });
  return app;
}
