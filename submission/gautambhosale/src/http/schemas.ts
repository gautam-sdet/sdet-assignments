import { z } from "zod";

export const createSubscriptionSchema = z.object({
  customer_id: z.string().min(1),
  plan: z.string().min(1),
  payment_method_id: z.string().min(1),
});

export const webhookPayloadSchema = z.object({
  event_id: z.string().min(1),
  type: z.enum(["payment.succeeded", "payment.failed", "payment.refunded"]),
  subscription_id: z.string().min(1),
  invoice_id: z.string().min(1),
  amount: z.number(),
  currency: z.string().min(1),
});
