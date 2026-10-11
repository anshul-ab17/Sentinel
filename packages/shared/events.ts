export type Commitment = "processed" | "confirmed" | "finalized";
export type Event = {
  id: string;
  signature: string;
  eventIndex: number;
  slot: number;
  timestamp: number;
  pool: string;
  commitment: Commitment;
} & (
  | { kind: "pool_created"; baseMint: string; quoteMint: string }
  | { kind: "buy"; wallet: string; quoteLamports: string }
  | { kind: "funding"; wallet: string; source: string; lamports: string }
  | { kind: "transfer"; wallet: string; recipient: string; lamports: string }
);

export type RuleId = "early-buyer-concentration" | "shared-funding" | "large-transfer";
export type Alert = {
  id: string;
  pool: string;
  rule: { id: RuleId; version: "0.1.0" };
  severity: "medium" | "high";
  timestamp: number;
  title: string;
  observation: string;
  interpretation: string;
  evidence: string[];
  metrics: Record<string, string | number>;
};

export type Pool = {
  address: string;
  name: string;
  symbol: string;
  baseMint: string;
  quoteMint: string;
  createdAt: number;
};
