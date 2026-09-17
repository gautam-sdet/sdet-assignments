import type { ChargeOutcome, WebhookEventType } from "../../src/types.js";
import { BillingAssertions } from "./assertions/billing-assertions.js";
import { CreateSubscriptionBuilder } from "./builders/create-subscription-builder.js";
import { WebhookPayloadBuilder } from "./builders/webhook-payload-builder.js";
import type { BillingApiClient } from "./http/billing-api-client.js";
import { PLANS } from "./defaults.js";
import { GivenScenarios } from "./given.js";
import { TestHarness } from "./harness.js";

/**
 * Only object a spec should construct.
 * HTTP, mock outcomes, and persistence checks go through this facade.
 */
export class TestWorld {
  readonly given: GivenScenarios;
  readonly verify: BillingAssertions;

  private constructor(private readonly harness: TestHarness) {
    this.given = new GivenScenarios(harness);
    this.verify = new BillingAssertions(harness);
  }

  static start(): TestWorld {
    return new TestWorld(TestHarness.start());
  }

  get api(): BillingApiClient {
    return this.harness.api;
  }

  /** Queue mock charge results for the next billing-cycle / pro-create calls. */
  willCharge(...outcomes: ChargeOutcome[]): void {
    this.harness.provider.enqueue(...outcomes);
  }

  createBody() {
    return new CreateSubscriptionBuilder();
  }

  paymentWebhook(
    subscriptionId: string,
    options: {
      eventId: string;
      invoiceId: string;
      type?: WebhookEventType;
      amount?: number;
    },
  ) {
    return new WebhookPayloadBuilder()
      .withEventId(options.eventId)
      .forSubscription(subscriptionId)
      .forInvoice(options.invoiceId)
      .ofType(options.type ?? "payment.succeeded")
      .withAmount(options.amount ?? PLANS.basic.amount)
      .build();
  }
}
