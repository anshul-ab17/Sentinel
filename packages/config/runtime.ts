export type RuntimeConfig = ReturnType<typeof loadConfig>;
export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const mode = env.APP_MODE ?? "live";
  if (mode !== "fixture" && mode !== "live") throw new Error("APP_MODE must be fixture or live");
  const cluster = env.SOLANA_CLUSTER ?? "mainnet-beta";
  if (!["mainnet-beta", "devnet", "testnet"].includes(cluster))
    throw new Error("Invalid SOLANA_CLUSTER");
  const aiMode = env.AI_MODE ?? "off";
  if (!["off", "shadow"].includes(aiMode)) throw new Error("AI_MODE must be off or shadow");
  const origin = env.APP_ORIGIN ?? "http://localhost:3000";
  const url = new URL(origin);
  if (origin !== url.origin) throw new Error("APP_ORIGIN must be an origin without a path");
  const domain = env.AUTH_DOMAIN ?? url.host;
  if (domain !== url.host) throw new Error("AUTH_DOMAIN must match APP_ORIGIN host");
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl)
    throw new Error("DATABASE_URL is required; start PostgreSQL and run db:migrate");
  const defaultRpcUrls: Record<string, string> = {
    "mainnet-beta": "https://api.mainnet.solana.com",
    devnet: "https://api.devnet.solana.com",
    testnet: "https://api.testnet.solana.com",
  };
  if (
    aiMode === "shadow" &&
    (!env.TYPESAFE_API_KEY || !env.JEV_MODEL || /latest/.test(env.JEV_MODEL))
  )
    throw new Error("Shadow mode requires TYPESAFE_API_KEY and a pinned JEV_MODEL");
  const port = Number(env.PORT ?? "4000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  return {
    mode: mode as "fixture" | "live",
    cluster,
    aiMode: aiMode as "off" | "shadow",
    origin,
    domain,
    databaseUrl,
    port,
    host: env.HOST ?? "127.0.0.1",
    secureCookies: url.protocol === "https:",
    rpcUrl: env.SOLANA_HTTP_URL || defaultRpcUrls[cluster],
    rpcFallbackUrls: (env.SOLANA_HTTP_FALLBACK_URLS ?? env.SOLANA_HTTP_FALLBACK_URL ?? "")
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean),
    jevModel: env.JEV_MODEL,
    jevKey: env.TYPESAFE_API_KEY,
    jevBaseUrl: env.TYPESAFE_BASE_URL ?? "https://api.typesafe.ai",
  };
}
