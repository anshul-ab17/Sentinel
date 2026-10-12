export const sol = (amount: string) =>
  (Number(BigInt(amount) / 1000000n) / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
export const time = (timestamp: number) => new Date(timestamp * 1000).toISOString().slice(11, 19);
