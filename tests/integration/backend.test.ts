import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";

import bs58 from "bs58";

import { buildApi } from "../../apps/server/src/api.ts";
import { loadConfig } from "../../packages/config/runtime.ts";
import { claimJob, createDatabase, transaction } from "../../packages/database/store.ts";
import { dispatchInApp } from "../../apps/worker/src/delivery.ts";

const url = process.env.DATABASE_URL;
test("persistent API, SIWS nonce fencing and tenant authorization", { skip: !url }, async () => {
  const config = loadConfig({ DATABASE_URL: url, APP_MODE: "fixture" });
  const db = createDatabase(url!);
  const app = await buildApi(config, db);
  const origin = config.origin;
  async function login() {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const address = bs58.encode(publicKey.export({ format: "der", type: "spki" }).subarray(-32));
    const challenge = await app.inject({
      method: "POST",
      url: "/v1/auth/challenge",
      headers: { origin },
      payload: { address },
    });
    assert.equal(challenge.statusCode, 200);
    const { id, message } = challenge.json();
    const flow = challenge.cookies.find((c) => c.name === "sentinel_flow")!;
    const payload = {
      id,
      signedMessage: message,
      signature: sign(null, Buffer.from(message, "base64"), privateKey).toString("base64"),
    };
    const headers = { origin, cookie: `sentinel_flow=${flow.value}` };
    const responses = await Promise.all([
      app.inject({ method: "POST", url: "/v1/auth/verify", headers, payload }),
      app.inject({ method: "POST", url: "/v1/auth/verify", headers, payload }),
    ]);
    assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 401]);
    const accepted = responses.find((r) => r.statusCode === 200)!;
    return {
      cookie: `sentinel_session=${accepted.cookies.find((c) => c.name === "sentinel_session")!.value}`,
      address,
    };
  }
  try {
    assert.equal((await app.inject("/health/ready")).statusCode, 200);
    const snapshot = (await app.inject("/api/snapshot")).json();
    assert.equal(snapshot.coverage.persistence, "PostgreSQL");
    assert.equal(snapshot.events.length, 28);
    const cachedSnapshot = await app.inject("/api/snapshot");
    assert.equal(cachedSnapshot.headers["x-sentinel-cache"], "HIT");
    const before = (await db.query("SELECT count(*) FROM canonical_events WHERE cluster='fixture'"))
      .rows[0].count;
    // Repeated fixture initialization must not produce duplicate volume/outbox.
    const { seedFixtures } = await import("../../apps/server/src/repository.ts");
    await seedFixtures(db, config);
    assert.equal(
      (await db.query("SELECT count(*) FROM canonical_events WHERE cluster='fixture'")).rows[0]
        .count,
      before,
    );
    assert.equal((await app.inject("/v1/launches?limit=101")).statusCode, 400);
    const page = (await app.inject("/v1/launches?limit=1")).json();
    assert.equal(page.data.items.length, 1);
    assert.ok(page.data.next_cursor);
    assert.equal((await app.inject("/v1/watchlists")).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/challenge",
          headers: { origin: "https://attacker.example" },
          payload: { address: "11111111111111111111111111111111" },
        })
      ).statusCode,
      403,
    );
    const a = await login(),
      b = await login();
    const wrong = await app.inject({
      method: "POST",
      url: "/v1/auth/challenge",
      headers: { origin },
      payload: { address: a.address },
    });
    const challenge = wrong.json(),
      flow = wrong.cookies.find((c) => c.name === "sentinel_flow")!;
    const wrongHeaders = { origin, cookie: `sentinel_flow=${flow.value}` };
    const badProof = {
      id: challenge.id,
      signedMessage: Buffer.from(
        Buffer.from(challenge.message, "base64")
          .toString()
          .replace(config.domain, "attacker.example"),
      ).toString("base64"),
      signature: Buffer.alloc(64).toString("base64"),
    };
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/verify",
          headers: wrongHeaders,
          payload: badProof,
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (await db.query("SELECT consumed_at FROM auth_challenges WHERE id=$1", [challenge.id]))
        .rows[0].consumed_at,
      null,
    );
    await db.query("UPDATE auth_challenges SET expires_at=now()-interval '1 second' WHERE id=$1", [
      challenge.id,
    ]);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/v1/auth/verify",
          headers: wrongHeaders,
          payload: { ...badProof, signedMessage: challenge.message },
        })
      ).statusCode,
      401,
    );
    const created = await app.inject({
      method: "POST",
      url: "/v1/investigations",
      headers: { origin, cookie: a.cookie },
      payload: { name: "Private", pool_address: "demo-orbit-pool" },
    });
    assert.equal(created.statusCode, 201);
    const id = created.json().data.id;
    assert.equal(
      (await app.inject({ url: `/v1/investigations/${id}`, headers: { cookie: b.cookie } }))
        .statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: `/v1/investigations/${id}/analyze`,
          headers: { origin, cookie: b.cookie },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await app.inject({
          method: "DELETE",
          url: `/v1/investigations/${id}`,
          headers: { origin, cookie: b.cookie },
        })
      ).statusCode,
      404,
    );
    assert.equal(
      (await app.inject({ url: "/v1/me", headers: { cookie: a.cookie } })).json().wallets[0]
        .address,
      a.address,
    );
    await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { origin, cookie: a.cookie },
    });
    assert.equal(
      (await app.inject({ url: "/v1/me", headers: { cookie: a.cookie } })).statusCode,
      401,
    );
  } finally {
    await app.close();
  }
});

