import { events, pools } from "@fixtures/launch";
import { detect } from "@detection/detect";
import { summarize } from "@ai/summarize";

import type { Snapshot } from "@shared/snapshot";

export const coverage = {
  mode: "fixture" as const,
  source: "Synthetic fixtures — not live Solana data",
  commitment: "finalized",
  liveIngestion: false,
  persistence: "in-memory fixture",
};

export function getSnapshot(): Snapshot {
  const alerts = detect(events);
  return {
    coverage,
    pools,
    events,
    alerts: alerts.map((alert) => ({ ...alert, summary: summarize(alert) })),
  };
}
