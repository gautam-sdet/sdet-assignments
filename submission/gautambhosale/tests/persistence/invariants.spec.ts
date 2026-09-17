import { describe, expect, it } from "vitest";
import { PLANS, TestWorld } from "../support/index.js";

describe("Persistence invariants", () => {
  it("keeps API status, subscription row, invoice, webhook event, and audit aligned after activation", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();
    world.willCharge("succeeded");
    const billed = await world.api.runBillingCycle(created.body.id);

    expect(billed.body.status).toBe("active");
    world.verify.apiMatchesPersistence(created.body.id, billed.body);
    world.verify.hasPaidInvoice(created.body.id);
    world.verify.paidChargeIsCoherent(created.body.id, PLANS.basic.amount);
  });

  it("never leaves an active subscription with only failed invoices", async () => {
    const world = TestWorld.start();
    const created = await world.given.pastDueFromTrial();

    world.verify.subscriptionStatus(created.body.id, "past_due");
    world.verify.noPaidInvoice(created.body.id);
  });

  it("records duplicate webhooks as a single processed event_id", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();
    const payload = world.paymentWebhook(created.body.id, {
      eventId: "evt_persist_dup",
      invoiceId: "inv_persist",
    });

    await world.api.postWebhook(payload);
    await world.api.postWebhook(payload);

    world.verify.webhookEventCount(1);
    world.verify.webhookOutcome("evt_persist_dup", "applied");
    world.verify.invoiceCount(created.body.id, 1);
  });

  it("isolates data between harness instances (no stale rows)", async () => {
    const first = TestWorld.start();
    await first.given.basicTrial();
    const second = TestWorld.start();

    second.verify.subscriptionCount(0);
    first.verify.subscriptionCount(1);
  });
});
