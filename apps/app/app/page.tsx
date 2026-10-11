import type { Snapshot } from "@shared/snapshot";
import { Dashboard } from "@app/components/dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  let snapshot: Snapshot;
  try {
    const response = await fetch(`${process.env.API_SERVER_URL ?? "http://127.0.0.1:4000"}/api/snapshot`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("Backend unavailable");
    snapshot = await response.json();
  } catch {
    return <main className="offline"><h1>Sentinel backend is offline.</h1><p>Start both apps with <code>pnpm dev</code>, or run <code>pnpm dev:server</code> separately.</p><a href="/">Try again ↗</a></main>;
  }
  return <Dashboard snapshot={snapshot} />;
}
