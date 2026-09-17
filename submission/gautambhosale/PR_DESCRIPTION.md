## Summary
Minimal Express **service fixture** plus an OOP test harness for a Subscription & Billing domain (assignment Option 3). Tests drive HTTP (Supertest), assert **persisted** subscriptions/invoices/webhook events/audit rows, and record **payment provider** calls. The payment provider is a mock; inbound webhooks are signed in-process. There is no live PSP.

## Test Strategy
- Levels covered: domain state-machine, API contract, lifecycle (API + webhook), persistence, mock-provider interaction, HTTP-to-DB e2e.
- In scope: create/get/cancel; validation including missing fields; HMAC vs malformed webhook handling; every listed lifecycle transition; ≥2 illegal transitions; idempotent `event_id`; stale and out-of-order webhooks on the same invoice; decline/timeout; dunning after 3 failures; refund without status change.
- Out of scope: UI, live PSP, proration/tax/FX, plan-change API, concurrent webhook races (bonus), performance, monitoring, dashboards.
- What is real vs stubbed/mocked, and why: real HTTP + in-memory repositories + state machine (so API↔DB drift is detectable). Mocked `PaymentProvider` so tests force success/decline/timeout and assert arguments. Simulated signed webhooks because inbound PSP traffic is not a live network here.

## OOP & Design Pattern Choices
- **State machine / transition table** (`src/domain/subscription-state-machine.ts`, class `SubscriptionStateMachine`): illegal transitions return `ignored` instead of mutating a status string from controllers.
- **Builder** (`tests/support/builders/` — `CustomerBuilder`, `CreateSubscriptionBuilder`, `WebhookPayloadBuilder`): test data reads as intent.
- **Strategy + Factory** (`src/domain/plan-strategy.ts`, `PlanCatalog`): `basic` vs `pro` trial/price without scattered `if (plan === ...)`.
- **Payment provider seam** (`src/payments/payment-provider.ts` interface `PaymentProvider`): injected in the `SubscriptionService` constructor. Tests inject `ConfigurablePaymentProvider` through `TestWorld.willCharge()`.
- **Repository** (`src/persistence/repositories.ts`): persistence assertions go through DAOs.
- **API client** (`tests/support/http/billing-api-client.ts`) and **webhook simulator** (`tests/support/http/webhook-simulator.ts`): transport and HMAC stay out of specs.

## API Validation Approach
- Requests/responses: Zod schemas in `src/http/schemas.ts` plus service `ApiError` (400/404/409). Tests assert status and body shape on 201/200.
- Webhook **request handling** is separate from **business logic**: `tests/api/webhook-request-handling.spec.ts` covers missing signature, forged signature, wrong secret, malformed JSON, missing `event_id`, unknown type (401/400, no lifecycle write). Lifecycle/idempotency tests only send valid signatures.
- Failure scenarios: unknown plan, unknown customer, omitted `customer_id`, empty/invalid payment method, GET 404, cancel already-canceled, billing-cycle on canceled.

## Database Validation Approach
- Entities: `subscriptions`, `invoices`, `webhook_events`, `audit_log`.
- Invariants: API status === row status; `active` requires a paid invoice; canceled is terminal (`canceledAt` set); duplicate webhook does not insert a second invoice; invoice amount and `subscriptionId` match; `createdAt` ≤ `updatedAt` / `settledAt`.
- Lifecycle stages: create (trialing, no invoice for `basic`), first charge, past_due, recover, cancel — not create-only. Seed is `cust_001` in `TestWorld`; isolation is a new store per test.

## Mock Payment Provider & Webhook Validation
- `ConfigurablePaymentProvider` records each `charge()` (amount, customer, payment method, invoice id, idempotency key).
- Billing-cycle / pro-create: once per attempt. Rejected create and webhook replay: **zero** calls.
- Duplicate `event_id` → `duplicate`, one webhook row, one `subscription.activated` notification.
- Stale: `payment.failed` after paid invoice → `ignored_stale`, stays `active`.
- Out-of-order: `payment.failed` then `payment.succeeded` on the same `invoice_id` → `active` and paid.

## State-Machine / Lifecycle Coverage
- Valid (assignment diagram): trial success/fail, recurring fail, retry success, retries exhausted, API cancel from `trialing` and `active`. Charge arrows are also driven by webhooks (`payment.succeeded` / `payment.failed`). Recurring success on `active` is a documented self-transition.
- Invalid (proven): `canceled` + `payment.succeeded`, `canceled` + `payment.failed`, billing-cycle on canceled (409, no provider call).
- Confidence: transitions are table-driven; a handler that set `status` directly would still fail these tests when the table disagrees — the service only applies `machine.decide()`.

## Test Architecture
`TestWorld` (`tests/support/world.ts`) is the spec entry point. Specs use `world.given`, `world.willCharge`, `world.api`, and `world.verify` — they do not import `TestHarness` or repositories. `composeBilling` (`src/app/compose.ts`) is the single wiring for `src/index.ts` and tests. See `tests/README.md`.

## Validation
- `npm install`
- `npm test`
- `npm run lint`
- `npm run build` (`tsc --noEmit`; also the lint gate)

Schema checks are in-process (Zod create body + webhook payload validator), exercised by the API tests rather than a separate `validate-schema` CLI.

## Known Limitations / Next Steps
In-memory only; sync provider; no webhook mutex (concurrency is a spec bonus); no plan-change endpoint; refund does not change lifecycle. With more time: SQLite plus a parallel duplicate-`event_id` test.

## Responsible AI Usage
- Did you use AI tools? Yes, a coding assistant for scaffolding and boilerplate.
- Where they helped: project layout, Express wiring, first-pass test names.
- What was verified against the assignment text (not guessed): HMAC on the raw body; canceled webhooks must not insert invoices; dunning is three failed charges; provider argument asserts; webhook request handling vs business logic; every listed lifecycle arrow; duplicate `event_id`; `npm test` / `tsc`.

## Author Checklist
- [x] Linting passes (`npm run lint` → `tsc --noEmit`)
- [x] Type check passes (`npm run build`)
- [x] Test suite passes
- [x] Schema/setup validation passes (Zod + webhook validator via tests)
- [x] Every listed lifecycle transition is exercised by at least one test
- [x] At least two invalid transitions are proven impossible
- [x] Webhook idempotency (duplicate `event_id`) is tested
- [x] README was tested from a clean setup (`npm install && npm test`)
