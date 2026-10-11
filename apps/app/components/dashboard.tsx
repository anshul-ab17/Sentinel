"use client";

import { useState } from "react";
import type { Snapshot } from "@shared/snapshot";
import type { Alert, Event } from "@shared/events";

type ReplayResult = { digest: string; eventCount: number; alerts: Alert[]; ruleVersion: string };
type View = "Overview" | "Launches" | "Alerts" | "Launch Autopsy";
const views: { name: View; icon: string }[] = [
  { name: "Overview", icon: "◈" }, { name: "Launches", icon: "↗" },
  { name: "Alerts", icon: "◇" }, { name: "Launch Autopsy", icon: "↺" },
];
const sol = (amount: string) => (Number(BigInt(amount) / 1000000n) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
const time = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(11, 19);

export function Dashboard({ snapshot }: { snapshot: Snapshot }) {
  const [view, setView] = useState<View>("Overview");
  const [query, setQuery] = useState("");
  const [poolId, setPoolId] = useState(snapshot.pools[0].address);
  const [selectedAlert, setSelectedAlert] = useState<string | null>(snapshot.alerts[0]?.id ?? null);
  const [severity, setSeverity] = useState("all");
  const [cutoff, setCutoff] = useState(90);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pool = snapshot.pools.find(pool => pool.address === poolId)!;
  const alert = snapshot.alerts.find(alert => alert.id === selectedAlert);
  const selectedEvents = snapshot.events.filter(event => event.pool === poolId);
  const filteredPools = snapshot.pools.filter(pool => `${pool.name} ${pool.symbol} ${pool.address}`.toLowerCase().includes(query.toLowerCase()));
  const filteredAlerts = snapshot.alerts.filter(alert => (severity === "all" || alert.severity === severity) &&
    `${alert.title} ${alert.pool}`.toLowerCase().includes(query.toLowerCase()));
  const buys = snapshot.events.filter(event => event.kind === "buy");
  const total = buys.reduce((sum, event) => sum + BigInt(event.quoteLamports), 0n);

  async function runReplay() {
    setPending(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/investigations/replay", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool: poolId, through: pool.createdAt + cutoff }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Replay failed");
      setResult(data);
    } catch (error) { setError(error instanceof Error ? error.message : "Replay failed. Try again."); }
    finally { setPending(false); }
  }

  function exportReport() {
    if (!alert) return;
    const blob = new Blob([JSON.stringify({ coverage: snapshot.coverage, alert,
      events: snapshot.events.filter(event => alert.evidence.includes(event.id)) }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `sentinel-${alert.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function poolTable() {
    return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">DBC EXPLORER</span><h2>Launch watchlist</h2></div><span className="subtle">{filteredPools.length} pools</span></div>
      <div className="table-scroll"><table><thead><tr><th>Token / pool</th><th>Observed buys</th><th>Buy volume</th><th>Signals</th><th>Investigate</th></tr></thead><tbody>
        {filteredPools.map((pool, index) => {
          const buys = snapshot.events.filter(event => event.pool === pool.address && event.kind === "buy");
          const amount = buys.reduce((sum, event) => sum + (event.kind === "buy" ? BigInt(event.quoteLamports) : 0n), 0n);
          const count = snapshot.alerts.filter(alert => alert.pool === pool.address).length;
          return <tr key={pool.address}><td><div className="token-cell"><span className={`token token-${index}`}>{pool.symbol.slice(0, 1)}</span><div><strong>{pool.name} <small>{pool.symbol}</small></strong><code>{pool.address}</code></div></div></td>
            <td>{buys.length} <span className="subtle">transactions</span></td><td>{sol(amount.toString())} <span className="subtle">SOL</span></td>
            <td><span className={`badge ${count ? "amber" : "neutral"}`}>{count ? `${count} signals` : "No rules triggered"}</span></td>
            <td><button className="text-button" onClick={() => { setPoolId(pool.address); setResult(null); setView("Launch Autopsy"); }}>Replay ↗</button></td></tr>;
        })}
      </tbody></table>{!filteredPools.length && <p className="empty">No pools match your search.</p>}</div>
    </section>;
  }

  function alertsPanel() {
    return <section className="panel"><div className="panel-heading"><div><span className="eyebrow">DETECTION ENGINE</span><h2>Signals to investigate</h2></div>
      <select aria-label="Filter alerts by severity" value={severity} onChange={event => setSeverity(event.target.value)}><option value="all">All severities</option><option value="high">High</option><option value="medium">Medium</option></select></div>
      <div className="alert-list">{filteredAlerts.map(alert => <button key={alert.id} className={`alert-row ${selectedAlert === alert.id ? "selected" : ""}`} onClick={() => setSelectedAlert(alert.id)}>
        <span className={`signal-icon ${alert.severity}`}>!</span><span className="alert-copy"><strong>{alert.title}</strong><span>{alert.pool} · rule v{alert.rule.version}</span></span><span className={`badge ${alert.severity === "high" ? "amber" : "neutral"}`}>{alert.severity}</span><span className="arrow">↗</span>
      </button>)}{!filteredAlerts.length && <p className="empty">No alerts match your filters.</p>}</div>
    </section>;
  }

  function evidencePanel() {
    return <section className="panel evidence"><div className="panel-heading"><div><span className="eyebrow">EVIDENCE FIRST</span><h2>Investigation brief</h2></div><span className="mini-icon">⌕</span></div>
      {alert ? <div className="evidence-body"><div className="brief-title"><span className="badge amber">Requires investigation</span><h3>{alert.title}</h3></div>
        <span className="eyebrow">OBSERVATION · SYNTHETIC DATA</span><p>{alert.observation}</p><span className="eyebrow">HEURISTIC INTERPRETATION</span><p>{alert.interpretation}</p>
        <div className="note">Template summary · No AI model connected</div><div className="evidence-meta"><span>Rule version</span><code>{alert.rule.version}</code><span>Evidence records</span><strong>{alert.evidence.length}</strong></div>
        <details><summary>Inspect transaction evidence</summary><ul className="evidence-list">{snapshot.events.filter(event => alert.evidence.includes(event.id)).map(event => <li key={event.id}><strong>{event.kind}</strong><code>{event.signature}</code><span>{time(event.timestamp)} UTC · slot {event.slot}</span></li>)}</ul></details>
        <button className="secondary full" onClick={exportReport}>Export evidence JSON ↓</button><p className="fine-print">Synthetic signatures cannot be verified on a blockchain explorer. Shared funding alone does not prove coordination.</p>
      </div> : <p className="empty">Select an alert to inspect its evidence.</p>}
    </section>;
  }

  function eventLabel(event: Event) {
    if (event.kind === "pool_created") return "DBC pool created";
    if (event.kind === "buy") return `${sol(event.quoteLamports)} SOL buy · ${event.wallet}`;
    if (event.kind === "funding") return `Funding link · ${event.source} → ${event.wallet}`;
    return `${sol(event.lamports)} SOL transfer · ${event.wallet} → ${event.recipient}`;
  }

  return <div className="app-shell"><aside className="sidebar"><a href="/" className="brand"><span className="brand-symbol">◈</span>SENTINEL<span className="brand-ai">AI</span></a><div className="workspace"><span className="workspace-icon">S</span><div>Research workspace<small>Solana intelligence</small></div><span>⌄</span></div>
    <span className="nav-label">INTELLIGENCE</span><nav>{views.map(item => <button key={item.name} className={view === item.name ? "active" : ""} onClick={() => { setView(item.name); setQuery(""); }} aria-current={view === item.name ? "page" : undefined}><span>{item.icon}</span>{item.name}{item.name === "Alerts" && <b>{snapshot.alerts.length}</b>}</button>)}</nav>
    <div className="sidebar-bottom"><div className="network"><span className="status-dot"/><div>Solana / Meteora DBC<small>Demo environment</small></div></div><a href="/api/pools" target="_blank" rel="noreferrer">Developer API ↗</a><p>See the launch.<br/>Verify the evidence.</p><span className="version">SENTINEL v0.1.0</span></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{view}</strong></div><span className="demo-pill"><span className="status-dot"/> Synthetic demo</span></header>
      <main><div className="page-heading"><div><span className="eyebrow">SOLANA LAUNCH INTELLIGENCE</span><h1>{view === "Overview" ? "Every signal has a story." : view}</h1><p>{view === "Overview" ? "Trace the activity. Investigate the connections. Follow the evidence." : view === "Launch Autopsy" ? "Reconstruct a launch from versioned, deterministic event data." : "Inspect observed activity and the evidence behind each signal."}</p></div><button className="primary" onClick={() => { setView("Launch Autopsy"); setQuery(""); }}>↺ Launch Autopsy</button></div>
        <div className="demo-banner"><span>◉</span><p><strong>Development preview</strong> All activity below is synthetic. Live RPC ingestion, database persistence, and AI analysis are not connected.</p><span className="banner-tag">FIXTURE DATA</span></div>
        {view !== "Launch Autopsy" && <label className="search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search pools, tokens, or signals…" aria-label="Search pools and signals"/><kbd>SEARCH</kbd></label>}
        {view === "Overview" && <><div className="stats"><article><span>Observed pools</span><strong>{snapshot.pools.length.toString().padStart(2, "0")}</strong><small>Meteora DBC fixtures <b>↗</b></small></article><article><span>Observed buy volume</span><strong>{sol(total.toString())}<em>SOL</em></strong><small>Across {buys.length} sample buys <b>↗</b></small></article><article><span>Rule-based signals</span><strong>{snapshot.alerts.length.toString().padStart(2, "0")}<i className="tiny-amber"/></strong><small>{snapshot.alerts.filter(alert => alert.severity === "high").length} high severity · review required</small></article><article><span>Evidence coverage</span><strong>Finalized</strong><small>Supplied events only <span className="status-dot"/></small></article></div>{poolTable()}<div className="investigation-grid"><div>{alertsPanel()}<section className="method-card"><span className="orbit-mark">◎</span><div><span className="eyebrow">BUILT FOR VERIFICATION</span><h3>Signals, with the receipts.</h3><p>Every finding links to its source events and a versioned rule. Replay the same dataset to reproduce the result.</p></div></section></div>{evidencePanel()}</div></>}
        {view === "Launches" && poolTable()}
        {view === "Alerts" && <div className="investigation-grid"><div>{alertsPanel()}</div>{evidencePanel()}</div>}
        {view === "Launch Autopsy" && <div className="replay-grid"><section className="panel replay-controls"><span className="eyebrow">HISTORICAL REPLAY</span><h2>Follow the first 90 seconds.</h2><p className="subtle">Select a pool and an observation window. The same events and rule version produce the same digest.</p>
          <label>Pool<select disabled={pending} value={poolId} onChange={event => { setPoolId(event.target.value); setResult(null); }}>{snapshot.pools.map(pool => <option key={pool.address} value={pool.address}>{pool.name} / {pool.symbol}</option>)}</select></label>
          <label>Seconds after creation <strong>{cutoff}s</strong><input disabled={pending} type="range" min="0" max="90" value={cutoff} onChange={event => { setCutoff(Number(event.target.value)); setResult(null); }}/></label><button className="primary full" disabled={pending} onClick={runReplay}>{pending ? "Replaying events…" : "Run deterministic replay ↗"}</button>
          <div aria-live="polite">{error && <p className="error" role="alert">{error}</p>}{result && <div className="replay-result"><span className="badge green">Replay complete</span><h3>{result.alerts.length} signals · {result.eventCount} events</h3><p>Rule version {result.ruleVersion}</p><span className="eyebrow">SHA-256 DATASET + RULE DIGEST</span><code>{result.digest}</code>{result.alerts.map(alert => <p key={alert.id}>{alert.title}</p>)}</div>}</div></section>
          <section className="panel"><div className="panel-heading"><div><span className="eyebrow">{pool.symbol} / EVENT TIMELINE</span><h2>Launch reconstruction</h2></div><span className="badge neutral">0–{cutoff}s</span></div><ol className="timeline">{selectedEvents.filter(event => event.timestamp <= pool.createdAt + cutoff).map(event => <li key={event.id}><time>00:{String(event.timestamp - pool.createdAt).padStart(2, "0")}</time><span className={`timeline-dot ${event.kind}`}/><div><strong>{eventLabel(event)}</strong><code>{event.signature}</code><small>Finalized fixture · slot {event.slot}</small></div></li>)}</ol></section></div>}
        <footer><span>Sentinel AI <span className="footer-dot">·</span> Evidence-first intelligence</span><span>Research tool. Signals are not proof of wrongdoing.</span></footer>
      </main></div></div>;
}
