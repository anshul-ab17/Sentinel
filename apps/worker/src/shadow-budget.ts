import type { Database } from "../../../packages/database/store.ts";

export async function reserveDailyShadowRequest(db: Database, dailyLimit: number) {
  if (!Number.isSafeInteger(dailyLimit) || dailyLimit <= 0) return false;
  const result = await db.query(
    `INSERT INTO ai_shadow_budget_usage(usage_day,requests_reserved)
     VALUES((now() AT TIME ZONE 'UTC')::date,1)
     ON CONFLICT(usage_day) DO UPDATE
       SET requests_reserved=ai_shadow_budget_usage.requests_reserved+1,updated_at=now()
       WHERE ai_shadow_budget_usage.requests_reserved<$1
     RETURNING requests_reserved`,
    [dailyLimit],
  );
  return Boolean(result.rowCount);
}

export function jevTokenUsage(value: unknown) {
  if (!value || typeof value !== "object") return { input: 0, output: 0 };
  const usage = (value as { usage?: Record<string, unknown> }).usage;
  if (!usage) return { input: 0, output: 0 };
  const input = usage.input_tokens,
    output = usage.output_tokens;
  return {
    input: Number.isSafeInteger(input) && Number(input) >= 0 ? Number(input) : 0,
    output: Number.isSafeInteger(output) && Number(output) >= 0 ? Number(output) : 0,
  };
}

export function jevClassification(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const answer = (value as { answers?: { classification?: { choice?: unknown } } }).answers
    ?.classification?.choice;
  return typeof answer === "string" ? answer : null;
}
