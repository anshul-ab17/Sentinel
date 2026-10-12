import type { Alert } from "@shared/events";

/** Template-based baseline. No LLM is called and no generated claim is treated as evidence. */
export function summarize(alert: Alert) {
  return {
    method: "deterministic-template" as const,
    observation: alert.observation,
    interpretation: alert.interpretation,
    limitations:
      "Coverage is limited to supplied finalized events. Missing funding history can change findings. See the source coverage before interpreting this result.",
    rule: alert.rule,
    evidence: alert.evidence,
  };
}
