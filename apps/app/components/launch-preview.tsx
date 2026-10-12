"use client";

import { useState } from "react";
import { Icon } from "@app/components/icon";

const stages = [
  { label: "Launch", time: "00:00", title: "Start with the launch.", body: "A synthetic Orbit pool is created. Seven wallets buy during the first 90 seconds.", metric: "7", unit: "observed buyers", caption: "Every purchase adds a record to the investigation." },
  { label: "Funding", time: "00:07", title: "Follow the funding.", body: "Three buyers received SOL from one observed source before buying. The links are direct transfers, not an ownership claim.", metric: "3", unit: "linked buyers", caption: "One observed source. Three direct funding links." },
  { label: "Finding", time: "01:12", title: "Inspect the finding.", body: "Those three buyers account for 80% of observed early buy volume. The concentration rule flags the pattern for review.", metric: "80%", unit: "early buy volume", caption: "A signal to investigate. Not proof of manipulation." },
];
const wallets = [{ x: 100, y: 155 }, { x: 230, y: 155 }, { x: 360, y: 155 }, { x: 70, y: 255 }, { x: 175, y: 275 }, { x: 285, y: 275 }, { x: 390, y: 255 }];

export function LaunchPreview() {
  const [stage, setStage] = useState(1);
  const current = stages[stage];

  return <section className="launch-preview" aria-label="Interactive synthetic launch investigation">
    <div className="preview-top"><span className="preview-token">O</span><div><strong>Orbit investigation</strong><span>Meteora DBC sample</span></div><span className="preview-demo">Synthetic data</span></div>
    <div className="preview-steps" role="group" aria-label="Investigation stage">{stages.map((item, index) => <button key={item.label} type="button" aria-pressed={stage === index} onClick={() => setStage(index)}><span>{index + 1}</span>{item.label}</button>)}</div>
    <div className={`preview-graph stage-${stage}`}>
      <svg viewBox="0 0 460 330" role="img" aria-label={stage === 0 ? "Seven observed buyers around the Orbit pool." : "A common funding source connects to three of seven Orbit buyers. Shared funding does not establish ownership."}>
        <g className="graph-guides" fill="none"><ellipse cx="230" cy="188" rx="205" ry="109"/><ellipse cx="230" cy="188" rx="144" ry="73"/></g>
        <g className="graph-lines" fill="none">{wallets.map((wallet, index) => <path key={index} d={`M230 210 L${wallet.x} ${wallet.y}`} />)}</g>
        {stage > 0 && <g className="graph-funding" fill="none"><path pathLength="1" d="M230 58C230 102 100 92 100 155M230 58V155M230 58C230 102 360 92 360 155"/></g>}
        {wallets.map((wallet, index) => <g key={index} className={stage > 0 && index < 3 ? "graph-wallet linked" : "graph-wallet"}>
          <rect x={wallet.x - 20} y={wallet.y - 17} width="40" height="34" rx="10"/><path d={`M${wallet.x - 8} ${wallet.y - 5}h16v11h-16z M${wallet.x + 3} ${wallet.y}h5`} fill="none"/>
          <text x={wallet.x} y={wallet.y + 34} textAnchor="middle">Buyer {index + 1}</text>
        </g>)}
        <g className="graph-pool"><circle cx="230" cy="211" r="27"/><text x="230" y="217" textAnchor="middle">O</text></g>
        {stage > 0 && <g className="graph-source"><rect x="169" y="22" width="122" height="36" rx="9"/><text x="230" y="44" textAnchor="middle">Shared source</text></g>}
      </svg>
      <div className="graph-caption"><span className="status-dot"/>{current.caption}</div>
    </div>
    <div className="preview-finding" aria-live="polite" aria-atomic="true"><div className="preview-metric"><strong>{current.metric}</strong><span>{current.unit}</span></div><div className="preview-summary"><h3>{current.title}</h3><p>{current.body}</p></div></div>
    <div className="preview-bottom"><span><Icon name="check" size={14}/> Evidence attached</span><span>Rule v0.1.0</span></div>
  </section>;
}
