import type { WebhookEventType } from "../../../src/types.js";
import { PLANS } from "../defaults.js";

export class WebhookPayloadBuilder {
  private eventId = "evt_8c1f4f0b";
  private type: WebhookEventType = "payment.succeeded";
  private subscriptionId = "sub_001";
  private invoiceId = "inv_001";
  private amount: number = PLANS.pro.amount;
  private currency = PLANS.pro.currency;

  withEventId(eventId: string): this {
    this.eventId = eventId;
    return this;
  }

  ofType(type: WebhookEventType): this {
    this.type = type;
    return this;
  }

  forSubscription(subscriptionId: string): this {
    this.subscriptionId = subscriptionId;
    return this;
  }

  forInvoice(invoiceId: string): this {
    this.invoiceId = invoiceId;
    return this;
  }

  withAmount(amount: number): this {
    this.amount = amount;
    return this;
  }

  build() {
    return {
      event_id: this.eventId,
      type: this.type,
      subscription_id: this.subscriptionId,
      invoice_id: this.invoiceId,
      amount: this.amount,
      currency: this.currency,
    };
  }
}
