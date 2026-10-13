import { Icon } from "@app/components/icon";

import type { Snapshot } from "@shared/snapshot";

type FeedState = NonNullable<Snapshot["coverage"]["freshness"]>;

const stateLabels: Record<FeedState, string> = {
  fresh: "Indexer current",
  stale: "Indexer delayed",
  warming_up: "Indexer catching up",
  degraded: "Coverage gap detected",
  synthetic: "Synthetic data",
};

function formatSlot(slot: string | null | undefined) {
  if (!slot || !/^\d+$/.test(slot)) return "Waiting for checkpoint";
  return `Slot ${BigInt(slot).toLocaleString("en-US")}`;
}

function formatObservedAt(value: string | null | undefined) {
  if (!value) return "No checkpoint time";
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "No checkpoint time";
  return `${timestamp.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function CoverageStatus({ coverage }: { coverage: Snapshot["coverage"] }) {
  const feedState: FeedState =
    coverage.mode === "fixture" ? "synthetic" : (coverage.freshness ?? "stale");
  const label = coverage.mode === "fixture" ? "Fixture mode" : stateLabels[feedState];
  const detail =
    coverage.mode === "fixture"
      ? "Sample records are isolated from the live chain."
      : coverage.freshness === "fresh"
        ? "Finalized chain events are arriving within the expected slot window."
        : "Live records remain visible while the indexer reports its current coverage state.";

  return (
    <section
      className="coverage-status"
      data-state={feedState}
      aria-label="Data coverage"
      role="status"
      aria-live="polite"
    >
      <div className="coverage-status-heading">
        <span className="coverage-status-indicator" aria-hidden="true" />
        <div>
          <strong>{label}</strong>
          <p>{detail}</p>
        </div>
      </div>
      <div className="coverage-status-meta">
        <span>
          <Icon name="database" size={14} />
          {coverage.source}
        </span>
        <span>{coverage.commitment} commitment</span>
        <span>{formatSlot(coverage.asOfSlot)}</span>
        <span>{formatObservedAt(coverage.observedAt)}</span>
      </div>
    </section>
  );
}
