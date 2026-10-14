import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";

import bs58 from "bs58";

import { buildApi } from "../../apps/server/src/api.ts";
import { loadConfig } from "../../packages/config/runtime.ts";
import { claimJob, createDatabase, transaction } from "../../packages/database/store.ts";
import { dispatchInApp } from "../../apps/worker/src/delivery.ts";

const url = process.env.DATABASE_URL;

function isolateRateLimitAddress(app: Awaited<ReturnType<typeof buildApi>>) {
  const originalInject = app.inject.bind(app);
  const token = randomUUID().replaceAll("-", "");
  const address = `198.18.${Number.parseInt(token.slice(0, 2), 16)}.${Number.parseInt(token.slice(2, 4), 16)}`;
  app.inject = (async (
    input: string | { url: string; headers?: Record<string, string | string[]> },
  ) => {
    const request = typeof input === "string" ? { url: input } : input;
    return originalInject({
      ...request,
      headers: { ...request.headers, "x-forwarded-for": address },
    } as never);
  }) as typeof app.inject;
}

test(
  "indexed shark and curve-history routes return only source-backed rows",
  { skip: !url },
  async () => {
    const config = loadConfig({ DATABASE_URL: url, APP_MODE: "fixture" });
    const db = createDatabase(url!);
    const app = await buildApi(config, db);
    const pool = "11111111111111111111111111111111";
    const mint = "So11111111111111111111111111111111111111112";
    const wallet = "Vote111111111111111111111111111111111111111";
    const recipient = "Stake11111111111111111111111111111111111111";
    const suffix = randomUUID();
    const swapId = `route-test:${suffix}:swap`;
    const transferId = `route-test:${suffix}:transfer`;
    const walletTransferId = `route-test:${suffix}:native-transfer`;
    const hopTransferId = `route-test:${suffix}:hop-transfer`;
    const signalId = `route-test-signal:${suffix}`;
    try {
      const pantaStatus = await app.inject("/v1/providers/panta/status");
      assert.equal(pantaStatus.statusCode, 200);
      assert.equal(pantaStatus.json().configured, false);
      const pantaMarkets = await app.inject("/v1/providers/panta/markets");
      assert.equal(pantaMarkets.statusCode, 503);
      assert.equal(pantaMarkets.json().error, "provider_not_configured");
      await db.query(
        "INSERT INTO pools(cluster,address,base_mint,quote_mint,lifecycle,slot) VALUES('fixture',$1,$2,$2,'active_curve',10)",
        [pool, mint],
      );
      for (const [id, signature, slot, kind, payload, path] of [
        [
          swapId,
          `swap-${suffix}`,
          "11",
          "swap",
          {
            kind: "swap",
            pool,
            trader: wallet,
            base_mint: mint,
            quote_mint: mint,
            trade_direction: 1,
            amount_raw: "500000000",
            output_amount: "42",
            quote_reserve_amount: "2",
            migration_threshold: "3",
          },
          [0],
        ],
        [
          transferId,
          `transfer-${suffix}`,
          "12",
          "transfer",
          {
            kind: "transfer",
            pool,
            wallet,
            recipient,
            lamports: "1000",
          },
          [1],
        ],
      ] as const) {
        await db.query(
          "INSERT INTO chain_observations(id,cluster,signature,slot,block_hash,provider,commitment,raw) VALUES($1,'fixture',$2,$3,'route-test','test','finalized',$4)",
          [id, signature, slot, payload],
        );
        await db.query(
          "INSERT INTO canonical_events(event_id,cluster,pool_address,kind,slot,signature,instruction_path,ordinal,commitment,observation_id,payload) VALUES($1,'fixture',$2,$3,$4,$5,$6,0,'finalized',$1,$7)",
          [id, pool, kind, slot, signature, JSON.stringify(path), payload],
        );
      }
      await db.query(
        `INSERT INTO wallet_transfers(event_id,cluster,signature,slot,transaction_index,
        instruction_path,source_wallet,recipient_wallet,lamports,block_time,observation_id)
       VALUES($1,'fixture',$2,12,0,'[0]'::jsonb,$3,$4,1000,1700000000,$5)`,
        [walletTransferId, `transfer-${suffix}`, wallet, recipient, transferId],
      );
      await db.query(
        `INSERT INTO wallet_transfers(event_id,cluster,signature,slot,transaction_index,
        instruction_path,source_wallet,recipient_wallet,lamports,block_time,observation_id)
       VALUES($1,'fixture',$2,13,0,'[1]'::jsonb,$3,$4,500,1700000001,$5)`,
        [hopTransferId, `transfer-hop-${suffix}`, recipient, pool, transferId],
      );
      await db.query(
        `INSERT INTO signals(id,cluster,pool_address,rule_id,rule_version,severity,payload)
       VALUES($1,'fixture',$2,'large-transfer','0.1.0','medium',$3)`,
        [signalId, pool, { id: signalId, evidence: [walletTransferId] }],
      );

      const activity = await app.inject(`/v1/sharks/activity?poolId=${pool}&mint=${mint}`);
      assert.equal(activity.statusCode, 200);
      assert.equal(activity.json().data.items[0].wallet, wallet);
      assert.equal(activity.json().data.items[0].quote_amount_raw, "500000000");

      const leaderboard = await app.inject(
        `/v1/sharks/wallets?poolId=${pool}&quoteMint=${mint}&segment=above_threshold&thresholdRaw=400000000`,
      );
      assert.equal(leaderboard.statusCode, 200);
      assert.equal(leaderboard.json().data.items[0].wallet, wallet);
      assert.equal(leaderboard.json().data.items[0].buy_quote_raw, "500000000");

      const trades = await app.inject(`/v1/wallets/${wallet}/trades?poolId=${pool}`);
      assert.equal(trades.statusCode, 200);
      assert.equal(trades.json().data.items.length, 1);

      const funding = await app.inject(`/v1/wallets/${recipient}/funding`);
      assert.equal(funding.statusCode, 200);
      const directFunding = funding
        .json()
        .data.edges.find((edge: { evidence_id: string }) => edge.evidence_id === walletTransferId);
      assert.ok(directFunding);
      assert.equal(directFunding.ownership_claim, false);
      const transferEvidence = await app.inject(`/v1/evidence/${walletTransferId}`);
      assert.equal(transferEvidence.statusCode, 200);
      assert.equal(transferEvidence.json().data.payload.kind, "native_sol_transfer");
      const graph = await app.inject(`/v1/wallets/${wallet}/graph?hops=2`);
      assert.equal(graph.statusCode, 200);
      assert.ok(graph.json().data.edges.some((edge: { hop: number }) => edge.hop === 2));
      const signalEvidence = await app.inject(`/v1/anomalies/${signalId}/evidence`);
      assert.equal(signalEvidence.statusCode, 200);
      assert.equal(signalEvidence.json().data.items[0].kind, "native_sol_transfer");

      const history = await app.inject(`/v1/pools/${pool}/history`);
      assert.equal(history.statusCode, 200);
      assert.equal(history.json().data.items[0].curve.threshold_progress_bps, "6666");
    } finally {
      await db.query("DELETE FROM canonical_events WHERE event_id=ANY($1::text[])", [
        [swapId, transferId],
      ]);
      await db.query("DELETE FROM wallet_transfers WHERE event_id=$1", [walletTransferId]);
      await db.query("DELETE FROM wallet_transfers WHERE event_id=$1", [hopTransferId]);
      await db.query("DELETE FROM signals WHERE id=$1", [signalId]);
      await db.query("DELETE FROM chain_observations WHERE id=ANY($1::text[])", [
        [swapId, transferId],
      ]);
      await db.query("DELETE FROM pools WHERE cluster='fixture' AND address=$1", [pool]);
      await app.close();
    }
  },
);