test("SSE filters private invalidations and supports durable resume", { skip: !url }, async () => {
  const db = createDatabase(url!);
  const config = loadConfig({ DATABASE_URL: url, APP_MODE: "fixture" });
  const app = await buildApi(config, db);
  const user = randomUUID(),
    key = `test-sse:${randomUUID()}`;
  try {
    await db.query("INSERT INTO users(id) VALUES($1)", [user]);
    const marker = (
      await db.query(
        "INSERT INTO outbox_events(topic,entity_id,payload,dedup_key) VALUES('test',$1,'{}',$1) RETURNING id::text",
        [key],
      )
    ).rows[0].id;
    await db.query(
      "INSERT INTO outbox_events(user_id,topic,entity_id,payload,dedup_key) VALUES($1,'secret',$2,$3,$2)",
      [user, key + ":private", { secret: "private-note" }],
    );
    await app.inject("/api/snapshot");
    assert.equal((await app.inject("/api/snapshot")).headers["x-sentinel-cache"], "HIT");
    const listening = await app.listen({ host: "127.0.0.1", port: 0 });
    const response = await fetch(listening + "/v1/stream", {
      headers: { "Last-Event-ID": marker },
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    const reader = response.body!.getReader();
    let text = "";
    while (!text.includes(": connected")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    await db.query(
      "INSERT INTO outbox_events(topic,entity_id,payload,dedup_key) VALUES('test',$1,'{}',$1)",
      [key + ":public"],
    );
    while (!text.includes("event: test")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      text += new TextDecoder().decode(chunk.value);
    }
    assert.ok(text.includes("event: test"));
    assert.ok(!text.includes("private-note"));
    assert.ok(!text.includes("event: secret"));
    assert.notEqual((await app.inject("/api/snapshot")).headers["x-sentinel-cache"], "HIT");
    await reader.cancel();
    assert.equal(
      (
        await fetch(listening + "/v1/stream", {
          headers: { "Last-Event-ID": "999999999999999999" },
        })
      ).status,
      409,
    );
  } finally {
    await db.query("DELETE FROM outbox_events WHERE dedup_key LIKE $1", [key + "%"]);
    await db.query("DELETE FROM users WHERE id=$1", [user]);
    await app.close();
  }
});

test("SQL rollback and expired lease recovery are durable", { skip: !url }, async () => {
  const db = createDatabase(url!);
  const id = randomUUID(),
    dedup = `test:${id}`;
  try {
    await assert.rejects(
      transaction(db, async (c) => {
        await c.query(
          "INSERT INTO processing_jobs(id,kind,dedup_key,payload) VALUES($1,'assessment',$2,'{}')",
          [id, dedup],
        );
        throw new Error("crash");
      }),
    );
    assert.equal((await db.query("SELECT 1 FROM processing_jobs WHERE id=$1", [id])).rowCount, 0);
    await db.query(
      "INSERT INTO processing_jobs(id,kind,dedup_key,payload) VALUES($1,'assessment',$2,'{}')",
      [id, dedup],
    );
    const token1 = randomUUID(),
      token2 = randomUUID();
    const first = await claimJob(db, token1);
    assert.equal(first.id, id);
    assert.equal(await claimJob(db, token2), undefined);
    await db.query("UPDATE processing_jobs SET lease_until=now()-interval '1 second' WHERE id=$1", [
      id,
    ]);
    assert.equal((await claimJob(db, token2)).attempts, 2);
    assert.equal(
      (
        await db.query(
          "UPDATE processing_jobs SET status='completed' WHERE id=$1 AND lease_token=$2 RETURNING id",
          [id, token1],
        )
      ).rowCount,
      0,
    );
  } finally {
    await db.query("DELETE FROM processing_jobs WHERE id=$1", [id]);
    await db.end();
  }
});

test(
  "service roles enforce ownership and in-app retry does not duplicate incidents",
  { skip: !url },
  async () => {
    const db = createDatabase(url!);
    const user = randomUUID(),
      watchlist = randomUUID();
    try {
      await assert.rejects(
        transaction(db, async (client) => {
          await client.query("SET LOCAL ROLE sentinel_api");
          await client.query(
            "INSERT INTO pools(cluster,address,lifecycle,slot) VALUES('test','forbidden','discovered',0)",
          );
        }),
        /permission denied/,
      );
      await assert.rejects(
        transaction(db, async (client) => {
          await client.query("SET LOCAL ROLE sentinel_engine");
          await client.query("INSERT INTO users(id) VALUES($1)", [randomUUID()]);
        }),
        /permission denied/,
      );
      await assert.rejects(
        transaction(db, async (client) => {
          await client.query("SET LOCAL ROLE sentinel_worker");
          await client.query("UPDATE pools SET lifecycle='unsupported' WHERE false");
        }),
        /permission denied/,
      );
      await dispatchInApp(db);
      await db.query("INSERT INTO users(id) VALUES($1)", [user]);
      await db.query(
        "INSERT INTO watchlists(id,user_id,name,items) VALUES($1,$2,'test','[\"demo-orbit-pool\"]')",
        [watchlist, user],
      );
      const before =
        (await db.query("SELECT cursor::text FROM worker_checkpoints WHERE name='in-app'")).rows[0]
          ?.cursor ?? "0";
      const signal = (await db.query("SELECT id FROM signals WHERE cluster='fixture' LIMIT 1"))
        .rows[0].id;
      const key = `test-delivery:${randomUUID()}`;
      await db.query(
        "INSERT INTO outbox_events(topic,entity_id,payload,dedup_key) VALUES('signal',$1,'{}',$2)",
        [signal, key],
      );
      await dispatchInApp(db);
      await dispatchInApp(db);
      assert.equal(
        (await db.query("SELECT count(*) FROM in_app_alerts WHERE user_id=$1", [user])).rows[0]
          .count,
        "1",
      );
      const alert = (await db.query("SELECT id FROM in_app_alerts WHERE user_id=$1", [user]))
        .rows[0].id;
      assert.equal(
        (
          await db.query("SELECT count(*) FROM outbox_events WHERE user_id=$1 AND topic='alert'", [
            user,
          ])
        ).rows[0].count,
        "1",
      );
      await db.query("DELETE FROM outbox_events WHERE user_id=$1 OR dedup_key=$2", [user, key]);
      await db.query("DELETE FROM in_app_alerts WHERE id=$1", [alert]);
      await db.query("UPDATE worker_checkpoints SET cursor=$1 WHERE name='in-app'", [before]);
    } finally {
      await db.query("DELETE FROM outbox_events WHERE user_id=$1", [user]);
      await db.query("DELETE FROM in_app_alerts WHERE user_id=$1", [user]);
      await db.query("DELETE FROM watchlists WHERE id=$1", [watchlist]);
      await db.query("DELETE FROM users WHERE id=$1", [user]);
      await db.end();
    }
  },
);
