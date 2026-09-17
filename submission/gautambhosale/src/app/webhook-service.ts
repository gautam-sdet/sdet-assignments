import type { Clock } from "../domain/clock.js";
import { ApiError } from "../http/api-error.js";
import { webhookPayloadSchema } from "../http/schemas.js";
import { signaturesMatch, signWebhookBody } from "../payments/hmac.js";
import type { Repositories } from "../persistence/repositories.js";
import type { WebhookEventType, WebhookProcessOutcome } from "../types.js";
import type { SubscriptionService } from "./subscription-service.js";

export interface WebhookPayload {
  event_id: string;
  type: WebhookEventType;
  subscription_id: string;
  invoice_id: string;
  amount: number;
  currency: string;
}

export class WebhookService {
  constructor(
    private readonly repos: Repositories,
    private readonly subscriptions: SubscriptionService,
    private readonly clock: Clock,
    private readonly webhookSecret: string,
  ) {}

  process(
    rawBody: string,
    signature: string | undefined,
  ): {
    outcome: WebhookProcessOutcome;
    subscriptionId: string;
    eventId: string;
  } {
    const expected = signWebhookBody(rawBody, this.webhookSecret);
    if (!signaturesMatch(signature, expected)) {
      throw new ApiError(401, "invalid_signature", "X-Provider-Signature is invalid");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new ApiError(400, "malformed_json", "webhook body is not valid JSON");
    }

    const payload = this.validate(parsed);
    const existing = this.repos.webhookEvents.get(payload.event_id);
    if (existing) {
      return {
        outcome: "duplicate",
        subscriptionId: existing.subscriptionId,
        eventId: payload.event_id,
      };
    }

    const subscription = this.repos.subscriptions.get(payload.subscription_id);
    if (!subscription) {
      throw new ApiError(
        404,
        "not_found",
        `subscription ${payload.subscription_id} not found`,
      );
    }

    if (subscription.status === "canceled") {
      this.record(payload, "ignored_canceled");
      return {
        outcome: "ignored_canceled",
        subscriptionId: subscription.id,
        eventId: payload.event_id,
      };
    }

    const invoice = this.subscriptions.ensureInvoiceForWebhook({
      subscription,
      invoiceId: payload.invoice_id,
      amount: payload.amount,
    });

    let outcome: WebhookProcessOutcome = "applied";

    if (payload.type === "payment.failed" && invoice.status === "paid") {
      outcome = "ignored_stale";
      this.record(payload, outcome);
      return { outcome, subscriptionId: subscription.id, eventId: payload.event_id };
    }

    if (payload.type === "payment.refunded") {
      if (invoice.status === "paid" || invoice.status === "refunded") {
        this.repos.invoices.save({
          ...invoice,
          status: "refunded",
          settledAt: this.clock.now().toISOString(),
        });
        outcome = "applied";
      } else {
        outcome = "ignored_stale";
      }
      this.record(payload, outcome);
      return { outcome, subscriptionId: subscription.id, eventId: payload.event_id };
    }

    const chargeOutcome =
      payload.type === "payment.succeeded" ? "succeeded" : "declined";
    this.subscriptions.applyChargeOutcome(
      subscription.id,
      invoice.id,
      chargeOutcome,
    );
    this.record(payload, outcome);
    return { outcome, subscriptionId: subscription.id, eventId: payload.event_id };
  }

  private record(payload: WebhookPayload, outcome: WebhookProcessOutcome): void {
    this.repos.webhookEvents.save({
      eventId: payload.event_id,
      type: payload.type,
      subscriptionId: payload.subscription_id,
      invoiceId: payload.invoice_id,
      amount: payload.amount,
      outcome,
      receivedAt: this.clock.now().toISOString(),
    });
  }

  private validate(parsed: unknown): WebhookPayload {
    if (!parsed || typeof parsed !== "object") {
      throw new ApiError(400, "malformed_payload", "webhook payload must be an object");
    }
    const type = (parsed as { type?: unknown }).type;
    if (
      type !== "payment.succeeded" &&
      type !== "payment.failed" &&
      type !== "payment.refunded"
    ) {
      throw new ApiError(400, "unknown_event_type", "unsupported webhook type");
    }
    const body = webhookPayloadSchema.safeParse(parsed);
    if (!body.success) {
      throw new ApiError(400, "malformed_payload", body.error.issues[0]?.message ?? "invalid webhook");
    }
    return body.data;
  }
}
