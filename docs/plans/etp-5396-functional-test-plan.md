# ETP-5396 — Functional test plan

## Purpose

Validate the demo-to-PRO lifecycle, account billing space, environment access rules, owner and
invited-member separation, optional data transfer, and recovery behavior described in the [PRD](etp-5396-demo-to-pro-prd.md).
The plan treats the new billing boundary as provider-neutral. Existing Stripe transport tests are
regression coverage only; Stripe refactoring is outside this task.

## Test data and setup

Prepare an account owner, an invited member, a second account, one active demo, one expired demo,
and one productive environment associated with a demo. Prepare completed invoices/products/contacts
for the optional Export/Import flow. Configure trial days and renewal grace to small values in a
dedicated environment when testing time boundaries; restore the initial value of 15 days afterward.

Use separate browser profiles for owner, invited member, and second account. Capture the account
email, environment identifiers, purchase identifier, checkout request status, lifecycle preference
values, and HTTP status/body for every case. Do not include payment secrets or provider credentials
in evidence.

## Acceptance cases

| ID | Area | Scenario and steps | Expected result | Priority | Execution |
|---|---|---|---|---|---|
| ETP5396-F01 | Signup | Register a new account and complete onboarding. | Exactly one usable demo is created; it is labeled Demo and its trial starts at readiness. | P0 | E2E + DB |
| ETP5396-F02 | Trial clock | Delay onboarding readiness, then complete it. Retry onboarding with the same data. | Time before readiness is not consumed; retry does not create another demo or reset the original deadline. | P0 | Integration |
| ETP5396-F03 | Trial display | Open the environment selector during an active trial. | Demo type, expiration date, and remaining days are visible and update from server data. | P1 | UI + API |
| ETP5396-F04 | Expiration | Set the demo deadline to now/past and try owner, administrator, and member access, including an existing session and direct NEO/API request. | All tenant access is denied; account billing/settings remain available. | P0 | E2E + API |
| ETP5396-F05 | Purchase during trial | As owner, purchase a productive environment while demo is active. | A new tenant identifier is created; the demo is retained and associated; no conversion option appears. | P0 | Sandbox E2E |
| ETP5396-F06 | Purchase after expiry | As owner, open account billing after demo expiry and complete a purchase. | Purchase remains possible from account space and creates a new productive environment. | P0 | Sandbox E2E |
| ETP5396-F07 | Conversion removed | Call the old conversion action/endpoint with `convert-demo`. | Request is rejected before payment/provisioning; existing demo remains unchanged. | P0 | API integration |
| ETP5396-F08 | Owner permission | Attempt checkout, purchase creation, retry, and billing management as an invited member or administrator without owner marker. | Each mutation is rejected server-side; no purchase or environment is created. | P0 | API security |
| ETP5396-F09 | Invitation independence | Expire the invited user's personal demo, then enter a company where the user has active membership. | Destination-company eligibility and membership decide access; personal expiry does not block it. | P0 | E2E + API |
| ETP5396-F10 | Cross-company isolation | Use account A's purchase id, environment name, or payment reference from account B. | Non-disclosing rejection; no status, billing, or environment data leaks. | P0 | API security |
| ETP5396-F11 | Paid access | Confirm a productive subscription is current and enter both associated demo and productive environments. | Both environments are accessible and visually show their distinct type plus active subscription. | P1 | E2E |
| ETP5396-F12 | Renewal grace | Mark a subscription past due and test access before and after the configured 15-day grace deadline. | During grace, access remains available with payment-pending state; after deadline productive access is suspended. | P0 | Integration + E2E |
| ETP5396-F13 | Demo during grace | During renewal grace, test an associated demo with remaining original trial and then with expired trial. | Active original trial still governs demo access; grace never restarts the trial. | P1 | Policy integration |
| ETP5396-F14 | Grace deadline stability | Deliver repeated failed/late billing events and retry payment. | Original due/deadline remains fixed; successful recovery clears the commercial block without changing trial history. | P0 | Integration |
| ETP5396-F15 | Export/Import products | Purchase productive environment and select product transfer. Complete existing Export/Import flow. | Products transfer to the new environment; skipped transfer leaves source and target data unchanged. | P1 | E2E |
| ETP5396-F16 | Export/Import contacts | Repeat transfer for contacts, including invalid reference/partial failure. | Valid records transfer; failure is actionable and does not silently claim full success. | P1 | E2E |
| ETP5396-F17 | Duplicate purchase | Submit purchase creation twice concurrently or refresh after provider redirect. | One durable purchase and at most one provider checkout are retained; duplicate returns existing purchase state. | P0 | Concurrency integration |
| ETP5396-F18 | Browser restart | Close browser after payment confirmation and reopen account billing in another browser/profile. | Durable purchase and provisioning state are visible; user is not asked to pay again. | P0 | E2E + DB |
| ETP5396-F19 | Provisioning restart | Stop the worker/process during provisioning, then retry after the lease expires. | Retry reclaims the purchase with a new fencing attempt and eventually creates at most one productive tenant. | P0 | Multi-process integration |
| ETP5396-F20 | Stale worker fencing | Let an old provisioning worker finish after a newer retry owns the lease. | Old worker cannot mark the purchase provisioned or overwrite the newer environment link. | P0 | Concurrency integration |
| ETP5396-F21 | Billing overview | Open account billing with no eligible ERP environment and with multiple environments. | Account space loads independently; all environment states and durable purchases are clear and company-scoped. | P1 | UI + API |
| ETP5396-F22 | Offer configuration | Change server offer amount/currency/interval and reload billing page. | UI displays server offer; client does not hardcode the price; purchase boundary remains authoritative. | P1 | UI + API |
| ETP5396-F23 | Visual clarity | Compare Demo active, Demo expired, Productive current, past due, suspended, Owner, and Invited views. | Type, commercial state, and relationship are visually distinct and localized. | P1 | Manual UI |
| ETP5396-F24 | Stripe regression | Run existing checkout signature, webhook idempotency, and callback tests after new boundary changes. | Existing Stripe transport contracts continue to pass without schema/API refactoring. | P0 | Regression suite |

