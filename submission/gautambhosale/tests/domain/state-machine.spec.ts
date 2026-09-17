import { describe, expect, it } from "vitest";
import { SubscriptionStateMachine } from "../../src/domain/subscription-state-machine.js";

describe("SubscriptionStateMachine", () => {
  const machine = new SubscriptionStateMachine();

  it("allows only the documented transitions", () => {
    expect(machine.decide("trialing", "CHARGE_SUCCEEDED")).toEqual({
      kind: "applied",
      to: "active",
    });
    expect(machine.decide("trialing", "CHARGE_FAILED")).toEqual({
      kind: "applied",
      to: "past_due",
    });
    expect(machine.decide("trialing", "CANCEL")).toEqual({
      kind: "applied",
      to: "canceled",
    });
    expect(machine.decide("active", "CHARGE_FAILED")).toEqual({
      kind: "applied",
      to: "past_due",
    });
    expect(machine.decide("active", "CANCEL")).toEqual({
      kind: "applied",
      to: "canceled",
    });
    expect(machine.decide("past_due", "CHARGE_SUCCEEDED")).toEqual({
      kind: "applied",
      to: "active",
    });
    expect(machine.decide("past_due", "RETRIES_EXHAUSTED")).toEqual({
      kind: "applied",
      to: "canceled",
    });
  });

  it("treats canceled as terminal", () => {
    expect(machine.decide("canceled", "CHARGE_SUCCEEDED")).toEqual({
      kind: "ignored",
      reason: "terminal_canceled",
    });
    expect(machine.decide("canceled", "CANCEL")).toEqual({
      kind: "ignored",
      reason: "terminal_canceled",
    });
  });

  it("ignores CHARGE_FAILED while already past_due (dunning stays until retries exhaust)", () => {
    expect(machine.decide("past_due", "CHARGE_FAILED")).toEqual({
      kind: "ignored",
      reason: "illegal",
    });
  });
});
