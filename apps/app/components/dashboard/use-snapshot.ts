"use client";
import { useEffect, useRef, useState } from "react";

import type { Snapshot } from "@shared/snapshot";

export function useSnapshot(initialSnapshot: Snapshot) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const snapshotRef = useRef(initialSnapshot);
  const [poolId, setPoolId] = useState(snapshot.pools[0].address);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const response = await fetch("/api/snapshot", {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return;
        const next: Snapshot = await response.json();
        if (
          !stopped &&
          next.pools.length &&
          JSON.stringify(next) !== JSON.stringify(snapshotRef.current)
        ) {
          snapshotRef.current = next;
          setSnapshot(next);
          setPoolId((previous) =>
            next.pools.some((pool) => pool.address === previous) ? previous : next.pools[0].address,
          );
        }
      } catch {
        /* Keep the last covered snapshot while reconnecting. */
      }
    }
    const stream = new EventSource("/v1/stream");
    const invalidate = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 300);
    };
    for (const event of ["pool", "signal", "assessment"])
      stream.addEventListener(event, invalidate);
    const poll = setInterval(() => void refresh(), 15000);
    return () => {
      stopped = true;
      stream.close();
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, []);
  return { snapshot, poolId, setPoolId };
}
