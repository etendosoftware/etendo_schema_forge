# PRD: Reusable Paid Tenant Checkout with Stripe

> **Status: shipped, and superseded for forward scope.** This document is the record of the one-off
> paid-tenant checkout delivered by ETP-4686 → ETP-4800 → ETP-4861 → ETP-4966, and its requirements
> still bind — in particular the idempotency-across-restarts and reconcilability requirements, which
> remain unmet because payment state is still held in memory. It does **not**
> describe recurring billing, resource limits or plan change. For those, see
> [plans/2026-08-27-recurring-billing-and-resource-limits-prd.md](plans/2026-08-27-recurring-billing-and-resource-limits-prd.md).

## 1. Summary

Replace the feature-flagged mock card payment used during productive tenant creation with a real Stripe-hosted Checkout integration, initially operating in Stripe Test Mode.

The implementation must be core-first:

- `schema_forge_core` owns the reusable, provider-neutral checkout experience and frontend contract.
- `com.etendoerp.go` owns payment authorization, Stripe communication, webhook processing, payment state, and tenant provisioning.
- `schema-forge` only composes the capability for the Tenant Upgrade product flow.
- CloudFront only routes requests and does not execute payment business logic.

The browser must never send raw card details through Etendo endpoints.

## 2. Problem Statement

The current Tenant Upgrade flow contains a mocked card-payment form behind the `tenant-upgrade` feature flag. It collects card-like data in the React application, generates a fake payment token, and allows onboarding to continue without externally verified payment.

This is useful for demonstrations but is not suitable for sandbox or production payment validation. It is also implemented specifically in `schema-forge`, making its checkout states, API handling, security decisions, and error behavior difficult to reuse.

## 3. Product Objective

Allow an authenticated user to purchase an additional productive tenant through Stripe-hosted Checkout and provision that tenant only after the backend has verified the payment.

The checkout capability must become a reusable part of Schema Forge Core so other paid workflows can consume it without duplicating product-independent behavior.

## 4. Success Criteria

- No raw card information passes through Schema Forge, Etendo Go, CloudFront, application logs, or Etendo database records.
- Every productive tenant created through this flow is associated with a server-verified successful payment.
- Duplicate Stripe events cannot create duplicate tenants.
- Cancelling, refreshing, or reopening Checkout does not corrupt the upgrade request.
- The Core checkout capability can be consumed by another product flow without importing Tenant Upgrade-specific code.
- Existing free onboarding remains unchanged.
- The complete integration can run with Stripe Test Mode credentials before production activation.

## 5. Scope

### Included

- Stripe-hosted Checkout.
- Creation of a pending purchase or upgrade request.
- Server-side Stripe Checkout Session creation.
- Success and cancellation return routes.
- Signed Stripe webhook processing.
- Server-side payment confirmation.
- Idempotent productive tenant provisioning.
- Reusable Core checkout components, hooks, API contract, and state model.
- Tenant Upgrade integration behind its existing feature flag.
- Test Mode configuration and documentation.
- Audit and operational visibility.
- Automated unit, integration, security, and behavioral tests.

### Excluded from the initial delivery

- Custom card-entry forms.
- Direct use of Stripe secret keys from the frontend.
- Refund management UI.
- Invoice administration UI.
- Customer billing portal.
- Plan upgrades, downgrades, or proration.
- Multiple currencies.
- Coupons and promotional codes.
- Saved payment methods.
- Tax calculation.
- Production Stripe account activation.

Subscription lifecycle handling is excluded unless Product selects recurring billing as part of this delivery.

## 6. Product Decision Required: Billing Model

The current UI describes the tenant price as monthly, but the mock does not implement a subscription lifecycle. Product must select one model before implementation begins.

### Option A: Recurring subscription (recommended if the tenant is sold monthly)

Stripe Checkout uses `subscription` mode and a recurring Stripe Price. The complete lifecycle must then be specified, including renewals, cancellation, failed payments, and tenant entitlement.

### Option B: One-time sandbox payment

The initial delivery validates checkout and provisioning with a one-time payment. The UI must not describe the payment as a monthly subscription.

The implementation must not create a one-time charge while presenting it as recurring billing.

## 7. User Journey

### Entry conditions

- The user is authenticated.
- The `tenant-upgrade` feature flag is enabled.
- The user is authorized to purchase or provision an additional tenant.
- The user qualifies for the paid flow.

### Main flow

