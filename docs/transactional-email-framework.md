# Transactional Email Framework

This guide defines the working model for transactional email in Etendo Go. Transactional email is a server-side capability for account recovery, account creation, security alerts, document notifications, and controlled support/admin communication.

The system must not become a generic email relay. Every send must be driven by an explicit, versioned email contract with authorization, recipient resolution, throttling, idempotency, audit, and operational controls.

## Non-Negotiable Rules

1. The frontend never calls the email provider endpoint directly.
2. Provider URLs, API keys, sender identity, and signing secrets stay in server configuration only.
3. The browser never sends a generic provider payload such as `{ "to": "...", "template": "...", "data": ... }`.
4. Every email send uses a named email contract and a versioned command schema.
5. Recipients are resolved server-side from the authenticated context or business record by default.
6. Document-send contracts accept recipient edits **by default** through the allowlisted `recipientEdits` command field (`to.add`/`to.remove`, `cc.add`); the backend stays authoritative over the final recipient set (normalization, cross-channel dedup, suppression, count limits, hashed audit). Reason capture is **explicitly waived** for document-send recipient edits (stakeholder decision 2026-06-11, ETP-4226): the send action plus the hashed audit evidence is sufficient context. Caller-provided recipients outside the document-send family remain allowed only for explicit admin/support contracts with role checks, throttle, reason capture, and audit. This amendment does not relax rule 1 or rule 3: `recipientEdits` is a named, contract-family-scoped command field, never a generic provider payload, and contracts outside the document-send family reject it with `VALIDATION_FAILED`.
7. `custom` email is not a public capability. It can exist only as a controlled contract with sanitizer, allowlisted roles, tight throttle, and complete audit.
8. Reply-To is disabled by default and must never allow tenant-owned sender spoofing. If enabled, it must be validated and recorded.
9. Each contract must define throttle, idempotency, audit fields, kill switch behavior, and at least three edge cases.
10. Documentation and tests must move with behavior changes in the same PR.

## Architecture

Transactional email is executed inside Etendo Go, behind the NEO Headless boundary.

```
React SPA
  -> POST /sws/neo/email-contracts/{contractName}/send
     or auth endpoints such as /sws/go/register and /sws/go/password-reset/request
  -> JWT auth and role/org context
  -> EmailContractExecutor
  -> Contract registry
  -> Authorization check
  -> Recipient resolver
  -> Variable resolver and validation
  -> Throttle, idempotency, suppression, kill switches
  -> Audit record
  -> Provider adapter
  -> External email provider
```

Schema Forge documents the contract methodology and generated UI integration points. Etendo Go owns runtime execution, provider configuration, persistence, and enforcement.

## Command Shape

The frontend sends a contract command, not an email provider payload.

```json
{
  "recordId": "E2F7A13B...",
  "version": "v1",
  "intent": "send-document",
  "idempotencyKey": "sales-invoice:E2F7A13B:email:v1",
  "clientReference": "ui-send-modal-2026-05-19T12:30:00Z"
}
```

The contract decides:

- which template is used
- who can execute it
- how recipients are resolved
- which variables are allowed
- how links are generated
- whether Reply-To is allowed
- how throttling and idempotency work
- which audit fields are stored
- what happens if a kill switch is active

Authentication flows are stricter: browser clients call the auth endpoint only
and never send the email contract command. The server creates the transactional
email command after the account, password reset, or onboarding state transition
has been validated and persisted.

## Contract Lifecycle

| Phase | Owner | Required Output |
|-------|-------|-----------------|
| Design | Product/engineering | Contract name, user story, allowed roles, recipient source, variables, edge cases |
| Implementation | Backend | Contract class/descriptor, executor wiring, provider adapter usage |
| UI integration | Frontend | Contract command call and mapped user-facing states |
| QA | QA/security | Authorization, throttling, idempotency, failure, sanitizer, and audit tests |
| Operations | Support/DevOps | Metrics, logs, runbook entry, kill switch path, alert thresholds |
| Documentation | Engineering | Contract entry in [email-contracts.md](email-contracts.md) and runbook updates |

## Initial Contract Families

### Password Reset

Purpose: send a recovery link to the account owner.

Expected contract: `reset-password`.

Edge cases:

- The requested user does not exist: return a neutral success response and do not reveal account existence.
- The user has no active email address: suppress the send, audit the reason, and return a neutral response.
- Multiple requests arrive in a short window: reuse idempotency and throttle by account, IP, recipient, and tenant.
- The reset token is expired or already used: the link target handles invalid token state without resending automatically.

### New Account

Purpose: notify a user that a local Etendo Go account was created.

Expected contract: `new-account`.

Edge cases:

- The account exists but is inactive: block the send unless a dedicated activation flow permits it.
- The recipient email belongs to an existing user in another tenant: keep tenant context isolated and avoid cross-tenant data in variables.
- The invite link is regenerated: invalidate or supersede prior links according to the contract idempotency rule.

### Environment Ready

Purpose: notify a user that onboarding committed successfully and the new environment is ready to enter.

Expected contract: `environment-ready`.

Edge cases:

- Onboarding fails before commit: do not send the email.
- The account cannot be resolved after commit: audit the failure and keep onboarding success unchanged.
- A retry completes the same environment again: use idempotency scoped to the environment/client id.

### Password Changed

Purpose: notify the account owner after an authenticated local password change.

Expected contract: `password-changed`.

Edge cases:

