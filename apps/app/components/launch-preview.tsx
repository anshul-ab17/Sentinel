"use client";

import { useMemo, useState } from "react";

import { Icon } from "@app/components/icon";

import type { Snapshot } from "@shared/snapshot";

const stages = ["Launch", "Buyers", "Findings"] as const;

export function LaunchPreview({ snapshot }: { snapshot: Snapshot | null }) {
  const [stage, setStage] = useState(0);
  const pool = snapshot?.pools[0];
  const poolEvents = useMemo(
    () => snapshot?.events.filter((event) => event.pool === pool?.address) ?? [],
    [pool?.address, snapshot?.events],
  );
  const buyers = useMemo(
    () =>
      [
        ...new Set(poolEvents.flatMap((event) => (event.kind === "buy" ? [event.wallet] : []))),
      ].slice(0, 7),
    [poolEvents],
  );
  const fundingLinks = poolEvents.filter((event) => event.kind === "funding");
  const findings = snapshot?.alerts.filter((alert) => alert.pool === pool?.address) ?? [];
  const nodes = buyers.map((wallet, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(buyers.length, 1);
    return {
      wallet,
      x: 230 + Math.cos(angle) * 170,
      y: 188 + Math.sin(angle) * 86,
    };
  });
  const metric = [pool ? "1" : "0", String(buyers.length), String(findings.length)][stage];
  const title = [
    "Start with the launch.",
    "Inspect observed buyers.",
    "Review evidence-backed findings.",
  ][stage];
  const body = [
    pool
      ? `${pool.name} (${pool.symbol}) is the latest covered Meteora DBC pool.`
      : "The live index is waiting for its first covered Meteora DBC launch.",
    fundingLinks.length
      ? `${fundingLinks.length} direct funding links are present in the indexed event window.`
      : "Funding history is not yet included in the indexed DBC event coverage.",
    findings.length
      ? findings.map((finding) => finding.title).join(" · ")
      : "No detection findings are available for this launch yet.",
  ][stage];
  const caption = [
    pool ? `Pool ${pool.address}` : "No indexed pool in the current coverage window",
    `${buyers.length} distinct buyer wallets in indexed events`,
    `${findings.length} findings linked to this pool`,
  ][stage];
  const feedState =
    snapshot?.coverage.freshness === "fresh" ? "Live" : snapshot ? "Catching up" : "Connecting";

  return (
    <section className="launch-preview" aria-label="Live Solana launch investigation">
      <div className="preview-top">
        <span className="preview-token">{pool?.symbol.slice(0, 1) ?? "S"}</span>
        <div>
          <strong>{pool ? `${pool.name} investigation` : "Live investigation"}</strong>
          <span>{snapshot?.coverage.commitment ?? "Solana mainnet"} · Meteora DBC</span>
        </div>
        <span className="preview-demo">{feedState}</span>
      </div>
      <div className="preview-steps" role="group" aria-label="Investigation stage">
        {stages.map((item, index) => (
          <button
            key={item}
            type="button"
            aria-pressed={stage === index}
            onClick={() => setStage(index)}
          >
            <span>{index + 1}</span>
            {item}
          </button>
        ))}
      </div>
      <div className={`preview-graph stage-${stage}`}>
        <svg
          viewBox="0 0 460 330"
          role="img"
          aria-label={`${buyers.length} indexed buyers for the selected pool`}
        >
          <g className="graph-guides" fill="none">
            <ellipse cx="230" cy="188" rx="205" ry="109" />
            <ellipse cx="230" cy="188" rx="144" ry="73" />
          </g>
          <g className="graph-lines" fill="none">
            {nodes.map((node) => (
              <path key={node.wallet} d={`M230 210 L${node.x} ${node.y}`} />
            ))}
          </g>
          {nodes.map((node) => (
            <g className="graph-wallet" key={node.wallet}>
              <rect x={node.x - 20} y={node.y - 17} width="40" height="34" rx="10" />
              <path
                d={`M${node.x - 8} ${node.y - 5}h16v11h-16z M${node.x + 3} ${node.y}h5`}
                fill="none"
              />
              <text x={node.x} y={node.y + 34} textAnchor="middle">
                {node.wallet.slice(0, 4)}…
              </text>
            </g>
          ))}
          <g className="graph-pool">
            <circle cx="230" cy="211" r="27" />
            <text x="230" y="217" textAnchor="middle">
              {pool?.symbol.slice(0, 1) ?? "—"}
            </text>
          </g>
        </svg>
        <div className="graph-caption">
          <span className="status-dot" />
          {caption}
        </div>
      </div>
      <div className="preview-finding" aria-live="polite" aria-atomic="true">
        <div className="preview-metric">
          <strong>{metric}</strong>
          <span>{["covered launch", "buyer wallets", "findings"][stage]}</span>
        </div>
        <div className="preview-summary">
          <h3>{title}</h3>
          <p>{body}</p>
        </div>
      </div>
      <div className="preview-bottom">
        <span>
          <Icon name="check" size={14} /> {snapshot?.coverage.commitment ?? "Live provider"} data
        </span>
        <span>{snapshot?.coverage.persistence ?? "Waiting for backend"}</span>
      </div>
    </section>
  );
}
