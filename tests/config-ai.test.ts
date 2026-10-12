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