1. The user opens Tenant Upgrade.
2. The application displays the plan, price, billing frequency, and included functionality.
3. The user selects **Continue to payment**.
4. The frontend asks `com.etendoerp.go` to create a checkout request.
5. The backend verifies authorization, resolves trusted pricing, persists a pending request, and creates a Stripe Checkout Session.
6. The frontend redirects the user to Stripe-hosted Checkout.
7. The user enters payment information on Stripe.
8. Stripe redirects the user to the configured success URL.
9. The return page displays a processing state and requests authoritative status from the backend.
10. Stripe sends a signed webhook to `com.etendoerp.go`.
11. The backend verifies the webhook and marks the request as paid.
12. The backend starts or resumes tenant provisioning idempotently.
13. The frontend observes payment and provisioning status.
14. When provisioning finishes, the user sees confirmation and can enter the new tenant.

### Cancellation flow

1. The user cancels or exits Stripe Checkout.
2. Stripe redirects to the cancellation URL.
3. No tenant is provisioned.
4. The existing request remains cancelled, pending, or expired according to its server-side state.
5. The user can safely start another checkout attempt.

## 8. Functional Requirements

### FR-1: Reusable Core checkout capability

`schema_forge_core` must expose a reusable checkout module, preferably under:

```text
packages/etendo-go-core/src/checkout/
```

It must provide:

- A provider-neutral checkout API contract.
- A deterministic checkout state model.
- Reusable loading, redirecting, cancelled, processing, failed, and completed states.
- A hosted-checkout launcher.
- Return-page status handling.
- Bounded polling or refresh behavior for asynchronous status.
- Normalized error objects.
- Analytics and observability event hooks.
- Public exports, usage documentation, and tests.

The public Core API must not expose Stripe-specific payload structures.

### FR-2: Product composition in `schema-forge`

`schema-forge` must:

- Compose the Core checkout module into Tenant Upgrade.
- Own plan presentation, product copy, routes, and translations.
- Retain the `tenant-upgrade` feature flag.
- Remove mock card fields and mock-token generation.
- Configure the Core component with a known paid-action identifier.
- Include product-level integration and end-to-end tests.

It must not calculate the authoritative amount, trust the success redirect as proof of payment, or provision the tenant directly from the browser callback.

### FR-3: Checkout request creation

`com.etendoerp.go` must provide an authenticated endpoint that creates a pending upgrade request and Stripe Checkout Session.

The browser may identify a known action:

```json
{
  "action": "productive-tenant",
  "returnContext": {
    "locale": "en_US"
  }
}
```

The browser must not provide authoritative charge amount, currency, Stripe Price ID, paid status, entitlement, or provisioning authorization.

The response should contain browser-safe information only:

```json
{
  "requestId": "upgrade-request-id",
  "checkoutUrl": "https://checkout.stripe.com/...",
  "expiresAt": "..."
}
```

### FR-4: Server-controlled pricing

The backend must resolve the Stripe product or price from trusted configuration using the action or plan identifier. Client-displayed pricing is informational; the backend record and Stripe Session are authoritative.

Configuration must support Test and Production environments without code changes.

### FR-5: Signed webhook processing

The Stripe webhook endpoint must:

- Preserve the unmodified request body when required for signature verification.
- Validate the Stripe signature.
- Reject invalid or unsigned events.
- Record and deduplicate by Stripe event ID.
- Correlate events through a server-created request ID.
- Avoid treating arbitrary metadata as authorization.
- Handle duplicate and out-of-order events safely.

### FR-6: Authoritative payment state

The backend must maintain payment and provisioning state independently of the browser.

Recommended states:

```text
CREATED
CHECKOUT_PENDING
PAYMENT_PROCESSING
PAID
PROVISIONING
COMPLETED
CANCELLED
EXPIRED
PAYMENT_FAILED
PROVISIONING_FAILED
```

A request must never transition to `PAID` exclusively because the success URL was opened.

### FR-7: Idempotent provisioning

Tenant provisioning starts only after the backend verifies the required payment state. It must use the upgrade request ID as an idempotency boundary so duplicate webhooks, refreshed pages, retries, and backend restarts cannot create another tenant.

The persisted result must associate the request, payment reference, user or account, created tenant, current state, timestamps, and an operationally safe failure reason.

### FR-8: Status endpoint

`com.etendoerp.go` must expose an authenticated status endpoint. It must verify that the caller can view the requested purchase.

Example response:

```json
{
  "requestId": "upgrade-request-id",
  "checkoutStatus": "completed",
  "paymentStatus": "paid",
  "provisioningStatus": "in_progress",
  "progress": {
    "currentStep": "configuring-tenant",
    "percentage": 70
  },
  "result": null,
  "error": null
}
```

### FR-9: Return-page behavior