- The current password is wrong: reject the change and do not send email.
- The provider fails after the password is changed: audit the email failure but keep the password change and rotated session token.
- Multiple changes happen in a short window: throttle per recipient and tenant while keeping each successful change auditable.

### Login Alert

Purpose: notify a user about security-relevant login events.

Expected contract: `login-alert`.

Current status: registered for contract compatibility but not triggered by login. Sending login alerts is deferred until the SSO and risk-policy model is defined.

Edge cases:

- Login comes from a known device but a new IP: send only when the contract's risk threshold requires it.
- Login metadata is incomplete: send with a safe fallback for missing location/device fields.
- A burst of failed logins happens: throttle per account and IP while preserving audit records for security review.
- The account is locked after the event: send the lock-related alert contract instead of duplicating generic login alerts.

### Invoice and Document Notification

Purpose: send a business document notification derived from an Etendo record.

Expected contracts: `sales-invoice-send`, `sales-order-send`, `sales-quotation-send`, or a document-specific contract name.

Edge cases:

- The user cannot access the document: return unauthorized and do not disclose whether the record exists.
- The document has no valid recipient contact: block the send with a clear UI state and audit `NO_RECIPIENT`.
- The document is draft or voided: block unless the contract explicitly allows that document status.
- The same document is sent twice from the UI: idempotency returns a duplicate/sent state without a second provider call.
- The user edits recipients (To/CC) before sending: the backend re-resolves and re-validates the final set; an empty final To returns `NO_RECIPIENT`, and a different final set derives a different idempotency key.

### Controlled Custom Support Email

Purpose: allow support/admin teams to send controlled HTML or rich text when no fixed template exists.

Expected contract: `support-custom-email`.

Edge cases:

- A general user attempts to execute the contract: return forbidden and audit the attempt.
- HTML contains scripts, event handlers, external tracking pixels, or unsafe links: sanitize or reject according to the contract.
- The operator omits a reason: reject the command because support custom sends must be justified.
- The recipient is outside the allowed domain policy: block or require elevated approval according to the contract.

## Required Runtime Controls

### Authorization

Each contract must verify the authenticated user, role, tenant, organization, and target record before resolving recipients or variables. Frontend button visibility is a UX hint only.

### Recipient Resolution

Contracts should resolve recipients from trusted server-side data:

- account owner email for authentication flows
- business partner contact email for documents (the trusted base `to` set; document-send contracts then apply the allowlisted `recipientEdits` command field per rule 6 and re-validate the final set server-side)
- responsible user email for internal alerts
- allowlisted caller-provided email only for admin/support contracts

### Throttling

Contracts must declare limits at the levels that apply to their abuse profile:

- per user
- per tenant/client
- per contract/template
- per recipient
- per domain
- per source IP when available
- per target record
- global provider safety limit

### Idempotency

All send commands must require or derive an idempotency key. Duplicate commands must not trigger duplicate provider calls within the configured window.

Recommended key shape:

```
{contractName}:{tenantId}:{recordOrSubjectId}:{semanticAction}:{version}
```

### Audit

Audit records must be written for success, blocked, duplicate, throttled, unauthorized, suppressed, sanitizer rejection, provider failure, and kill-switch outcomes. Audit must not store provider secrets or full HTML bodies.

Runtime audit, idempotency, throttle counters, and kill-switch records are persisted through the DAL-backed safety store. Process-local in-memory storage is acceptable only for unit tests or explicit non-runtime harnesses.

### Kill Switches

The executor must support:

- global email kill switch
- tenant/client kill switch
- contract/template kill switch
- provider adapter disable switch
- emergency suppressions by recipient or domain

## UI State Contract

Frontend integrations must map executor responses to explicit user states:

| Executor Result | UI Behavior |
|-----------------|-------------|
| `SENT` | Show success and persist send status if the flow needs it |
| `DUPLICATE` | Show already sent or recently sent, not an error |
| `THROTTLED` | Show wait/retry guidance without provider details |
| `UNAUTHORIZED` | Hide/disallow action and show a permission message |
| `NO_RECIPIENT` | Ask the user to fix the business contact data |
| `SUPPRESSED` | Show that delivery is disabled for the recipient/domain |
| `KILL_SWITCHED` | Show service unavailable for email sends |
| `PROVIDER_FAILED` | Show retry/support message with request reference |

## Agent Checklist

When creating or maintaining email sending behavior:

1. Update or create the contract entry in [email-contracts.md](email-contracts.md).
2. Keep provider endpoint/API key in server config only.
3. Do not add frontend code that accepts arbitrary `to`, `template`, or raw provider data. The only recipient-related command field the document-send UI may emit is the allowlisted `recipientEdits` (rule 6).
4. Implement backend authorization before recipient or variable resolution.
5. Add throttling, idempotency, audit, suppression, and kill switch handling.
6. Add at least three edge cases for the contract family.
7. Add tests for unauthorized access, invalid recipient, forbidden sender/reply-to fields, duplicate send, throttle, and provider failure.
8. Update [ops/transactional-email-security.md](ops/transactional-email-security.md) when operations behavior changes.

## Definition of Done

An email contract is done only when:

- the contract is documented
- the executor path is covered by automated tests
- the UI never exposes provider secrets or arbitrary provider payloads
- audit and metrics are emitted for all terminal outcomes
- throttle and idempotency behavior are deterministic
- kill switch behavior is verified
- security review covers custom HTML if the contract accepts rich text
