const PANTA_API = "https://live-api.panta.market/api/v1";
const MAX_RESPONSE_BYTES = 1_000_000;

export type PantaMarketQuery = {
  category?: string;
  status?: "primary" | "secondary" | "resolved" | "cancelled";
  cursor?: string;
  limit?: number;
};

export class PantaProviderError extends Error {
  readonly code: "provider_not_configured" | "upstream_unavailable" | "invalid_upstream_response";
  readonly httpStatus: number;

  constructor(
    code: "provider_not_configured" | "upstream_unavailable" | "invalid_upstream_response",
    httpStatus: number,
  ) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export async function listPantaMarkets(
  apiKey: string | undefined,
  query: PantaMarketQuery,
  fetcher: typeof fetch = fetch,
) {
  if (!apiKey) throw new PantaProviderError("provider_not_configured", 503);
  const url = new URL(`${PANTA_API}/markets/`);
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) url.searchParams.set(key, String(value));

  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new PantaProviderError("upstream_unavailable", 503);
  }
  if (!response.ok) throw new PantaProviderError("upstream_unavailable", 503);
  const text = await readBoundedText(response);

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new PantaProviderError("invalid_upstream_response", 502);
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray((payload as { items?: unknown }).items) ||
    !(
      (payload as { nextCursor?: unknown }).nextCursor === undefined ||
      (payload as { nextCursor?: unknown }).nextCursor === null ||
      typeof (payload as { nextCursor?: unknown }).nextCursor === "string"
    )
  )
    throw new PantaProviderError("invalid_upstream_response", 502);

  const items = (payload as { items: unknown[] }).items;
  if (!items.every(isMarket)) throw new PantaProviderError("invalid_upstream_response", 502);
  return {
    items,
    next_cursor: (payload as { nextCursor?: string | null }).nextCursor ?? null,
  };
}

async function readBoundedText(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES)
    throw new PantaProviderError("invalid_upstream_response", 502);
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new PantaProviderError("invalid_upstream_response", 502);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function isMarket(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const market = value as Record<string, unknown>;
  return (
    typeof market.marketId === "string" &&
    typeof market.category === "string" &&
    typeof market.title === "string" &&
    typeof market.phase === "string" &&
    typeof market.status === "string" &&
    (market.volumeUsdc === undefined || typeof market.volumeUsdc === "string")
  );
}
