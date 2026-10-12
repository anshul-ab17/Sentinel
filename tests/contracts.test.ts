import test from "node:test";
import assert from "node:assert/strict";

import { validateEvent } from "../packages/contracts/validate.ts";
const event = {
  schema_version: "sentinel.event.v1",
  event_id: "test",
  cluster: "devnet",
  slot: "510343149",
  signature: "recorded-test",
  instruction_path: [5, 3],
  kind: "swap",
  commitment: "finalized",
  protocol: "meteora_dbc",
  decoder_version: "anchor-dbc-0.2.1-f552f20",
  amount_raw: "18446744073709551615",
  decimals: null,
  source_observation_ids: ["raw:test"],
  coverage: "partial",
};
test("canonical amounts remain exact decimal strings and unknown decimals remain null", () => {
  assert.doesNotThrow(() => validateEvent(event));
  for (const amount_raw of [1.5, "1.5", "-1", "01", (1n << 128n).toString()])
    assert.throws(() => validateEvent({ ...event, amount_raw }));
  assert.throws(() => validateEvent({ ...event, slot: 123 }));
  assert.throws(() => validateEvent({ ...event, source_observation_ids: [] }));
});
