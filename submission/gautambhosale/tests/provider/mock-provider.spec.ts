import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOMER,
  DEFAULT_PAYMENT_METHOD,
  PLANS,
  TestWorld,
} from "../support/index.js";

describe("Mock payment provider interactions", () => {
  it("is called exactly once per genuine billing attempt with amount, customer, and idempotency key", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();
    world.willCharge("succeeded");

    await world.api.runBillingCycle(created.body.id);

    world.verify.providerCalledTimes(1);
    world.verify.firstProviderCharge({
      amount: PLANS.basic.amount,
      customerId: DEFAULT_CUSTOMER.id,
      paymentMethodId: DEFAULT_PAYMENT_METHOD,
      subscriptionId: created.body.id,
      idempotencyKey: `charge:${created.body.id}:1`,
    });
  });

  it("is not called when creation is rejected", async () => {
    const world = TestWorld.start();

    await world.api.createSubscription(world.createBody().onPlan("gold").build());

    world.verify.providerCalledTimes(0);
  });

  it("treats a timeout as a failed charge, not as active", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();
    world.willCharge("timeout");

    const response = await world.api.runBillingCycle(created.body.id);

    expect(response.body.status).toBe("past_due");
    world.verify.latestInvoiceStatus(created.body.id, "failed");
    world.verify.noPaidInvoice(created.body.id);
    world.verify.providerCalledTimes(1);
  });

  it("treats a decline on pro create as past_due with a failed invoice", async () => {
    const world = TestWorld.start();
    world.willCharge("declined");

    const response = await world.api.createSubscription(
      world.createBody().onPlan("pro").build(),
    );

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("past_due");
    world.verify.latestInvoiceStatus(response.body.id, "failed");
    world.verify.providerCalledTimes(1);
    world.verify.lastProviderCharge({
      amount: PLANS.pro.amount,
      customerId: DEFAULT_CUSTOMER.id,
      paymentMethodId: DEFAULT_PAYMENT_METHOD,
    });
  });

  it("is not called when a webhook is replayed", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();
    const payload = world.paymentWebhook(created.body.id, {
      eventId: "evt_no_provider",
      invoiceId: "inv_wh",
    });

    await world.api.postWebhook(payload);
    await world.api.postWebhook(payload);

    world.verify.providerCalledTimes(0);
  });
});
