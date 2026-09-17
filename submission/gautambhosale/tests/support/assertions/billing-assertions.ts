import type { TestHarness } from "../harness.js";
import { PersistenceAssertions } from "./persistence-assertions.js";
import { ProviderAssertions } from "./provider-assertions.js";
import type { InvoiceStatus, SubscriptionStatus } from "../../../src/types.js";

/** Facade so specs call one `verify` object. */
export class BillingAssertions {
  private readonly persistence: PersistenceAssertions;
  private readonly provider: ProviderAssertions;

  constructor(harness: TestHarness) {
    this.persistence = new PersistenceAssertions(harness.repos);
    this.provider = new ProviderAssertions(harness.provider, harness.notifier);
  }

  subscriptionStatus(id: string, status: SubscriptionStatus): void {
    this.persistence.subscriptionStatus(id, status);
  }

  apiMatchesPersistence(
    id: string,
    apiBody: { status: string; plan: string; amount: number },
  ): void {
    this.persistence.apiMatchesRow(id, apiBody);
  }

  invoiceCount(subscriptionId: string, expected: number): void {
    this.persistence.invoiceCount(subscriptionId, expected);
  }

  latestInvoiceStatus(subscriptionId: string, status: InvoiceStatus): void {
    this.persistence.latestInvoiceStatus(subscriptionId, status);
  }

  noPaidInvoice(subscriptionId: string): void {
    this.persistence.noPaidInvoice(subscriptionId);
  }

  hasPaidInvoice(subscriptionId: string): void {
    this.persistence.hasPaidInvoice(subscriptionId);
  }

  webhookOutcome(eventId: string, outcome: string): void {
    this.persistence.webhookOutcome(eventId, outcome);
  }

  providerCalledTimes(times: number): void {
    this.provider.calledTimes(times);
  }

  lastProviderCharge(expected: {
    amount: number;
    customerId: string;
    paymentMethodId: string;
  }): void {
    this.provider.lastCharge(expected);
  }

  notifierCount(event: string, times: number, subscriptionId?: string): void {
    this.provider.notifierCount(event, times, subscriptionId);
  }

  canceledIsTerminal(subscriptionId: string): void {
    this.persistence.canceledIsTerminal(subscriptionId);
  }

  webhookEventCount(expected: number): void {
    this.persistence.webhookEventCount(expected);
  }

  subscriptionCount(expected: number): void {
    this.persistence.subscriptionCount(expected);
  }

  invoiceStatus(invoiceId: string, status: InvoiceStatus): void {
    this.persistence.invoiceStatus(invoiceId, status);
  }

  latestInvoiceId(subscriptionId: string): string {
    return this.persistence.latestInvoiceId(subscriptionId);
  }

  paidChargeIsCoherent(subscriptionId: string, amount: number): void {
    this.persistence.paidChargeIsCoherent(subscriptionId, amount);
  }

  firstProviderCharge(expected: {
    amount: number;
    customerId: string;
    paymentMethodId: string;
    subscriptionId: string;
    idempotencyKey: string;
  }): void {
    this.provider.firstCharge(expected);
  }
}
