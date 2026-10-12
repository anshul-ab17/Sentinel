import type { Alert, Event, Pool } from "@shared/events";

export type Snapshot = {
  coverage: {
    mode: "fixture" | "live";
    source: string;
    commitment: string;
    liveIngestion: boolean;
    persistence: string;
    freshness?: "fresh" | "stale" | "warming_up" | "degraded" | "synthetic";
    asOfSlot?: string | null;
    observedAt?: string | null;
  };
  pools: Pool[];
  events: Event[];
  alerts: (Alert & {
    summary: {
      method: "deterministic-template";
      observation: string;
      interpretation: string;
      limitations: string;
      rule: Alert["rule"];
      evidence: string[];
    };
  })[];
};