## Automated coverage map

| Layer | Required coverage | Current evidence / target |
|---|---|---|
| Pure policy unit tests | Trial remaining/expired, current subscription, past due grace, membership, configuration validation. | `EnvironmentAccessPolicyTest` in `com.etendoerp.go`; add boundary cases for exact deadline and ceil days. |
| Backend integration | Durable lifecycle preferences, owner checks, account scoping, purchase deduplication, stale lease reclaim, fencing. | `CheckoutRequestStoreIntegrationTest`, onboarding claim integration, and new lifecycle integration cases. |
| Frontend unit/component | Environment labels, billing overview, offer rendering, purchase duplicate state, resume flow, migration actions. | `tools/app-shell/src/lib/__tests__/upgrade-api.test.js`, `UpgradePage.vitest.jsx`, `environmentPresentation.test.js`. |
| End-to-end | F01, F03–F06, F09, F11–F12, F15–F18, F21–F23. | Run against a built frontend and deployed/local backend; attach screenshots and network evidence. |
| Database/concurrency | F02, F14, F17–F20. | Requires real PostgreSQL and two workers/processes; mocks are insufficient. |

## Exit criteria

The delivery is ready for review when all P0 cases pass, all P1 cases have pass or an explicitly
accepted product gap, the backend policy and durable-state suites pass, frontend tests pass, and
manual evidence covers expired owner, paid owner, invited member, and provisioning recovery. The
provider sandbox flow must confirm one purchase produces one productive environment. Any failure
involving stale data, cross-account disclosure, duplicate charge, or unauthorized owner action is
a release blocker.

## Known environment dependencies

- A real database is required for persistence, uniqueness, and concurrency assertions.
- Provider sandbox credentials are required for the end-to-end payment step; they must remain outside
  the repository and test evidence.
- A scheduler/worker or controlled process stop is required for lease and restart cases.
- Existing legacy Stripe contract tests remain regression checks and do not prove provider-neutral
  behavior in the new boundary.
