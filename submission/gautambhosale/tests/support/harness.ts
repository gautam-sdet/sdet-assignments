import request from "supertest";
import { composeBilling } from "../../src/app/compose.js";
import { FrozenClock } from "../../src/domain/clock.js";
import { RecordingNotifier } from "../../src/notifications/notifier.js";
import { ConfigurablePaymentProvider } from "../../src/payments/configurable-payment-provider.js";
import type { Repositories } from "../../src/persistence/repositories.js";
import { InMemoryStore } from "../../src/persistence/store.js";
import { BillingApiClient } from "./http/billing-api-client.js";
import { CustomerBuilder } from "./builders/customer-builder.js";
import { TEST_WEBHOOK_SECRET } from "./defaults.js";

/** Isolated in-process environment. Specs use TestWorld, not this class. */
export class TestHarness {
  readonly store: InMemoryStore;
  readonly repos: Repositories;
  readonly provider: ConfigurablePaymentProvider;
  readonly notifier: RecordingNotifier;
  readonly clock: FrozenClock;
  readonly api: BillingApiClient;

  private constructor() {
    this.store = new InMemoryStore();
    this.provider = new ConfigurablePaymentProvider();
    this.notifier = new RecordingNotifier();
    this.clock = new FrozenClock(new Date("2026-09-17T09:00:00.000Z"));
    const composed = composeBilling({
      provider: this.provider,
      clock: this.clock,
      notifier: this.notifier,
      webhookSecret: TEST_WEBHOOK_SECRET,
      store: this.store,
    });
    this.repos = composed.repos;
    this.api = new BillingApiClient(request(composed.app), TEST_WEBHOOK_SECRET);
    this.repos.customers.seed(new CustomerBuilder().build());
  }

  static start(): TestHarness {
    return new TestHarness();
  }
}
