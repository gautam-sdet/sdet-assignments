import type { ChargeRequest, ChargeResult, ChargeOutcome } from "../types.js";

export interface PaymentProvider {
  charge(request: ChargeRequest): ChargeResult;
}

export class ConfigurablePaymentProvider implements PaymentProvider {
  readonly calls: ChargeRequest[] = [];
  private readonly queued: ChargeOutcome[] = [];
  defaultOutcome: ChargeOutcome = "succeeded";

  enqueue(...outcomes: ChargeOutcome[]): void {
    this.queued.push(...outcomes);
  }

  reset(): void {
    this.calls.length = 0;
    this.queued.length = 0;
    this.defaultOutcome = "succeeded";
  }

  charge(request: ChargeRequest): ChargeResult {
    this.calls.push({ ...request });
    const outcome = this.queued.shift() ?? this.defaultOutcome;
    if (outcome === "succeeded") {
      return { outcome, providerChargeId: `ch_${this.calls.length}` };
    }
    return { outcome };
  }
}
