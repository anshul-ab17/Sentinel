import { randomUUID } from "node:crypto";

import { metadata } from "../repository.ts";
import { userFor, originGuard } from "../auth.ts";

import type { FastifyInstance } from "fastify";
import type { RuntimeConfig } from "../../../../packages/config/runtime.ts";
import type { Database } from "../../../../packages/database/store.ts";

export function registerPrivateRoutes(app: FastifyInstance, db: Database, config: RuntimeConfig) {
  const cluster = config.mode === "fixture" ? "fixture" : config.cluster;
  const envelope = async (data: unknown) => ({ ...(await metadata(db, config)), data });
  const privateGuard = async (
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply,
  ) => {
    if (!["GET", "HEAD"].includes(request.method) && originGuard(config, request, reply)) return;
    if (!(await userFor(db, request)))
      return reply.code(401).send({ error: "authentication_required" });
  };
  for (const resource of ["watchlists", "investigations"] as const) {
    app.patch<{
      Params: { id: string };
      Body: { name?: string; notes?: string; items?: string[] };
    }>(
      `/v1/${resource}/:id`,
      {
        preHandler: privateGuard,
        schema: {
          body: {
            type: "object",
            minProperties: 1,
            additionalProperties: false,
            properties: {
              name: { type: "string", minLength: 1, maxLength: 120 },
              notes: { type: "string", maxLength: 2000 },
              items: { type: "array", maxItems: 100, items: { type: "string", maxLength: 128 } },
            },
          },
        },
      },
      async (request, reply) => {
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.params.id)
        )
          return reply.code(404).send({ error: "not_found" });
        const { name, notes, items } = request.body;
        const row =
          resource === "watchlists"
            ? await db.query(
                "UPDATE watchlists SET name=COALESCE($3,name),items=COALESCE($4::jsonb,items),updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *",
                [
                  request.params.id,
                  await userFor(db, request),
                  name ?? null,
                  items ? JSON.stringify(items) : null,
                ],
              )
            : await db.query(
                "UPDATE investigations SET name=COALESCE($3,name),notes=COALESCE($4,notes) WHERE id=$1 AND user_id=$2 RETURNING *",
                [request.params.id, await userFor(db, request), name ?? null, notes ?? null],
              );
        return row.rows[0] ? envelope(row.rows[0]) : reply.code(404).send({ error: "not_found" });
      },
    );
    app.get(`/v1/${resource}`, { preHandler: privateGuard }, async (request) =>
      envelope(
        (
          await db.query(`SELECT * FROM ${resource} WHERE user_id=$1 ORDER BY id LIMIT 100`, [
            await userFor(db, request),
          ])
        ).rows,
      ),
    );
    app.post<{ Body: { name: string; pool_address?: string; items?: string[]; notes?: string } }>(
      `/v1/${resource}`,
      {
        preHandler: privateGuard,
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: resource === "investigations" ? ["name", "pool_address"] : ["name"],
            properties: {
              name: { type: "string", minLength: 1, maxLength: 120 },
              pool_address: { type: "string", minLength: 1, maxLength: 128 },
              items: { type: "array", maxItems: 100, items: { type: "string", maxLength: 128 } },
              notes: { type: "string", maxLength: 2000 },
            },
          },
        },
      },
      async (request, reply) => {
        const user = await userFor(db, request);
        if (
          Number(
            (await db.query(`SELECT count(*) FROM ${resource} WHERE user_id=$1`, [user])).rows[0]
              .count,
          ) >= 100
        )
          return reply.code(429).send({ error: "quota_exceeded" });
        const id = randomUUID();
        const row =
          resource === "watchlists"
            ? await db.query(
                "INSERT INTO watchlists(id,user_id,name,items) VALUES($1,$2,$3,$4) RETURNING *",
                [id, user, request.body.name, JSON.stringify(request.body.items ?? [])],
              )
            : await db.query(
                "INSERT INTO investigations(id,user_id,name,pool_address,notes) VALUES($1,$2,$3,$4,$5) RETURNING *",
                [id, user, request.body.name, request.body.pool_address, request.body.notes ?? ""],
              );
        return reply.code(201).send(await envelope(row.rows[0]));
      },
    );
    app.get<{ Params: { id: string } }>(
      `/v1/${resource}/:id`,
      { preHandler: privateGuard },
      async (request, reply) => {
        if (!/^[\da-f-]{36}$/i.test(request.params.id))
          return reply.code(404).send({ error: "not_found" });
        const row = (
          await db.query(`SELECT * FROM ${resource} WHERE id=$1 AND user_id=$2`, [
            request.params.id,
            await userFor(db, request),
          ])
        ).rows[0];
        return row ? envelope(row) : reply.code(404).send({ error: "not_found" });
      },
    );
    app.delete<{ Params: { id: string } }>(
      `/v1/${resource}/:id`,
      { preHandler: privateGuard },
      async (request, reply) => {
        if (!/^[\da-f-]{36}$/i.test(request.params.id))
          return reply.code(404).send({ error: "not_found" });
        const result = await db.query(
          `DELETE FROM ${resource} WHERE id=$1 AND user_id=$2 RETURNING id`,
          [request.params.id, await userFor(db, request)],
        );
        return result.rowCount ? { deleted: true } : reply.code(404).send({ error: "not_found" });
      },
    );
  }
  app.get("/v1/preferences", { preHandler: privateGuard }, async (request) =>
    envelope(
      (
        await db.query("SELECT in_app FROM notification_preferences WHERE user_id=$1", [
          await userFor(db, request),
        ])
      ).rows[0] ?? { in_app: true },
    ),
  );
  app.get("/v1/alerts", { preHandler: privateGuard }, async (request) =>
    envelope(
      (
        await db.query(
          `SELECT a.id,a.signal_id,a.status,a.payload,a.updated_at,
                  COALESCE(x.status,'open') AS acknowledgement
             FROM in_app_alerts a
             LEFT JOIN signal_acknowledgements x
               ON x.user_id=a.user_id AND x.signal_id=a.signal_id
            WHERE a.user_id=$1 ORDER BY a.updated_at DESC LIMIT 100`,
          [await userFor(db, request)],
        )
      ).rows,
    ),
  );
  app.put<{ Body: { in_app: boolean } }>(
    "/v1/preferences",
    {
      preHandler: privateGuard,
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["in_app"],
          properties: { in_app: { type: "boolean" } },
        },
      },
    },
    async (request) => {
      const row = await db.query(
        "INSERT INTO notification_preferences(user_id,in_app) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET in_app=excluded.in_app RETURNING in_app",
        [await userFor(db, request), request.body.in_app],
      );
      return envelope(row.rows[0]);
    },
  );
  app.post<{ Params: { id: string } }>(
    "/v1/investigations/:id/analyze",
    { preHandler: privateGuard },
    async (request, reply) => {
      if (!/^[\da-f-]{36}$/i.test(request.params.id))
        return reply.code(404).send({ error: "not_found" });
      const row = (
        await db.query("SELECT id,pool_address FROM investigations WHERE id=$1 AND user_id=$2", [
          request.params.id,
          await userFor(db, request),
        ])
      ).rows[0];
      if (!row) return reply.code(404).send({ error: "not_found" });
      const id = randomUUID();
      await db.query(
        "INSERT INTO processing_jobs(id,kind,dedup_key,payload) VALUES($1,'assessment',$2,$3) ON CONFLICT DO NOTHING",
        [
          id,
          `investigation:${row.id}:${config.jevModel ?? "template"}`,
          {
            investigation_id: row.id,
            pool: row.pool_address,
            user_id: await userFor(db, request),
            cluster,
          },
        ],
      );
      return reply.code(202).send({ status: "queued", investigation_id: row.id });
    },
  );
}
