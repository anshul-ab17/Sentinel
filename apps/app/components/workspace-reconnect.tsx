"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { BrandLogo } from "@app/components/brand-logo";

export function WorkspaceReconnect() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !pending) {
        startTransition(() => router.refresh());
      }
    }, 15000);
    return () => window.clearInterval(timer);
  }, [router, pending]);

  return <main className="workspace-reconnect">
    <div className="workspace-reconnect-card">
      <Link href="/" className="workspace-reconnect-brand" aria-label="Sentinel home"><BrandLogo size={36}/>sentinel</Link>
      <h1>A brief pause.</h1>
      <p>Your workspace is temporarily unavailable. We’ll reconnect automatically when it’s ready.</p>
      <div className="workspace-reconnect-actions">
        <button className="secondary" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Reconnecting…" : "Reconnect"}</button>
        <Link href="/">Back to home</Link>
      </div>
      <span className="workspace-reconnect-status" role="status">{pending ? "Checking your connection…" : "Checking again shortly"}</span>
    </div>
  </main>;
}
