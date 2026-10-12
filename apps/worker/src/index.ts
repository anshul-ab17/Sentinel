import { events, pools } from "@fixtures/launch";
import { replay } from "@detection/replay";

// One-shot fixture pipeline. Live indexing and persistent checkpoints are not wired yet.
for (const pool of pools) {
  const result = replay(events, pool.address);
  console.log(
    JSON.stringify({
      source: "synthetic-demo",
      pool: pool.address,
      eventCount: result.eventCount,
      ruleVersion: result.ruleVersion,
      digest: result.digest,
      alerts: result.alerts,
    }),
  );
}
