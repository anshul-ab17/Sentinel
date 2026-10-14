import test from "node:test";
import assert from "node:assert/strict";

import {
  jevClassification,
  jevTokenUsage,
  reserveDailyShadowRequest,
} from "../apps/worker/src/shadow-budget.ts";
import type { Database } from "../packages/database/store.ts";

test("shadow request budget is a hard zero-limit gate and atomically reserves positive budgets", async () => {
  let calls = 0;
  const db = {
    query: async (sql: string, values: unknown[]) => {
      calls++;
      assert.match(sql, /ON CONFLICT\(usage_day\) DO UPDATE/);
      assert.deepEqual(values, [2]);
      return { rowCount: 1 };
    },
  } as unknown as Database;

  assert.equal(await reserveDailyShadowRequest(db, 0), false);
  assert.equal(calls, 0);
  assert.equal(await reserveDailyShadowRequest(db, 2), true);
  assert.equal(calls, 1);
});

test("Jev shadow runs preserve bounded usage and the classification label", () => {
  const result = {
    answers: { classification: { choice: "insufficient_evidence" } },
    usage: { input_tokens: 125, output_tokens: 31 },
  };
  assert.deepEqual(jevTokenUsage(result), { input: 125, output: 31 });
  assert.equal(jevClassification(result), "insufficient_evidence");
  assert.deepEqual(jevTokenUsage({ usage: { input_tokens: -4, output_tokens: 2 ** 60 } }), {
    input: 0,
    output: 0,
  });
  assert.equal(jevClassification({ answers: { classification: { choice: 9 } } }), null);
});
