import { expect } from "vitest";
import type { Repositories } from "../../../src/persistence/repositories.js";
import type { InvoiceStatus, SubscriptionStatus } from "../../../src/types.js";

export class PersistenceAssertions {
  constructor(private readonly repos: Repositories) {}

  subscriptionStatus(id: string, status: SubscriptionStatus): void {
    const row = this.repos.subscriptions.get(id);
    expect(row, `subscription ${id} should exist`).toBeDefined();
    expect(row?.status).toBe(status);
  }

  apiMatchesRow(
    id: string,
    apiBody: { status: string; plan: string; amount: number },
  ): void {
    const row = this.repos.subscriptions.get(id);
    expect(row).toBeDefined();
    expect(row?.status).toBe(apiBody.status);
    expect(row?.planId).toBe(apiBody.plan);
    expect(row?.amount).toBe(apiBody.amount);
  }

  invoiceCount(subscriptionId: string, expected: number): void {
    expect(this.repos.invoices.findBySubscription(subscriptionId)).toHaveLength(
      expected,
    );
  }

  latestInvoiceStatus(subscriptionId: string, status: InvoiceStatus): void {
    const invoices = this.repos.invoices.findBySubscription(subscriptionId);
    expect(invoices.length).toBeGreaterThan(0);
    expect(invoices[invoices.length - 1]?.status).toBe(status);
  }

  noPaidInvoice(subscriptionId: string): void {
    const paid = this.repos.invoices
      .findBySubscription(subscriptionId)
      .filter((invoice) => invoice.status === "paid");
    expect(paid).toHaveLength(0);
  }

  hasPaidInvoice(subscriptionId: string): void {
    const paid = this.repos.invoices
      .findBySubscription(subscriptionId)
      .filter((invoice) => invoice.status === "paid");
    expect(paid.length).toBeGreaterThan(0);
  }

  canceledIsTerminal(subscriptionId: string): void {
    const sub = this.repos.subscriptions.get(subscriptionId);
    expect(sub?.status).toBe("canceled");
    expect(sub?.canceledAt).not.toBeNull();
  }

  webhookOutcome(eventId: string, outcome: string): void {
    expect(this.repos.webhookEvents.get(eventId)?.outcome).toBe(outcome);
  }

  webhookEventCount(expected: number): void {
    expect(this.repos.webhookEvents.count()).toBe(expected);
  }

  subscriptionCount(expected: number): void {
    expect(this.repos.subscriptions.list()).toHaveLength(expected);
  }

  invoiceStatus(invoiceId: string, status: InvoiceStatus): void {
    expect(this.repos.invoices.get(invoiceId)?.status).toBe(status);
  }

  latestInvoiceId(subscriptionId: string): string {
    const invoices = this.repos.invoices.findBySubscription(subscriptionId);
    const id = invoices[invoices.length - 1]?.id;
    expect(id, `expected an invoice for ${subscriptionId}`).toBeDefined();
    return id!;
  }

  paidChargeIsCoherent(subscriptionId: string, amount: number): void {
    const sub = this.repos.subscriptions.get(subscriptionId);
    const invoices = this.repos.invoices.findBySubscription(subscriptionId);
    const invoice = invoices[0];
    expect(sub).toBeDefined();
    expect(invoice).toBeDefined();
    expect(invoice!.amount).toBe(amount);
    expect(invoice!.currency).toBe("USD");
    expect(invoice!.settledAt).not.toBeNull();
    expect(sub!.createdAt <= sub!.updatedAt).toBe(true);
    expect(invoice!.createdAt <= invoice!.settledAt!).toBe(true);
    expect(invoice!.subscriptionId).toBe(subscriptionId);
    expect(invoice!.amount).toBe(sub!.amount);
    const audit = this.repos.audit.forSubscription(subscriptionId);
    expect(audit.map((entry) => entry.action)).toContain("lifecycle.CHARGE_SUCCEEDED");
    expect(
      audit.some(
        (entry) => entry.fromStatus === "trialing" && entry.toStatus === "active",
      ),
    ).toBe(true);
  }
}