The success return page must initially show a processing state. It must query authoritative server state, tolerate webhook delivery after the browser redirect, observe provisioning progress, stop polling on terminal states, and permit a manual status retry.

It must not silently create another Checkout Session.

### FR-10: Feature flag enforcement

The Tenant Upgrade entry point remains protected by `tenant-upgrade`. The backend must independently enforce whether the paid action is enabled because frontend visibility is not authorization.

Disabling the feature must prevent new Checkout Sessions without invalidating completed payments. Already-paid requests must follow a controlled completion or support process.

## 9. Repository Ownership

| Repository or layer | Responsibility |
| --- | --- |
| `schema_forge_core` | Reusable checkout UI, state model, frontend API client, return handling, normalized errors, shared events, tests, and documentation |
| `schema-forge` | Tenant Upgrade composition, plan presentation, routes, feature flag, translations, and product-level end-to-end tests |
| `com.etendoerp.go` | Stripe Session creation, secrets, price resolution, signed webhook, payment state, authorization, audit, and idempotent provisioning |
| CloudFront configuration | Route checkout API and Stripe webhook requests to the correct backend origin |

CloudFront must not contain Stripe business logic, credentials, payment validation, or provisioning behavior.

## 10. Core API Design Principles

The frontend contract should be provider-neutral:

```ts
type CheckoutAdapter = {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutRedirect>;
  getCheckoutStatus(requestId: string): Promise<CheckoutStatus>;
};
```

A product should be able to compose it as follows:

```jsx
<HostedCheckout
  action="productive-tenant"
  createCheckout={createCheckout}
  getStatus={getCheckoutStatus}
  onCompleted={handleCompleted}
  onCancelled={handleCancelled}
/>
```

Stripe is the first server-side provider implementation, not the public frontend abstraction.

## 11. Security Requirements

- Use Stripe-hosted Checkout; do not implement custom card collection.
- Store Stripe secret and webhook signing keys only in secure backend configuration.
- Never commit Stripe secrets or expose them to the browser.
- Resolve price and currency server-side.
- Authorize Session creation and status retrieval.
- Verify every webhook signature.
- Deduplicate webhook events by Stripe event ID.
- Use idempotency for Session creation and tenant provisioning.
- Prevent users from reading another account's checkout status.
- Avoid unnecessary personal or sensitive data in Stripe metadata.
- Rate-limit checkout creation.
- Sanitize user-visible errors.
- Do not log secrets, raw provider payloads, or sensitive Checkout URLs.

## 12. Required Edge Cases

Tests and behavior must cover at least:

1. The success redirect arrives before the webhook.
2. Stripe sends the same webhook multiple times.
3. Events arrive out of order.
4. Provisioning succeeds while the frontend is disconnected.
5. The user refreshes or opens the return page in another tab.
6. The user cancels Checkout and starts again.
7. The Checkout Session expires.
8. Payment succeeds after the feature flag is disabled.
9. Payment succeeds but provisioning fails.
10. The backend restarts during provisioning.
11. The user attempts to alter the plan, amount, currency, or Price ID.
12. An invalid or unsigned webhook is received.
13. A user requests another account's purchase status.
14. Two checkout-creation requests arrive simultaneously.
15. The return route is opened without a valid request identifier.

## 13. Error Recovery

### Payment not completed

No provisioning starts. The user can return to the plan and explicitly create a new Session.

### Payment confirmed, provisioning failed

The request remains paid, the user is not charged again, and the backend provides an operational retry mechanism. The UI explains that payment was received but setup requires retry or support.

### Webhook delayed

The UI displays a processing state instead of a failure. Status checks use bounded retry and backoff, and the user can safely return later.

### Provider unavailable

Checkout creation returns a normalized retryable error. No request is marked paid, and any persisted request remains reconcilable.

## 14. Observability and Audit

Record events for:

- Upgrade request and Checkout Session creation.
- Redirect initiation.
- Checkout completion, cancellation, and expiration.
- Webhook acceptance, rejection, and deduplication.
- Payment confirmation.
- Provisioning start, completion, failure, and retry.
- Status authorization failure.

Each correlated log must contain a safe internal request ID.

Suggested metrics:

- Checkout started, completed, and cancelled.
- Payment-to-provisioning latency.
- Provisioning success rate.
- Paid requests with provisioning failure.
- Duplicate event count.
- Checkout creation failure rate.

## 15. Testing Strategy

### `schema_forge_core`

- Checkout state transitions.
- Redirect initiation.
- Return-before-webhook behavior.
- Terminal state handling.
- Retry, backoff, and timeout behavior.
- Error normalization.
- Consumer integration example.
- Accessibility of checkout states.

