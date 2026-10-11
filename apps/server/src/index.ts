import { createServer } from "node:http";
import { Readable } from "node:stream";
import { handleRequest } from "@server/handler";

const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
const host = process.env.HOST ?? "127.0.0.1";
const server = createServer(async (incoming, outgoing) => {
  try {
    const init: RequestInit & { duplex?: "half" } = { method: incoming.method };
    if (incoming.method !== "GET" && incoming.method !== "HEAD") {
      init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      init.duplex = "half";
    }
    const request = new Request(new URL(incoming.url ?? "/", "http://localhost"), init);
    const response = await handleRequest(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error("Request failed:", error instanceof Error ? error.message : "Unknown error");
    outgoing.writeHead(500, { "Content-Type": "application/json" });
    outgoing.end(JSON.stringify({ error: "Internal server error" }));
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, host, () => console.log(`Sentinel API: http://${host}:${port} (synthetic demo data)`));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
});
