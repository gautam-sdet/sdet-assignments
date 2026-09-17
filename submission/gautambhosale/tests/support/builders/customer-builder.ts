import { DEFAULT_CUSTOMER } from "../defaults.js";

export class CustomerBuilder {
  private id: string = DEFAULT_CUSTOMER.id;
  private email: string = DEFAULT_CUSTOMER.email;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withEmail(email: string): this {
    this.email = email;
    return this;
  }

  build() {
    return { id: this.id, email: this.email };
  }
}
