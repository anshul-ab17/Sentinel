"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Snapshot } from "@shared/snapshot";
import { ActivityChart } from "@app/components/activity-chart";
import { DashboardModule, type ModuleView } from "@app/components/dashboard-module";
import { DashboardOverview } from "@app/components/dashboard-overview";
import { Icon } from "@app/components/icon";
import { SidebarProvider } from "@app/components/ui/sidebar";
import { WalletGraph } from "@app/components/wallet-graph";
import { CoverageStatus } from "@app/components/dashboard/coverage-status";
import { DashboardNavigation } from "./dashboard/navigation-shell";
import { LaunchReplay, type ReplayResult } from "./dashboard/replay";
import { PoolTable, LaunchBoard } from "./dashboard/launches";
import { InvestigationPanels } from "./dashboard/signals";
import { views, type View } from "./dashboard/navigation";
import { useSnapshot } from "./dashboard/use-snapshot";
import { useSavedInvestigations } from "./dashboard/use-saved-investigations";
import "@app/app/dashboard/dashboard.css";
import "@app/app/dashboard/premium-dashboard.css";
import "@app/app/dashboard/reference-dashboard.css";

export function Dashboard({ snapshot: initialSnapshot }: { snapshot: Snapshot }) {
  const { snapshot, poolId, setPoolId } = useSnapshot(initialSnapshot);
  const [view, setView] = useState<View>("Overview");
  const [query, setQuery] = useState("");
  const [selectedAlert, setSelectedAlert] = useState<string | null>(snapshot.alerts[0]?.id ?? null);
  const [severity, setSeverity] = useState("all");
  const [poolFilter, setPoolFilter] = useState<"all" | "flagged">("all");
  const [sort, setSort] = useState<"volume" | "name" | "signals">("volume");
  const [cutoff, setCutoff] = useState(90);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { savedIds, toggleSaved } = useSavedInvestigations(snapshot, setError);
  const [sidebarWidth, setSidebarWidth] = useState(244);
  const pool = snapshot.pools.find((pool) => pool.address === poolId)!;
  const alert = snapshot.alerts.find((alert) => alert.id === selectedAlert);
  const selectedEvents = snapshot.events.filter((event) => event.pool === poolId);
  const poolRows = snapshot.pools.map((pool) => {
    const buys = snapshot.events.filter(
      (event) => event.pool === pool.address && event.kind === "buy",
    );
    return {
      ...pool,
      buys: buys.length,
      volume: buys.reduce(
        (sum, event) => sum + (event.kind === "buy" ? BigInt(event.quoteLamports) : 0n),
        0n,
      ),
      signals: snapshot.alerts.filter((alert) => alert.pool === pool.address).length,
    };
  });
  const filteredPools = poolRows
    .filter(
      (pool) =>
        `${pool.name} ${pool.symbol} ${pool.address}`.toLowerCase().includes(query.toLowerCase()) &&
        (poolFilter === "all" || pool.signals > 0),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "signals"
          ? b.signals - a.signals || a.name.localeCompare(b.name)
          : a.volume === b.volume
            ? a.name.localeCompare(b.name)
            : a.volume > b.volume
              ? -1
              : 1,
    );
  const filteredAlerts = snapshot.alerts.filter(
    (alert) =>
      (severity === "all" || alert.severity === severity) &&
      `${alert.title} ${alert.pool}`.toLowerCase().includes(query.toLowerCase()),
  );
  const investigationPanelProps = {
    snapshot,
    filteredAlerts,
    severity,
    setSeverity,
    selectedAlert,
    setSelectedAlert,
    alert,
    savedIds,
    toggleSaved,
    exportReport,
  };

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("sentinel-sidebar-width"));
      if (Number.isFinite(saved) && saved >= 44 && saved <= 360)
        setSidebarWidth(saved >= 132 ? 244 : 56);
    } catch {
      /* Keep the default sidebar width when storage is unavailable. */
    }
  }, []);

  function persistSidebarWidth(width: number) {
    const next = width >= 132 ? 244 : 56;
    setSidebarWidth(next);
    try {
      localStorage.setItem("sentinel-sidebar-width", String(next));
    } catch {
      /* Resizing still works when storage is unavailable. */
    }
  }

  async function runReplay() {
    setPending(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/investigations/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool: poolId, through: pool.createdAt + cutoff }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Replay failed");
      setResult(data);
    } catch {
      setError("We couldn’t complete the replay right now. Please try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  function exportReport() {
    if (!alert) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            coverage: snapshot.coverage,
            alert,
            events: snapshot.events.filter((event) => alert.evidence.includes(event.id)),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sentinel-${alert.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <SidebarProvider
      open={sidebarWidth >= 132}
      onOpenChange={(open) => persistSidebarWidth(open ? 244 : 56)}
    >
      <div
        className="app-shell dashboard-shell"
        data-sidebar-collapsed={sidebarWidth < 132}
        style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
      >
        <a className="dashboard-skip" href="#dashboard-content">
          Skip to dashboard
        </a>
        <DashboardNavigation
          snapshot={snapshot}
          view={view}
          setView={setView}
          setQuery={setQuery}
          setPoolId={setPoolId}
          setSelectedAlert={setSelectedAlert}
        />
        <div className="main-shell">
          <main id="dashboard-content">
            <div className="page-heading">
              <div>
                <h1>{views.find((item) => item.name === view)?.label ?? view}</h1>
                <p>
                  {view === "Overview"
                    ? "Launch intelligence, backed by evidence."
                    : view === "Launch Autopsy"
                      ? "Replay a launch and trace each finding to its evidence."
                      : "Explore activity and the evidence behind each signal."}
                </p>
              </div>
              <div className="dashboard-heading-actions">
                <span className="dashboard-sample-window">
                  <Icon name="calendar" size={17} />
                  {snapshot.coverage.mode === "fixture" ? "Fixture window" : "Finalized window"}
                </span>
                <button
                  className="primary"
                  onClick={() => {
                    setView("Launch Autopsy");
                    setQuery("");
                  }}
                >
                  <Icon name="replay" size={15} /> Replay launch
                </button>
              </div>
            </div>
            <CoverageStatus coverage={snapshot.coverage} />
            {error && <p role="alert">{error}</p>}
            {view === "Overview" && (
              <DashboardOverview
                snapshot={snapshot}
                onLaunch={(id) => {
                  setPoolId(id);
                  setResult(null);
                  setView("Launch Autopsy");
                }}
                onEvidence={(item) => {
                  setSelectedAlert(item.id);
                  setView("Alerts");
                }}
                onLaunches={() => setView("Launches")}
                onAlerts={() => setView("Alerts")}
                onGraph={() => setView("Wallet Graph")}
              />
            )}
            {view === "DBC Explorer" && (
              <PoolTable
                snapshot={snapshot}
                filteredPools={filteredPools}
                poolFilter={poolFilter}
                setPoolFilter={setPoolFilter}
                sort={sort}
                setSort={setSort}
                setPoolId={setPoolId}
                setResult={setResult}
                setView={setView}
              />
            )}
            {view === "Analytics" && (
              <>
                <ActivityChart snapshot={snapshot} />
                <WalletGraph snapshot={snapshot} />
              </>
            )}
            {view === "Funding Graph" && (
              <WalletGraph key="funding" snapshot={snapshot} initialFilter="funding" />
            )}
            {view === "Anomaly Engine" && <InvestigationPanels {...investigationPanelProps} />}
            {(
              [
                "Whale Tracker",
                "Holder Concentration",
                "Liquidity Monitor",
                "Saved investigations",
                "Settings",
              ] as View[]
            ).includes(view) && (
              <DashboardModule
                view={view as ModuleView}
                snapshot={snapshot}
                savedIds={savedIds}
                onEvidence={(item) => {
                  setSelectedAlert(item.id);
                  setView("Alerts");
                }}
              />
            )}
            {view === "Launches" && (
              <LaunchBoard
                snapshot={snapshot}
                filteredPools={filteredPools}
                setPoolId={setPoolId}
                setResult={setResult}
                setView={setView}
              />
            )}
            {view === "Alerts" && <InvestigationPanels {...investigationPanelProps} />}
            {view === "Wallet Graph" && (
              <>
                <WalletGraph snapshot={snapshot} />
                <InvestigationPanels {...investigationPanelProps} />
              </>
            )}
            {view === "Launch Autopsy" && (
              <LaunchReplay
                snapshot={snapshot}
                pool={pool}
                poolId={poolId}
                selectedEvents={selectedEvents}
                cutoff={cutoff}
                pending={pending}
                error={error}
                result={result}
                setPoolId={setPoolId}
                setResult={setResult}
                setCutoff={setCutoff}
                runReplay={runReplay}
              />
            )}
            <footer>
              <span>
                Sentinel AI <span className="footer-dot">·</span> Evidence-first intelligence
              </span>
              <span>Research tool. Signals are not proof of wrongdoing.</span>
            </footer>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
