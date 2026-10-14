"use client";

import { useState } from "react";

const nodes = [
  { id: "origin", x: 28, y: 83, color: "warm", label: "Launch wallet" },
  { id: "buyer-a", x: 83, y: 34, color: "warm", label: "Early buyer" },
  { id: "buyer-b", x: 91, y: 133, color: "warm", label: "Early buyer" },
  { id: "funder", x: 134, y: 80, color: "cool", label: "Shared funder" },
  { id: "wallet-a", x: 193, y: 52, color: "cool", label: "Connected wallet" },
  { id: "wallet-b", x: 205, y: 115, color: "cool", label: "Connected wallet" },
  { id: "signal", x: 270, y: 84, color: "signal", label: "Observed signal" },
  { id: "wallet-c", x: 326, y: 119, color: "warm", label: "Related wallet" },
] as const;

const edges = [
  ["origin", "buyer-a"],
  ["origin", "buyer-b"],
  ["buyer-a", "funder"],
  ["buyer-b", "funder"],
  ["funder", "wallet-a"],
  ["funder", "wallet-b"],
  ["wallet-a", "signal"],
  ["wallet-b", "signal"],
  ["signal", "wallet-c"],
  ["buyer-a", "signal"],
  ["buyer-b", "wallet-b"],
] as const;

export function ApproachNetwork() {
  const [activeNode, setActiveNode] = useState<string>("signal");
  const active = nodes.find((node) => node.id === activeNode) ?? nodes[6];

  function toggleNode(id: string) {
    setActiveNode((current) => (current === id ? "signal" : id));
  }

  return (
    <div className="approach-network">
      <div className="approach-network-heading">
        <span>NETWORK / LIVE VIEW</span>
        <span>
          <i /> CONNECTED
        </span>
      </div>
      <svg viewBox="0 0 360 160" role="group" aria-label="Interactive wallet relationship graph">
        <defs>
          <pattern id="approach-network-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" className="approach-network-grid-line" />
          </pattern>
        </defs>
        <rect width="360" height="160" fill="url(#approach-network-grid)" />
        {edges.map(([from, to], index) => {
          const start = nodes.find((node) => node.id === from)!;
          const end = nodes.find((node) => node.id === to)!;
          const connected = from === activeNode || to === activeNode;
          return (
            <line
              key={`${from}-${to}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              className={`approach-network-edge${connected ? " is-connected" : ""}`}
              style={{ animationDelay: `${index * 90}ms` }}
            />
          );
        })}
        {nodes.map((node) => (
          <g
            key={node.id}
            className={`approach-network-node ${node.color}${activeNode === node.id ? " is-active" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={node.label}
            aria-pressed={activeNode === node.id}
            onClick={() => toggleNode(node.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleNode(node.id);
              }
            }}
          >
            <circle className="approach-network-halo" cx={node.x} cy={node.y} r="11" />
            <circle className="approach-network-dot" cx={node.x} cy={node.y} r="4" />
          </g>
        ))}
        <path d={`M ${active.x} ${active.y + 13} v 8 h 16`} className="approach-network-bracket" />
        <text x={active.x + 19} y={active.y + 24} className="approach-network-caption">
          {active.label.toUpperCase()}
        </text>
      </svg>
      <div className="approach-network-footer" aria-live="polite">
        <strong>{active.label}</strong>
      </div>
    </div>
  );
}
