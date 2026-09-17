# Test framework

Object-oriented automation around a small HTTP billing fixture. Specs describe **behavior**. They import **only** `tests/support/index.ts`.

## How to run

```bash
npm install
npm test
npm test -- tests/lifecycle/valid-transitions.spec.ts
npm run lint
npm run build
```

Each test calls `TestWorld.start()`, which builds a **new in-memory store**. Nothing is shared between tests.

## Folder map

```text
tests/
  support/
    index.ts               # public API
    world.ts / given.ts / harness.ts / defaults.ts
    http/                  # BillingApiClient + WebhookSimulator
    builders/
    assertions/
  api/  lifecycle/  webhooks/  provider/  persistence/  e2e/  domain/
```

## Code flow

```text
spec
  └─ TestWorld.start()
        ├─ TestHarness
        │     ├─ ConfigurablePaymentProvider
        │     ├─ composeBilling() → services + Express
        │     └─ BillingApiClient + WebhookSimulator
        ├─ world.given.*
        ├─ world.willCharge(...)     → next mock charge outcome
        ├─ world.api.* / paymentWebhook
        └─ world.verify.*            → repositories / recorded charges
```

Example:

1. `world.given.basicTrial()` → `POST /subscriptions` plan `basic`.
2. `world.willCharge("declined")` → next `charge()` declines.
3. `world.api.runBillingCycle(id)` → service → mock → invoice + `past_due`.
4. `world.verify.latestInvoiceStatus(id, "failed")` reads the invoice repository, not only the HTTP body.

Inbound webhooks skip `charge()`: `world.api.postWebhook(world.paymentWebhook(...))`.

## Adding a scenario

1. `import { TestWorld } from "../support/index.js"`.
2. `const world = TestWorld.start()`.
3. Use `given` / `willCharge` / `api` / `paymentWebhook` / `verify`.
4. Put the file under the matching risk folder.

Do not import `TestHarness`, `supertest`, or repositories in specs. New checks belong on `PersistenceAssertions` or `ProviderAssertions`, then wrap them on `BillingAssertions`.
