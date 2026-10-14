"use client";

import { useMemo, useState } from "react";
import type { Snapshot } from "@shared/snapshot";

const windows = [
  { label: "1h", seconds: 60 * 60 },
  { label: "6h", seconds: 6 * 60 * 60 },
  { label: "24h", seconds: 24 * 60 * 60 },
  { label: "7d", seconds: 7 * 24 * 60 * 60 },
  { label: "30d", seconds: 30 * 24 * 60 * 60 },
] as const;

const chartNumber = (value: number) => Number(value.toFixed(1));

export function OverviewActivity({ snapshot }: { snapshot: Snapshot }) {
  const [windowLabel, setWindowLabel] = useState<(typeof windows)[number]["label"]>("24h");
  const window = windows.find((item) => item.label === windowLabel) ?? windows[2];
  const data = useMemo(() => {
    const timestamps = [
      ...snapshot.pools.map((pool) => pool.createdAt),
      ...snapshot.alerts.map((alert) => alert.timestamp),
    ];
    const end = timestamps.length ? Math.max(...timestamps) : 0;
    const start = end - window.seconds;
    const interval = window.seconds / 12;
    const bins = Array.from({ length: 12 }, (_, index) => ({
      label: index,
      launches: 0,
      signals: 0,
      evidence: 0,
    }));

    for (const pool of snapshot.pools) {
      if (pool.createdAt < start || pool.createdAt > end) continue;
      const index = Math.min(11, Math.floor((pool.createdAt - start) / interval));
      bins[index].launches += 1;
    }
    for (const alert of snapshot.alerts) {
      if (alert.timestamp < start || alert.timestamp > end) continue;
      const index = Math.min(11, Math.floor((alert.timestamp - start) / interval));
      bins[index].signals += 1;
    }
    for (const event of snapshot.events) {
      if (event.timestamp < start || event.timestamp > end) continue;
      const index = Math.min(11, Math.floor((event.timestamp - start) / interval));
      bins[index].evidence += 1;
    }

    const maximum = Math.max(
      1,
      ...bins.map((bin) => Math.max(bin.launches, bin.signals, bin.evidence)),
    );
    const x = (index: number) => 42 + (index * 680) / 11;
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
    const evidencePath = bins
      .map(
        (bin, index) =>
          `${index ? "L" : "M"}${chartNumber(x(index))},${chartNumber(y(bin.evidence))}`,
      )
      .join(" ");
    const totalLaunches = bins.reduce((sum, bin) => sum + bin.launches, 0);
    const totalSignals = bins.reduce((sum, bin) => sum + bin.signals, 0);
    const totalEvidence = bins.reduce((sum, bin) => sum + bin.evidence, 0);

    return {
      bins,
      maximum,
      x,
      y,
      launchPath,
      signalPath,
      evidencePath,
      totalLaunches,
      totalSignals,
      totalEvidence,
    };
  }, [snapshot.alerts, snapshot.events, snapshot.pools, window.seconds]);

  return (
    <section className="panel overview-activity-panel" aria-label="Launch activity">
      <div className="panel-heading">
        <div>
          <h2>Launch activity</h2>
          <p>Covered Meteora DBC launches and associated findings</p>
        </div>
        <div className="overview-window-controls" role="group" aria-label="Activity time window">
          {windows.map((item) => (
            <button
              key={item.label}
              type="button"
              aria-pressed={windowLabel === item.label}
              onClick={() => setWindowLabel(item.label)}
            >
              {item.label}
            </button>
          ))}
        </div>
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
        <span>
          <i className="overview-evidence-key" />
          Evidence records <strong>{data.totalEvidence}</strong>
        </span>
      </div>
      <div className="overview-activity-chart">
        <svg
          viewBox="0 0 750 190"
          role="img"
          aria-label={`${data.totalLaunches} covered launches, ${data.totalSignals} detection signals, and ${data.totalEvidence} evidence records in the selected ${windowLabel} window`}
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
              width="26"
              height={chartNumber((bin.launches / data.maximum) * 116)}
              rx="3"
              className="overview-launch-bar"
            >
              <title>{`${bin.launches} launches in interval ${index + 1}`}</title>
            </rect>
          ))}
          <path d={data.launchPath} className="overview-launch-line" />
          <path d={data.signalPath} className="overview-signal-line" />
          <path d={data.evidencePath} className="overview-evidence-line" />
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
              <circle
                cx={chartNumber(data.x(index))}
                cy={chartNumber(data.y(bin.evidence))}
                r="3.2"
                className="overview-evidence-point"
              >
                <title>{`${bin.evidence} evidence records in interval ${index + 1}`}</title>
              </circle>
              {(index % 3 === 0 || index === 11) && (
                <text
                  x={chartNumber(data.x(index))}
                  y="177"
                  textAnchor="middle"
                  className="overview-chart-label"
                >
                  {windowLabel === "1h"
                    ? `${Math.round((index * window.seconds) / 12 / 60)}m`
                    : windowLabel.endsWith("h")
                      ? `${Math.round((index * window.seconds) / 12 / 3600)}h`
                      : `${Math.round((index * window.seconds) / 12 / 86400)}d`}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <p className="overview-chart-footnote">
        Time buckets use the timestamps present in current indexed coverage.
      </p>
    </section>
  );
}

const severityColors = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
} as const;

export function SignalProfile({ snapshot }: { snapshot: Snapshot }) {
  const severities = Object.keys(severityColors) as (keyof typeof severityColors)[];
  const counts = severities.map((severity) => ({
    severity,
    count: snapshot.alerts.filter((alert) => alert.severity === severity).length,
  }));
  const total = snapshot.alerts.length;

  return (
    <section className="panel signal-profile-panel">
      <div className="panel-heading">
        <div>
          <h2>Signal profile</h2>
          <p>Observed findings by severity</p>
        </div>
        <span
          className="signal-profile-info"
          title="Severity describes the configured rule level, not a token safety score."
        >
          i
        </span>
      </div>
      <div
        className="signal-profile-visual"
        aria-label={`${total} findings across ${severities.filter((severity) => counts.find((item) => item.severity === severity)?.count).length} severity levels`}
      >
        <div
          className="signal-profile-stack"
          role="img"
          aria-label={`${counts.map(({ severity, count }) => `${count} ${severity}`).join(", ")}`}
        >
          {counts.map(({ severity, count }) => (
            <span
              key={severity}
              className={`signal-profile-segment ${severityColors[severity]}`}
              style={{ width: `${total ? (count / total) * 100 : 0}%` }}
            />
          ))}
        </div>
        <strong>{total}</strong>
        <span>observed findings</span>
      </div>
      <div className="signal-profile-legend">
        {counts.map(({ severity, count }) => (
          <div key={severity}>
            <i className={severityColors[severity]} />
            <strong>{count}</strong>
            <span>{severity}</span>
          </div>
        ))}
      </div>
      <p className="signal-profile-note">
        Severity reflects the detection rule. It is not a security score or proof of wrongdoing.
      </p>
    </section>
  );
}
