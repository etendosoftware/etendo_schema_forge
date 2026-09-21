# ETP-5396 — Demo-to-PRO lifecycle and account billing PRD

- **Date:** 2026-09-17
- **Status:** Product requirements and proposed delivery scope; not implemented by this document.
- **Task:** [ETP-5396](https://etendoproject.atlassian.net/browse/ETP-5396), under ETP-3504.
- **Technical design:** [ETP-5396 technical design](etp-5396-demo-to-pro-technical-design.md).
- **Required baseline:** The final delivery of Schema Forge `feature/ETP-5045-2` and its corresponding `com.etendoerp.go` `feature/ETP-5045` backend. Reuse both completed checkout-request and billing-event persistence. Do not build against the earlier, partially completed ETP-5045 work.

## 1. Purpose and outcome

Let a person try Etendo Go, purchase a new productive environment, and manage billing even when ERP access has expired. Make the environment type, access state, and the person's relationship to each company understandable.

Payment and access belong to the relevant company subscription. They must not become an account-wide switch that blocks invited users or unlocks unrelated companies.

Use the existing application and deployment, with explicit boundaries for new billing, access-policy and provisioning logic. New code uses provider-independent contracts, with a thin bridge to the existing Stripe integration as its first implementation. Existing Stripe coupling is explicitly outside the refactoring scope. Prepare new functionality for a future provider or service extraction without implementing either now.

This PRD supersedes conflicting older rules about converting demos, fixed 14-day trials, login-only expiry enforcement and indefinite access after missed payment. Provider independence applies to new contracts only; existing Stripe contracts remain in place. The wider recurring-billing and resource-limits initiative remains separate; this task does not absorb its quota or plan-change features.

## 2. Scope

### Included

- Configurable demo trial, initially 15 days, and server-enforced expiry.
- The global application header always shows the current environment type and its commercial
  status; active demo days remain visible in a dedicated full-width banner below the search header.
- New productive environment after a confirmed purchase; removal of demo conversion.
- Continued access to the associated demo while the subscription is current.
- Optional transfer of products and contacts through existing Export/Import.
- Company-scoped owner billing permissions and independent invited-company access.
- An authenticated account/billing space available without an accessible ERP environment.
- Configurable renewal-payment grace and a controlled transition for existing demos.
- Recovery of confirmed purchases and interrupted provisioning without the original browser.
- Provider-independent contracts for new functionality, with a thin integration bridge to existing Stripe code.

### Excluded

- A microservice, new database, new identity system, message broker, or separate deployment.
- A second payment-provider integration or migration of existing subscriptions to another provider.
- Decoupling, renaming, replacing or generalizing existing Stripe code, endpoints, events, table columns or constraints. Existing Stripe transport hardening is separate work, not a prerequisite for delivering the new boundary.
- A new cross-company copy engine; transfer of transactions, stock, accounting history, or fiscal configuration.
- Automated refunds/disputes, new pricing models, usage charging, or quota implementation.
- Automatic data deletion after expiry or a new data-retention policy.
- A general rewrite of onboarding, authentication, or all existing payment code.

The deferred migration is architectural. Optional product/contact transfer and the transition of existing demo deadlines are part of this functional scope.

## 3. Concepts and authority

| Concept | Meaning |
| --- | --- |
| Account | The person's platform identity and account session; can exist without ERP access. |
| Environment | An ERP tenant/company with its own users, permissions, and data. |
| Environment type | `DEMO` or `PRODUCTIVE`; payment does not change a demo's type. |
| Membership | The person's permission to enter a particular company; distinct from ownership and subscription eligibility. |
| Owner | The account with verified ownership of the relevant company, resolved server-side. An administrator role name alone is insufficient. |
| Subscription | The commercial agreement granting access to one explicitly associated productive environment and, where applicable, its demo. |
| Access state | Etendo's decision for the target environment: trial, active, grace, expired, or suspended. Provisioning readiness is a separate state. |
| Provider | The external system handling checkout and billing. Its states are translated into Etendo's commercial model. |

Having owner permission is sufficient for initial self-service billing administration. It does not bypass expiry or membership checks. Platform support needs separately authorized, audited operations; it is not an implicit tenant-role exception.

## 4. Functional requirements

| ID | Requirement |
| --- | --- |
| FR-01 | Ordinary self-service signup provisions one demo. Start its trial only when provisioning succeeds and it becomes usable. An interrupted/retried signup must neither create another demo nor restart its clock. |
| FR-02 | Trial length is configurable, initially 15 days. Persist the assigned start and expiry; changing configuration affects newly assigned periods by default. |
| FR-03 | During an unpaid active trial, show remaining days and the expiration date. At expiry, block the demo for every tenant role, including owner and administrator, existing sessions, and direct data/API requests. |
| FR-04 | Permit purchase both before and after trial expiry. A confirmed purchase provisions a new productive environment with a different tenant identifier; no in-place conversion endpoint or UI option remains available. |
| FR-05 | A current subscription grants access to its productive environment and associated demo, including after the original demo deadline, subject to each user's membership and permissions. It grants no access to another company's environments. |
| FR-06 | The owner may select products and/or contacts during checkout. After payment, the selected data is transferred automatically server-side; the user never has to export, download, upload, or import files. The step can be skipped or retried and does not gate productive readiness. |
| FR-07 | An invited user's own demo/subscription state does not affect access to another company. Evaluate the destination company's eligibility and the user's membership there. |
| FR-08 | Only the verified owner may initiate or manage a company's billing and provisioning actions. Revalidate on every mutation, including retries. An invited member cannot buy against or associate the host company's demo. |
| FR-09 | Account login, environment discovery, account settings, and authorized billing/recovery actions remain available without an eligible ERP environment. This area remains authenticated. |
| FR-10 | For an overdue renewal of an established subscription, allow a configurable grace period, initially 15 days. Show the payment problem and deadline; suspend the subscription's environments after grace, unless a demo still has independent trial time. |
| FR-11 | Payment reconciliation and productive provisioning must recover from duplicates, delayed events, browser closure, process restarts, and retryable failures without another charge or another productive environment for the same purchase. |
| FR-12 | Distinguish Demo/Productive, access/provisioning status, and Owner/Invited in environment selection and relevant account screens. Read prices, status, permissions, and deadlines from the backend. |
| FR-13 | Existing unmanaged demos receive a configurable transition period, initially 15 days from policy activation. Persist that deadline once. Preserve explicitly authorized existing productive access; missing subscription data is not an unlimited-access rule. |
| FR-14 | New product rules, application APIs, and UI logic use provider-independent concepts and integrate with existing Stripe behavior through a narrow bridge. Existing Stripe coupling remains unchanged. A future provider must not require changing the new trial, invitation, ownership, or access-policy rules; adapting the legacy checkout is deferred work. |

## 5. Time and access rules

### Three separate settings

| Setting | Initial value | Starts at | Does not restart when |
| --- | --- | --- | --- |
| Demo trial duration | 15 days | First successful demo readiness | Login, role change, invitation, retry, or configuration edit |
| Renewal-payment grace | 15 days | Due time of the oldest unresolved renewal obligation that triggered delinquency | Webhook retry, another failed attempt, or another overdue invoice |
| Existing-demo transition | 15 days | Recorded activation time of the applicable rollout cohort | Redeploy, migration rerun, or configuration edit |

Use server UTC timestamps and elapsed 24-hour days. Access ends at `now >= expiresAt`. Display local dates and `max(0, ceil((expiresAt - serverNow) / 24h))` remaining days; the backend remains authoritative. Persist the policy version and duration used for each period. A retroactive extension or correction requires an explicit, audited operation.

A grace period is for renewal debt, not a substitute for the initial payment. A failed initial checkout does not create productive access. A legitimate zero-amount purchase confirmed under the configured plan/discount policy can qualify; a browser success URL cannot.

### Eligibility matrix

These decisions always require a valid account/environment session, current membership, applicable role permissions, and a ready environment.

| Target environment and commercial state | May enter? | UI state / next action |
| --- | --- | --- |
| Demo with remaining trial and no eligible subscription | Yes | Demo · Trial, days remaining; owner can purchase |
| Demo expired, no eligible subscription or transition | No, for all tenant roles | Demo · Expired; owner can purchase in account space |
| Demo associated with a current subscription | Yes | Demo · Included with subscription |
| Productive environment with current subscription | Yes | Productive · Active |
| Associated demo or productive environment during renewal grace | Yes | Payment pending, grace deadline; only owner manages billing |
| Productive environment after grace | No | Productive · Suspended; owner can resolve payment |
| Associated demo after grace, original trial still active | Yes, until that original deadline | Demo · Trial; no restarted trial |
| Associated demo after grace, original trial expired | No | Demo · Suspended |
| Invited company, user's own demo expired | Depends only on destination eligibility | Destination state · Invited |
| Any company without valid membership | No | No data or billing details disclosed |
| Paid purchase, productive provisioning incomplete | No entry into unfinished production | Preparing environment or recovery needed |

For a subscription cancelled at the end of its prepaid period, the proposed default is access through that paid-through instant; cancellation itself does not create a debt grace period. Immediate cancellation, refunds, and disputes use an explicit support policy until separately defined. These are implementation recommendations, not new automated money-management features.

Payment recovery removes a commercial block only after reconciliation proves the relevant subscription is eligible. An old paid invoice must not clear a newer unresolved debt.

## 6. User journeys

### Signup and trial

1. Register and complete the existing identity/onboarding prerequisites.
2. Provision the demo idempotently; show preparation progress without consuming trial days.
3. On readiness, persist the trial interval and show Demo, remaining days, and the purchase action to the owner.
4. At expiry, server data access stops. Keep account space and other eligible memberships reachable.

Invitation acceptance remains a distinct existing journey. Proposed default: accepting an invitation does not force creation or purchase of a personal company. If that person later starts ordinary self-service onboarding, ownership rather than total membership count determines their first demo eligibility.

### Purchase before or after expiry

1. Owner opens account billing and selects their demo/company context and productive environment name.
2. Display the configured plan, price, currency, interval, and applicable commercial terms from the backend.
3. Create or resume the purchase and redirect to the selected provider's hosted checkout.
4. Display payment confirmation separately from provisioning progress. A redirect alone never confirms payment.
5. Provision a new productive environment from server-persisted inputs after authoritative confirmation.
6. Show the demo/productive association and the selected automatic transfer status.

The owner can reopen account billing on another browser and see the same purchase/provisioning outcome. Missing browser storage must not require a new payment. The demo can become eligible from the confirmed subscription while production is still being prepared. If an existing checkout call has an ambiguous outcome that cannot be recovered through its current contract, display a reconciliation/support state and block blind re-creation; fixing Stripe's existing transport is outside this task.

### Optional automatic data transfer

During checkout, the owner can select **Products**, **Contacts**, both, or neither. The selection is
stored with the paid provisioning request. After payment confirmation, the backend transfers only
the selected supported records from the associated demo into the new productive environment. The
browser does not download a file, call a CSV endpoint, or ask the user to import anything.

The operation must be server-authorized, idempotent, scoped to the owner's associated demo, and
retryable independently from payment and tenant creation. It must report partial failures without
rolling back a confirmed subscription or creating a second productive environment. Unsupported
columns, references, duplicate resolution, and child-record limits remain explicit in the transfer
contract; the UI must not promise a full relational clone.

### Renewal failure and recovery

1. Reconcile the provider's confirmed renewal failure into a local overdue obligation.
2. Persist its fixed grace deadline; show payment pending to members and a resolution action only to the owner.
3. At the deadline, deny subsequent tenant requests while leaving account billing reachable.
4. After successful reconciliation, restore applicable access without recreating environments or membership.

## 7. Account-space experience

The account/billing area uses the same design system, localization, account identity, and navigation conventions as Etendo Go. It has its own route/layout and does not require a selected, eligible ERP tenant.

Minimum contents:

- Environment cards/list with type, state, relationship, and entry availability.
- Remaining trial/grace time and a clear reason when entry is blocked.
- Company-scoped billing overview and purchase/recovery controls for owners.
- Durable purchase/provisioning status, with a safe resume/retry action where applicable.
- Entry points to supported provider management actions, only when those capabilities exist.

A provider-hosted customer portal is optional. Etendo's own account area must not depend on Stripe having such a portal, and never exposes a non-owner's payment details. If a capability is unsupported, explain the supported resolution path without displaying a broken action. Provider-hosted pages may have their own branding limitations; Etendo controls its entry and return experience.

## 8. Existing customers and rollout

Inventory existing demos, productive environments, ownership records, and confirmed purchases before enforcement. Record explicit classification rather than inferring commercial eligibility solely from an old `free/productive` preference or a missing subscription row.

- New demos use FR-01/02 once the policy is enabled for their cohort.
- Existing unmanaged demos receive the persisted transition deadline from FR-13.
- Existing managed demos retain their assigned deadline; deployment does not reset it.
- Existing paid/grandfathered productive environments retain an explicit reviewed entitlement until linked to recurring billing.
- Unresolved ownership goes to support correction; do not grant owner billing permissions by email similarity or role label.
- Existing paid requests for the removed conversion flow require explicit resolution into a new productive environment; do not consume their payment or leave them orphaned.

Removing data or revoking a legitimate existing commercial agreement is not part of this rollout.

## 9. Acceptance and edge cases

All scenarios below are required evidence for implementation delivery. They have not been executed as part of this documentation task.

| ID | Requirements | Observable acceptance and required edge cases |
| --- | --- | --- |
| AC-01 | FR-01, FR-02 | A ready demo gets one persisted trial; delayed readiness consumes no days; concurrent/retried signup creates one demo; a later configuration change leaves its deadline unchanged. |
| AC-02 | FR-03, FR-09 | At exact expiry owner/admin/member requests are denied, including an already-issued token, direct export/API access, and another browser tab; account billing and another eligible company remain accessible. |
| AC-03 | FR-04, FR-05, FR-08 | Purchase during trial and after expiry creates a different productive tenant and retains demo type; old `convert-demo` calls are rejected; an invited member cannot purchase against the host demo. |
| AC-04 | FR-06 | Product and contact transfer use existing export/import; skipping has no provisioning effect; invalid references/partial failures remain actionable; retry follows existing duplicate handling. |
| AC-05 | FR-05, FR-07, FR-08 | Expired personal trial does not block an eligible invitation; paid personal subscription does not unlock a blocked host; role-name admin without ownership cannot manage host billing. |
| AC-06 | FR-09, FR-11 | Account-only login, lost session storage, closed checkout tab, and login on a second device all recover the server's purchase status without another charge. |
| AC-07 | FR-10 | Repeated failure events preserve the original grace deadline; exact grace expiry blocks both associated environments except remaining demo trial; clearing an old invoice does not clear current debt. |
| AC-08 | FR-11 | Duplicate/out-of-order events, kill after durable event receipt, kill during provisioning, and retry from two nodes eventually resolve one purchase into at most one productive tenant. Unfinished work is visible and recoverable. |
| AC-09 | FR-12 | Demo/Productive, access state, and Owner/Invited are visually distinct; no tenant selection is required for billing; status changes refresh correctly after payment and environment switching. |
| AC-10 | FR-13 | Repeating rollout does not extend deadlines; explicit legacy productive entitlements survive; missing/ambiguous classification is reported rather than silently granting unlimited use. |
| AC-11 | FR-14 | The new lifecycle/ownership tests pass with a provider-neutral fake adapter; new domain/UI tests require no Stripe event names or SDK objects; the bridge reuses existing contracts without a Stripe schema/API migration; unsupported management capability has a usable fallback. |
| AC-12 | FR-08, FR-11, FR-14 | New account operations reject cross-account purchase references and untrusted payment claims; existing callback-verification tests still pass; ambiguous legacy checkout creation is visible and never blindly retried. A valid zero-amount promotion follows its confirmed commercial terms. |

Release evidence must include backend policy tests, real database concurrency/restart tests, frontend tests, a provider sandbox flow, and manual/UI evidence for expired owner, paid owner, invited member, and failed-payment recovery. Existing unit tests alone are not proof of the complete flow.

## 10. Delivery sequence and ownership

| Slice | Deliverable | Coordination |
| --- | --- | --- |
| 1 | Freeze/review final ETP-5045-2 and matching backend; baseline durable checkout/event tests | ETP-5045 |
| 2 | Boundary around new logic plus thin legacy bridge, local subscription associations, trial/deadline policy, ownership contract; no Stripe refactor | ETP-5046 and this task |
| 3 | Request-time eligibility enforcement and existing-demo transition | ETP-5047 and this task |
| 4 | Server-driven provisioning/reconciliation and retry recovery | ETP-5048 and this task |
| 5 | Account billing area, new-production-only flow, environment clarity, optional transfer guidance | ETP-5049 and this task |
| 6 | Integrated scenarios, compatibility rollout, documentation, and operational evidence | Shared delivery |

These are coordination boundaries, not a claim that the related tasks are complete. Integrate final versions and update their conflicting acceptance criteria before implementation is considered delivered. Do not release the UI ahead of backend authorization, recovery, and expiry enforcement.

## 11. Assumptions and remaining implementation decisions

- Initial model: one productive environment and at most one associated demo per subscription; no shared entitlement across unrelated companies. Broader bundles require separate product design.
- Preserve invitation-only signup without forcing a personal demo, as described above.
- Honor prepaid cancellation through its effective period end; refunds/disputes remain an audited support decision.
- Select concrete scheduler cadence, retry budgets, and operational response targets from deployment capacity; no new commercial SLA is declared here.
- Confirm the final ETP-5045-2/backend revisions and ETP-5046 schema at implementation start; the technical design records the inspected snapshot and expected integration seams.

These assumptions are explicit so implementation can resolve them without treating inferred behavior as an already-shipped guarantee.
