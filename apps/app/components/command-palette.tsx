"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Snapshot } from "@shared/snapshot";
import { Icon } from "@app/components/icon";

type View = "Overview" | "Launches" | "Alerts" | "Wallet Graph" | "Launch Autopsy";
type Result = { id: string; group: string; title: string; detail: string; icon: "grid" | "launch" | "signal" | "replay" | "graph"; action: () => void };

export function CommandPalette({
  snapshot, onView, onPool, onAlert,
}: {
  snapshot: Snapshot;
  onView: (view: View) => void;
  onPool: (poolId: string, search: string) => void;
  onAlert: (alertId: string, search: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    const commands: Result[] = [
      { id: "overview", group: "Commands", title: "Overview", detail: "Review launch activity and analytics", icon: "grid", action: () => onView("Overview") },
      { id: "launches", group: "Commands", title: "Launches", detail: "Browse pools and detection status", icon: "launch", action: () => onView("Launches") },
      { id: "alerts", group: "Commands", title: "Alerts", detail: "Inspect signals and their evidence", icon: "signal", action: () => onView("Alerts") },
      { id: "wallet-graph", group: "Commands", title: "Wallet Graph", detail: "Trace observed funding connections", icon: "graph", action: () => onView("Wallet Graph") },
      { id: "autopsy", group: "Commands", title: "Launch Autopsy", detail: "Replay a launch timeline", icon: "replay", action: () => onView("Launch Autopsy") },
    ];
    const pools: Result[] = snapshot.pools.filter(pool => !term || `${pool.name} ${pool.symbol} ${pool.address}`.toLowerCase().includes(term)).map(pool => ({
      id: pool.address, group: term ? "Launches" : "Recent launches", title: `${pool.name} (${pool.symbol})`, detail: pool.address,
      icon: "launch", action: () => onPool(pool.address, pool.symbol),
    }));
    const alerts: Result[] = snapshot.alerts.filter(alert => !term || `${alert.title} ${alert.pool} ${alert.severity}`.toLowerCase().includes(term)).map(alert => ({
      id: alert.id, group: "Signals", title: alert.title, detail: `${alert.severity} · ${alert.pool}`, icon: "signal",
      action: () => onAlert(alert.id, alert.title),
    }));
    return [...(term ? commands.filter(item => `${item.title} ${item.detail}`.toLowerCase().includes(term)) : commands), ...pools, ...alerts];
  }, [onAlert, onPool, onView, query, snapshot]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(value => !value);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      setActive(0);
      requestAnimationFrame(() => input.current?.focus());
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = previousOverflow; };
    } else if (wasOpen.current) {
      wasOpen.current = false;
      setQuery("");
      requestAnimationFrame(() => trigger.current?.focus());
    }
  }, [open]);

  function choose(result: Result) {
    result.action();
    setOpen(false);
  }

  function navigateResults(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown" && results.length) { event.preventDefault(); setActive(index => (index + 1) % results.length); }
    if (event.key === "ArrowUp" && results.length) { event.preventDefault(); setActive(index => (index - 1 + results.length) % results.length); }
    if (event.key === "Enter" && results[active]) { event.preventDefault(); choose(results[active]); }
  }

  const grouped = results.reduce<Record<string, Result[]>>((groups, result) => {
    (groups[result.group] ??= []).push(result);
    return groups;
  }, {});
  let resultIndex = 0;

  return <>
    <button ref={trigger} type="button" className="search palette-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
      <Icon name="search" size={16}/><span className="palette-trigger-label">Search launches and commands...</span><kbd><span>⌘</span><span>K</span></kbd>
    </button>
    {open && <div className="command-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-labelledby="command-heading" onKeyDown={navigateResults}>
        <h2 id="command-heading" className="visually-hidden">Search launches and commands</h2>
        <div className="command-input-wrap"><span aria-hidden="true">⌕</span><input ref={input} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} placeholder="Search launches and commands..." aria-label="Search launches and commands" aria-activedescendant={results[active] ? `command-result-${active}` : undefined} aria-controls="command-results" role="combobox" aria-expanded="true" aria-autocomplete="list"/><kbd>ESC</kbd></div>
        <div className="command-results" id="command-results" role="listbox" aria-label="Search results">
          {Object.entries(grouped).map(([group, items]) => <div className="command-group" key={group}><p>{group}</p>{items.map(item => {
            const index = resultIndex++;
            return <button type="button" role="option" aria-selected={active === index} id={`command-result-${index}`} className="command-result" key={`${item.group}-${item.id}`} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}><span className="command-result-icon"><Icon name={item.icon} size={16}/></span><span className="command-result-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><span className="command-result-type">{item.group === "Commands" ? "Command" : item.group === "Signals" ? "Alert" : "Launch"}</span></button>;
          })}</div>)}
          {results.length === 0 && <p className="command-empty">No launches or signals found.</p>}
        </div>
        <footer className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span><kbd>esc</kbd> Close</span></footer>
      </section>
    </div>}
  </>;
}
