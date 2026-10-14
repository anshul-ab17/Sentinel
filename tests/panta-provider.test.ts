import test from "node:test";
import assert from "node:assert/strict";

import { listPantaMarkets, PantaProviderError } from "../apps/server/src/providers/panta.ts";

test("Panta market reads are server-authenticated, bounded and source-labeled", async () => {
  let requestedUrl = "";
  let authorization = "";
  const result = await listPantaMarkets(
    "pk_test_private",
    { category: "crypto", status: "primary", limit: 20 },
    async (input, init) => {
      requestedUrl = String(input);
      authorization = new Headers(init?.headers).get("X-Api-Key") ?? "";
      return Response.json({
        items: [
          {
            marketId: "market-1",
            category: "crypto",
            title: "SOL above a threshold?",
            phase: "primary",
            status: "open",
            volumeUsdc: "123.45",
          },
        ],
        nextCursor: "next-page",
      });
    },
  );

  assert.equal(new URL(requestedUrl).origin, "https://live-api.panta.market");
  assert.equal(new URL(requestedUrl).pathname, "/api/v1/markets/");
  assert.equal(new URL(requestedUrl).searchParams.get("category"), "crypto");
  assert.equal(authorization, "pk_test_private");
  assert.equal(result.items[0].marketId, "market-1");
  assert.equal(result.next_cursor, "next-page");
});

test("Panta integration makes no request without a key", async () => {
  let called = false;
  await assert.rejects(
    listPantaMarkets(undefined, {}, async () => {
      called = true;
      return Response.json({ items: [] });
    }),
    (error: unknown) =>
      error instanceof PantaProviderError && error.code === "provider_not_configured",
  );
  assert.equal(called, false);
});

test("Panta malformed responses and upstream failures fail closed", async () => {
  await assert.rejects(
    listPantaMarkets("key", {}, async () => Response.json({ items: [{ marketId: 7 }] })),
    (error: unknown) =>
      error instanceof PantaProviderError && error.code === "invalid_upstream_response",
  );
  await assert.rejects(
    listPantaMarkets("key", {}, async () => new Response("unavailable", { status: 429 })),
    (error: unknown) =>
      error instanceof PantaProviderError && error.code === "upstream_unavailable",
  );
});
