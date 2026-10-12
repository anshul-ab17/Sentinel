export type CoverageEnvelope<T> = {
  data: T;
  as_of_slot: string | null;
  commitment: string;
  observed_at: string | null;
  freshness: string;
  coverage: { mode: string; status: string; limitations: string[] };
};
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "request_failed");
  return data;
}
