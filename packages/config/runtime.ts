export type RuntimeConfig = ReturnType<typeof loadConfig>;
export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const mode = env.APP_MODE ?? "live";
  if (mode !== "fixture" && mode !== "live") throw new Error("APP_MODE must be fixture or live");
  const cluster = env.SOLANA_CLUSTER ?? "mainnet-beta";
  if (!["mainnet-beta", "devnet", "testnet"].includes(cluster))
    throw new Error("Invalid SOLANA_CLUSTER");
  const aiMode = env.AI_MODE ?? "off";
  if (!["off", "shadow"].includes(aiMode)) throw new Error("AI_MODE must be off or shadow");
  const aiDailyMaxRequests = Number(env.AI_DAILY_MAX_REQUESTS ?? "100");
  if (
    !Number.isSafeInteger(aiDailyMaxRequests) ||
    aiDailyMaxRequests < 0 ||
    aiDailyMaxRequests > 100_000
  )
    throw new Error("AI_DAILY_MAX_REQUESTS must be an integer from 0 to 100000");
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
  const rpcUrl =
    env.SOLANA_HTTP_URL || env.RPCFAST_HTTP_URL || env.SOLAMI_HTTP_URL || defaultRpcUrls[cluster];
  const rpcFallbackUrls = [
    env.RPCFAST_HTTP_URL,
    env.SOLAMI_HTTP_URL,
    env.SOLANA_HTTP_FALLBACK_URLS ?? env.SOLANA_HTTP_FALLBACK_URL ?? "",
  ]
    .filter(Boolean)
    .join(",")
    .split(",")
    .map((fallback) => fallback.trim())
    .filter(
      (fallback, index, urls) =>
        Boolean(fallback) && fallback !== rpcUrl && urls.indexOf(fallback) === index,
    );
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
    aiDailyMaxRequests,
    origin,
    domain,
    databaseUrl,
    redisUrl: env.REDIS_URL ?? "redis://127.0.0.1:6379",
    port,
    host: env.HOST ?? "127.0.0.1",
    secureCookies: url.protocol === "https:",
    rpcUrl,
    rpcFastHttpUrl: env.RPCFAST_HTTP_URL,
    solamiHttpUrl: env.SOLAMI_HTTP_URL,
    rpcFallbackUrls,
    rpcFastWsUrl: env.RPCFAST_WS_URL,
    solamiWsUrl: env.SOLAMI_WS_URL,
    pantaApiKey: env.PANTA_API_KEY,
    jevModel: env.JEV_MODEL,
    jevKey: env.TYPESAFE_API_KEY,
    jevBaseUrl: env.TYPESAFE_BASE_URL ?? "https://api.typesafe.ai",
  };
}
