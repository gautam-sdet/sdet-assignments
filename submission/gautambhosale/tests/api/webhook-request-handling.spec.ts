import { describe, expect, it } from "vitest";
import { TestWorld } from "../support/index.js";

describe("API contract — webhook request handling", () => {
  it("rejects a missing signature before any business processing", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();
    const payload = world.paymentWebhook(created.body.id, {
      eventId: "evt_unsigned",
      invoiceId: "inv_001",
    });

    const response = await world.api.postWebhook(payload, { signature: null });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("invalid_signature");
    world.verify.webhookEventCount(0);
    world.verify.subscriptionStatus(created.body.id, "trialing");
  });

  it("rejects a forged signature", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    const response = await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_forged",
        invoiceId: "inv_001",
      }),
      { signature: "deadbeef" },
    );

    expect(response.status).toBe(401);
    world.verify.webhookEventCount(0);
  });

  it("rejects a payload signed with the wrong secret", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    const response = await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_wrong_secret",
        invoiceId: "inv_001",
      }),
      { secret: "wrong_secret" },
    );

    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    const world = TestWorld.start();

    const response = await world.api.postWebhook("{not-json");

    expect(response.status).toBe(400);
  });

  it("rejects a payload missing event_id", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    const response = await world.api.postWebhook({
      type: "payment.succeeded",
      subscription_id: created.body.id,
      invoice_id: "inv_001",
      amount: 900,
      currency: "USD",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("malformed_payload");
    world.verify.webhookEventCount(0);
  });

  it("rejects an unsupported event type", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    const response = await world.api.postWebhook({
      event_id: "evt_x",
      type: "invoice.voided",
      subscription_id: created.body.id,
      invoice_id: "inv_001",
      amount: 900,
      currency: "USD",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("unknown_event_type");
  });

  it("accepts a valid signed webhook", async () => {
    const world = TestWorld.start();
    const created = await world.given.basicTrial();

    const response = await world.api.postWebhook(
      world.paymentWebhook(created.body.id, {
        eventId: "evt_ok",
        invoiceId: "inv_trial_end",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.body.outcome).toBe("applied");
    world.verify.subscriptionStatus(created.body.id, "active");
  });
});
