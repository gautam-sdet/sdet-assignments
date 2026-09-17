# Approach

The system under test is a **stateful billed resource**. A `201` on create is not enough. Confidence comes from four layers together:

1. **API** — create, get, cancel, and webhook request handling (status codes and payload shape).
2. **State machine** — only documented transitions occur, whether the trigger is an API call or a webhook.
3. **Persistence** — subscription, invoice, webhook-event, and audit rows match the API result at every stage, not only at create.
4. **Payment provider mock** — outbound charges go through an injectable client; inbound webhooks are signed (and forged) by the suite.

Invariants that must hold after every move:

- API status equals the subscription row.
- `active` always has at least one paid invoice.
- The same `event_id` twice is a no-op (no second invoice, no second side effect).
- A late `payment.failed` must not undo a paid invoice.
- `canceled` is terminal: no further billing, no reactivation via webhook.

## Domain assumptions

**HTTP surface (real in the fixture):**

```text
POST /subscriptions
GET  /subscriptions/{id}
POST /subscriptions/{id}/cancel
POST /webhooks/payment-provider
POST /subscriptions/{id}/billing-cycle   # fixture-only: trial end / renewal / dunning
```

Create body: `{ customer_id, plan, payment_method_id }`.  
Webhook body: `{ event_id, type, subscription_id, invoice_id, amount, currency }`.  
Webhook header: `X-Provider-Signature` over the **raw** body. HMAC is verified before any business write.

**Plans** (Strategy via `PlanCatalog`, not scattered `if (plan)`):

- `basic` — 900 cents, 14-day trial, starts `trialing`, no charge on create
- `pro` — 4900 cents, no trial, charge on create → `active` or `past_due`

**Lifecycle (must all be exercised):**

```text
trialing --(trial ends, first charge succeeds)--> active
trialing --(trial ends, first charge fails)------> past_due
active   --(recurring charge fails)---------------> past_due
past_due --(retry charge succeeds)----------------> active
past_due --(retries exhausted)--------------------> canceled
active   --(customer/API cancel)------------------> canceled
trialing --(customer/API cancel)------------------> canceled
```

Anything not listed is rejected or ignored, not silently accepted.

**Extra assumptions (needed to run the domain, not in the diagram):**

- Dunning: three consecutive failed charges then `canceled`.
- Recurring **success** on `active` is a self-transition (renewal stays `active` and records a paid invoice).
- `payment.refunded` marks the invoice refunded and does **not** change subscription status (refund is not a listed transition).
- There is no plan-change API. High-level wording mentions plan changes; the published operations do not. Plan differences are proven at create (price + trial), not via `PATCH`.
- `POST .../billing-cycle` is not a product API. It stands in for “trial ended / invoice due” so time is not waited out. The same charge outcome can also arrive as an inbound webhook **without** a second provider call.

**Two drivers for money events:**

| Path | Provider `charge()` | Typical use |
| --- | --- | --- |
| Billing-cycle / pro create | Yes, once per attempt | Outbound collect |
| Inbound `payment.succeeded` / `payment.failed` | No | PSP already charged; service applies the result |

## Fixture and seams

No production service is provided (Option 3: small HTTP service + test doubles). Tests use a queryable in-memory store. Each run starts a **new store** so leftover rows cannot fake a pass.

**Real vs double**

| Piece | Role |
| --- | --- |
| HTTP fixture, Zod/API errors, state machine, repositories, HMAC verify | Real (in-process) |
| `PaymentProvider` | Mocked (`ConfigurablePaymentProvider`) |
| Inbound webhooks | Simulated (`WebhookSimulator` signs or omits the header) |
| Clock | Controlled (`FrozenClock`) |
| Live Stripe / network PSP | Not used |

Seed: `cust_001` only. Plans come from `PlanCatalog`, not from leftover rows. Isolation is a new `TestWorld` per test (internally a `TestHarness`), not a shared database wipe.

Behavior-first: an invariant is written as a failing scenario, then the fixture is the minimum that makes it pass (Red / Blue / Green). Intermediate git steps are not kept.

### Required OOP patterns

These are the patterns the assignment asks for, each used because it removes a real failure mode — not as a checklist.

