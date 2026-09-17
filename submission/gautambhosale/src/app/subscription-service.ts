import { MAX_FAILED_ATTEMPTS, SubscriptionStateMachine } from "../domain/subscription-state-machine.js";
import type { Clock } from "../domain/clock.js";
import type { PlanCatalog } from "../domain/plan-strategy.js";
import { ApiError } from "../http/api-error.js";
import type { Notifier } from "../notifications/notifier.js";
import type { PaymentProvider } from "../payments/payment-provider.js";
import type { Repositories } from "../persistence/repositories.js";
import type {
  ChargeOutcome,
  Invoice,
  InvoiceStatus,
  Subscription,
  SubscriptionStatus,
} from "../types.js";
import { newId } from "./ids.js";

export class SubscriptionService {
  constructor(
    private readonly repos: Repositories,
    private readonly plans: PlanCatalog,
    private readonly provider: PaymentProvider,
    private readonly machine: SubscriptionStateMachine,
    private readonly clock: Clock,
    private readonly notifier: Notifier,
  ) {}

  create(input: {
    customerId: string;
    plan: string;
    paymentMethodId: string;
  }): Subscription {
    if (!input.customerId) {
      throw new ApiError(400, "missing_customer", "customer_id is required");
    }
    if (!input.paymentMethodId) {
      throw new ApiError(400, "missing_payment_method", "payment_method_id is required");
    }
    if (!input.paymentMethodId.startsWith("pm_")) {
      throw new ApiError(400, "invalid_payment_method", "payment_method_id is invalid");
    }
    if (!this.plans.isKnown(input.plan)) {
      throw new ApiError(400, "unknown_plan", `unknown plan: ${input.plan}`);
    }
    if (!this.repos.customers.get(input.customerId)) {
      throw new ApiError(400, "unknown_customer", `unknown customer: ${input.customerId}`);
    }

    const strategy = this.plans.forPlan(input.plan);
    const now = this.clock.now().toISOString();
    const subscription: Subscription = {
      id: newId("sub"),
      customerId: input.customerId,
      paymentMethodId: input.paymentMethodId,
      planId: strategy.planId,
      status: "trialing",
      amount: strategy.amount,
      currency: strategy.currency,
      trialDays: strategy.trialDays,
      failedAttempts: 0,
      createdAt: now,
      updatedAt: now,
      canceledAt: null,
    };

    this.repos.subscriptions.save(subscription);
    this.audit(subscription.id, "subscription.created", null, "trialing", {
      plan: strategy.planId,
      chargesOnCreate: strategy.chargesOnCreate(),
    });

    if (!strategy.chargesOnCreate()) {
      return this.get(subscription.id);
    }

    return this.runBillingCycle(subscription.id);
  }

  get(id: string): Subscription {
    const found = this.repos.subscriptions.get(id);
    if (!found) {
      throw new ApiError(404, "not_found", `subscription ${id} not found`);
    }
    return found;
  }

  cancel(id: string): Subscription {
    const subscription = this.get(id);
    const decision = this.machine.decide(subscription.status, "CANCEL");
    if (decision.kind === "ignored") {
      throw new ApiError(409, "already_canceled", "subscription is already canceled");
    }
    this.applyStatus(subscription, decision.to, "CANCEL");
    this.notifier.notify(subscription.id, "subscription.canceled", {
      from: subscription.status,
    });
    return this.get(id);
  }

  runBillingCycle(id: string): Subscription {
    const subscription = this.get(id);
    if (subscription.status === "canceled") {
      throw new ApiError(409, "canceled", "cannot bill a canceled subscription");
    }

    const attemptNumber = this.repos.invoices.findBySubscription(id).length + 1;
    const invoice = this.createInvoice(subscription, attemptNumber, "pending");
    const result = this.provider.charge({
      customerId: subscription.customerId,
      paymentMethodId: subscription.paymentMethodId,
      amount: subscription.amount,
      currency: subscription.currency,
      subscriptionId: subscription.id,
      invoiceId: invoice.id,
      idempotencyKey: invoice.idempotencyKey,
    });
    return this.applyChargeOutcome(
      subscription.id,
      invoice.id,
      result.outcome,
      result.providerChargeId,
    );
  }

