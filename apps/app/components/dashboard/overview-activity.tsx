"use client";

import { useMemo } from "react";
import type { CoverageWindow } from "./coverage-status";
import type { Snapshot } from "@shared/snapshot";

const windows = [
  { label: "24h", seconds: 24 * 60 * 60 },
  { label: "7d", seconds: 7 * 24 * 60 * 60 },
  { label: "30d", seconds: 30 * 24 * 60 * 60 },
  { label: "All", seconds: null },
] as const;

const chartNumber = (value: number) => Number(value.toFixed(1));
const BIN_COUNT = 24;

export function OverviewActivity({
  snapshot,
  windowLabel,
}: {
  snapshot: Snapshot;
  windowLabel: CoverageWindow;
}) {
  const window = windows.find((item) => item.label === windowLabel) ?? windows[0];
  const data = useMemo(() => {
    const timestamps = [
      ...snapshot.pools.map((pool) => pool.createdAt),
      ...snapshot.alerts.map((alert) => alert.timestamp),
    ];
    const end = timestamps.length ? Math.max(...timestamps) : 0;
    const earliest = timestamps.length ? Math.min(...timestamps) : end;
    const duration = window.seconds ?? Math.max(1, end - earliest);
    const start = window.seconds === null ? earliest : end - duration;
    const interval = duration / BIN_COUNT;
    const bins = Array.from({ length: BIN_COUNT }, (_, index) => ({
      label: index,
      launches: 0,
      signals: 0,
    }));

    for (const pool of snapshot.pools) {
      if (pool.createdAt < start || pool.createdAt > end) continue;
      const index = Math.min(BIN_COUNT - 1, Math.floor((pool.createdAt - start) / interval));
      bins[index].launches += 1;
    }
    for (const alert of snapshot.alerts) {
      if (alert.timestamp < start || alert.timestamp > end) continue;
      const index = Math.min(BIN_COUNT - 1, Math.floor((alert.timestamp - start) / interval));
      bins[index].signals += 1;
    }
    const maximum = Math.max(1, ...bins.map((bin) => Math.max(bin.launches, bin.signals)));
    const x = (index: number) => 42 + (index * 680) / (BIN_COUNT - 1);
    const y = (value: number) => 152 - (value / maximum) * 116;
    const launchPath = bins
      .map(
        (bin, index) =>
          `${index ? "L" : "M"}${chartNumber(x(index))},${chartNumber(y(bin.launches))}`,
      )
      .join(" ");
    const signalPath = bins
      .map(
        (bin, index) =>
          `${index ? "L" : "M"}${chartNumber(x(index))},${chartNumber(y(bin.signals))}`,
      )
      .join(" ");
    const launchAreaPath = `${launchPath} L722,152 L42,152 Z`;
    const totalLaunches = bins.reduce((sum, bin) => sum + bin.launches, 0);
    const totalSignals = bins.reduce((sum, bin) => sum + bin.signals, 0);

    return {
      bins,
      maximum,
      x,
      y,
      launchPath,
      launchAreaPath,
      signalPath,
      totalLaunches,
      totalSignals,
      start,
      interval,
    };
  }, [snapshot.alerts, snapshot.pools, window.seconds]);

  return (
    <section className="panel overview-activity-panel" aria-label="Launch activity">
      <div className="panel-heading">
        <div>
          <h2>Launch activity</h2>
          <p>Covered Meteora DBC launches and associated findings</p>
        </div>
      </div>
      {data.totalLaunches + data.totalSignals > 0 ? (
        <>
          <div className="overview-activity-chart">
            <svg
              viewBox="0 0 750 190"
              role="img"
              aria-label={`${data.totalLaunches} covered launches and ${data.totalSignals} detection signals in the selected ${windowLabel} window`}
            >
              {[0, 0.33, 0.66, 1].map((fraction) => {
                const y = chartNumber(152 - fraction * 116);
                return (
                  <g key={fraction}>
                    <line x1="42" x2="722" y1={y} y2={y} className="overview-chart-grid" />
                    <text x="30" y={y + 4} textAnchor="end" className="overview-chart-label">
                      {Math.round(data.maximum * fraction)}
                    </text>
                  </g>
                );
              })}
              {data.bins.map((bin, index) => (
                <rect
                  key={bin.label}
                  x={chartNumber(data.x(index) - 13)}
                  y={chartNumber(152 - (bin.launches / data.maximum) * 116)}
                  width="13"
                  height={chartNumber((bin.launches / data.maximum) * 116)}
                  rx="3"
                  className="overview-launch-bar"
                >
                  <title>{`${bin.launches} launches in interval ${index + 1}`}</title>
                </rect>
              ))}
              <path d={data.launchAreaPath} className="overview-launch-area" />
              <path d={data.launchPath} className="overview-launch-line" />
              <path d={data.signalPath} className="overview-signal-line" />
              {data.bins.map((bin, index) => (
                <g key={`point-${bin.label}`}>
                  <circle
                    cx={chartNumber(data.x(index))}
                    cy={chartNumber(data.y(bin.launches))}
                    r="3.2"
                    className="overview-launch-point"
                  >
                    <title>{`${bin.launches} launches in interval ${index + 1}`}</title>
                  </circle>
                  <circle
                    cx={chartNumber(data.x(index))}
                    cy={chartNumber(data.y(bin.signals))}
                    r="3.2"
                    className="overview-signal-point"
                  >
                    <title>{`${bin.signals} detection signals in interval ${index + 1}`}</title>
                  </circle>
                  {(index % 3 === 0 || index === BIN_COUNT - 1) && (
                    <text
                      x={chartNumber(data.x(index))}
                      y="177"
                      textAnchor="middle"
                      className="overview-chart-label"
                    >
                      {formatBucketTime(data.start + index * data.interval, windowLabel)}
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
          <div className="overview-chart-summary" aria-live="polite">
            <span>
              <i className="overview-launch-key" />
              Launches <strong>{data.totalLaunches}</strong>
            </span>
            <span>
              <i className="overview-signal-key" />
              Detection signals <strong>{data.totalSignals}</strong>
            </span>
          </div>
          <p className="overview-chart-footnote">
            Time buckets use the timestamps present in current indexed coverage.
          </p>
        </>
      ) : (
        <div className="analytics-empty overview-chart-empty" role="status">
          <strong>No launch activity in current coverage</strong>
          <p>Launches and findings will appear here as the indexer records them.</p>
        </div>
      )}
    </section>
  );
}

function formatBucketTime(timestamp: number, windowLabel: string) {
  const date = new Date(timestamp * 1000);
  if (windowLabel.endsWith("d")) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }
  return date
    .toLocaleTimeString("en-US", { hour: "numeric", hour12: true, timeZone: "UTC" })
    .replace(" ", "");
}

function arcSegment(startAngle: number, endAngle: number) {
  const centerX = 110;
  const centerY = 104;
  const radius = 82;
  const point = (angle: number) => {
    const radians = (angle * Math.PI) / 180;
    return {
      x: chartNumber(centerX + radius * Math.cos(radians)),
      y: chartNumber(centerY - radius * Math.sin(radians)),
    };
  };
  const start = point(startAngle);
  const end = point(endAngle);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`;
}

export function SignalProfile({ snapshot, range }: { snapshot: Snapshot; range: CoverageWindow }) {
  const latest = Math.max(
    0,
    ...snapshot.pools.map((pool) => pool.createdAt),
    ...snapshot.alerts.map((alert) => alert.timestamp),
  );
  const seconds =
    range === "24h" ? 86400 : range === "7d" ? 604800 : range === "30d" ? 2592000 : Infinity;
  const pools = snapshot.pools.filter(
    (pool) => range === "All" || pool.createdAt >= latest - seconds,
  );
  const poolAddresses = new Set(pools.map((pool) => pool.address));
  const scopedAlerts = snapshot.alerts.filter(
    (alert) =>
      poolAddresses.has(alert.pool) && (range === "All" || alert.timestamp >= latest - seconds),
  );
  const highPools = new Set(
    scopedAlerts.filter((alert) => alert.severity === "high").map((alert) => alert.pool),
  );
  const mediumPools = new Set(
    scopedAlerts
      .filter((alert) => alert.severity === "medium" && !highPools.has(alert.pool))
      .map((alert) => alert.pool),
  );
  const signaledPools = new Set(scopedAlerts.map((alert) => alert.pool));
  const groups = [
    { label: "High severity", count: highPools.size, color: "high" },
    { label: "Medium severity", count: mediumPools.size, color: "medium" },
    { label: "Low severity", count: 0, color: "low" },
    {
      label: "No signals",
      count: pools.filter((pool) => !signaledPools.has(pool.address)).length,
      color: "clear",
    },
  ];
  const total = pools.length;
  let angle = 180;
  const arcs = groups.map((group) => {
    const span = total ? (group.count / total) * 180 : 0;
    const segment = { ...group, path: span > 1 ? arcSegment(angle - 0.8, angle - span + 0.8) : "" };
    angle -= span;
    return segment;
  });
  return (
    <section className="panel signal-profile-panel">
      <div className="panel-heading">
        <div>
          <h2>Risk distribution</h2>
          <p>Observed findings across covered launches</p>
        </div>
      </div>
      <div className="signal-distribution">
        <svg
          viewBox="0 0 220 126"
          role="img"
          aria-label={`${total} covered launches. ${groups.map((group) => `${group.count} ${group.label}`).join(", ")}`}
        >
          <path d={arcSegment(180, 0)} className="signal-gauge-track" />
          {arcs.map((arc) => (
            <path key={arc.color} d={arc.path} className={`signal-gauge-segment ${arc.color}`} />
          ))}
          <text x="110" y="78" textAnchor="middle" className="signal-gauge-total">
            {total}
          </text>
          <text x="110" y="95" textAnchor="middle" className="signal-gauge-caption">
            covered launches
          </text>
        </svg>
      </div>
      <div className="risk-distribution-legend">
        {groups.map(({ label, count, color }) => (
          <div key={label}>
            <i className={color} />
            <span>{label}</span>
            <strong>{count}</strong>
            <small>{total ? ((count / total) * 100).toFixed(1) : "0.0"}%</small>
          </div>
        ))}
      </div>
      <p className="signal-profile-note">
        Categories reflect configured rule severity. No signals means no finding in indexed
        coverage, not a safety assessment.
      </p>
    </section>
  );
}
