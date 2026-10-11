import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "@server/handler";
import { EPOCH } from "@fixtures/launch";

const get = (path: string) => handleRequest(new Request(`http://localhost/api/${path}`));
const post = (body: string) => handleRequest(new Request("http://localhost/api/investigations/replay", { method: "POST", body }));

test("API advertises demo coverage and serves pool-specific evidence", async () => {
  const response = await get("pools/demo-orbit-pool/events");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.coverage.mode, "demo");
  assert.equal(data.coverage.liveIngestion, false);
  assert.equal(data.events.length, 12);
});

test("replay API validates JSON, pool, cutoff, and request size", async () => {
  assert.equal((await post("{")).status, 400);
  assert.equal((await post("null")).status, 400);
  assert.equal((await post(JSON.stringify({ pool: "missing" }))).status, 404);
  assert.equal((await post(JSON.stringify({ pool: "demo-orbit-pool", through: "90" }))).status, 400);
  assert.equal((await post("x".repeat(4097))).status, 413);
});

test("repeated replay requests return identical bodies", async () => {
  const body = JSON.stringify({ pool: "demo-orbit-pool", through: EPOCH + 90 });
  const first = await post(body);
  const second = await post(body);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), await second.json());
});

test("wallet graph carries direct evidence and routes fail explicitly", async () => {
  const data = await (await get("wallets/demo-common-funder/graph")).json();
  assert.equal(data.edges.length, 3);
  assert.ok(data.edges.every((edge: {eventId: string}) => edge.eventId));
  assert.equal((await get("pools/missing")).status, 404);
  assert.equal((await get("alerts/stream")).status, 404);
  assert.equal((await handleRequest(new Request("http://localhost/api/pools", { method: "DELETE" }))).status, 405);
});
