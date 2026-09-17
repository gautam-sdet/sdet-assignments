import type { Express } from "express";
import { SubscriptionService } from "./subscription-service.js";
import { WebhookService } from "./webhook-service.js";
import type { Clock } from "../domain/clock.js";
import { PlanCatalog } from "../domain/plan-strategy.js";
import { SubscriptionStateMachine } from "../domain/subscription-state-machine.js";
import { createApp } from "../http/create-app.js";
import type { Notifier } from "../notifications/notifier.js";
import type { PaymentProvider } from "../payments/payment-provider.js";
import {
  createRepositories,
  type Repositories,
} from "../persistence/repositories.js";
import { InMemoryStore } from "../persistence/store.js";

export interface BillingComposition {
  store: InMemoryStore;
  repos: Repositories;
  subscriptions: SubscriptionService;
  webhooks: WebhookService;
  app: Express;
}

/**
 * Single wiring point for HTTP fixture + tests.
 * Tests inject clock, notifier, and payment provider; production uses defaults.
 */
export function composeBilling(deps: {
  provider: PaymentProvider;
  clock: Clock;
  notifier: Notifier;
  webhookSecret: string;
  store?: InMemoryStore;
}): BillingComposition {
  const store = deps.store ?? new InMemoryStore();
  const repos = createRepositories(store);
  const subscriptions = new SubscriptionService(
    repos,
    new PlanCatalog(),
    deps.provider,
    new SubscriptionStateMachine(),
    deps.clock,
    deps.notifier,
  );
  const webhooks = new WebhookService(
    repos,
    subscriptions,
    deps.clock,
    deps.webhookSecret,
  );
  return {
    store,
    repos,
    subscriptions,
    webhooks,
    app: createApp({ subscriptions, webhooks }),
  };
}
