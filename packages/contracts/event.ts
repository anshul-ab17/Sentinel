// Generated from event.schema.json.
export type CanonicalEvent = {
  schema_version: "sentinel.event.v1";
  event_id: string;
  cluster: string;
  slot: string;
  signature: string;
  instruction_path: number[];
  kind: string;
  commitment: "processed" | "confirmed" | "finalized";
  protocol: string;
  decoder_version: string;
  amount_raw: string;
  decimals: number | null;
  source_observation_ids: string[];
  coverage: "partial" | "complete" | "synthetic";
  [key: string]: unknown;
};
