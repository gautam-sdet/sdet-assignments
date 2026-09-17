import type {
  AuditEntry,
  Customer,
  Invoice,
  Subscription,
  WebhookEventRecord,
} from "../types.js";

export class InMemoryStore {
  readonly customers = new Map<string, Customer>();
  readonly subscriptions = new Map<string, Subscription>();
  readonly invoices = new Map<string, Invoice>();
  readonly webhookEvents = new Map<string, WebhookEventRecord>();
  readonly auditLog: AuditEntry[] = [];
}
