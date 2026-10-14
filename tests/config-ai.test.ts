import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../packages/config/runtime.ts";
import { validateJev, JevAdapter } from "../packages/ai/jev.ts";
test("live configuration defaults to a public Solana endpoint and never uses synthetic data", () => {
  const defaults = loadConfig({ DATABASE_URL: "postgres://localhost/test" });
  assert.equal(defaults.mode, "live");
  assert.equal(defaults.rpcUrl, "https://api.mainnet.solana.com");
  assert.deepEqual(defaults.rpcFallbackUrls, []);
  assert.equal(
    loadConfig({ APP_MODE: "fixture", DATABASE_URL: "postgres://localhost/test" }).mode,
    "fixture",
  );
  assert.deepEqual(
    loadConfig({
      DATABASE_URL: "postgres://localhost/test",
      SOLANA_HTTP_FALLBACK_URLS: "https://one.example, https://two.example",
    }).rpcFallbackUrls,
    ["https://one.example", "https://two.example"],
  );
  const providers = loadConfig({
    DATABASE_URL: "postgres://localhost/test",
    RPCFAST_HTTP_URL: "https://rpcfast.example/cluster",
    RPCFAST_WS_URL: "wss://rpcfast.example/stream",
    SOLAMI_HTTP_URL: "https://solami.example/cluster",
    SOLAMI_WS_URL: "wss://solami.example/stream",
    PANTA_API_KEY: "server-only-test-key",
  });
  assert.equal(providers.rpcUrl, "https://rpcfast.example/cluster");
  assert.deepEqual(providers.rpcFallbackUrls, ["https://solami.example/cluster"]);
  assert.equal(providers.rpcFastWsUrl, "wss://rpcfast.example/stream");
  assert.equal(providers.solamiWsUrl, "wss://solami.example/stream");
  assert.equal(providers.pantaApiKey, "server-only-test-key");
  assert.equal(providers.aiDailyMaxRequests, 100);
  assert.equal(
    loadConfig({ DATABASE_URL: "postgres://localhost/test", AI_DAILY_MAX_REQUESTS: "0" })
      .aiDailyMaxRequests,
    0,
  );
  assert.throws(
    () => loadConfig({ DATABASE_URL: "postgres://localhost/test", AI_DAILY_MAX_REQUESTS: "-1" }),
    /AI_DAILY_MAX_REQUESTS/,
  );
  assert.throws(
    () =>
      loadConfig({
        DATABASE_URL: "postgres://localhost/test",
        AI_MODE: "shadow",
        JEV_MODEL: "jev-latest",
        TYPESAFE_API_KEY: "test",
      }),
    /pinned/,
  );
  assert.throws(
    () => loadConfig({ DATABASE_URL: "postgres://localhost/test", AUTH_DOMAIN: "attacker" }),
    /AUTH_DOMAIN/,
  );
});
test("Jev network boundary rejects invalid probabilities and model drift", () => {
  assert.throws(() => validateJev({ model: "jev-latest", answers: {} }, "jev-1.13.0"), /model/);
  assert.throws(() => validateJev({ model: "jev-1.13.0", answers: {} }, "jev-1.13.0"), /keys/);
});
test("AI outage circuit breaks while preserving deterministic fallback", async () => {
  let calls = 0;
  const adapter = new JevAdapter(
    { key: "test", model: "jev-1.13.0", baseUrl: "https://example.invalid" },
    async () => {
      calls++;
      return new Response("unavailable", { status: 529 });
    },
  );
  for (let i = 0; i < 4; i++) await assert.rejects(adapter.evaluate({}), /ai_unavailable/);
  assert.equal(calls, 3);
});
