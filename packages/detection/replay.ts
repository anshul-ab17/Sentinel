import { createHash } from "node:crypto";

import { detect, normalize, RULE_CONFIG } from "@detection/detect";

import type { Event } from "@shared/events";

/** A deterministic point-in-time snapshot, not a reconstruction of ingestion arrival order. */
export function replay(input: readonly Event[], pool: string, through?: number) {
  if (through !== undefined && (!Number.isSafeInteger(through) || through < 0))
    throw new Error("Invalid replay cutoff");
  const events = normalize(
    input.filter(
      (event) => event.pool === pool && (through === undefined || event.timestamp <= through),
    ),
  );
  const alerts = detect(events);
  const canonical = events.map((event) =>
    Object.fromEntries(Object.entries(event).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  );
  const digest = createHash("sha256")
    .update(JSON.stringify({ rule: RULE_CONFIG, events: canonical }))
    .digest("hex");
  return {
    pool,
    ruleVersion: RULE_CONFIG.version,
    through: through ?? null,
    eventCount: events.length,
    digest,
    events,
    alerts,
  };
}
