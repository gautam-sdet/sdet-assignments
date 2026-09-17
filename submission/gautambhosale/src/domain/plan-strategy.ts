import type { PlanId } from "../types.js";
import { PLAN_TABLE } from "./plan-table.js";

/**
 * Strategy: plan-specific trial and price live on strategy objects,
 * not in if/else chains spread across create + billing.
 */
export interface PlanBillingStrategy {
  readonly planId: PlanId;
  readonly amount: number;
  readonly currency: "USD";
  readonly trialDays: number;
  chargesOnCreate(): boolean;
}

export class BasicPlanStrategy implements PlanBillingStrategy {
  readonly planId = PLAN_TABLE.basic.id;
  readonly amount = PLAN_TABLE.basic.amount;
  readonly currency = PLAN_TABLE.basic.currency;
  readonly trialDays = PLAN_TABLE.basic.trialDays;

  chargesOnCreate(): boolean {
    return false;
  }
}

export class ProPlanStrategy implements PlanBillingStrategy {
  readonly planId = PLAN_TABLE.pro.id;
  readonly amount = PLAN_TABLE.pro.amount;
  readonly currency = PLAN_TABLE.pro.currency;
  readonly trialDays = PLAN_TABLE.pro.trialDays;

  chargesOnCreate(): boolean {
    return true;
  }
}

/** Factory: one place to resolve a plan id into billing rules. */
export class PlanCatalog {
  private readonly strategies: Record<PlanId, PlanBillingStrategy> = {
    basic: new BasicPlanStrategy(),
    pro: new ProPlanStrategy(),
  };

  isKnown(plan: string): plan is PlanId {
    return plan === "basic" || plan === "pro";
  }

  forPlan(plan: PlanId): PlanBillingStrategy {
    return this.strategies[plan];
  }
}
