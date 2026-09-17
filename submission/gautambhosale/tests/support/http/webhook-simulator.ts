import request from "supertest";
import { signWebhookBody } from "../../../src/payments/hmac.js";

/** Signs (or deliberately fails to sign) POSTs to `/webhooks/payment-provider`. */
export class WebhookSimulator {
  constructor(
    private readonly http: ReturnType<typeof request>,
    private readonly webhookSecret: string,
  ) {}

  post(
    payload: string | Record<string, unknown>,
    options: { signature?: string | null; secret?: string } = {},
  ) {
    const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
    const req = this.http
      .post("/webhooks/payment-provider")
      .set("Content-Type", "application/json")
      .send(raw);

    if (options.signature === null) {
      return req;
    }
    const secret = options.secret ?? this.webhookSecret;
    const signature = options.signature ?? signWebhookBody(raw, secret);
    return req.set("X-Provider-Signature", signature);
  }
}
