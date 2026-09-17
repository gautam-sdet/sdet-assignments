import request from "supertest";
import { WebhookSimulator } from "./webhook-simulator.js";

/** Typed HTTP facade — specs never call raw supertest paths. */
export class BillingApiClient {
  readonly webhooks: WebhookSimulator;

  constructor(
    private readonly http: ReturnType<typeof request>,
    webhookSecret: string,
  ) {
    this.webhooks = new WebhookSimulator(http, webhookSecret);
  }

  createSubscription(body: Record<string, unknown>) {
    return this.http.post("/subscriptions").send(body);
  }

  getSubscription(id: string) {
    return this.http.get(`/subscriptions/${id}`);
  }

  cancelSubscription(id: string) {
    return this.http.post(`/subscriptions/${id}/cancel`);
  }

  runBillingCycle(id: string) {
    return this.http.post(`/subscriptions/${id}/billing-cycle`);
  }

  postWebhook(
    payload: string | Record<string, unknown>,
    options: { signature?: string | null; secret?: string } = {},
  ) {
    return this.webhooks.post(payload, options);
  }
}
