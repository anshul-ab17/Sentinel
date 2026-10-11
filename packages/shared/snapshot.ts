import type { Alert, Event, Pool } from "@shared/events";

export type Snapshot = {
  coverage: {
    mode: "demo";
    source: string;
    commitment: string;
    liveIngestion: boolean;
    persistence: string;
  };
  pools: Pool[];
  events: Event[];
  alerts: (Alert & { summary: {
    method: "deterministic-template";
    observation: string;
    interpretation: string;
    limitations: string;
    rule: Alert["rule"];
    evidence: string[];
  } })[];
};
