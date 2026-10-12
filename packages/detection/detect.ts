import { createHash } from "node:crypto";

import type { Alert, Event, RuleId } from "@shared/events";

export const RULE_CONFIG = Object.freeze({
  version: "0.1.0",
  windowSeconds: 90,
  minimumBuyers: 5,
  topBuyerCount: 3,
  concentrationBps: 7500,
  minimumLinkedBuyers: 3,
  linkedShareBps: 5000,
  largeTransferLamports: "100000000000",
});

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Finalized only. Duplicate notifications cannot inflate metrics. Conflicts fail closed. */
export function normalize(events: readonly Event[]): Event[] {
  const unique = new Map<string, Event>();
  const ids = new Set<string>();
  for (const event of events) {
    if (event.commitment !== "finalized") continue;
    if (
      !Number.isSafeInteger(event.timestamp) ||
      !Number.isSafeInteger(event.slot) ||
      !Number.isSafeInteger(event.eventIndex) ||
      event.eventIndex < 0 ||
      event.slot < 0
    ) {
      throw new Error("Invalid event ordering fields");
    }
    const amount =
      event.kind === "buy"
        ? event.quoteLamports
        : event.kind === "funding" || event.kind === "transfer"
          ? event.lamports
          : undefined;
    if (amount !== undefined && !/^[1-9]\d*$/.test(amount))
      throw new Error("Amounts must be positive integer strings");
    const key = `${event.signature}:${event.eventIndex}`;
    const previous = unique.get(key);
    if (previous) {
      const canonical = (value: Event) =>
        JSON.stringify(Object.entries(value).sort(([a], [b]) => cmp(a, b)));
      if (canonical(previous) !== canonical(event)) throw new Error(`Conflicting event ${key}`);
      continue;
    }
    if (ids.has(event.id)) throw new Error(`Duplicate event ID ${event.id}`);
    ids.add(event.id);
    unique.set(key, event);
  }
  return [...unique.values()].sort(
    (a, b) =>
      a.timestamp - b.timestamp ||
      a.slot - b.slot ||
      cmp(a.signature, b.signature) ||
      a.eventIndex - b.eventIndex,
  );
}

function alert(
  pool: string,
  rule: RuleId,
  title: string,
  observation: string,
  interpretation: string,
  events: Event[],
  metrics: Alert["metrics"],
  severity: Alert["severity"],
): Alert {
  const evidence = [...new Set(events.map((event) => event.id))].sort(cmp);
  const digest = createHash("sha256")
    .update(JSON.stringify([pool, rule, RULE_CONFIG.version, evidence]))
    .digest("hex")
    .slice(0, 24);
  return {
    id: digest,
    pool,
    rule: { id: rule, version: "0.1.0" },
    title,
    observation,
    interpretation,
    metrics,
    severity,
    evidence,
    timestamp: Math.max(...events.map((event) => event.timestamp)),
  };
}

/** Evaluate a snapshot. Amounts use integer arithmetic; shares use basis points. */
export function detect(input: readonly Event[]): Alert[] {
  const events = normalize(input);
  const alerts: Alert[] = [];
  const pools = events.filter((event) => event.kind === "pool_created");
  if (new Set(pools.map((pool) => pool.pool)).size !== pools.length)
    throw new Error("Multiple creation events for one pool");
  for (const pool of pools) {
    const buys = events.filter(
      (event): event is Event & { kind: "buy" } =>
        event.kind === "buy" &&
        event.pool === pool.pool &&
        event.timestamp >= pool.timestamp &&
        event.timestamp <= pool.timestamp + RULE_CONFIG.windowSeconds,
    );
    const volumes = new Map<string, bigint>();
    for (const buy of buys)
      volumes.set(buy.wallet, (volumes.get(buy.wallet) ?? 0n) + BigInt(buy.quoteLamports));
    const total = [...volumes.values()].reduce((sum, amount) => sum + amount, 0n);
    if (volumes.size >= RULE_CONFIG.minimumBuyers && total > 0n) {
      const ranked = [...volumes.entries()].sort(([a, av], [b, bv]) =>
        av === bv ? cmp(a, b) : av > bv ? -1 : 1,
      );
      const top = ranked
        .slice(0, RULE_CONFIG.topBuyerCount)
        .reduce((sum, [, amount]) => sum + amount, 0n);
      const share = Number((top * 10000n) / total);
      if (share >= RULE_CONFIG.concentrationBps) {
        alerts.push(
          alert(
            pool.pool,
            "early-buyer-concentration",
            "Early buying is concentrated",
            `The top 3 of ${volumes.size} observed buyers account for ${(share / 100).toFixed(2)}% of early buy volume.`,
            "Concentration warrants review. It does not establish common ownership or manipulation.",
            [pool, ...buys],
            {
              buyerCount: volumes.size,
              topBuyerCount: 3,
              shareBps: share,
              windowSeconds: 90,
              totalQuoteLamports: total.toString(),
            },
            "high",
          ),
        );
      }
      const sources = new Map<string, Set<string>>();
      const funding = events.filter(
        (event): event is Event & { kind: "funding" } =>
          event.kind === "funding" &&
          event.pool === pool.pool &&
          buys.some((buy) => buy.wallet === event.wallet && event.timestamp < buy.timestamp),
      );
      for (const event of funding) {
        if (event.source === event.wallet) continue;
        const wallets = sources.get(event.source) ?? new Set<string>();
        wallets.add(event.wallet);
        sources.set(event.source, wallets);
      }
      for (const [source, wallets] of [...sources.entries()].sort(([a], [b]) => cmp(a, b))) {
        const linked = [...wallets].reduce((sum, wallet) => sum + (volumes.get(wallet) ?? 0n), 0n);
        const share = Number((linked * 10000n) / total);
        if (wallets.size < RULE_CONFIG.minimumLinkedBuyers || share < RULE_CONFIG.linkedShareBps)
          continue;
        alerts.push(
          alert(
            pool.pool,
            "shared-funding",
            "Buyers share an observed funder",
            `${wallets.size} buyers received funds from ${source} and account for ${(share / 100).toFixed(2)}% of observed early buying.`,
            "A shared funder may be an exchange or service. This link does not prove coordination or ownership.",
            [pool, ...buys, ...funding.filter((event) => event.source === source)],
            { source, linkedWalletCount: wallets.size, shareBps: share, windowSeconds: 90 },
            "medium",
          ),
        );
      }
    }
  }
  for (const event of events) {
    if (
      event.kind !== "transfer" ||
      BigInt(event.lamports) < BigInt(RULE_CONFIG.largeTransferLamports)
    )
      continue;
    alerts.push(
      alert(
        event.pool,
        "large-transfer",
        "Large SOL transfer",
        `${event.lamports} lamports moved from ${event.wallet} to ${event.recipient}.`,
        "The transfer exceeds the configured 100 SOL threshold. Intent is unknown.",
        [event],
        { lamports: event.lamports, thresholdLamports: RULE_CONFIG.largeTransferLamports },
        "medium",
      ),
    );
  }
  return alerts.sort((a, b) => a.timestamp - b.timestamp || cmp(a.id, b.id));
}
