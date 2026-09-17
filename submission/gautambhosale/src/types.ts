export type PlanId = "basic" | "pro";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export type InvoiceStatus = "pending" | "paid" | "failed" | "refunded";

export type WebhookEventType =
  | "payment.succeeded"
  | "payment.failed"
  | "payment.refunded";

export type WebhookProcessOutcome =
  | "applied"
  | "duplicate"
  | "ignored_stale"
  | "ignored_illegal_transition"
  | "ignored_canceled";

export type ChargeOutcome = "succeeded" | "declined" | "timeout";

export interface Customer {
  id: string;
  email: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  paymentMethodId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  amount: number;
  currency: string;
  trialDays: number;
  failedAttempts: number;
  createdAt: string;
  updatedAt: string;
  canceledAt: string | null;
}

export interface Invoice {
  id: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  attemptNumber: number;
  providerChargeId: string | null;
  idempotencyKey: string;
  createdAt: string;
  settledAt: string | null;
}

export interface WebhookEventRecord {
  eventId: string;
  type: WebhookEventType;
  subscriptionId: string;
  invoiceId: string;
  amount: number;
  outcome: WebhookProcessOutcome;
  receivedAt: string;
}

export interface AuditEntry {
  id: string;
  subscriptionId: string;
  action: string;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus | null;
  at: string;
  detail: Record<string, unknown>;
}

export interface ChargeRequest {
  customerId: string;
  paymentMethodId: string;
  amount: number;
  currency: string;
  subscriptionId: string;
  invoiceId: string;
  idempotencyKey: string;
}

export interface ChargeResult {
  outcome: ChargeOutcome;
  providerChargeId?: string;
}
