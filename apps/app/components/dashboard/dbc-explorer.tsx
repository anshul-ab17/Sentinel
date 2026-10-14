"use client";

import type { Snapshot } from "@shared/snapshot";

type Props = {
  snapshot: Snapshot;
  poolId: string;
  setPoolId: (poolId: string) => void;
};

export function DbcExplorer({ snapshot, poolId, setPoolId }: Props) {
  const pool = snapshot.pools.find((item) => item.address === poolId);
  const events = snapshot.events
    .filter((event) => event.pool === poolId)
    .sort((a, b) => b.timestamp - a.timestamp);
  const buys = events.filter((event) => event.kind === "buy");
  const volume = buys.reduce(
    (sum, event) => sum + (event.kind === "buy" ? BigInt(event.quoteLamports) : 0n),
    0n,
  );
  const signalCount = snapshot.alerts.filter((alert) => alert.pool === poolId).length;

  return (
    <div className="dbc-explorer">
      <section className="panel dbc-pool-selector">
        <div className="panel-heading">
          <div>
            <h2>Pool selection</h2>
            <p>Explore observed Meteora Dynamic Bonding Curve pools.</p>
          </div>
          <span className="count-label">{snapshot.pools.length} covered</span>
        </div>
        {snapshot.pools.length ? (
          <label className="dbc-select-label">
            <span>Pool</span>
            <select value={pool?.address ?? ""} onChange={(event) => setPoolId(event.target.value)}>
              {snapshot.pools.map((item) => (
                <option key={item.address} value={item.address}>
                  {item.name} ({item.symbol}) · {item.address}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="dbc-empty">
            <strong>No covered DBC pools</strong>
            <p>Pool details appear when the indexer observes a launch within current coverage.</p>
          </div>
        )}
      </section>

      {pool && (
        <>
          <div className="dbc-facts">
            <article className="panel">
              <span>Buy volume</span>
              <strong>
                {(Number(volume) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 3 })} SOL
              </strong>
            </article>
            <article className="panel">
              <span>Observed purchases</span>
              <strong>{buys.length}</strong>
            </article>
            <article className="panel">
              <span>Detection signals</span>
              <strong>{signalCount}</strong>
            </article>
            <article className="panel">
              <span>First observed (UTC)</span>
              <strong>
                {new Date(pool.createdAt * 1000).toISOString().replace("T", " ").slice(0, 19)}
              </strong>
            </article>
          </div>
          <div className="dbc-detail-grid">
            <section className="panel dbc-identity">
              <div className="panel-heading">
                <div>
                  <h2>Pool configuration</h2>
                  <p>Identity observed from the DBC launch record</p>
                </div>
              </div>
              <dl>
                <div>
                  <dt>Token</dt>
                  <dd>
                    {pool.name} ({pool.symbol})
                  </dd>
                </div>
                <div>
                  <dt>Pool address</dt>
                  <dd>
                    <code title={pool.address}>{pool.address}</code>
                  </dd>
                </div>
                <div>
                  <dt>Base mint</dt>
                  <dd>
                    <code title={pool.baseMint}>{pool.baseMint}</code>
                  </dd>
                </div>
                <div>
                  <dt>Quote mint</dt>
                  <dd>
                    <code title={pool.quoteMint}>{pool.quoteMint}</code>
                  </dd>
                </div>
                <div>
                  <dt>Coverage</dt>
                  <dd>
                    {snapshot.coverage.commitment} · {snapshot.coverage.source}
                  </dd>
                </div>
              </dl>
              <p className="dbc-limitation">
                Reserves, curve progress, fees, and migration state are not available in the current
                indexed records.
              </p>
            </section>
            <section className="panel dbc-events">
              <div className="panel-heading">
                <div>
                  <h2>Recent pool events</h2>
                  <p>Recorded events for the selected pool</p>
                </div>
                <span className="count-label">{events.length}</span>
              </div>
              {events.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Slot</th>
                        <th>Time (UTC)</th>
                        <th>Signature</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.slice(0, 8).map((event) => (
                        <tr key={event.id}>
                          <td>{event.kind.replace("_", " ")}</td>
                          <td>{event.slot.toLocaleString("en-US")}</td>
                          <td>{new Date(event.timestamp * 1000).toISOString().slice(11, 19)}</td>
                          <td>
                            <code title={event.signature}>{event.signature}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="dbc-empty">
                  <strong>No events recorded for this pool.</strong>
                  <p>Check the coverage status and selected observation window.</p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
