import type {
  AuditEntry,
  Customer,
  Invoice,
  Subscription,
  WebhookEventRecord,
} from "../types.js";
import type { InMemoryStore } from "./store.js";

export class CustomerRepository {
  constructor(private readonly store: InMemoryStore) {}

  get(id: string): Customer | undefined {
    return this.store.customers.get(id);
  }

  seed(customer: Customer): void {
    this.store.customers.set(customer.id, customer);
  }
}

export class SubscriptionRepository {
  constructor(private readonly store: InMemoryStore) {}

  save(subscription: Subscription): void {
    this.store.subscriptions.set(subscription.id, {
      ...subscription,
    });
  }

  get(id: string): Subscription | undefined {
    const found = this.store.subscriptions.get(id);
    return found ? { ...found } : undefined;
  }

  list(): Subscription[] {
    return [...this.store.subscriptions.values()].map((s) => ({ ...s }));
  }
}

export class InvoiceRepository {
  constructor(private readonly store: InMemoryStore) {}

  save(invoice: Invoice): void {
    this.store.invoices.set(invoice.id, { ...invoice });
  }

  get(id: string): Invoice | undefined {
    const found = this.store.invoices.get(id);
    return found ? { ...found } : undefined;
  }

  findBySubscription(subscriptionId: string): Invoice[] {
    return [...this.store.invoices.values()]
      .filter((invoice) => invoice.subscriptionId === subscriptionId)
      .map((invoice) => ({ ...invoice }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export class WebhookEventRepository {
  constructor(private readonly store: InMemoryStore) {}

  get(eventId: string): WebhookEventRecord | undefined {
    const found = this.store.webhookEvents.get(eventId);
    return found ? { ...found } : undefined;
  }

  save(record: WebhookEventRecord): void {
    this.store.webhookEvents.set(record.eventId, { ...record });
  }

  listForSubscription(subscriptionId: string): WebhookEventRecord[] {
    return [...this.store.webhookEvents.values()]
      .filter((event) => event.subscriptionId === subscriptionId)
      .map((event) => ({ ...event }));
  }

  count(): number {
    return this.store.webhookEvents.size;
  }
}

export class AuditRepository {
  constructor(private readonly store: InMemoryStore) {}

  append(entry: AuditEntry): void {
    this.store.auditLog.push({ ...entry, detail: { ...entry.detail } });
  }

  forSubscription(subscriptionId: string): AuditEntry[] {
    return this.store.auditLog
      .filter((entry) => entry.subscriptionId === subscriptionId)
      .map((entry) => ({ ...entry, detail: { ...entry.detail } }));
  }
}

export interface Repositories {
  customers: CustomerRepository;
  subscriptions: SubscriptionRepository;
  invoices: InvoiceRepository;
  webhookEvents: WebhookEventRepository;
  audit: AuditRepository;
}

export function createRepositories(store: InMemoryStore): Repositories {
  return {
    customers: new CustomerRepository(store),
    subscriptions: new SubscriptionRepository(store),
    invoices: new InvoiceRepository(store),
    webhookEvents: new WebhookEventRepository(store),
    audit: new AuditRepository(store),
  };
}
