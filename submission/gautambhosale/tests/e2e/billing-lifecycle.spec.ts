import { describe, expect, it } from "vitest";
import { TestWorld } from "../support/index.js";

describe("End-to-end billing flows", () => {
  it("covers trial → failed charge → retry success, matching API, DB, and provider", async () => {
    const world = TestWorld.start();

    const created = await world.given.basicTrial();
    expect(created.status).toBe(201);
    world.verify.subscriptionStatus(created.body.id, "trialing");
    world.verify.providerCalledTimes(0);

    world.willCharge("declined");
    const failed = await world.api.runBillingCycle(created.body.id);
    expect(failed.body.status).toBe("past_due");
    world.verify.latestInvoiceStatus(created.body.id, "failed");
    world.verify.apiMatchesPersistence(created.body.id, failed.body);

    world.willCharge("succeeded");
    const recovered = await world.api.runBillingCycle(created.body.id);
    expect(recovered.body.status).toBe("active");
    world.verify.hasPaidInvoice(created.body.id);
    world.verify.providerCalledTimes(2);
    world.verify.apiMatchesPersistence(created.body.id, recovered.body);

    const fetched = await world.api.getSubscription(created.body.id);
    expect(fetched.body.status).toBe("active");
  });

  it("covers webhook-driven activation then customer cancel as a terminal state", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_e2e",
        invoiceId: "inv_e2e",
      }),
    );
    const canceled = await world.api.cancelSubscription(created.body.id);

    expect(canceled.body.status).toBe("canceled");
    world.verify.canceledIsTerminal(created.body.id);
    world.verify.hasPaidInvoice(created.body.id);

    const stray = await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_e2e_stray",
        invoiceId: "inv_e2e_2",
      }),
    );
    expect(stray.body.outcome).toBe("ignored_canceled");
    world.verify.canceledIsTerminal(created.body.id);
  });
});
