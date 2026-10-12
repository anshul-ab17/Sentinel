"use client";
import { sol } from "./format.ts";

import type { Snapshot } from "@shared/snapshot";
import type { Alert, Event } from "@shared/events";

export type ReplayResult = {
  digest: string;
  eventCount: number;
  alerts: Alert[];
  ruleVersion: string;
};
type Props = {
  snapshot: Snapshot;
  pool: Snapshot["pools"][number];
  poolId: string;
  selectedEvents: Event[];
  cutoff: number;
  pending: boolean;
  error: string;
  result: ReplayResult | null;
  setPoolId: (id: string) => void;
  setResult: (result: null) => void;
  setCutoff: (seconds: number) => void;
  runReplay: () => Promise<void>;
};

function eventLabel(event: Event) {
  if (event.kind === "pool_created") return "DBC pool created";
  if (event.kind === "buy") return `${sol(event.quoteLamports)} SOL buy · ${event.wallet}`;
  if (event.kind === "funding") return `Funding link · ${event.source} → ${event.wallet}`;
  return `${sol(event.lamports)} SOL transfer · ${event.wallet} → ${event.recipient}`;
}

export function LaunchReplay({
  snapshot,
  pool,
  poolId,
  selectedEvents,
  cutoff,
  pending,
  error,
  result,
  setPoolId,
  setResult,
  setCutoff,
  runReplay,
}: Props) {
  return (
    <div className="replay-grid">
      <section className="panel replay-controls">
        <span className="eyebrow">HISTORICAL REPLAY</span>
        <h2>Follow the first 90 covered seconds.</h2>
        <p className="subtle">
          Select a pool and an observation window. The same events and rule version produce the same
          digest.
        </p>
        <label>
          Pool
          <select
            disabled={pending}
            value={poolId}
            onChange={(event) => {
              setPoolId(event.target.value);
              setResult(null);
            }}
          >
            {snapshot.pools.map((pool) => (
              <option key={pool.address} value={pool.address}>
                {pool.name} / {pool.symbol}
              </option>
            ))}
          </select>
        </label>
        <label>
          Seconds after first observation <strong>{cutoff}s</strong>
          <input
            disabled={pending}
            type="range"
            min="0"
            max="90"
            value={cutoff}
            onChange={(event) => {
              setCutoff(Number(event.target.value));
              setResult(null);
            }}
          />
        </label>
        <button className="primary full" disabled={pending} onClick={runReplay}>
          {pending ? "Replaying events…" : "Run deterministic replay ↗"}
        </button>
        <div aria-live="polite">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {result && (
            <div className="replay-result">
              <span className="badge green">Replay complete</span>
              <h3>
                {result.alerts.length} signals · {result.eventCount} events
              </h3>
              <p>Rule version {result.ruleVersion}</p>
              <span className="eyebrow">SHA-256 DATASET + RULE DIGEST</span>
              <code>{result.digest}</code>
              {result.alerts.map((alert) => (
                <p key={alert.id}>{alert.title}</p>
              ))}
            </div>
          )}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">{pool.symbol} / EVENT TIMELINE</span>
            <h2>Launch reconstruction</h2>
          </div>
          <span className="badge neutral">0–{cutoff}s</span>
        </div>
        <ol className="timeline">
          {selectedEvents
            .filter((event) => event.timestamp <= pool.createdAt + cutoff)
            .map((event) => (
              <li key={event.id}>
                <time>00:{String(event.timestamp - pool.createdAt).padStart(2, "0")}</time>
                <span className={`timeline-dot ${event.kind}`} />
                <div>
                  <strong>{eventLabel(event)}</strong>
                  <code>{event.signature}</code>
                  <small>Finalized on-chain event · slot {event.slot}</small>
                </div>
              </li>
            ))}
        </ol>
      </section>
    </div>
  );
}
