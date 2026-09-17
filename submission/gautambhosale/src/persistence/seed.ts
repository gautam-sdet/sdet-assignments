import { FIXTURE_CUSTOMER } from "../config/fixture.js";
import type { CustomerRepository } from "./repositories.js";

export function seedFixtureCustomer(customers: CustomerRepository): void {
  customers.seed({
    id: FIXTURE_CUSTOMER.id,
    email: FIXTURE_CUSTOMER.email,
  });
}