| Pattern (spec) | What it is here | Problem it solves |
| --- | --- | --- |
| State machine / transition table | `SubscriptionStateMachine` | Illegal `canceled → active` cannot be a stray `status =` in a handler |
| Builder | `CustomerBuilder`, `CreateSubscriptionBuilder`, `WebhookPayloadBuilder` | Scenarios read as intent, not copy-pasted JSON |
| Payment-provider seam (interface + injection) | `PaymentProvider` injected into `SubscriptionService`; tests pass `ConfigurablePaymentProvider` | Force success / decline / timeout; assert amount, customer, payment method, idempotency key — no live PSP |
| Extra: Strategy + Factory | `PlanBillingStrategy` / `PlanCatalog` | Trial vs immediate charge and price live in one place |
| Extra: Repository | Subscription / invoice / webhook-event / audit DAOs | Persistence asserts are not raw maps inside specs |

Webhook **simulation** is not a second PSP: `WebhookPayloadBuilder` plus `WebhookSimulator` sign or omit `X-Provider-Signature` and POST.

### Test architecture (separate classes)

Matches the six responsibilities in the assignment:

| Role | Class | Responsibility |
| --- | --- | --- |
| Scenario entry | `TestWorld` | Specs use `given`, `willCharge`, `api`, `verify` only |
| Givens | `GivenScenarios` | Reusable trial / pro / past_due / canceled setups |
| Fixture / environment | `TestHarness` + `composeBilling` | Seed, inject mock, isolate (not imported by specs) |
| API client | `BillingApiClient` | Typed HTTP |
| Mock provider + webhook delivery | `ConfigurablePaymentProvider` + `WebhookSimulator` | Outcomes and HMAC |
| Assertions | `BillingAssertions` | Persistence + provider via repositories |
| Scenarios | Specs grouped by risk | API, lifecycle, webhooks, provider, persistence, e2e |
| Test data builders | `CustomerBuilder`, `CreateSubscriptionBuilder`, `WebhookPayloadBuilder` | Intent instead of raw JSON |

That split is what makes the suite extendable: a new scenario reuses harness + client + builders + assertions instead of growing another script file.

## What will be proven

**API contract**

- Create / get / cancel: codes and body shape
- GET unknown id → 404
- Unknown plan, unknown customer, missing `customer_id`, missing/invalid payment method → 400, **no** provider call, **no** subscription row
- Cancel already-canceled → 409, no extra provider call
- Webhook **request handling** (signature, malformed JSON, missing fields, unknown type) is asserted **before** lifecycle: 401/400 and no business write
- Webhook **business logic** (transitions, idempotency, stale events) is a separate group of tests

**Lifecycle**

- Every arrow in the diagram: outbound `billing-cycle` **and** inbound `payment.succeeded` / `payment.failed` where the trigger is a charge
- API cancel from `trialing` and from `active`
- Recurring success on `active` stays `active` (self-transition) and writes another paid invoice; charge amount still matches the plan catalog
- At least two illegal cases: `canceled` + `payment.succeeded`, `canceled` + `payment.failed` (no invoice write, no reactivation)
- Billing-cycle on `canceled` → 409, provider not called
- Plan price and trial length applied on create **and** on the subsequent charge arguments

**Payments and webhooks**

- Provider called **once per genuine billing attempt**, with amount, customer, payment method, invoice id, idempotency key
- Provider **not** called on rejected create or replayed webhook
- Decline and timeout → `past_due`, failed invoice, never a paid invoice
- Duplicate `event_id` → transition once, one invoice, one notification/side effect
- Stale `payment.failed` after `payment.succeeded` on the same `invoice_id` → subscription stays `active`, invoice stays paid
- Out-of-order: `payment.failed` then `payment.succeeded` on the same `invoice_id` → `active` and paid
- `payment.refunded` on a paid invoice → invoice `refunded`, status unchanged

**Persistence (every stage)**

- Subscription row matches API (status, plan, amount)
- One invoice per genuine attempt; paid vs failed coherent with status
- Duplicate webhook recorded as duplicate / single `event_id`, not a second invoice
- Audit log records lifecycle from/to
- `active` never exists with only failed invoices
- Timestamps and references are coherent (`createdAt` ≤ `updatedAt` / `settledAt`; invoice `subscriptionId` matches)

## Reliability classes (from the spec)

Covered: duplicate webhooks, out-of-order/stale webhooks, provider timeout and decline, forged/missing signatures, illegal transitions, subscription vs invoice mismatch.

Not covered (bonus in the spec): two webhooks processed in parallel for the same subscription.

## Out of scope

- UI
- A live payment provider
- Proration, tax, multi-currency
- Plan-change / upgrade API
- Concurrent racing webhooks (optional in the spec; not traded against the items above)
- Performance tests, production monitoring, test-report dashboards
- A large generic test platform

## Design risk

If the webhook handler creates an invoice **before** checking `canceled`, “ignored transition” tests can go green while an invalid row still lands. Record the event, skip invoice creation, and stop.
