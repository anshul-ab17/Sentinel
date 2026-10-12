"use client";

import { useId, useMemo, useState } from "react";

import type { Snapshot } from "@shared/snapshot";

type LinkFilter = "all" | "funding" | "trades";
type GraphNode = {
  address: string;
  role: "Buyer" | "Funding source" | "Buyer · source";
  x: number;
  y: number;
};

export function WalletGraph({
  snapshot,
  compact = false,
  onOpen,
  initialFilter = "all",
}: {
  snapshot: Snapshot;
  compact?: boolean;
  onOpen?: () => void;
  initialFilter?: LinkFilter;
}) {
  const gridId = useId();
  const [poolId, setPoolId] = useState(snapshot.pools[0]?.address ?? "");
  const [filter, setFilter] = useState<LinkFilter>(initialFilter);
  const [layout, setLayout] = useState<"graph" | "addresses">("graph");
  const data = useMemo(() => {
    const events = snapshot.events.filter((event) => event.pool === poolId);
    const funding = events.filter(
      (event): event is Extract<typeof event, { kind: "funding" }> => event.kind === "funding",
    );
    const buyers = [
      ...new Set(
        events
          .filter((event): event is Extract<typeof event, { kind: "buy" }> => event.kind === "buy")
          .map((event) => event.wallet),
      ),
    ].sort();
    const sources = [...new Set(funding.map((event) => event.source))].sort();
    const addresses = [...new Set([...buyers, ...sources])].sort();
    const positions = new Map<string, GraphNode>();
    buyers.forEach((address, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(buyers.length, 1);
      positions.set(address, {
        address,
        role: sources.includes(address) ? "Buyer · source" : "Buyer",
        x: 420 + Math.cos(angle) * 150,
        y: 210 + Math.sin(angle) * 142,
      });
    });
    sources.forEach((address, index) => {
      if (!positions.has(address))
        positions.set(address, {
          address,
          role: "Funding source",
          x: 110,
          y: ((index + 1) * 420) / (sources.length + 1),
        });
    });
    return { funding, buyers, sources, addresses, positions };
  }, [poolId, snapshot.events]);
  const showFunding = filter !== "trades";
  const showTrades = filter !== "funding";
  const pool = snapshot.pools.find((item) => item.address === poolId);

  return (
    <section className={`panel wallet-graph-panel ${compact ? "wallet-graph-compact" : ""}`}>
      <div className="panel-heading wallet-graph-heading">
        <div>
          <span className="eyebrow">WALLET INTELLIGENCE</span>
          <h2>{compact ? "Wallet funding network" : "Wallet graph"}</h2>
          <p>Observed buyer activity and indexed funding links for this pool.</p>
        </div>
        {compact ? (
          <button className="text-button" onClick={onOpen}>
            View investigation →
          </button>
        ) : (
          <div className="wallet-graph-controls">
            <select
              value={poolId}
              aria-label="Choose pool for wallet graph"
              onChange={(event) => setPoolId(event.target.value)}
            >
              {snapshot.pools.map((item) => (
                <option key={item.address} value={item.address}>
                  {item.symbol} · {item.name}
                </option>
              ))}
            </select>
            <div className="metric-switch" role="group" aria-label="Wallet graph view">
              <button
                type="button"
                aria-pressed={layout === "graph"}
                onClick={() => setLayout("graph")}
              >
                Graph
              </button>
              <button
                type="button"
                aria-pressed={layout === "addresses"}
                onClick={() => setLayout("addresses")}
              >
                Addresses
              </button>
            </div>
          </div>
        )}
      </div>
      {layout === "graph" ? (
        <>
          <div className="wallet-graph-toolbar">
            <div className="metric-switch" role="group" aria-label="Filter wallet graph links">
              <button
                type="button"
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                All links
              </button>
              <button
                type="button"
                aria-pressed={filter === "funding"}
                onClick={() => setFilter("funding")}
              >
                Funding
              </button>
              <button
                type="button"
                aria-pressed={filter === "trades"}
                onClick={() => setFilter("trades")}
              >
                Purchases
              </button>
            </div>
            <span>
              {data.buyers.length} buyers <i /> {data.sources.length} funding sources
            </span>
          </div>
          {data.buyers.length ? (
            <div className="wallet-graph-canvas">
              <svg
                viewBox="0 0 820 440"
                role="img"
                aria-label={`${data.buyers.length} observed buyers and ${data.funding.length} direct funding links for ${pool?.symbol ?? "selected pool"}`}
              >
                <defs>
                  <pattern id={gridId} width="25" height="25" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r=".8" fill="var(--graph-grid)" />
                  </pattern>
                </defs>
                <rect width="820" height="440" fill={`url(#${gridId})`} />
                {showFunding &&
                  data.funding.map((event, index) => {
                    const source = data.positions.get(event.source);
                    const buyer = data.positions.get(event.wallet);
                    return source && buyer ? (
                      <path
                        key={`funding-${event.id}-${index}`}
                        className="wallet-edge funding"
                        d={`M${source.x + 32} ${source.y} C${source.x + 110} ${source.y},${buyer.x - 100} ${buyer.y},${buyer.x - 35} ${buyer.y}`}
                      >
                        <title>Observed direct funding transfer</title>
                      </path>
                    ) : null;
                  })}
                {showTrades &&
                  data.buyers.map((address) => {
                    const buyer = data.positions.get(address);
                    return buyer ? (
                      <path
                        key={`trade-${address}`}
                        className="wallet-edge trade"
                        d={`M${buyer.x + 32} ${buyer.y} Q${(buyer.x + 755) / 2} ${buyer.y},755 210`}
                      >
                        <title>{`Observed purchase in ${pool?.symbol}`}</title>
                      </path>
                    ) : null;
                  })}
                {data.sources
                  .filter((address) => !data.positions.get(address)?.role.startsWith("Buyer"))
                  .map((address) => {
                    const node = data.positions.get(address)!;
                    return (
                      <g
                        className="wallet-node source"
                        key={address}
                        transform={`translate(${node.x} ${node.y})`}
                      >
                        <circle r="23" />
                        <text className="wallet-node-mark" textAnchor="middle" y="5">
                          F
                        </text>
                        <text className="wallet-node-label" x="31" y="4">
                          Funding source
                        </text>
                        <text className="wallet-node-address" x="31" y="19">
                          {address.slice(0, 5)}…{address.slice(-4)}
                        </text>
                      </g>
                    );
                  })}
                {data.buyers.map((address) => {
                  const node = data.positions.get(address)!;
                  return (
                    <g
                      className="wallet-node buyer"
                      key={address}
                      transform={`translate(${node.x} ${node.y})`}
                    >
                      <circle r="22" />
                      <text className="wallet-node-mark" textAnchor="middle" y="5">
                        W
                      </text>
                      <text className="wallet-node-address" textAnchor="middle" y="39">
                        {address.slice(0, 5)}…{address.slice(-4)}
                      </text>
                    </g>
                  );
                })}
                <g className="wallet-node pool-node" transform="translate(755 210)">
                  <circle r="31" />
                  <text className="wallet-node-mark" textAnchor="middle" y="5">
                    {pool?.symbol.slice(0, 1) ?? "P"}
                  </text>
                  <text className="wallet-node-label" textAnchor="middle" y="52">
                    {pool?.symbol ?? "Pool"}
                  </text>
                  <text className="wallet-node-address" textAnchor="middle" y="67">
                    DBC pool
                  </text>
                </g>
              </svg>
            </div>
          ) : (
            <div className="wallet-address-list">
              {data.addresses.map((address) => (
                <div className="wallet-address-row" key={address}>
                  <span
                    className={`wallet-address-mark ${data.sources.includes(address) ? "source" : "buyer"}`}
                  >
                    {data.sources.includes(address) ? "F" : "W"}
                  </span>
                  <code>{address}</code>
                  <span className="badge neutral">
                    {data.buyers.includes(address) && data.sources.includes(address)
                      ? "Buyer · source"
                      : data.buyers.includes(address)
                        ? "Buyer"
                        : "Funding source"}
                  </span>
                </div>
              ))}
              {data.addresses.length === 0 && (
                <p className="empty">No wallet activity in this pool.</p>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="wallet-graph-empty">
          No purchase activity is available in the current coverage window.
        </div>
      )}
      <div className="wallet-graph-legend">
        <span>
          <i className="funding-key" />
          Direct funding
        </span>
        <span>
          <i className="trade-key" />
          Observed purchase
        </span>
        <small>
          Connections represent observed transactions; they do not establish shared ownership.
        </small>
      </div>
    </section>
  );
}
