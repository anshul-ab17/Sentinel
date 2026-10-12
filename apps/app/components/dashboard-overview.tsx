"use client";

import { Icon } from "@app/components/icon";
import { ActivityChart } from "@app/components/activity-chart";
import { WalletGraph } from "@app/components/wallet-graph";

import type { Snapshot } from "@shared/snapshot";
import type { Alert } from "@shared/events";

const amount = (value: bigint) =>
  (Number(value) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 3 });
const clock = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(11, 19);

function SparkBars({ values, warning = false }: { values: number[]; warning?: boolean }) {
  const maximum = Math.max(1, ...values);
  return (
    <svg
      className={`metric-spark ${warning ? "warning" : ""}`}
      viewBox="0 0 76 44"
      aria-hidden="true"
    >
      {values.map((value, index) => (
        <rect
          key={index}
          x={index * 6 + 1}
          y={42 - Math.max(2, (value / maximum) * 38)}
          width="2.5"
          height={Math.max(2, (value / maximum) * 38)}
        />
      ))}
    </svg>
  );
}

export function DashboardOverview({
  snapshot,
  onLaunch,
  onEvidence,
  onLaunches,
  onAlerts,
  onGraph,
}: {
  snapshot: Snapshot;
  onLaunch: (pool: string) => void;
  onEvidence: (alert: Alert) => void;
  onLaunches: () => void;
  onAlerts: () => void;
  onGraph: () => void;
}) {
  const buys = snapshot.events.filter((event) => event.kind === "buy");
  const volume = buys.reduce((sum, event) => sum + BigInt(event.quoteLamports), 0n);
  const start = Math.min(...snapshot.pools.map((pool) => pool.createdAt));
  const end = Math.max(start + 1, ...snapshot.events.map((event) => event.timestamp));
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
            <SparkBars values={histories[index]} warning={index === 2} />
          </article>
        ))}
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
                {rows.map((pool) => (
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
          {snapshot.alerts.slice(0, 3).map((alert) => (
            <article className="evidence-feed-row" key={alert.id}>
              <span className="feed-alert-icon">
                <Icon name="signal" size={19} />
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
            <p className="empty">No detection signals in the covered events.</p>
          )}
        </section>
        <ActivityChart snapshot={snapshot} compact />
        <WalletGraph snapshot={snapshot} compact onOpen={onGraph} />
      </div>
      <section className="panel overview-investigation-activity">
        <div className="panel-heading">
          <div>
            <h2>Investigation activity</h2>
            <p>Latest analysis and evidence collection</p>
          </div>
          <button className="text-button" onClick={onAlerts}>
            View all activity
            <Icon name="arrow" size={14} />
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Token</th>
                <th>Event</th>
                <th>Priority</th>
                <th>Details</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.alerts.map((alert) => {
                const pool = rows.find((pool) => pool.address === alert.pool);
                return (
                  <tr key={alert.id}>
                    <td>{clock(alert.timestamp)}</td>
                    <td>
                      <div className="activity-token">
                        <span className={`token token-${pool?.index ?? 0}`}>
                          {pool?.symbol.slice(0, 1)}
                        </span>
                        {pool?.symbol ?? alert.pool}
                      </div>
                    </td>
                    <td>{alert.title}</td>
                    <td>
                      <span className={`badge ${alert.severity === "high" ? "amber" : "neutral"}`}>
                        {alert.severity}
                      </span>
                    </td>
                    <td className="activity-observation">{alert.observation}</td>
                    <td>
                      <button className="text-button" onClick={() => onEvidence(alert)}>
                        View evidence
                        <Icon name="arrow" size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
