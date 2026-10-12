import { randomUUID } from "node:crypto";

import { loadConfig } from "../../../packages/config/runtime.ts";
import { createDatabase, claimJob, transaction } from "../../../packages/database/store.ts";
import { evidenceCacheKey, JevAdapter, POLICY_VERSION } from "../../../packages/ai/jev.ts";
import { dispatchInApp } from "./delivery.ts";

const config = loadConfig(),
  db = createDatabase(config.databaseUrl, config.mode === "live" ? "sentinel_worker" : undefined);
const adapter =
  config.aiMode === "shadow"
    ? new JevAdapter({ key: config.jevKey!, model: config.jevModel!, baseUrl: config.jevBaseUrl })
    : null;
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    stopping = true;
  });
console.log(`Sentinel worker: AI ${config.aiMode}; PostgreSQL leased jobs`);
while (!stopping) {
  const token = randomUUID();
  let job: Awaited<ReturnType<typeof claimJob>>;
  try {
    await dispatchInApp(db);
    job = await claimJob(db, token);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    continue;
  }
  if (!job) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    continue;
  }
  try {
    if (job.kind !== "assessment") throw new Error("unsupported_job");
    const signals = (
      await db.query(
        "SELECT payload FROM signals WHERE cluster=$1 AND pool_address=$2 AND status='active' ORDER BY id LIMIT 100",
        [job.payload.cluster, job.payload.pool],
      )
    ).rows.map((row) => row.payload);
    const evidence = [...new Set(signals.flatMap((signal) => signal.evidence))];
    const state = {
      schema_version: "sentinel.evidence.v1",
      policy_version: POLICY_VERSION,
      signals,
      evidence_ids: evidence,
      coverage: "partial",
      metadata_policy: "untrusted",
    };
    const key = evidenceCacheKey(state, config.jevModel ?? "template-v1");
    let result = (await db.query("SELECT result FROM ai_assessments WHERE cache_key=$1", [key]))
      .rows[0]?.result;
    if (!result) {
      if (adapter) {
        try {
          result = await adapter.evaluate(state);
        } catch {
          result = { status: "ai_unavailable", evidence_ids: evidence };
        }
      } else
        result = {
          status: "ai_off",
          evidence_ids: evidence,
          observation: signals.map((s) => s.observation),
          limitations: "Only covered deterministic facts are included",
        };
    }
    await transaction(db, async (client) => {
      // Fencing: an expired lease must never acknowledge a newer worker's job.
      const lease = await client.query(
        "SELECT id FROM processing_jobs WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND status='running' FOR UPDATE",
        [job.id, token],
      );
      if (!lease.rowCount) return;
      await client.query(
        "INSERT INTO ai_assessments(cache_key,model,mode,result) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [key, config.jevModel ?? "template-v1", config.aiMode, result],
      );
      await client.query(
        "INSERT INTO outbox_events(user_id,topic,entity_id,payload,dedup_key) VALUES($1,'assessment',$2,$3,$4) ON CONFLICT DO NOTHING",
        [
          job.payload.user_id,
          job.payload.investigation_id,
          { investigation_id: job.payload.investigation_id, cache_key: key },
          `assessment:${job.id}`,
        ],
      );
      await client.query(
        "UPDATE processing_jobs SET status='completed',lease_until=NULL,lease_token=NULL WHERE id=$1 AND lease_token=$2",
        [job.id, token],
      );
    });
  } catch (error) {
    await db.query(
      "UPDATE processing_jobs SET status=CASE WHEN attempts>=5 THEN 'dead' ELSE 'pending' END,available_at=now()+make_interval(secs=>LEAST(300,POWER(2,attempts)::int)),lease_until=NULL,lease_token=NULL,last_error=$3 WHERE id=$1 AND lease_token=$2",
      [job.id, token, error instanceof Error ? error.message.slice(0, 200) : "job_failed"],
    );
  }
}
await db.end();
