import type { Snapshot } from "@shared/snapshot";

export type CoverageWindow = "24h" | "7d" | "30d" | "All";

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

export function CoverageStatus({
  coverage,
  windowRange,
  onWindowChange,
}: {
  coverage: Snapshot["coverage"];
  windowRange: CoverageWindow;
  onWindowChange: (value: CoverageWindow) => void;
}) {
  const feedState: FeedState =
    coverage.mode === "fixture" ? "synthetic" : (coverage.freshness ?? "stale");
  const label = coverage.mode === "fixture" ? "Fixture mode" : stateLabels[feedState];
  const detail =
    coverage.mode === "fixture"
      ? "Sample records are isolated from the live chain."
      : coverage.freshness === "fresh"
        ? "Finalized chain events are arriving within the expected slot window."
        : "Live records remain visible while the indexer reports its current coverage state.";

  const slot = formatSlot(coverage.asOfSlot);
  const observedAt = formatObservedAt(coverage.observedAt);
  const coverageTitle = `${label}. ${detail} ${coverage.source}; ${coverage.commitment} commitment; ${slot}; ${observedAt}.`;

  return (
    <section
      className="coverage-status"
      data-state={feedState}
      aria-label="Data coverage"
      role="status"
      aria-live="polite"
      title={coverageTitle}
    >
      <div className="coverage-network-label">
        <svg viewBox="0 0 32 24" aria-hidden="true">
          <defs>
            <linearGradient id="solana-mark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#80ec9a" />
              <stop offset="1" stopColor="#a45bff" />
            </linearGradient>
          </defs>
          <path
            d="M8 3h22l-6 5H2l6-5Zm0 7h22l-6 5H2l6-5Zm0 7h22l-6 5H2l6-5Z"
            fill="url(#solana-mark)"
          />
        </svg>
        <strong>Solana</strong>
      </div>
      <div className="coverage-window-control" role="group" aria-label="Activity time range">
        {(["24h", "7d", "30d", "All"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={windowRange === value}
            onClick={() => onWindowChange(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="coverage-live-state" title={coverageTitle}>
        <span className="coverage-status-indicator" aria-hidden="true" />
        <strong>{coverage.mode === "live" && feedState === "fresh" ? "Live" : label}</strong>
      </div>
      <span className="coverage-sr-details">{coverageTitle}</span>
    </section>
  );
}
