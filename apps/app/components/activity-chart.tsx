"use client";

import { useState } from "react";
import type { Snapshot } from "@shared/snapshot";

export function ActivityChart({ snapshot }: { snapshot: Snapshot }) {
  const [metric, setMetric] = useState<"volume" | "buys">("volume");
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

  return <section className="panel activity-panel" aria-label="Early launch activity analytics">
    <div className="panel-heading"><div><h2>Early launch activity</h2><p>First 90 seconds across all sample pools</p></div><div className="metric-switch" role="group" aria-label="Chart metric"><button type="button" aria-pressed={metric === "volume"} onClick={() => setMetric("volume")}>Volume</button><button type="button" aria-pressed={metric === "buys"} onClick={() => setMetric("buys")}>Buys</button></div></div>
    <div className="chart-summary" aria-live="polite"><strong>{total.toLocaleString("en-US")} <span>{metric === "volume" ? "SOL" : "buys"}</span></strong><span className="chart-legend"><i/>Observed {metric === "volume" ? "buy volume" : "purchases"}</span></div>
    <div className="activity-chart"><svg viewBox="0 0 680 168" role="img" aria-label={`${metric === "volume" ? "Buy volume in SOL" : "Buy count"} by seconds after each pool's creation. Exact values are available below.`}>
      {[0, .5, 1].map(fraction => <g key={fraction}><line x1="40" x2="670" y1={132 - fraction * 112} y2={132 - fraction * 112} className="chart-grid"/><text x="30" y={136 - fraction * 112} textAnchor="end" className="chart-label">{Number((ceiling * fraction).toFixed(1))}</text></g>)}
      {bins.map((bin, index) => <g key={bin.label}><rect x={55 + index * 68} y={132 - values[index] / ceiling * 112} width="34" height={values[index] / ceiling * 112} rx="3" className="chart-bar"><title>{bin.label}: {values[index]} {metric === "volume" ? "SOL" : "buys"}</title></rect><text x={72 + index * 68} y="156" textAnchor="middle" className="chart-label">{index * 10}s</text></g>)}
    </svg></div><details className="chart-data"><summary>View chart data</summary><div className="table-scroll"><table><caption>Time since pool creation. Bins include their start and exclude their end, except the last includes 90s.</caption><thead><tr><th>Window</th><th>Buys</th><th>Volume (SOL)</th></tr></thead><tbody>{bins.map(bin => <tr key={bin.label}><td>{bin.label}</td><td>{bin.buys}</td><td>{Number(bin.lamports) / 1e9}</td></tr>)}</tbody></table></div></details>
  </section>;
}
