import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { type SubscriptionService } from "../app/subscription-service.js";
import type { WebhookService } from "../app/webhook-service.js";
import { ApiError } from "./api-error.js";
import { createSubscriptionSchema } from "./schemas.js";
import { toSubscriptionResponse } from "./subscription-response.js";

export interface AppServices {
  subscriptions: SubscriptionService;
  webhooks: WebhookService;
}

type RequestWithRawBody = Request & { rawBody?: string };

export function createApp(services: AppServices): Express {
  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as RequestWithRawBody).rawBody = buf.toString("utf8");
      },
    }),
  );

  app.post("/subscriptions", (req, res, next) => {
    try {
      const parsed = createSubscriptionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(
          400,
          "invalid_request",
          parsed.error.issues[0]?.message ?? "invalid body",
        );
      }
      const created = services.subscriptions.create({
        customerId: parsed.data.customer_id,
        plan: parsed.data.plan,
        paymentMethodId: parsed.data.payment_method_id,
      });
      res.status(201).json(toSubscriptionResponse(created));
    } catch (error) {
      next(error);
    }
  });

  app.get("/subscriptions/:id", (req, res, next) => {
    try {
      const found = services.subscriptions.get(req.params.id);
      res.status(200).json(toSubscriptionResponse(found));
    } catch (error) {
      next(error);
    }
  });

  app.post("/subscriptions/:id/cancel", (req, res, next) => {
    try {
      const canceled = services.subscriptions.cancel(req.params.id);
      res.status(200).json(toSubscriptionResponse(canceled));
    } catch (error) {
      next(error);
    }
  });

  app.post("/subscriptions/:id/billing-cycle", (req, res, next) => {
    try {
      const billed = services.subscriptions.runBillingCycle(req.params.id);
      res.status(200).json(toSubscriptionResponse(billed));
    } catch (error) {
      next(error);
    }
  });

  app.post("/webhooks/payment-provider", (req, res, next) => {
    try {
      const raw = (req as RequestWithRawBody).rawBody ?? JSON.stringify(req.body ?? {});
      const signature = req.header("X-Provider-Signature");
      const result = services.webhooks.process(raw, signature);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ApiError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({
        error: "malformed_json",
        message: "request body is not valid JSON",
      });
      return;
    }
    res.status(500).json({ error: "internal", message: "unexpected error" });
  });

  return app;
}
