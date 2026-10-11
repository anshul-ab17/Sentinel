import { getSnapshot } from "@server/data";
import { replay } from "@detection/replay";

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });

export async function handleRequest(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith("/api/")) return json({ error: "Endpoint not found" }, 404);
  const path = pathname.slice(5).split("/");
  if (request.method === "POST") return post(request, path);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  return get(path);
}

function get(path: string[]) {
  const snapshot = getSnapshot();
  const [resource, id, child] = path;
  if (path.length === 1) {
    if (resource === "snapshot") return json(snapshot);
    if (resource === "health") return json({ status: "ok", coverage: snapshot.coverage });
    if (resource === "pools") return json({ coverage: snapshot.coverage, pools: snapshot.pools });
    if (resource === "alerts") return json({ coverage: snapshot.coverage, alerts: snapshot.alerts });
  }
  if (resource === "pools" && path.length <= 3 && id) {
    const pool = snapshot.pools.find(pool => pool.address === id);
    if (!pool) return json({ error: "Pool not found in the demo dataset" }, 404);
    const events = snapshot.events.filter(event => event.pool === id);
    if (child === "events") return json({ coverage: snapshot.coverage, events });
    if (!child) return json({ coverage: snapshot.coverage, pool, alerts: snapshot.alerts.filter(alert => alert.pool === id) });
  }
  if (resource === "wallets" && id && path.length <= 3) {
    const events = snapshot.events.filter(event => ("wallet" in event && event.wallet === id) ||
      (event.kind === "funding" && event.source === id) || (event.kind === "transfer" && event.recipient === id));
    if (!events.length) return json({ error: "Wallet not found in the demo dataset" }, 404);
    if (!child) return json({ coverage: snapshot.coverage, wallet: id, events });
    if (child === "graph") return json({ coverage: snapshot.coverage, wallet: id, edges: events.flatMap(event =>
      event.kind === "funding" ? [{ from: event.source, to: event.wallet, eventId: event.id, lamports: event.lamports }] :
      event.kind === "transfer" ? [{ from: event.wallet, to: event.recipient, eventId: event.id, lamports: event.lamports }] : []) });
  }
  return json({ error: "Endpoint not found" }, 404);
}

async function post(request: Request, path: string[]) {
  if (path.join("/") !== "investigations/replay") return json({ error: "Endpoint not found" }, 404);
  // Bound the body while reading, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "A JSON body is required" }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) { await reader.cancel(); return json({ error: "Request too large" }, 413); }
    chunks.push(value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body || typeof body !== "object" || !("pool" in body) || typeof body.pool !== "string") {
    return json({ error: "pool is required" }, 400);
  }
  const through = "through" in body ? body.through : undefined;
  if (through !== undefined && (typeof through !== "number" || !Number.isSafeInteger(through) || through < 0)) {
    return json({ error: "through must be a nonnegative Unix timestamp in seconds" }, 400);
  }
  const snapshot = getSnapshot();
  if (!snapshot.pools.some(pool => pool.address === body.pool)) return json({ error: "Pool not found" }, 404);
  return json({ coverage: snapshot.coverage, ...replay(snapshot.events, body.pool, through as number | undefined) });
}
