import type { Event, Pool } from "@shared/events";

export const EPOCH = 1791691200;
export const pools: Pool[] = [
  {
    address: "demo-orbit-pool",
    name: "Orbit",
    symbol: "ORBIT",
    baseMint: "demo-orbit-mint",
    quoteMint: "demo-wrapped-sol",
    createdAt: EPOCH,
  },
  {
    address: "demo-moss-pool",
    name: "Moss",
    symbol: "MOSS",
    baseMint: "demo-moss-mint",
    quoteMint: "demo-wrapped-sol",
    createdAt: EPOCH + 180,
  },
  {
    address: "demo-tide-pool",
    name: "Tide",
    symbol: "TIDE",
    baseMint: "demo-tide-mint",
    quoteMint: "demo-wrapped-sol",
    createdAt: EPOCH + 360,
  },
];

export const events: Event[] = [];
for (const [poolIndex, pool] of pools.entries()) {
  let sequence = 0;
  const base = (offset: number) => {
    const index = sequence++;
    return {
      id: `${pool.address}-event-${index}`,
      signature: `synthetic-${pool.symbol.toLowerCase()}-${index}`,
      eventIndex: 0,
      slot: 300000000 + poolIndex * 1000 + index,
      timestamp: pool.createdAt + offset,
      pool: pool.address,
      commitment: "finalized" as const,
    };
  };
  events.push({
    ...base(0),
    kind: "pool_created",
    baseMint: pool.baseMint,
    quoteMint: pool.quoteMint,
  });
  if (poolIndex === 0) {
    for (let i = 0; i < 3; i++)
      events.push({
        ...base(5 + i),
        kind: "funding",
        wallet: `demo-orbit-buyer-${i}`,
        source: "demo-common-funder",
        lamports: "40000000000",
      });
  }
  const amounts = poolIndex === 0 ? [32, 28, 20, 5, 5, 5, 5] : [10, 12, 9, 11, 10, 8, 10];
  for (const [index, amount] of amounts.entries()) {
    events.push({
      ...base(12 + index * 10),
      kind: "buy",
      wallet: `demo-${pool.symbol.toLowerCase()}-buyer-${index}`,
      quoteLamports: (BigInt(amount) * 1000000000n).toString(),
    });
  }
  if (poolIndex === 0)
    events.push({
      ...base(80),
      kind: "transfer",
      wallet: "demo-orbit-buyer-0",
      recipient: "demo-destination",
      lamports: "125000000000",
    });
}
