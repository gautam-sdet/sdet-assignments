import { describe, expect, it } from "vitest";
import { PLANS, TestWorld } from "../support/index.js";

describe("Webhooks — idempotency and duplicate delivery", () => {
  it("processes the same event_id exactly once", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();
    const payload = world.paymentWebhook(created.body.id, {
      eventId: "evt_8c1f4f0b",
      invoiceId: "inv_001",
    });

    const first = await world.api.postWebhook(payload);
    const second = await world.api.postWebhook(payload);

    expect(first.body.outcome).toBe("applied");
    expect(second.body.outcome).toBe("duplicate");
    world.verify.webhookEventCount(1);
    world.verify.invoiceCount(created.body.id, 1);
    world.verify.subscriptionStatus(created.body.id, "active");
    world.verify.notifierCount("subscription.activated", 1, created.body.id);
    world.verify.providerCalledTimes(0);
  });

  it("does not create a duplicate invoice row on redelivery", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();
    const payload = world.paymentWebhook(created.body.id, {
      eventId: "evt_dup_inv",
      invoiceId: "inv_dup",
      type: "payment.failed",
    });

    await world.api.postWebhook(payload);
    await world.api.postWebhook(payload);

    world.verify.invoiceCount(created.body.id, 1);
    world.verify.subscriptionStatus(created.body.id, "past_due");
  });
});

describe("Webhooks — out-of-order / stale delivery", () => {
  it("does not regress active when payment.failed arrives after payment.succeeded for the same invoice", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_success_first",
        invoiceId: "inv_same",
      }),
    );
    const stale = await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_fail_later",
        invoiceId: "inv_same",
        type: "payment.failed",
      }),
    );

    expect(stale.body.outcome).toBe("ignored_stale");
    world.verify.subscriptionStatus(created.body.id, "active");
    world.verify.invoiceStatus("inv_same", "paid");
    world.verify.notifierCount("subscription.past_due", 0);
  });

  it("applies a late payment.succeeded after payment.failed for the same invoice", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_fail_first",
        invoiceId: "inv_reorder",
        type: "payment.failed",
      }),
    );
    world.verify.subscriptionStatus(created.body.id, "past_due");

    const later = await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_success_later",
        invoiceId: "inv_reorder",
      }),
    );

    expect(later.body.outcome).toBe("applied");
    world.verify.subscriptionStatus(created.body.id, "active");
    world.verify.invoiceStatus("inv_reorder", "paid");
  });

  it("records a refund without changing lifecycle status", async () => {
    const world = TestWorld.start();
    const created = await world.given.proActive();
    const invoiceId = world.verify.latestInvoiceId(created.body.id);

    const response = await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_refund",
        invoiceId,
        type: "payment.refunded",
        amount: PLANS.pro.amount,
      }),
    );

    expect(response.body.outcome).toBe("applied");
    world.verify.subscriptionStatus(created.body.id, "active");
    world.verify.invoiceStatus(invoiceId, "refunded");
  });
});
