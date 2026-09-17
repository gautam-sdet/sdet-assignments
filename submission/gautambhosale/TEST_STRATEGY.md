# Test strategy — Subscription & Billing

Documented against the official `SDET_ASSIGNMENT.md` (Option 3 fixture + OOP suite). TypeScript, Vitest, Supertest, in-memory store.

## Assumptions about the system under test

- No production service was provided, so this repo ships a **minimal HTTP fixture** (Express) with an in-memory store.
- Plans: `basic` (trial, no charge on create) and `pro` (immediate charge). Amounts match the assignment example (`pro` = 4900).
- Webhooks are HMAC-SHA256 over the **raw body**, header `X-Provider-Signature`.
- `POST /subscriptions/{id}/billing-cycle` is fixture-only: trial-end / renewal / dunning. It is the path that calls `PaymentProvider.charge()`.
- Inbound `payment.*` webhooks apply money outcomes **without** calling the provider.
- Max **3** failed charges then cancel (`past_due` → `canceled`).
- `payment.refunded` marks the invoice refunded and **does not** change subscription status (not in the assignment transition diagram).
- Recurring success on `active` is a self-transition so a paid renewal is not classified as illegal.
- No plan-change API: the problem statement mentions “plan changes”; the published operations are create / get / cancel / webhook. Plan differences are proven at create and on charge arguments.

## Scope

**In scope:** create / get / cancel; missing-field and validation errors; webhook signature vs malformed payload (separate from business logic); every listed lifecycle transition via billing-cycle **and** via `payment.succeeded` / `payment.failed` where the trigger is a charge; ≥2 illegal transitions; provider success/decline/timeout; duplicate `event_id`; stale fail-after-success; fail-then-success on the same invoice; refund; persistence of subscriptions, invoices, webhook events, audit log; timestamps/references.

**Out of scope:** UI, live PSP, proration, tax, multi-currency, concurrent webhook races (bonus), performance, monitoring, dashboards, plan-change API.

## Test levels

| Level | Where |
| --- | --- |
| Domain | `tests/domain/state-machine.spec.ts` |
| API contract | `tests/api/*` |
| State machine / workflow | `tests/lifecycle/*` |
| Persistence | `tests/persistence/*` plus assertions in other files |
| External mock | `tests/provider/*` |
| E2E (HTTP → service → store → mock) | `tests/e2e/*` |

## Real vs stubbed

- **Real:** HTTP stack, validation, state machine, repositories, HMAC verify.
- **Mocked:** `PaymentProvider` via `ConfigurablePaymentProvider`.
- **Simulated:** `WebhookSimulator`.
- **Controlled:** `FrozenClock`, seeded `cust_001`.

Each `TestWorld.start()` builds a **new store**. That is how we avoid stale-data false positives.

## Design patterns (and the problem each one solves)

1. **State machine / transition table** — `src/domain/subscription-state-machine.ts`. Illegal transitions cannot be “set status = active” from a random call site.
2. **Builder** — `tests/support/builders/`. Scenarios read as intent.
3. **Strategy + Factory** — `src/domain/plan-strategy.ts`. Trial vs immediate charge and price live in one place.
4. **Provider seam** — `src/payments/payment-provider.ts` injected into `SubscriptionService` (`src/app/subscription-service.ts`). Tests inject `ConfigurablePaymentProvider`.
5. **Repository** — `src/persistence/repositories.ts`. Tests never poke `Map` internals.
6. **API client + webhook simulator** — `tests/support/http/billing-api-client.ts`, `tests/support/http/webhook-simulator.ts`.
7. **TestWorld** — `tests/support/world.ts`. Specs import this barrel (`tests/support/index.ts`).

## API contracts

```text
POST /subscriptions
GET  /subscriptions/:id
POST /subscriptions/:id/cancel
POST /subscriptions/:id/billing-cycle   # fixture
POST /webhooks/payment-provider
```

Create body: `{ customer_id, plan, payment_method_id }`.  
Webhook body: `{ event_id, type, subscription_id, invoice_id, amount, currency }`.

Webhook **request handling** (`tests/api/webhook-request-handling.spec.ts`) is separate from webhook **business logic** (`tests/webhooks/*`, `tests/lifecycle/*`).

## Database entities and invariants

| Entity | What we assert |
| --- | --- |
| `subscriptions` | status/plan/amount match API; `canceledAt` set iff canceled; `createdAt` ≤ `updatedAt` |
| `invoices` | one row per genuine attempt; paid vs failed; `settledAt`; amount matches subscription |
| `webhook_events` | keyed by `event_id`; duplicate is a no-op; stale/canceled outcomes recorded |
| `audit_log` | lifecycle actions with from/to status |

Seed: harness inserts `cust_001`. Clean: new harness, not a shared wipe.

## Webhook / idempotency

1. Verify HMAC on raw body.
2. If `event_id` exists → `{ outcome: "duplicate" }`, no further writes.
3. If subscription `canceled` → record `ignored_canceled`, **do not** create an invoice.
4. If `payment.failed` and invoice already `paid` → `ignored_stale`.
5. Else apply charge outcome through the same path billing-cycle uses.

## Known limitations

- In-memory store is process-local; not durable.
- `charge()` is synchronous.
- No advisory lock around parallel webhooks (bonus, not implemented).
- No plan-change endpoint.
- Refund does not reverse `active`.
