import { describe, expect, it } from "vitest";
import { TestWorld } from "../support/index.js";

describe("State machine — invalid transitions are impossible", () => {
  it("does not reactivate a canceled subscription via payment.succeeded", async () => {
    const world = TestWorld.start();
    const created = await world.given.canceledTrial();

    const response = await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_stray_success",
        invoiceId: "inv_stray",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.body.outcome).toBe("ignored_canceled");
    world.verify.canceledIsTerminal(created.body.id);
    world.verify.noPaidInvoice(created.body.id);
    world.verify.providerCalledTimes(0);
    world.verify.notifierCount("subscription.activated", 0);
  });

  it("does not move canceled -> past_due via payment.failed", async () => {
    const world = TestWorld.start();
    const created = await world.given.canceledTrial();

    const response = await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_stray_fail",
        invoiceId: "inv_stray_fail",
        type: "payment.failed",
      }),
    );

    expect(response.body.outcome).toBe("ignored_canceled");
    world.verify.subscriptionStatus(created.body.id, "canceled");
  });

  it("refuses to bill a canceled subscription", async () => {
    const world = TestWorld.start();
    const created = await world.given.canceledTrial();

    const response = await world.api.runBillingCycle(created.body.id);

    expect(response.status).toBe(409);
    world.verify.providerCalledTimes(0);
    world.verify.invoiceCount(created.body.id, 0);
  });
});
