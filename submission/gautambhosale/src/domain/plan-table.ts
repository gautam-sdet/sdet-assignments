import type { PlanId } from "../types.js";

/** Single source for plan price and trial — fixture and tests both import this. */
export const PLAN_TABLE = {
  basic: { id: "basic" as const, amount: 900, trialDays: 14, currency: "USD" as const },
  pro: { id: "pro" as const, amount: 4900, trialDays: 0, currency: "USD" as const },
};

export type PlanDefinition = (typeof PLAN_TABLE)[PlanId];
