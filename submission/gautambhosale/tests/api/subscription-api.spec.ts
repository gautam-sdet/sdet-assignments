import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOMER,
  DEFAULT_PAYMENT_METHOD,
  PLANS,
  TestWorld,
} from "../support/index.js";

describe("API contract — subscriptions", () => {
  it("creates a basic subscription in trialing without charging", async () => {
    const world = TestWorld.start();

    const response = await world.given.basicTrial();

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      customer_id: DEFAULT_CUSTOMER.id,
      plan: "basic",
      status: "trialing",
      amount: PLANS.basic.amount,
      currency: "USD",
      trial_days: PLANS.basic.trialDays,
      canceled_at: null,
    });
    expect(response.body.id).toMatch(/^sub_/);
    world.verify.apiMatchesPersistence(response.body.id, response.body);
    world.verify.providerCalledTimes(0);
    world.verify.invoiceCount(response.body.id, 0);
  });

  it("creates a pro subscription, charges immediately, and returns active", async () => {
    const world = TestWorld.start();

    const response = await world.given.proActive();

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      plan: "pro",
      status: "active",
      amount: PLANS.pro.amount,
      trial_days: PLANS.pro.trialDays,
    });
    world.verify.apiMatchesPersistence(response.body.id, response.body);
    world.verify.providerCalledTimes(1);
    world.verify.lastProviderCharge({
      amount: PLANS.pro.amount,
      customerId: DEFAULT_CUSTOMER.id,
      paymentMethodId: DEFAULT_PAYMENT_METHOD,
    });
    world.verify.hasPaidInvoice(response.body.id);
  });

  it("retrieves an existing subscription", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    const response = await world.api.getSubscription(created.body.id);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(created.body.id);
    expect(response.body.status).toBe("trialing");
  });

  it("returns 404 for an unknown subscription", async () => {
    const world = TestWorld.start();

    const response = await world.api.getSubscription("sub_missing");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("not_found");
  });

  it("rejects an unknown plan without calling the provider", async () => {
    const world = TestWorld.start();

    const response = await world.api.createSubscription(
      world.createBody().onPlan("enterprise").build(),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("unknown_plan");
    world.verify.providerCalledTimes(0);
    world.verify.subscriptionCount(0);
  });

  it("rejects an unknown customer without calling the provider", async () => {
    const world = TestWorld.start();

    const response = await world.api.createSubscription(
      world.createBody().forCustomer("cust_unknown").build(),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("unknown_customer");
    world.verify.providerCalledTimes(0);
  });

  it("rejects a body missing customer_id", async () => {
    const world = TestWorld.start();

    const response = await world.api.createSubscription({
      plan: "basic",
      payment_method_id: DEFAULT_PAYMENT_METHOD,
    });

    expect(response.status).toBe(400);
    world.verify.providerCalledTimes(0);
    world.verify.subscriptionCount(0);
  });

  it("rejects a missing payment method", async () => {
    const world = TestWorld.start();

    const response = await world.api.createSubscription(
      world.createBody().withPaymentMethod("").build(),
    );

    expect(response.status).toBe(400);
  });

  it("rejects an invalid payment method token", async () => {
    const world = TestWorld.start();

    const response = await world.api.createSubscription(
      world.createBody().withPaymentMethod("card_not_a_pm").build(),
    );

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_payment_method");
    world.verify.providerCalledTimes(0);
  });

  it("cancels a trialing subscription via API", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    const response = await world.api.cancelSubscription(created.body.id);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("canceled");
    world.verify.canceledIsTerminal(created.body.id);
    world.verify.providerCalledTimes(0);
  });

  it("returns 409 when canceling an already-canceled subscription", async () => {
    const world = TestWorld.start();
    const created = await world.given.canceledTrial();

    const response = await world.api.cancelSubscription(created.body.id);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe("already_canceled");
    world.verify.providerCalledTimes(0);
    world.verify.invoiceCount(created.body.id, 0);
  });
});
