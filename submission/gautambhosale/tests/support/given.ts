import type { TestHarness } from "./harness.js";
import { CreateSubscriptionBuilder } from "./builders/create-subscription-builder.js";

/** Named givens so specs reuse setup instead of repeating HTTP. */
export class GivenScenarios {
  constructor(private readonly harness: TestHarness) {}

  basicTrial() {
    return this.harness.api.createSubscription(
      new CreateSubscriptionBuilder().onPlan("basic").build(),
    );
  }

  proActive() {
    this.harness.provider.enqueue("succeeded");
    return this.harness.api.createSubscription(
      new CreateSubscriptionBuilder().onPlan("pro").build(),
    );
  }

  async canceledTrial() {
    const created = await this.basicTrial();
    await this.harness.api.cancelSubscription(created.body.id);
    return created;
  }

  async pastDueFromTrial() {
    const created = await this.basicTrial();
    this.harness.provider.enqueue("declined");
    await this.harness.api.runBillingCycle(created.body.id);
    return created;
  }
}