  applyChargeOutcome(
    subscriptionId: string,
    invoiceId: string,
    outcome: ChargeOutcome,
    providerChargeId?: string,
  ): Subscription {
    const subscription = this.get(subscriptionId);
    const invoice = this.repos.invoices.get(invoiceId);
    if (!invoice) {
      throw new ApiError(404, "invoice_not_found", `invoice ${invoiceId} not found`);
    }

    if (outcome === "succeeded") {
      this.settleInvoice(invoice, "paid", providerChargeId ?? null);
      const decision = this.machine.decide(subscription.status, "CHARGE_SUCCEEDED");
      if (decision.kind === "applied") {
        const from = subscription.status;
        this.applyStatus(subscription, decision.to, "CHARGE_SUCCEEDED", { invoiceId });
        if (decision.to === "active" && from !== "active") {
          this.notifier.notify(subscription.id, "subscription.activated", { invoiceId });
        }
      }
      return this.get(subscriptionId);
    }

    this.settleInvoice(invoice, "failed", providerChargeId ?? null);
    const current = this.get(subscriptionId);
    const failedAttempts = current.failedAttempts + 1;
    this.repos.subscriptions.save({
      ...current,
      failedAttempts,
      updatedAt: this.clock.now().toISOString(),
    });
    const latest = this.get(subscriptionId);

    if (latest.status === "past_due" && failedAttempts >= MAX_FAILED_ATTEMPTS) {
      const cancelDecision = this.machine.decide(latest.status, "RETRIES_EXHAUSTED");
      if (cancelDecision.kind === "applied") {
        this.applyStatus(latest, cancelDecision.to, "RETRIES_EXHAUSTED", {
          invoiceId,
          failedAttempts,
        });
        this.notifier.notify(latest.id, "subscription.canceled", {
          reason: "retries_exhausted",
        });
      }
      return this.get(subscriptionId);
    }

    const decision = this.machine.decide(latest.status, "CHARGE_FAILED");
    if (decision.kind === "applied") {
      this.applyStatus(latest, decision.to, "CHARGE_FAILED", {
        invoiceId,
        outcome,
      });
      this.notifier.notify(latest.id, "subscription.past_due", { invoiceId, outcome });
    }
    return this.get(subscriptionId);
  }

  ensureInvoiceForWebhook(input: {
    subscription: Subscription;
    invoiceId: string;
    amount: number;
  }): Invoice {
    const existing = this.repos.invoices.get(input.invoiceId);
    if (existing) {
      return existing;
    }
    const attemptNumber =
      this.repos.invoices.findBySubscription(input.subscription.id).length + 1;
    const now = this.clock.now().toISOString();
    const invoice: Invoice = {
      id: input.invoiceId,
      subscriptionId: input.subscription.id,
      amount: input.amount,
      currency: input.subscription.currency,
      status: "pending",
      attemptNumber,
      providerChargeId: null,
      idempotencyKey: `webhook:${input.invoiceId}`,
      createdAt: now,
      settledAt: null,
    };
    this.repos.invoices.save(invoice);
    return invoice;
  }

  private createInvoice(
    subscription: Subscription,
    attemptNumber: number,
    status: InvoiceStatus,
  ): Invoice {
    const now = this.clock.now().toISOString();
    const invoice: Invoice = {
      id: newId("inv"),
      subscriptionId: subscription.id,
      amount: subscription.amount,
      currency: subscription.currency,
      status,
      attemptNumber,
      providerChargeId: null,
      idempotencyKey: `charge:${subscription.id}:${attemptNumber}`,
      createdAt: now,
      settledAt: null,
    };
    this.repos.invoices.save(invoice);
    return invoice;
  }

  private settleInvoice(
    invoice: Invoice,
    status: InvoiceStatus,
    providerChargeId: string | null,
  ): void {
    this.repos.invoices.save({
      ...invoice,
      status,
      providerChargeId,
      settledAt: this.clock.now().toISOString(),
    });
  }

  private applyStatus(
    subscription: Subscription,
    to: SubscriptionStatus,
    trigger: string,
    detail: Record<string, unknown> = {},
  ): void {
    const latest = this.get(subscription.id);
    const now = this.clock.now().toISOString();
    this.repos.subscriptions.save({
      ...latest,
      status: to,
      updatedAt: now,
      canceledAt: to === "canceled" ? now : latest.canceledAt,
      failedAttempts: to === "active" ? 0 : latest.failedAttempts,
    });
    this.audit(subscription.id, `lifecycle.${trigger}`, latest.status, to, detail);
  }

  private audit(
    subscriptionId: string,
    action: string,
    fromStatus: SubscriptionStatus | null,
    toStatus: SubscriptionStatus | null,
    detail: Record<string, unknown>,
  ): void {
    this.repos.audit.append({
      id: newId("aud"),
      subscriptionId,
      action,
      fromStatus,
      toStatus,
      at: this.clock.now().toISOString(),
      detail,
    });
  }
}
