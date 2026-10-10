import type { Scenario } from "../../lib/schemas";

export const SENSITIVITY_TONE = {
  restricted: "critical",
  confidential: "high",
  internal: "info",
  public: "neutral",
} as const;

export function nameOf(s: Scenario, id: string): string {
  return [...s.principals, ...s.roles, ...s.resources].find((e) => e.id === id)?.name ?? id;
}
