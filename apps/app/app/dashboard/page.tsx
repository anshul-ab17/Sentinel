import type { Metadata } from "next";
import type { Snapshot } from "@shared/snapshot";
import { Dashboard } from "@app/components/dashboard";
import { WorkspaceReconnect } from "@app/components/workspace-reconnect";

export const metadata: Metadata = { title: "Dashboard · Sentinel" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  let snapshot: Snapshot;
  try {
    const response = await fetch(`${process.env.API_SERVER_URL ?? "http://127.0.0.1:4000"}/api/snapshot`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Backend unavailable");
    snapshot = await response.json();
  } catch (error) {
    console.error("Dashboard snapshot unavailable:", error);
    return <WorkspaceReconnect />;
  }
  return <Dashboard snapshot={snapshot} />;
}
