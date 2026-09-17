import type { PlanId } from "../../../src/types.js";
import { DEFAULT_CUSTOMER, DEFAULT_PAYMENT_METHOD } from "../defaults.js";

export class CreateSubscriptionBuilder {
  private customerId: string = DEFAULT_CUSTOMER.id;
  private plan: PlanId | string = "basic";
  private paymentMethodId: string = DEFAULT_PAYMENT_METHOD;

  forCustomer(customerId: string): this {
    this.customerId = customerId;
    return this;
  }

  onPlan(plan: PlanId | string): this {
    this.plan = plan;
    return this;
  }

  withPaymentMethod(paymentMethodId: string): this {
    this.paymentMethodId = paymentMethodId;
    return this;
  }

  build() {
    return {
      customer_id: this.customerId,
      plan: this.plan,
      payment_method_id: this.paymentMethodId,
    };
  }
}
