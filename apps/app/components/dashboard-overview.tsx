"use client";

import { Icon } from "@app/components/icon";
import { OverviewActivity, SignalProfile } from "@app/components/dashboard/overview-activity";
import type { CoverageWindow } from "@app/components/dashboard/coverage-status";

import type { Snapshot } from "@shared/snapshot";
import type { Alert } from "@shared/events";

const amount = (value: bigint) =>
  (Number(value) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 3 });
const clock = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(11, 19);

function SparkBars({ values, warning = false }: { values: number[]; warning?: boolean }) {
  const maximum = Math.max(1, ...values);
  const points = values.map((value, index) => ({
    x: 2 + (index / Math.max(1, values.length - 1)) * 72,
    y: 37 - (value / maximum) * 32,
  }));
  const line = points
    .map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L74,42 L2,42 Z`;
  return (
    <svg
      className={`metric-spark ${warning ? "warning" : ""}`}
      viewBox="0 0 76 44"
      aria-hidden="true"
    >
      <path d={area} className="metric-spark-area" />
      <path d={line} className="metric-spark-line" />
    </svg>
  );
}

export function DashboardOverview({
  snapshot,
  onLaunch,
  onEvidence,
  onLaunches,
  onAlerts,
  windowRange,
}: {
  snapshot: Snapshot;
  onLaunch: (pool: string) => void;
  onEvidence: (alert: Alert) => void;
  onLaunches: () => void;
  onAlerts: () => void;
  windowRange: CoverageWindow;
}) {
  const buys = snapshot.events.filter((event) => event.kind === "buy");
  const volume = buys.reduce((sum, event) => sum + BigInt(event.quoteLamports), 0n);
  const observedTimes = [
    ...snapshot.pools.map((pool) => pool.createdAt),
    ...snapshot.events.map((event) => event.timestamp),
  ];
  const start = observedTimes.length ? Math.min(...observedTimes) : 0;
  const end = Math.max(start + 1, ...observedTimes);
  const checkpoints = Array.from(
    { length: 12 },
    (_, index) => start + ((end - start) * (index + 1)) / 12,
  );
  const histories = [
    checkpoints.map(
      (through) =>
        Number(
          buys
            .filter((event) => event.timestamp <= through)
            .reduce((sum, event) => sum + BigInt(event.quoteLamports), 0n),
        ) / 1e9,
    ),
    checkpoints.map((through) => snapshot.pools.filter((pool) => pool.createdAt <= through).length),
    checkpoints.map(
      (through) => snapshot.alerts.filter((alert) => alert.timestamp <= through).length,
    ),
    checkpoints.map(
      (through) => snapshot.events.filter((event) => event.timestamp <= through).length,
    ),
  ];
  const hasHistory = [
    buys.length,
    snapshot.pools.length,
    snapshot.alerts.length,
    snapshot.events.length,
  ];
  const rows = snapshot.pools.map((pool, index) => {
    const purchases = buys.filter((event) => event.pool === pool.address);
    const total = purchases.reduce((sum, event) => sum + BigInt(event.quoteLamports), 0n);
    return {
      ...pool,
      index,
      purchases: purchases.length,
      volume: total,
      signals: snapshot.alerts.filter((alert) => alert.pool === pool.address).length,
      share: volume ? Number((total * 1000n) / volume) / 10 : 0,
    };
  });
  const metrics = [
    {
      title: "Observed volume",
      icon: "graph" as const,
      value: amount(volume),
      unit: "SOL",
      note: `Across ${buys.length} observed purchases`,
    },
    {
      title: "Tracked launches",
      icon: "launch" as const,
      value: snapshot.pools.length,
      note: "Meteora DBC pools",
    },
    {
      title: "Detection signals",
      icon: "signal" as const,
      value: snapshot.alerts.length,
      note: "For review",
    },
    {
      title: "Evidence records",
      icon: "replay" as const,
      value: snapshot.events.length,
      note: "Finalized evidence records",
    },
  ];
  return (
    <div className="reference-overview">
      <div className="stats overview-metric-strip">
        {metrics.map((metric, index) => (
          <article key={metric.title}>
            <span className="stat-heading">
              <Icon name={metric.icon} size={18} />
              <span>{metric.title}</span>
            </span>
            <strong>
              {metric.value}
              {metric.unit && <em>{metric.unit}</em>}
              {index === 2 && (
                <span className="stat-tag">
                  {snapshot.alerts.filter((alert) => alert.severity === "high").length} high
                  priority
                </span>
              )}
            </strong>
            <small>{metric.note}</small>
            {hasHistory[index] > 1 && new Set(histories[index]).size > 1 && (
              <SparkBars values={histories[index]} warning={index === 2} />
            )}
          </article>
        ))}
      </div>
      <div className="overview-insight-grid">
        <OverviewActivity snapshot={snapshot} windowLabel={windowRange} />
        <SignalProfile snapshot={snapshot} range={windowRange} />
      </div>
      <div className="overview-dashboard-grid">
        <section className="panel radar-panel">
          <div className="panel-heading">
            <div>
              <h2>Launch Radar</h2>
              <p>Recent launches across Meteora DBC pools</p>
            </div>
            <button className="text-button" onClick={onLaunches}>
              View all launches
              <Icon name="arrow" size={14} />
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>First observed (UTC)</th>
                  <th>Volume share</th>
                  <th className="numeric">Volume (SOL)</th>
                  <th className="numeric">Signals</th>
                  <th>
                    <span className="sr-only">Investigate</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((pool) => (
                  <tr key={pool.address} data-flagged={pool.signals > 0}>
                    <td>
                      <div className="token-cell">
                        <span className={`token token-${pool.index}`}>
                          {pool.symbol.slice(0, 1)}
                        </span>
                        <div>
                          <strong>{pool.name}</strong>
                          <small>{pool.symbol}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <time>{clock(pool.createdAt)}</time>
                      <small className="radar-date">
                        {new Date(pool.createdAt * 1000).toISOString().slice(0, 10)}
                      </small>
                    </td>
                    <td>
                      <div className="radar-share">
                        <span>
                          <i style={{ width: `${pool.share}%` }} />
                        </span>
                        <small>{pool.share}%</small>
                      </div>
                    </td>
                    <td className="numeric">{amount(pool.volume)}</td>
                    <td className="numeric">
                      <span className={`badge ${pool.signals ? "amber" : "neutral"}`}>
                        {pool.signals}
                      </span>
                    </td>
                    <td>
                      <button
                        className="radar-open"
                        aria-label={`Investigate ${pool.name}`}
                        onClick={() => onLaunch(pool.address)}
                      >
                        <Icon name="arrow" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel evidence-feed">
          <div className="panel-heading">
            <div>
              <h2>Evidence feed</h2>
              <p>Recent detection signals and supporting evidence</p>
            </div>
            <button className="text-button" onClick={onAlerts}>
              View all
              <Icon name="arrow" size={14} />
            </button>
          </div>
          {snapshot.alerts.slice(0, 5).map((alert) => (
            <article className="evidence-feed-row" key={alert.id}>
              <span className={`feed-alert-icon ${alert.severity}`}>
                <i aria-hidden="true" />
              </span>
              <div>
                <h3>{alert.title}</h3>
                <p>{alert.observation}</p>
              </div>
              <div className="feed-action">
                <time>{clock(alert.timestamp)} UTC</time>
                <button className="text-button" onClick={() => onEvidence(alert)}>
                  View evidence
                  <Icon name="arrow" size={13} />
                </button>
              </div>
            </article>
          ))}
          {!snapshot.alerts.length && (
            <p className="empty feed-empty-state">
              <i aria-hidden="true" />
              No detection signals in the covered events.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
