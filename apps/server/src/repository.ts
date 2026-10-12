import { getSnapshot } from "./data.ts";
import { summarize } from "../../../packages/ai/summarize.ts";
import { transaction, type Database } from "../../../packages/database/store.ts";
import { validateEvent } from "../../../packages/contracts/validate.ts";

import type { RuntimeConfig } from "../../../packages/config/runtime.ts";
import type { Snapshot } from "../../../packages/shared/snapshot.ts";
import type { Event, Pool, Alert } from "../../../packages/shared/events.ts";

export async function seedFixtures(db: Database, config: RuntimeConfig) {
  if (config.mode !== "fixture") return;
  await transaction(db, async (client) => {
    const snapshot = getSnapshot();
    snapshot.coverage.persistence = "PostgreSQL";
    await client.query(
      "INSERT INTO fixture_snapshots(cluster,payload) VALUES('fixture',$1) ON CONFLICT DO NOTHING",
      [snapshot],
    );
    for (const pool of snapshot.pools)
      await client.query(
        "INSERT INTO pools(cluster,address,base_mint,quote_mint,lifecycle,state,slot) VALUES('fixture',$1,$2,$3,'active_curve',$4,0) ON CONFLICT DO NOTHING",
        [pool.address, pool.baseMint, pool.quoteMint, pool],
      );
    for (const event of snapshot.events) {
      const id = "fixture:" + event.id;
      await client.query(
        "INSERT INTO chain_observations(id,cluster,signature,slot,block_hash,provider,commitment,raw) VALUES($1,'fixture',$2,$3,'synthetic','fixture','finalized',$4) ON CONFLICT DO NOTHING",
        [id, event.signature, event.slot.toString(), event],
      );
      const payload = {
        ...event,
        schema_version: "sentinel.event.v1",
        event_id: event.id,
        cluster: "fixture",
        slot: event.slot.toString(),
        instruction_path: [event.eventIndex],
        protocol: "synthetic",
        decoder_version: "fixture-0.1.0",
        amount_raw:
          "quoteLamports" in event
            ? event.quoteLamports
            : "lamports" in event
              ? event.lamports
              : "0",
        decimals: 9,
        source_observation_ids: [id],
        coverage: "synthetic",
      };
      validateEvent(payload);
      await client.query(
        "INSERT INTO canonical_events(event_id,cluster,pool_address,kind,slot,signature,instruction_path,ordinal,commitment,observation_id,payload) VALUES($1,'fixture',$2,$3,$4,$5,$6,0,'finalized',$7,$8) ON CONFLICT DO NOTHING",
        [
          id,
          event.pool,
          event.kind,
          event.slot.toString(),
          event.signature,
          JSON.stringify([event.eventIndex]),
          id,
          payload,
        ],
      );
    }
    for (const signal of snapshot.alerts) {
      await client.query(
        "INSERT INTO signals(id,cluster,pool_address,rule_id,rule_version,severity,payload) VALUES($1,'fixture',$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [signal.id, signal.pool, signal.rule.id, signal.rule.version, signal.severity, signal],
      );
      await client.query(
        "INSERT INTO outbox_events(topic,entity_id,payload,dedup_key) VALUES('signal',$1,$2,$3) ON CONFLICT DO NOTHING",
        [signal.id, { id: signal.id, pool: signal.pool }, `fixture:signal:${signal.id}`],
      );
    }
  });
}
export async function metadata(db: Database, config: RuntimeConfig) {
  if (config.mode === "fixture")
    return {
      as_of_slot: "0",
      commitment: "finalized",
      observed_at: new Date().toISOString(),
      freshness: "synthetic",
      coverage: {
        mode: "fixture",
        status: "synthetic",
        live_ingestion: false,
        limitations: ["Synthetic fixtures; not live Solana evidence"],
      },
    };
  const checkpoint = (
    await db.query(
      "SELECT slot::text,updated_at FROM provider_checkpoints WHERE cluster=$1 AND stage='finalized' ORDER BY slot DESC LIMIT 1",
      [config.cluster],
    )
  ).rows[0];
  const head = (
    await db.query(
      "SELECT slot::text FROM provider_checkpoints WHERE cluster=$1 AND stage='head' ORDER BY slot DESC LIMIT 1",
      [config.cluster],
    )
  ).rows[0];
  const gap = (
    await db.query(
      "SELECT 1 FROM coverage_intervals WHERE cluster=$1 AND status='gap' AND end_slot IS NULL LIMIT 1",
      [config.cluster],
    )
  ).rowCount;
  const intervals = (
    await db.query(
      "SELECT start_slot::text,end_slot::text,status,detail FROM coverage_intervals WHERE cluster=$1 ORDER BY id DESC LIMIT 20",
      [config.cluster],
    )
  ).rows;
  return {
    as_of_slot: checkpoint?.slot ?? null,
    commitment: "finalized",
    observed_at: checkpoint?.updated_at ?? null,
    freshness: gap
      ? "degraded"
      : checkpoint && head && Date.now() - new Date(checkpoint.updated_at).getTime() < 60000
        ? BigInt(head.slot) - BigInt(checkpoint.slot) <= 150n
          ? "fresh"
          : "warming_up"
        : "stale",
    coverage: {
      mode: "live",
      status: "partial",
      live_ingestion: !!checkpoint,
      intervals,
      limitations: [
        "Finalized HTTP block reconciliation",
        "Pool activity time begins at its first indexed event within the configured coverage window",
        "Owner history and DAMM positions not yet indexed",
        "Only pinned DBC event variants are decoded",
      ],
    },
  };
}
export async function persistedSnapshot(db: Database, config: RuntimeConfig): Promise<Snapshot> {
  if (config.mode === "fixture")
    return (await db.query("SELECT payload FROM fixture_snapshots WHERE cluster='fixture'")).rows[0]
      .payload;
  const liveStatus = await metadata(db, config);
  const poolRows = (
    await db.query(
      `SELECT pools.*,
              first_events.first_observed_at
       FROM pools
       LEFT JOIN (
         SELECT pool_address, MIN((payload->>'timestamp')::bigint) AS first_observed_at
         FROM canonical_events
         WHERE cluster=$1 AND active
         GROUP BY pool_address
       ) AS first_events ON first_events.pool_address=pools.address
       WHERE pools.cluster=$1
       ORDER BY pools.slot DESC
       LIMIT 100`,
      [config.cluster],
    )
  ).rows;
  const pools: Pool[] = poolRows
    .filter(
      (row) => row.base_mint && row.quote_mint === "So11111111111111111111111111111111111111112",
    )
    .map((row) => ({
      address: row.address,
      name: row.base_mint.slice(0, 6),
      symbol: row.base_mint.slice(0, 4),
      baseMint: row.base_mint,
      quoteMint: row.quote_mint,
      createdAt: Number(row.first_observed_at ?? row.state.timestamp ?? 0),
    }));
  const rows = (
    await db.query(
      "SELECT payload FROM canonical_events WHERE cluster=$1 AND active ORDER BY slot,instruction_path,ordinal LIMIT 5000",
      [config.cluster],
    )
  ).rows;
  const events: Event[] = rows.flatMap<Event>(({ payload: p }) => {
    if (!pools.some((pool) => pool.address === p.pool)) return [];
    const base = {
      id: p.event_id,
      signature: p.signature,
      eventIndex: p.instruction_path.at(-1) ?? 0,
      slot: Number(p.slot),
      timestamp: Number(p.timestamp ?? 0),
      pool: p.pool,
      commitment: "finalized" as const,
    };
    if (p.kind === "pool_created" && pools.some((x) => x.address === p.pool))
      return [
        { ...base, kind: "pool_created" as const, baseMint: p.base_mint, quoteMint: p.quote_mint },
      ];
    if (p.kind === "swap" && p.trade_direction === 1 && p.trader && BigInt(p.amount_raw) > 0n)
      return [{ ...base, kind: "buy" as const, wallet: p.trader, quoteLamports: p.amount_raw }];
    return [];
  });
  const alerts: Alert[] = (
    await db.query(
      "SELECT payload FROM signals WHERE cluster=$1 AND status='active' ORDER BY updated_at DESC LIMIT 100",
      [config.cluster],
    )
  ).rows
    .map((row) => row.payload)
    .filter((alert) => pools.some((p) => p.address === alert.pool));
  return {
    coverage: {
      mode: "live",
      source: "Finalized Solana DBC evidence; partial coverage",
      commitment: "finalized",
      liveIngestion: true,
      persistence: "PostgreSQL",
      freshness: liveStatus.freshness as Snapshot["coverage"]["freshness"],
      asOfSlot: liveStatus.as_of_slot,
      observedAt: liveStatus.observed_at,
    },
    pools,
    events,
    alerts: alerts.map((alert) => ({ ...alert, summary: summarize(alert) })),
  };
}
