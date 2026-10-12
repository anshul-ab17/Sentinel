import { once } from "node:events";

import { userFor } from "../auth.ts";

import type { ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import type { Database } from "../../../../packages/database/store.ts";

export function registerStreamRoutes(app: FastifyInstance, db: Database) {
  const streams = new Map<ServerResponse, string>();
  app.addHook("preClose", async () => {
    for (const stream of streams.keys()) stream.end();
  });
  app.get("/v1/stream", async (request, reply) => {
    if (streams.size >= 100 || [...streams.values()].filter((ip) => ip === request.ip).length >= 4)
      return reply.code(429).send({ error: "stream_limit" });
    const user = await userFor(db, request);
    const last = request.headers["last-event-id"] ?? "0";
    if (typeof last !== "string" || !/^\d{1,20}$/.test(last))
      return reply.code(400).send({ error: "invalid_cursor" });
    const bounds = (
      await db.query(
        "SELECT min(id)::text AS first, max(id)::text AS last FROM outbox_events WHERE user_id IS NULL OR user_id=$1",
        [user],
      )
    ).rows[0];
    if (
      last !== "0" &&
      ((bounds.first && BigInt(last) < BigInt(bounds.first) - 1n) ||
        !bounds.last ||
        BigInt(last) > BigInt(bounds.last))
    )
      return reply.code(409).send({ error: "cursor_expired", action: "refresh_snapshot" });
    reply.hijack();
    streams.set(reply.raw, request.ip);
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(": connected\n\n");
    let cursor = last,
      closed = false,
      busy = false;
    const poll = async () => {
      if (busy || closed) return;
      busy = true;
      try {
        if (user && (await userFor(db, request)) !== user) {
          reply.raw.end();
          return;
        }
        const rows = (
          await db.query(
            "SELECT id::text,topic,payload FROM outbox_events WHERE id>$1 AND (user_id IS NULL OR user_id=$2) ORDER BY id LIMIT 100",
            [cursor, user],
          )
        ).rows;
        for (const row of rows) {
          if (closed) break;
          if (
            !reply.raw.write(
              `id: ${row.id}\nevent: ${row.topic}\ndata: ${JSON.stringify(row.payload)}\n\n`,
            )
          )
            await Promise.race([once(reply.raw, "drain"), once(reply.raw, "close")]);
          cursor = row.id;
        }
      } catch {
        reply.raw.end();
      } finally {
        busy = false;
      }
    };
    const interval = setInterval(() => void poll(), 1000);
    const heartbeat = setInterval(() => {
      if (!closed && !busy) reply.raw.write(": heartbeat\n\n");
    }, 15000);
    // Bound every stream lifetime so deployments and revoked sessions cannot retain it indefinitely.
    const lifetime = setTimeout(() => reply.raw.end(), 300000);
    reply.raw.on("close", () => {
      streams.delete(reply.raw);
      closed = true;
      clearInterval(interval);
      clearInterval(heartbeat);
      clearTimeout(lifetime);
    });
    await poll();
  });
}
