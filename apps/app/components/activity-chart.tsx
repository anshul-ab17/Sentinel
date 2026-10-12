"use client";

import { useId, useState } from "react";
import type { Snapshot } from "@shared/snapshot";

export function ActivityChart({ snapshot, compact = false }: { snapshot: Snapshot; compact?: boolean }) {
  const [metric, setMetric] = useState<"volume" | "buys">("volume");
  const gradientId = useId();
  const bins = Array.from({ length: 9 }, (_, index) => ({ label: `${index * 10}–${(index + 1) * 10}s`, buys: 0, lamports: 0n }));
  for (const event of snapshot.events) {
    if (event.kind !== "buy") continue;
    const pool = snapshot.pools.find(pool => pool.address === event.pool);
    if (!pool) continue;
    const seconds = event.timestamp - pool.createdAt;
    if (seconds < 0 || seconds > 90) continue;
    const bin = bins[Math.min(8, Math.floor(seconds / 10))];
    bin.buys++;
    bin.lamports += BigInt(event.quoteLamports);
  }
  const values = bins.map(bin => metric === "buys" ? bin.buys : Number(bin.lamports) / 1e9);
  const maximum = Math.max(1, ...values);
  const ceiling = Math.ceil(maximum / (metric === "buys" ? 1 : 10)) * (metric === "buys" ? 1 : 10);
  const total = values.reduce((sum, value) => sum + value, 0);
  const points = values.map((value, index) => ({ x: 55 + index * 75, y: 132 - value / ceiling * 112 }));
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const signalBins = new Set(snapshot.alerts.flatMap(alert => {
    const pool = snapshot.pools.find(pool => pool.address === alert.pool);
    if (!pool) return [];
    const seconds = alert.timestamp - pool.createdAt;
    return seconds >= 0 && seconds <= 90 ? [Math.min(8, Math.floor(seconds / 10))] : [];
  }));

  return <section className={`panel activity-panel ${compact ? "activity-panel-compact" : ""}`} data-metric={metric} aria-label="Early launch activity analytics">
    <div className="panel-heading"><div><h2>Early launch activity</h2><p>First 90 seconds across all sample pools</p></div><div className="metric-switch" role="group" aria-label="Chart metric"><button type="button" aria-pressed={metric === "volume"} onClick={() => setMetric("volume")}>Volume</button><button type="button" aria-pressed={metric === "buys"} onClick={() => setMetric("buys")}>Buys</button></div></div>
    <div className="chart-summary" aria-live="polite"><strong>{total.toLocaleString("en-US")} <span>{metric === "volume" ? "SOL" : "buys"}</span></strong><span className="chart-legend"><i/>Observed {metric === "volume" ? "buy volume" : "purchases"}</span></div>
    <div className="activity-chart"><svg viewBox="0 0 680 168" preserveAspectRatio={compact ? "none" : "xMidYMid meet"} role="img" aria-label={`${metric === "volume" ? "Buy volume in SOL" : "Buy count"} by seconds after each pool's creation. Exact values are available below.`}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--chart-series)" stopOpacity=".9"/><stop offset="100%" stopColor="var(--chart-series)" stopOpacity=".4"/></linearGradient></defs>
      {bins.map((bin, index) => <line key={bin.label} x1={points[index].x} x2={points[index].x} y1="20" y2="132" className="chart-grid chart-grid-vertical"/>)}
      {[0, .5, 1].map(fraction => <g key={fraction}><line x1="40" x2="670" y1={132 - fraction * 112} y2={132 - fraction * 112} className="chart-grid"/><text x="30" y={136 - fraction * 112} textAnchor="end" className="chart-label">{Number((ceiling * fraction).toFixed(1))}</text></g>)}
      {!compact && <><path d={`${line} L655,132 L55,132 Z`} className="chart-area"/><path d={line} className="chart-line"/></>}
      {bins.map((bin, index) => <g key={bin.label}>{compact ? <rect x={points[index].x - 20} y={points[index].y} width="40" height={132 - points[index].y} rx="2" style={{ fill: `url(#${gradientId})` }} className="chart-bar"><title>{`${bin.label}: ${values[index]} ${metric === "volume" ? "SOL" : "buys"}`}</title></rect> : <circle cx={points[index].x} cy={points[index].y} r="3" className="chart-point"><title>{`${bin.label}: ${values[index]} ${metric === "volume" ? "SOL" : "buys"}`}</title></circle>}{signalBins.has(index) && <circle className="chart-signal-marker" cx={points[index].x} cy={Math.max(13, points[index].y - 7)} r="3.5"><title>Detection signal in this time window</title></circle>}<text x={points[index].x} y="156" textAnchor="middle" className="chart-label">{index * 10}s</text></g>)}
    </svg></div><div className="analytics-legend"><span><i className="series-key"/>{metric === "volume" ? "Volume (SOL)" : "Purchases"}</span><span><i className="signal-key"/>Detection signal</span></div><details className="chart-data"><summary>View chart data</summary><div className="table-scroll"><table><caption>Time since pool creation. Bins include their start and exclude their end, except the last includes 90s.</caption><thead><tr><th>Window</th><th>Buys</th><th>Volume (SOL)</th></tr></thead><tbody>{bins.map(bin => <tr key={bin.label}><td>{bin.label}</td><td>{bin.buys}</td><td>{Number(bin.lamports) / 1e9}</td></tr>)}</tbody></table></div></details>
  </section>;
}