test("persistent API, SIWS nonce fencing and tenant authorization", { skip: !url }, async () => {
  const config = loadConfig({ DATABASE_URL: url, APP_MODE: "fixture" });
  const db = createDatabase(url!);
  const app = await buildApi(config, db);
  isolateRateLimitAddress(app);
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
    const rules = await app.inject("/v1/anomalies/rules");
    assert.equal(rules.statusCode, 200);
    assert.ok(rules.json().data.some((rule: { id: string }) => rule.id === "shared-funding"));
    const signalId = (
      await db.query("SELECT id FROM signals WHERE cluster='fixture' ORDER BY id LIMIT 1")
    ).rows[0].id as string;
    const preferences = await app.inject({
      url: "/v1/me/alert-rules",
      headers: { cookie: a.cookie },
    });
    assert.equal(preferences.statusCode, 200);
    assert.equal(
      preferences.json().data.find((rule: { id: string }) => rule.id === "shared-funding").enabled,
      true,
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: "/v1/me/alert-rules/shared-funding",
          headers: { origin, cookie: a.cookie },
          payload: { enabled: false, minimum_severity: "high", cooldown_seconds: 900 },
        })
      ).statusCode,
      200,
    );
    const otherPreferences = await app.inject({
      url: "/v1/me/alert-rules",
      headers: { cookie: b.cookie },
    });
    assert.equal(
      otherPreferences.json().data.find((rule: { id: string }) => rule.id === "shared-funding")
        .enabled,
      true,
    );
    assert.equal(
      (
        await app.inject({
          method: "PATCH",
          url: `/v1/me/anomalies/${signalId}/acknowledgement`,
          headers: { origin, cookie: a.cookie },
          payload: { status: "acknowledged", note: "Reviewed against source events" },
        })
      ).statusCode,
      200,
    );
    const acknowledged = await app.inject({
      url: "/v1/anomalies?status=acknowledged",
      headers: { cookie: a.cookie },
    });
    assert.ok(acknowledged.json().data.items.some((item: { id: string }) => item.id === signalId));
    const hiddenAcknowledgement = await app.inject({
      url: "/v1/anomalies?status=acknowledged",
      headers: { cookie: b.cookie },
    });
    assert.ok(
      !hiddenAcknowledgement.json().data.items.some((item: { id: string }) => item.id === signalId),
    );
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
