import type { ChargeRequest, ChargeResult } from "../types.js";

export interface PaymentProvider {
  charge(request: ChargeRequest): ChargeResult;
}
