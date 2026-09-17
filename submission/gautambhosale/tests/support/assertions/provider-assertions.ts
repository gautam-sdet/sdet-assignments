import { expect } from "vitest";
import type { ConfigurablePaymentProvider } from "../../../src/payments/configurable-payment-provider.js";
import type { RecordingNotifier } from "../../../src/notifications/notifier.js";

export class ProviderAssertions {
  constructor(
    private readonly provider: ConfigurablePaymentProvider,
    private readonly notifier: RecordingNotifier,
  ) {}

  calledTimes(times: number): void {
    expect(this.provider.calls).toHaveLength(times);
  }

  lastCharge(expected: {
    amount: number;
    customerId: string;
    paymentMethodId: string;
  }): void {
    const last = this.provider.calls.at(-1);
    expect(last).toBeDefined();
    expect(last?.amount).toBe(expected.amount);
    expect(last?.customerId).toBe(expected.customerId);
    expect(last?.paymentMethodId).toBe(expected.paymentMethodId);
    expect(last?.idempotencyKey).toMatch(/^charge:/);
  }

  notifierCount(event: string, times: number, subscriptionId?: string): void {
    expect(this.notifier.count(event, subscriptionId)).toBe(times);
  }

  firstCharge(expected: {
    amount: number;
    customerId: string;
    paymentMethodId: string;
    subscriptionId: string;
    idempotencyKey: string;
  }): void {
    const call = this.provider.calls[0];
    expect(call).toBeDefined();
    expect(call?.amount).toBe(expected.amount);
    expect(call?.customerId).toBe(expected.customerId);
    expect(call?.paymentMethodId).toBe(expected.paymentMethodId);
    expect(call?.subscriptionId).toBe(expected.subscriptionId);
    expect(call?.invoiceId).toMatch(/^inv_/);
    expect(call?.idempotencyKey).toBe(expected.idempotencyKey);
    expect(call?.currency).toBe("USD");
  }
}
