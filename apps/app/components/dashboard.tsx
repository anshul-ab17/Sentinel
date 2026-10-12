"use client";

import { BrandLogo } from "@app/components/brand-logo";
import type { Snapshot } from "@shared/snapshot";
import type { Alert, Event } from "@shared/events";
import { ThemeToggle } from "@app/components/theme-toggle";
import { Icon } from "@app/components/icon";
import { ActivityChart } from "@app/components/activity-chart";
import { CommandPalette } from "@app/components/command-palette";
import { WalletGraph } from "@app/components/wallet-graph";
import "@app/app/dashboard/dashboard.css";
import { useEffect, useRef, useState, type CSSProperties } from "react";

type ReplayResult = { digest: string; eventCount: number; alerts: Alert[]; ruleVersion: string };
type View = "Overview" | "Launches" | "Alerts" | "Wallet Graph" | "Launch Autopsy";
const views: { name: View; icon: "grid" | "launch" | "signal" | "replay" | "graph" }[] = [
  { name: "Overview", icon: "grid" }, { name: "Launches", icon: "launch" },
  { name: "Alerts", icon: "signal" }, { name: "Wallet Graph", icon: "graph" }, { name: "Launch Autopsy", icon: "replay" },
];
const sol = (amount: string) => (Number(BigInt(amount) / 1000000n) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
const time = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(11, 19);

export function Dashboard({ snapshot }: { snapshot: Snapshot }) {
  const [view, setView] = useState<View>("Overview");
  const [query, setQuery] = useState("");
  const [poolId, setPoolId] = useState(snapshot.pools[0].address);
  const [selectedAlert, setSelectedAlert] = useState<string | null>(snapshot.alerts[0]?.id ?? null);
  const [severity, setSeverity] = useState("all");
  const [poolFilter, setPoolFilter] = useState<"all" | "flagged">("all");
  const [sort, setSort] = useState<"volume" | "name" | "signals">("volume");
  const [cutoff, setCutoff] = useState(90);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(212);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const resizingSidebar = useRef(false);
  const sidebarResizeOffset = useRef(0);
  const pool = snapshot.pools.find(pool => pool.address === poolId)!;
  const alert = snapshot.alerts.find(alert => alert.id === selectedAlert);
  const selectedEvents = snapshot.events.filter(event => event.pool === poolId);
  const poolRows = snapshot.pools.map(pool => {
    const buys = snapshot.events.filter(event => event.pool === pool.address && event.kind === "buy");
    return { ...pool, buys: buys.length, volume: buys.reduce((sum, event) => sum + (event.kind === "buy" ? BigInt(event.quoteLamports) : 0n), 0n), signals: snapshot.alerts.filter(alert => alert.pool === pool.address).length };
  });
  const filteredPools = poolRows.filter(pool => `${pool.name} ${pool.symbol} ${pool.address}`.toLowerCase().includes(query.toLowerCase()) && (poolFilter === "all" || pool.signals > 0)).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : sort === "signals" ? b.signals - a.signals || a.name.localeCompare(b.name) : a.volume === b.volume ? a.name.localeCompare(b.name) : a.volume > b.volume ? -1 : 1);
  const filteredAlerts = snapshot.alerts.filter(alert => (severity === "all" || alert.severity === severity) &&
    `${alert.title} ${alert.pool}`.toLowerCase().includes(query.toLowerCase()));
  const buys = snapshot.events.filter(event => event.kind === "buy");
  const total = buys.reduce((sum, event) => sum + BigInt(event.quoteLamports), 0n);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("sentinel-sidebar-width"));
      if (Number.isFinite(saved) && saved >= 44 && saved <= 360) setSidebarWidth(saved);
    } catch { /* Keep the default sidebar width when storage is unavailable. */ }
  }, []);

  function persistSidebarWidth(width: number) {
    const next = Math.min(360, Math.max(44, width));
    setSidebarWidth(next);
    try { localStorage.setItem("sentinel-sidebar-width", String(next)); } catch { /* Resizing still works when storage is unavailable. */ }
  }

  function resizeSidebar(event: React.PointerEvent<HTMLDivElement>) {
    if (resizingSidebar.current) setSidebarWidth(Math.min(360, Math.max(44, event.clientX - sidebarResizeOffset.current)));
  }

  async function runReplay() {
    setPending(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/investigations/replay", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool: poolId, through: pool.createdAt + cutoff }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Replay failed");
      setResult(data);
    } catch { setError("We couldn’t complete the replay right now. Please try again in a moment."); }
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
    return <section className="panel pools-panel"><div className="panel-heading"><div className="heading-inline"><h2>Launches</h2><span className="count-label">{filteredPools.length}</span></div><div className="table-controls"><div className="metric-switch" role="group" aria-label="Filter pools"><button aria-pressed={poolFilter === "all"} onClick={() => setPoolFilter("all")}>All pools</button><button aria-pressed={poolFilter === "flagged"} onClick={() => setPoolFilter("flagged")}>With signals</button></div><select value={sort} aria-label="Sort pools" onChange={event => setSort(event.target.value as typeof sort)}><option value="volume">Volume: high to low</option><option value="signals">Most signals</option><option value="name">Name: A–Z</option></select></div></div>
      <div className="table-scroll"><table><thead><tr><th>Token / pool</th><th className="numeric">Purchases</th><th className="numeric">Buy volume</th><th>Detection status</th><th className="row-action-heading">Action</th></tr></thead><tbody>
        {filteredPools.map(pool => {
          const index = snapshot.pools.findIndex(item => item.address === pool.address);
          const amount = pool.volume;
          const count = pool.signals;
          return <tr key={pool.address}><td><div className="token-cell"><span className={`token token-${index}`}>{pool.symbol.slice(0, 1)}</span><div><strong>{pool.name} <small>{pool.symbol}</small></strong><code>{pool.address}</code></div></div></td>
            <td className="numeric">{pool.buys}</td><td className="numeric volume-cell">{sol(amount.toString())} <span className="subtle">SOL</span></td>
            <td><span className={`badge ${count ? "amber" : "neutral"}`}><i/>{count ? `${count} signals` : "No signals"}</span></td>
            <td className="row-action"><button className="text-button" onClick={() => { setPoolId(pool.address); setResult(null); setView("Launch Autopsy"); }}>Investigate <Icon name="arrow" size={14}/></button></td></tr>;
        })}
      </tbody></table>{!filteredPools.length && <p className="empty">No pools match your filters.</p>}</div><div className="table-foot"><span>{filteredPools.length} of {snapshot.pools.length} sample pools</span><span>Meteora DBC · Finalized fixtures</span></div>
    </section>;
  }

  function launchBoard() {
    const groups = [
      { title: "Needs investigation", pools: filteredPools.filter(pool => pool.signals > 0), type: "review" },
      { title: "No signals detected", pools: filteredPools.filter(pool => pool.signals === 0), type: "clear" },
    ];
    return <section className="launch-board" aria-label="Launches grouped by detection status">
      {groups.map(group => <div className="launch-column" key={group.type}>
        <div className="launch-column-heading"><span className={`launch-column-dot ${group.type}`}/><h2>{group.title}</h2><span className="count-label">{group.pools.length}</span></div>
        <div className="launch-column-cards">{group.pools.map(pool => {
          const index = snapshot.pools.findIndex(item => item.address === pool.address);
          return <article className="launch-card" key={pool.address}>
            <div className="launch-card-top"><span className={`token token-${index}`}>{pool.symbol.slice(0, 1)}</span><span>{pool.symbol}</span><span className={`badge ${pool.signals ? "amber" : "neutral"}`}>{pool.signals ? `${pool.signals} signals` : "No signals"}</span></div>
            <h3>{pool.name}</h3><code>{pool.address}</code>
            <div className="launch-card-metrics"><div><span>Buy volume</span><strong>{sol(pool.volume.toString())} SOL</strong></div><div><span>Purchases</span><strong>{pool.buys}</strong></div></div>
            <button className="launch-card-action" onClick={() => { setPoolId(pool.address); setResult(null); setView("Launch Autopsy"); }}>Investigate <Icon name="arrow" size={14}/></button>
          </article>;
        })}{group.pools.length === 0 && <p className="launch-column-empty">No matching launches.</p>}</div>
      </div>)}
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

  return <div className="app-shell dashboard-shell" data-sidebar-collapsed={sidebarWidth < 132} data-sidebar-min={sidebarWidth === 44} data-sidebar-resizing={isResizingSidebar} style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><a className="dashboard-skip" href="#dashboard-content">Skip to dashboard</a><header className="topbar"><a href="/" className="dashboard-navbar-brand" aria-label="Sentinel home"><BrandLogo size={30}/><span>Sentinel</span></a><div className="breadcrumb">Workspace <span>/</span> <strong>{view}</strong></div><CommandPalette snapshot={snapshot} onView={nextView => { setView(nextView); setQuery(""); }} onPool={(id, search) => { setPoolId(id); setQuery(search); setView("Launches"); }} onAlert={(id, search) => { setSelectedAlert(id); setQuery(search); setView("Alerts"); }}/><div className="topbar-actions"><span className="demo-pill"><span className="status-dot"/> Demo data</span><ThemeToggle /></div></header><aside className="sidebar">
    <nav aria-label="Dashboard navigation">{views.map(item => <button key={item.name} title={item.name} aria-label={item.name} className={view === item.name ? "active" : ""} onClick={() => { setView(item.name); setQuery(""); }} aria-current={view === item.name ? "page" : undefined}><Icon name={item.icon} size={18}/><span className="nav-text">{item.name}</span>{item.name === "Alerts" && <b>{snapshot.alerts.length}</b>}</button>)}</nav>
    <div className="sidebar-bottom"><div className="network" title="Solana / Meteora DBC · Demo environment"><span className="status-dot"/><div>Solana / Meteora DBC<small>Demo environment</small></div></div><a href="/api/pools" target="_blank" rel="noreferrer" title="Developer API"><Icon name="code" size={16}/><span>Developer API ↗</span></a><p>See the launch.<br/>Verify the evidence.</p><div className="workspace" title="Research workspace · Personal workspace"><span className="workspace-icon">S</span><div>Research workspace<small>Personal workspace</small></div></div></div></aside>
    <div className="sidebar-resizer" role="separator" aria-label="Resize sidebar" aria-orientation="vertical" aria-valuemin={44} aria-valuemax={360} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={event => { resizingSidebar.current = true; setIsResizingSidebar(true); sidebarResizeOffset.current = event.clientX - sidebarWidth; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={resizeSidebar} onPointerUp={event => { resizingSidebar.current = false; setIsResizingSidebar(false); persistSidebarWidth(event.clientX - sidebarResizeOffset.current); }} onPointerCancel={() => { resizingSidebar.current = false; setIsResizingSidebar(false); }} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); persistSidebarWidth(sidebarWidth + (event.key === "ArrowRight" ? 12 : -12)); } if (event.key === "Home") { event.preventDefault(); persistSidebarWidth(44); } if (event.key === "End") { event.preventDefault(); persistSidebarWidth(360); } }}/>
    <div className="main-shell">
      <main id="dashboard-content"><div className="page-heading"><div><h1>{view}</h1><p>{view === "Overview" ? "Launch activity, wallet patterns, and the evidence behind them." : view === "Launch Autopsy" ? "Replay a launch and trace each finding to its evidence." : "Explore activity and the evidence behind each signal."}</p></div><button className="primary" onClick={() => { setView("Launch Autopsy"); setQuery(""); }}><Icon name="replay" size={15}/> Replay launch</button></div>
        <div className="demo-banner"><span aria-hidden="true">ⓘ</span><p><strong>Demo workspace.</strong> Sample data for exploring Sentinel. Live monitoring and AI analysis are not connected.</p></div>
        {view === "Overview" && <>
          <div className="stats">
            <article><span>Observed buy volume</span><strong>{sol(total.toString())}<em>SOL</em></strong><small>Across {buys.length} sample purchases</small></article>
            <article><span>Tracked launches</span><strong>{snapshot.pools.length}</strong><small>Meteora DBC pools</small></article>
            <article><span>Detection signals</span><strong>{snapshot.alerts.length}<span className="stat-tag">{snapshot.alerts.filter(alert => alert.severity === "high").length} high priority</span></strong><small>Rule-based findings for review</small></article>
            <article><span>Evidence records</span><strong>{snapshot.events.length}</strong><small>Finalized synthetic events</small></article>
          </div>
          <div className="analytics-grid"><ActivityChart snapshot={snapshot}/><section className="panel distribution-panel"><div className="panel-heading"><div><h2>Volume by launch</h2><p>Share of observed buy volume</p></div></div><div className="distribution-list">{poolRows.map((pool, index) => {
            const share = total > 0n ? Number(pool.volume * 10000n / total) / 100 : 0;
            return <div className="distribution-row" key={pool.address}><div><span className={`distribution-dot pool-color-${index}`}/><strong>{pool.name}</strong><span>{sol(pool.volume.toString())} SOL</span></div><div className="distribution-track"><span className={`pool-color-${index}`} style={{ width: `${share}%` }}/></div><small>{share.toFixed(1)}% of total</small></div>;
          })}</div><div className="distribution-note">Volume share describes activity, not token safety.</div></section></div>
          {poolTable()}
          <div className="investigation-grid"><div>{alertsPanel()}</div>{evidencePanel()}</div>
        </>}
        {view === "Launches" && launchBoard()}
        {view === "Alerts" && <div className="investigation-grid"><div>{alertsPanel()}</div>{evidencePanel()}</div>}
        {view === "Wallet Graph" && <><WalletGraph snapshot={snapshot}/><div className="investigation-grid"><div>{alertsPanel()}</div>{evidencePanel()}</div></>}
        {view === "Launch Autopsy" && <div className="replay-grid"><section className="panel replay-controls"><span className="eyebrow">HISTORICAL REPLAY</span><h2>Follow the first 90 seconds.</h2><p className="subtle">Select a pool and an observation window. The same events and rule version produce the same digest.</p>
          <label>Pool<select disabled={pending} value={poolId} onChange={event => { setPoolId(event.target.value); setResult(null); }}>{snapshot.pools.map(pool => <option key={pool.address} value={pool.address}>{pool.name} / {pool.symbol}</option>)}</select></label>
          <label>Seconds after creation <strong>{cutoff}s</strong><input disabled={pending} type="range" min="0" max="90" value={cutoff} onChange={event => { setCutoff(Number(event.target.value)); setResult(null); }}/></label><button className="primary full" disabled={pending} onClick={runReplay}>{pending ? "Replaying events…" : "Run deterministic replay ↗"}</button>
          <div aria-live="polite">{error && <p className="error" role="alert">{error}</p>}{result && <div className="replay-result"><span className="badge green">Replay complete</span><h3>{result.alerts.length} signals · {result.eventCount} events</h3><p>Rule version {result.ruleVersion}</p><span className="eyebrow">SHA-256 DATASET + RULE DIGEST</span><code>{result.digest}</code>{result.alerts.map(alert => <p key={alert.id}>{alert.title}</p>)}</div>}</div></section>
          <section className="panel"><div className="panel-heading"><div><span className="eyebrow">{pool.symbol} / EVENT TIMELINE</span><h2>Launch reconstruction</h2></div><span className="badge neutral">0–{cutoff}s</span></div><ol className="timeline">{selectedEvents.filter(event => event.timestamp <= pool.createdAt + cutoff).map(event => <li key={event.id}><time>00:{String(event.timestamp - pool.createdAt).padStart(2, "0")}</time><span className={`timeline-dot ${event.kind}`}/><div><strong>{eventLabel(event)}</strong><code>{event.signature}</code><small>Finalized fixture · slot {event.slot}</small></div></li>)}</ol></section></div>}
        <footer><span>Sentinel AI <span className="footer-dot">·</span> Evidence-first intelligence</span><span>Research tool. Signals are not proof of wrongdoing.</span></footer>
      </main></div></div>;
}
