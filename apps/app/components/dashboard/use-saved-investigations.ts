"use client";
import { useEffect, useState } from "react";

import type { Snapshot } from "@shared/snapshot";

export function useSavedInvestigations(snapshot: Snapshot, setError: (error: string) => void) {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedRecords, setSavedRecords] = useState<Record<string, string>>({});
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await fetch("/v1/investigations", { credentials: "same-origin" });
        const rows: { id: string; notes: string }[] = response.ok
          ? (await response.json()).data
          : [];
        const records = Object.fromEntries(
          rows
            .filter((row) => row.notes.startsWith("signal:"))
            .map((row) => [row.notes.slice(7), row.id]),
        );
        if (!stopped) {
          setSavedRecords(records);
          setSavedIds(Object.keys(records));
        }
      } catch {
        if (!stopped) {
          setSavedRecords({});
          setSavedIds([]);
        }
      }
    };
    void refresh();
    window.addEventListener("sentinel-session", refresh);
    return () => {
      stopped = true;
      window.removeEventListener("sentinel-session", refresh);
    };
  }, []);
  async function toggleSaved(id: string) {
    const signal = snapshot.alerts.find((alert) => alert.id === id);
    if (!signal) return;
    try {
      const existing = savedRecords[id];
      const response = await fetch(
        existing ? `/v1/investigations/${existing}` : "/v1/investigations",
        {
          method: existing ? "DELETE" : "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: existing
            ? undefined
            : JSON.stringify({
                name: signal.title,
                pool_address: signal.pool,
                notes: `signal:${id}`,
              }),
        },
      );
      if (!response.ok) {
        setError(
          response.status === 401
            ? "Connect your wallet in Settings to save a private investigation."
            : "Could not save this investigation. Please retry.",
        );
        return;
      }
      const records = { ...savedRecords };
      if (existing) delete records[id];
      else records[id] = (await response.json()).data.id;
      setSavedRecords(records);
      setSavedIds(Object.keys(records));
      setError("");
    } catch {
      setError("Could not save this investigation. Please retry.");
    }
  }
  return { savedIds, toggleSaved };
}