### `schema-forge`

- Feature flag enabled and disabled.
- Correct plan and billing information.
- Tenant Upgrade composition of the Core component.
- Cancellation and success returns.
- Provisioning progress and completion.
- Removal of mock card handling.
- End-to-end behavior with a controlled backend or Stripe Test Mode.

### `com.etendoerp.go`

- Authentication and authorization.
- Server-controlled pricing.
- Stripe Session creation.
- Signature verification and invalid-signature rejection.
- Duplicate and out-of-order events.
- Idempotent provisioning.
- Payment success followed by provisioning failure.
- Status ownership validation.
- Concurrent checkout attempts.
- Backend restart and recovery behavior.

## 16. Rollout Plan

### Phase 1: Core capability

- Add the provider-neutral checkout module to `schema_forge_core`.
- Document its public contract.
- Add unit and behavioral coverage.

### Phase 2: Backend sandbox integration

- Configure Stripe Test Mode.
- Implement Session creation, webhook processing, status persistence, and provisioning orchestration in `com.etendoerp.go`.
- Configure CloudFront routing.
- Verify webhook delivery in the sandbox environment.

### Phase 3: Tenant Upgrade integration

- Replace the mock with the Core checkout module.
- Preserve the feature flag.
- Remove mock card fields and token generation.
- Add product-level tests and documentation.

### Phase 4: Controlled QA

- Enable the feature only in QA.
- Exercise Stripe test-card scenarios.
- Validate delayed and duplicate webhooks.
- Validate payment-success and provisioning-failure recovery.

### Phase 5: Production readiness

A separate readiness review must cover live credentials, final Product and Price configuration, subscription lifecycle when applicable, legal and billing copy, refunds and support, monitoring, alerts, and reconciliation procedures.

## 17. Acceptance Criteria

- [ ] Raw card fields are no longer rendered or handled by Schema Forge.
- [ ] Checkout is hosted by Stripe.
- [ ] The reusable frontend capability resides in `schema_forge_core`.
- [ ] Tenant Upgrade-specific composition remains in `schema-forge`.
- [ ] Stripe secrets, webhooks, payment state, and provisioning reside in `com.etendoerp.go`.
- [ ] CloudFront performs routing only.
- [ ] The backend determines authoritative product, price, and currency.
- [ ] A browser success redirect cannot authorize provisioning.
- [ ] A valid signed webhook can confirm payment.
- [ ] Duplicate events cannot duplicate tenants.
- [ ] A paid request with failed provisioning can recover without another charge.
- [ ] Users cannot inspect another user's checkout status.
- [ ] Free onboarding remains unaffected.
- [ ] The feature flag controls both the frontend entry point and backend action.
- [ ] Sandbox documentation covers keys, Price configuration, webhook setup, and test scenarios.
- [ ] Documentation is updated in every affected repository.
- [ ] Automated tests cover the required behavioral and security edge cases.

## 18. Definition of Done

The initiative is complete when:

- The mock-payment implementation is removed from the active Tenant Upgrade path.
- Tenant Upgrade completes end to end using Stripe Test Mode.
- Payment is verified server-side.
- Productive tenant provisioning is payment-gated and idempotent.
- The reusable checkout capability is exported and documented by `schema_forge_core`.
- All repository test suites and quality gates pass.
- QA evidence includes successful, cancelled, declined, delayed-webhook, duplicate-webhook, and provisioning-failure scenarios.
- The recurring-versus-one-time billing decision is documented and consistently reflected in the UI, Stripe configuration, backend behavior, and tests.

## 19. Runtime configuration

The backend reads configuration from JVM properties, `Openbravo.properties`, or environment
variables, in that order. No credential or provider identifier is committed to source:

| Environment variable | Purpose |
| --- | --- |
| `ETGO_CHECKOUT_SECRET_KEY` | Server-side provider secret used to create hosted sessions |
| `ETGO_CHECKOUT_PRICE_ID` | Trusted provider Price ID; never accepted from the browser |
| `ETGO_CHECKOUT_WEBHOOK_SECRET` | Signing secret used to authenticate webhook payloads |
| `ETGO_CHECKOUT_MODE` | `subscription` (default) or one-time `payment` |
| `ETGO_CHECKOUT_API_BASE_URL` | Provider API base URL; defaults to Stripe's API URL |

The endpoint fails closed with `CHECKOUT_NOT_CONFIGURED` until all three secrets/identifiers are
present. Sandbox credentials can therefore be injected at deployment time without changing the
frontend bundle or database artifacts.
