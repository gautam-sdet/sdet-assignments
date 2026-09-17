import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOMER,
  DEFAULT_PAYMENT_METHOD,
  PLANS,
  TestWorld,
} from "../support/index.js";

describe("State machine — valid transitions", () => {
  it("trialing -- trial ends, first charge succeeds --> active", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();
    world.willCharge("succeeded");

    const response = await world.api.runBillingCycle(created.body.id);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("active");
    world.verify.hasPaidInvoice(created.body.id);
    world.verify.providerCalledTimes(1);
    world.verify.lastProviderCharge({
      amount: PLANS.basic.amount,
      customerId: DEFAULT_CUSTOMER.id,
      paymentMethodId: DEFAULT_PAYMENT_METHOD,
    });
  });

  it("trialing -- trial ends, first charge fails --> past_due", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();
    world.willCharge("declined");

    const response = await world.api.runBillingCycle(created.body.id);

    expect(response.body.status).toBe("past_due");
    world.verify.latestInvoiceStatus(created.body.id, "failed");
    world.verify.noPaidInvoice(created.body.id);
    expect(response.body.status).not.toBe("active");
    expect(response.body.status).not.toBe("canceled");
  });

  it("active -- recurring charge fails --> past_due", async () => {
    const world = TestWorld.start();
    const created = await world.given.proActive();
    expect(created.body.status).toBe("active");
    world.willCharge("declined");

    const response = await world.api.runBillingCycle(created.body.id);

    expect(response.body.status).toBe("past_due");
    world.verify.invoiceCount(created.body.id, 2);
    world.verify.latestInvoiceStatus(created.body.id, "failed");
  });

  it("past_due -- retry charge succeeds --> active", async () => {
    const world = TestWorld.start();
    const created = await world.given.pastDueFromTrial();
    world.willCharge("succeeded");

    const response = await world.api.runBillingCycle(created.body.id);

    expect(response.body.status).toBe("active");
    expect(response.body.failed_attempts).toBe(0);
    world.verify.hasPaidInvoice(created.body.id);
  });

  it("past_due -- retries exhausted --> canceled", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();
    world.willCharge("declined", "declined", "declined");

    await world.api.runBillingCycle(created.body.id);
    world.verify.subscriptionStatus(created.body.id, "past_due");
    await world.api.runBillingCycle(created.body.id);
    world.verify.subscriptionStatus(created.body.id, "past_due");
    const third = await world.api.runBillingCycle(created.body.id);

    expect(third.body.status).toBe("canceled");
    world.verify.canceledIsTerminal(created.body.id);
    world.verify.invoiceCount(created.body.id, 3);
    world.verify.providerCalledTimes(3);
  });

  it("active -- customer/API cancel --> canceled", async () => {
    const world = TestWorld.start();
    const created = await world.given.proActive();

    const response = await world.api.cancelSubscription(created.body.id);

    expect(response.body.status).toBe("canceled");
    world.verify.canceledIsTerminal(created.body.id);
  });

  it("trialing -- customer/API cancel --> canceled", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    const response = await world.api.cancelSubscription(created.body.id);

    expect(response.body.status).toBe("canceled");
  });

  it("applies plan price and trial length from the plan strategy", async () => {
    const world = TestWorld.start();
    const basic = await world.api.createSubscription(world.createBody().onPlan("basic").build());
    world.willCharge("succeeded");
    const pro = await world.api.createSubscription(world.createBody().onPlan("pro").build());

    expect(basic.body).toMatchObject({
      plan: "basic",
      amount: PLANS.basic.amount,
      trial_days: PLANS.basic.trialDays,
      status: "trialing",
    });
    expect(pro.body).toMatchObject({
      plan: "pro",
      amount: PLANS.pro.amount,
      trial_days: PLANS.pro.trialDays,
      status: "active",
    });
  });

  it("trialing can also activate from a payment.succeeded webhook", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_activate",
        invoiceId: "inv_activate",
      }),
    );

    world.verify.subscriptionStatus(created.body.id, "active");
    world.verify.providerCalledTimes(0);
  });

  it("trialing -- payment.failed webhook --> past_due without a provider charge", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    const response = await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_trial_fail",
        invoiceId: "inv_trial_fail",
        type: "payment.failed",
      }),
    );

    expect(response.status).toBe(200);
    world.verify.subscriptionStatus(created.body.id, "past_due");
    world.verify.latestInvoiceStatus(created.body.id, "failed");
    world.verify.noPaidInvoice(created.body.id);
    world.verify.providerCalledTimes(0);
  });

  it("active -- payment.failed webhook --> past_due", async () => {
    const world = TestWorld.start();
    const created = await world.given.proActive();
    const paidId = world.verify.latestInvoiceId(created.body.id);

    await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_recurring_fail",
        invoiceId: "inv_recurring_fail",
        type: "payment.failed",
        amount: PLANS.pro.amount,
      }),
    );

    world.verify.subscriptionStatus(created.body.id, "past_due");
    world.verify.invoiceStatus(paidId, "paid");
    world.verify.invoiceStatus("inv_recurring_fail", "failed");
  });

  it("past_due -- payment.succeeded webhook --> active", async () => {
    const world = TestWorld.start();
    const created = await world.given.pastDueFromTrial();

    await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_retry_ok",
        invoiceId: "inv_retry_ok",
      }),
    );

    world.verify.subscriptionStatus(created.body.id, "active");
    world.verify.invoiceStatus("inv_retry_ok", "paid");
  });

  it("active -- recurring charge succeeds --> stays active and records another paid invoice", async () => {
    const world = TestWorld.start();
    const created = await world.given.proActive();
    world.willCharge("succeeded");

    const response = await world.api.runBillingCycle(created.body.id);

    expect(response.body.status).toBe("active");
    world.verify.invoiceCount(created.body.id, 2);
    world.verify.latestInvoiceStatus(created.body.id, "paid");
    world.verify.providerCalledTimes(2);
    world.verify.lastProviderCharge({
      amount: PLANS.pro.amount,
      customerId: DEFAULT_CUSTOMER.id,
      paymentMethodId: DEFAULT_PAYMENT_METHOD,
    });
  });
});
