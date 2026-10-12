"use client";

import { Icon } from "@app/components/icon";

import { sol } from "./format.ts";

import type { Snapshot } from "@shared/snapshot";

type LaunchRow = Snapshot["pools"][number] & { buys: number; volume: bigint; signals: number };
type Props = {
  snapshot: Snapshot;
  filteredPools: LaunchRow[];
  poolFilter: "all" | "flagged";
  setPoolFilter: (value: "all" | "flagged") => void;
  sort: "volume" | "name" | "signals";
  setSort: (value: "volume" | "name" | "signals") => void;
  setPoolId: (id: string) => void;
  setResult: (result: null) => void;
  setView: (view: "Launch Autopsy") => void;
};

export function PoolTable({
  snapshot,
  filteredPools,
  poolFilter,
  setPoolFilter,
  sort,
  setSort,
  setPoolId,
  setResult,
  setView,
}: Props) {
  return (
    <section className="panel pools-panel">
      <div className="panel-heading">
        <div className="heading-inline">
          <h2>Launches</h2>
          <span className="count-label">{filteredPools.length}</span>
        </div>
        <div className="table-controls">
          <div className="metric-switch" role="group" aria-label="Filter pools">
            <button aria-pressed={poolFilter === "all"} onClick={() => setPoolFilter("all")}>
              All pools
            </button>
            <button
              aria-pressed={poolFilter === "flagged"}
              onClick={() => setPoolFilter("flagged")}
            >
              With signals
            </button>
          </div>
          <select
            value={sort}
            aria-label="Sort pools"
            onChange={(event) => setSort(event.target.value as typeof sort)}
          >
            <option value="volume">Volume: high to low</option>
            <option value="signals">Most signals</option>
            <option value="name">Name: A–Z</option>
          </select>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Token / pool</th>
              <th className="numeric">Purchases</th>
              <th className="numeric">Buy volume</th>
              <th>Detection status</th>
              <th className="row-action-heading">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredPools.map((pool) => {
              const index = snapshot.pools.findIndex((item) => item.address === pool.address);
              const amount = pool.volume;
              const count = pool.signals;
              return (
                <tr key={pool.address}>
                  <td>
                    <div className="token-cell">
                      <span className={`token token-${index}`}>{pool.symbol.slice(0, 1)}</span>
                      <div>
                        <strong>
                          {pool.name} <small>{pool.symbol}</small>
                        </strong>
                        <code>{pool.address}</code>
                      </div>
                    </div>
                  </td>
                  <td className="numeric">{pool.buys}</td>
                  <td className="numeric volume-cell">
                    {sol(amount.toString())} <span className="subtle">SOL</span>
                  </td>
                  <td>
                    <span className={`badge ${count ? "amber" : "neutral"}`}>
                      <i />
                      {count ? `${count} signals` : "No signals"}
                    </span>
                  </td>
                  <td className="row-action">
                    <button
                      className="text-button"
                      onClick={() => {
                        setPoolId(pool.address);
                        setResult(null);
                        setView("Launch Autopsy");
                      }}
                    >
                      Investigate <Icon name="arrow" size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!filteredPools.length && <p className="empty">No pools match your filters.</p>}
      </div>
      <div className="table-foot">
        <span>
          {filteredPools.length} of {snapshot.pools.length} covered pools
        </span>
        <span>Meteora DBC · Finalized on-chain data</span>
      </div>
    </section>
  );
}

export function LaunchBoard({
  snapshot,
  filteredPools,
  setPoolId,
  setResult,
  setView,
}: Pick<Props, "snapshot" | "filteredPools" | "setPoolId" | "setResult" | "setView">) {
  const groups = [
    {
      title: "Needs investigation",
      pools: filteredPools.filter((pool) => pool.signals > 0),
      type: "review",
    },
    {
      title: "No signals detected",
      pools: filteredPools.filter((pool) => pool.signals === 0),
      type: "clear",
    },
  ];
  return (
    <section className="launch-board" aria-label="Launches grouped by detection status">
      {groups.map((group) => (
        <div className="launch-column" key={group.type}>
          <div className="launch-column-heading">
            <span className={`launch-column-dot ${group.type}`} />
            <h2>{group.title}</h2>
            <span className="count-label">{group.pools.length}</span>
          </div>
          <div className="launch-column-cards">
            {group.pools.map((pool) => {
              const index = snapshot.pools.findIndex((item) => item.address === pool.address);
              return (
                <article className="launch-card" key={pool.address}>
                  <div className="launch-card-top">
                    <span className={`token token-${index}`}>{pool.symbol.slice(0, 1)}</span>
                    <span>{pool.symbol}</span>
                    <span className={`badge ${pool.signals ? "amber" : "neutral"}`}>
                      {pool.signals ? `${pool.signals} signals` : "No signals"}
                    </span>
                  </div>
                  <h3>{pool.name}</h3>
                  <code>{pool.address}</code>
                  <div className="launch-card-metrics">
                    <div>
                      <span>Buy volume</span>
                      <strong>{sol(pool.volume.toString())} SOL</strong>
                    </div>
                    <div>
                      <span>Purchases</span>
                      <strong>{pool.buys}</strong>
                    </div>
                  </div>
                  <button
                    className="launch-card-action"
                    onClick={() => {
                      setPoolId(pool.address);
                      setResult(null);
                      setView("Launch Autopsy");
                    }}
                  >
                    Investigate <Icon name="arrow" size={14} />
                  </button>
                </article>
              );
            })}
            {group.pools.length === 0 && (
              <p className="launch-column-empty">No matching launches.</p>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
