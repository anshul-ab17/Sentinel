import test from "node:test";
import assert from "node:assert/strict";

import { detect, normalize } from "@detection/detect";
import { replay } from "@detection/replay";
import { events, pools, EPOCH } from "@fixtures/launch";

import type { Event } from "@shared/events";

test("fixture detects concentration, shared funding and one large transfer with evidence", () => {
  const alerts = detect(events);
  assert.equal(alerts.length, 3);
  assert.deepEqual(
    new Set(alerts.map((alert) => alert.rule.id)),
    new Set(["early-buyer-concentration", "shared-funding", "large-transfer"]),
  );
  for (const alert of alerts) {
    assert.equal(alert.pool, pools[0].address);
    assert.ok(alert.evidence.length > 0);
    assert.ok(alert.evidence.every((id) => events.some((event) => event.id === id)));
  }
  assert.equal(
    alerts.find((alert) => alert.rule.id === "early-buyer-concentration")?.metrics.shareBps,
    8000,
  );
});

test("reordered and duplicate notifications reproduce identical alerts and digest", () => {
  const original = replay(events, pools[0].address);
  assert.deepEqual(replay([...events].reverse().concat(events), pools[0].address), original);
});

test("cutoff excludes future purchases, funding and transfers", () => {
  const result = replay(events, pools[0].address, EPOCH + 20);
  assert.equal(result.eventCount, 5);
  assert.equal(result.alerts.length, 0);
  assert.ok(result.events.every((event) => event.timestamp <= EPOCH + 20));
});

test("balanced launches and nonfinalized events do not trigger", () => {
  assert.equal(detect(events.filter((event) => event.pool !== pools[0].address)).length, 0);
  assert.equal(detect(events.map((event) => ({ ...event, commitment: "confirmed" }))).length, 0);
});

test("conflicting duplicates are rejected rather than silently replacing evidence", () => {
  const buy = events.find((event) => event.kind === "buy")!;
  assert.throws(
    () => normalize([...events, { ...buy, timestamp: buy.timestamp + 1 }]),
    /Conflicting event/,
  );
});

test("funding after the purchase is not used to infer funding of that purchase", () => {
  const changed = events.map((event) =>
    event.kind === "funding" ? { ...event, timestamp: EPOCH + 89 } : event,
  );
  assert.ok(!detect(changed).some((alert) => alert.rule.id === "shared-funding"));
});

test("transfer threshold is inclusive and integer-exact", () => {
  const transfer = events.find((event) => event.kind === "transfer")!;
  const below: Event = {
    ...transfer,
    kind: "transfer",
    wallet: "a",
    recipient: "b",
    lamports: "99999999999",
  };
  assert.equal(detect([below]).length, 0);
  assert.equal(detect([{ ...below, lamports: "100000000000" }]).length, 1);
});

test("invalid amount strings and cutoff are rejected", () => {
  const buy = events.find((event) => event.kind === "buy")!;
  assert.throws(
    () => detect([{ ...buy, kind: "buy", wallet: "a", quoteLamports: "1.5" }]),
    /integer strings/,
  );
  assert.throws(() => replay(events, pools[0].address, NaN), /Invalid replay cutoff/);
});

test("events outside the early window do not change concentration", () => {
  const buy = events.find((event) => event.kind === "buy")!;
  const late: Event = {
    ...buy,
    id: "late",
    signature: "late",
    timestamp: EPOCH + 91,
    kind: "buy",
    wallet: "late-buyer",
    quoteLamports: "9999999999999999999999999",
  };
  assert.deepEqual(detect([...events, late]), detect(events));
});
