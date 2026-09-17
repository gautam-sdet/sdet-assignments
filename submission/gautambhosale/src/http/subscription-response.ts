import type { Subscription } from "../types.js";

export function toSubscriptionResponse(subscription: Subscription) {
  return {
    id: subscription.id,
    customer_id: subscription.customerId,
    payment_method_id: subscription.paymentMethodId,
    plan: subscription.planId,
    status: subscription.status,
    amount: subscription.amount,
    currency: subscription.currency,
    trial_days: subscription.trialDays,
    failed_attempts: subscription.failedAttempts,
    created_at: subscription.createdAt,
    updated_at: subscription.updatedAt,
    canceled_at: subscription.canceledAt,
  };
}
