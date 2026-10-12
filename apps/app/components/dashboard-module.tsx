"use client";

import type { Snapshot } from "@shared/snapshot";
import type { Alert } from "@shared/events";
import { Icon } from "@app/components/icon";
import { ThemeToggle } from "@app/components/theme-toggle";

export type ModuleView = "Whale Tracker" | "Holder Concentration" | "Liquidity Monitor" | "Saved investigations" | "Settings";

export function DashboardModule({ view, snapshot, savedIds, onEvidence }: {
  view: ModuleView; snapshot: Snapshot; savedIds: string[]; onEvidence: (alert: Alert) => void;
}) {
  if (view === "Settings") return <section className="panel module-settings"><div className="panel-heading"><div><h2>Workspace preferences</h2><p>Customize your investigation workspace.</p></div></div><div className="module-setting-row"><div><strong>Appearance</strong><p>Switch between light and dark mode.</p></div><ThemeToggle/></div></section>;
  if (view === "Whale Tracker") {
    const transfers = snapshot.events.filter(event => event.kind === "transfer");
    return <section className="panel"><div className="panel-heading"><div><h2>Observed large transfers</h2><p>SOL movements in the observation window</p></div><span className="count-label">{transfers.length}</span></div><div className="table-scroll"><table><thead><tr><th>Source wallet</th><th>Recipient</th><th>Amount (SOL)</th><th>Time (UTC)</th><th>Evidence</th></tr></thead><tbody>{transfers.map(event => <tr key={event.id}><td><code>{event.wallet}</code></td><td><code>{event.recipient}</code></td><td>{(Number(event.lamports) / 1e9).toLocaleString("en-US")}</td><td>{new Date(event.timestamp * 1000).toISOString().slice(11, 19)}</td><td>{snapshot.alerts.filter(alert => alert.evidence.includes(event.id)).map(alert => <button key={alert.id} className="text-button" onClick={() => onEvidence(alert)}>View evidence<Icon name="arrow" size={14}/></button>)}</td></tr>)}</tbody></table>{!transfers.length && <p className="empty">No transfers in this sample.</p>}</div></section>;
  }
  if (view === "Saved investigations") {
    const saved = snapshot.alerts.filter(alert => savedIds.includes(alert.id));
    return <section className="panel"><div className="panel-heading"><div><h2>Saved investigations</h2><p>Evidence saved in this browser</p></div><span className="count-label">{saved.length}</span></div>{saved.map(alert => <button key={alert.id} className="alert-row" onClick={() => onEvidence(alert)}><Icon name="bookmark" size={18}/><span className="alert-copy"><strong>{alert.title}</strong><span>{snapshot.pools.find(pool => pool.address === alert.pool)?.name ?? alert.pool}</span></span><Icon name="arrow" size={16}/></button>)}{!saved.length && <div className="module-empty"><Icon name="bookmark" size={30}/><h3>Keep an investigation close.</h3><p>Open a signal and choose “Save investigation” to find it here.</p></div>}</section>;
  }
  const holder = view === "Holder Concentration";
  return <section className="panel"><div className="panel-heading"><div><h2>{view}</h2><p>{holder ? "Token holder distribution" : "Pool liquidity observations"}</p></div></div><div className="module-empty"><Icon name={holder ? "pie" : "drop"} size={30}/><h3>{holder ? "Holder balances are not available yet." : "Liquidity records are not available yet."}</h3><p>{holder ? "This sample contains purchases and funding links. Holder concentration requires token balance data." : "This sample contains launch, purchase, funding, and transfer events. Liquidity monitoring requires pool reserve data."}</p>{holder && snapshot.alerts.filter(alert => alert.rule.id === "early-buyer-concentration").map(alert => <button key={alert.id} className="secondary" onClick={() => onEvidence(alert)}>Inspect early buying<Icon name="arrow" size={14}/></button>)}</div></section>;
}
