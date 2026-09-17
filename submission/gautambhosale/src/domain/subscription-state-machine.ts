import type { SubscriptionStatus } from "../types.js";

export type LifecycleTrigger =
  | "CHARGE_SUCCEEDED"
  | "CHARGE_FAILED"
  | "RETRIES_EXHAUSTED"
  | "CANCEL";

export type TransitionDecision =
  | { kind: "applied"; to: SubscriptionStatus }
  | { kind: "ignored"; reason: "illegal" | "terminal_canceled" };

/**
 * Explicit transition table for the assignment lifecycle.
 * CHARGE_SUCCEEDED on `active` is a documented self-transition (recurring success).
 * Anything not in the table is ignored (webhooks) or rejected (API).
 */
export class SubscriptionStateMachine {
  private static readonly table: Record<
    SubscriptionStatus,
    Partial<Record<LifecycleTrigger, SubscriptionStatus>>
  > = {
    trialing: {
      CHARGE_SUCCEEDED: "active",
      CHARGE_FAILED: "past_due",
      CANCEL: "canceled",
    },
    active: {
      CHARGE_SUCCEEDED: "active",
      CHARGE_FAILED: "past_due",
      CANCEL: "canceled",
    },
    past_due: {
      CHARGE_SUCCEEDED: "active",
      RETRIES_EXHAUSTED: "canceled",
      CANCEL: "canceled",
    },
    canceled: {},
  };

  decide(
    from: SubscriptionStatus,
    trigger: LifecycleTrigger,
  ): TransitionDecision {
    if (from === "canceled") {
      return { kind: "ignored", reason: "terminal_canceled" };
    }
    const to = SubscriptionStateMachine.table[from][trigger];
    if (!to) {
      return { kind: "ignored", reason: "illegal" };
    }
    return { kind: "applied", to };
  }

  isAllowed(from: SubscriptionStatus, trigger: LifecycleTrigger): boolean {
    return this.decide(from, trigger).kind === "applied";
  }
}

export const MAX_FAILED_ATTEMPTS = 3;
