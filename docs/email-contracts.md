# Email Contracts Guide

Email contracts are the only supported way to send transactional email from Etendo Go. A contract is a server-side agreement between a product workflow and the email executor. It describes authorization, recipient resolution, variable resolution, throttling, idempotency, audit, and provider behavior.

Use this guide when adding or changing a contract.

## Contract Descriptor

Every contract must define these fields.

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Stable kebab-case contract name, for example `reset-password` |
| `version` | Yes | Contract schema version, starting at `v1` |
| `template` | Yes | Provider template identifier or internal renderer key |
| `enabled` | Yes | Default enabled state; kill switches can override it |
| `description` | Yes | Short business purpose |
| `caller` | Yes | Allowed source, such as `frontend`, `system`, `support`, or `admin` |
| `authorization` | Yes | Role, process, window, record, tenant, and organization checks |
| `recipient` | Yes | Server-side recipient source and validation rules |
| `variables` | Yes | Allowed variable names, types, sources, and required flags |
| `replyTo` | Yes | Disabled by default or explicit allowlist policy |
| `links` | If links exist | Link generator, expiry, host policy, and token policy |
| `throttle` | Yes | Per-contract abuse limits |
| `idempotency` | Yes | Key strategy and duplicate window |
| `audit` | Yes | Events and redaction rules |
| `suppression` | Yes | Recipient/domain suppression behavior |
| `killSwitch` | Yes | Global, tenant, and contract disable behavior |
| `edgeCases` | Yes | At least three edge cases with expected outcomes |

## Request Contract

The browser sends a command to Etendo Go:

```http
POST /sws/neo/email-contracts/{contractName}/send
Authorization: Bearer <jwt>
Content-Type: application/json
```

```json
{
  "version": "v1",
  "recordId": "E2F7A13B...",
  "intent": "send-document",
  "idempotencyKey": "sales-invoice-send:E2F7A13B:send:v1"
}
```

The browser must not send provider API keys, sender addresses, raw templates, or arbitrary provider payloads.

For the app-shell document send flow, `SendDocumentModal` posts only the contract command to `/sws/neo/email-contracts/{document-contract}/send`, such as `sales-invoice-send`, `sales-order-send`, or `sales-quotation-send`. The UI must not include `to`, `template`, `data`, `subject`, `body`, sender, Reply-To, or provider metadata in that request; those values are resolved by the server-side contract. The only recipient-related field the document-send UI may add is the allowlisted `recipientEdits` described below.

### `recipientEdits` (document-send family only)

Document-send contracts accept an optional `recipientEdits` command field by default (ETP-4226). It carries the user's edits to the recipient lists in two channels — `to` (add/remove) and `cc` (add only; base recipients never originate in CC):

```json
{
  "version": "v1",
  "recordId": "E2F7A13B...",
  "intent": "send-document",
  "recipientEdits": {
    "to": {
      "add": ["ap@customer.com", "billing@customer.com"],
      "remove": ["contact@customer.com"]
    },
    "cc": { "add": ["pm@customer.com"] }
  }
}
```

Semantics:

- **Absence means legacy behavior.** A command without `recipientEdits` resolves exactly the trusted base recipient set, as before. The frontend only includes the field when the user actually changed something, so untouched sends remain byte-identical to the legacy command — that is the backward-compatibility guarantee.
- **The backend is authoritative.** The contract re-resolves the document, access rights, document state, and base recipients, then normalizes the edits, applies `to.remove`/`to.add`/`cc.add`, deduplicates across channels (`to` wins over `cc`), and enforces the final constraints (non-empty `to`, max recipients across both channels, suppression, syntax validity). Frontend validation is user experience only.
- **The client `idempotencyKey` is omitted and ignored when edits are present.** The server derives the authoritative key as `{contractName}:{tenantId}:{recordId}:send:v1:{recipientSetHash}`, where `recipientSetHash` is a SHA-256 over the sorted, normalized `channel:address` tuples of the final recipient set. The frontend cannot compute this key (it does not know `tenantId` and is not authoritative over the final set).
- **Family-scoped.** Contracts outside the document-send family (auth/account contracts) reject a command containing `recipientEdits` with `VALIDATION_FAILED`, as does a document contract whose editing hook or window override disables editing.

Temporary preview-cache bridge: until document email downloads are stored in S3-backed storage, app-shell may cache an already generated PDF blob through `/sws/neo/preview-file` immediately before calling the email contract. This is only file preparation for the backend signed download link; it must not add provider payload fields or caller-provided download links to the contract command.

For auth email flows, the browser does not send an email contract command at all. It calls `/sws/go/register`, `/sws/go/password-reset/request`, `/sws/go/password-reset/confirm`, or `/sws/go/change-password`; Etendo Go builds the `new-account`, `reset-password`, `password-changed`, and `environment-ready` commands server-side from trusted account/onboarding records.

Registration may include the active onboarding locale. Etendo Go forwards it
through the closed `new-account` contract as the allowlisted `language` variable
so welcome content can be rendered in the user's selected language. The provider
template used by `new-account`, `environment-ready`, and `password-changed` is
`custom`, but those contracts generate fixed subject/body values server-side and
do not expose a generic custom email payload to the browser.

## Response Contract

Recommended executor response:

```json
{
  "status": "SENT",
  "contract": "sales-invoice-send",
  "version": "v1",
  "requestId": "req-8d7f0a",
  "auditId": "audit-7bc0",
  "duplicate": false,
  "retryAfterSeconds": null
}
```

Allowed statuses:

| Status | Meaning |
|--------|---------|
| `SENT` | Provider accepted the send |
| `DUPLICATE` | Idempotency found an equivalent send in the duplicate window |
| `THROTTLED` | A contract throttle limit blocked the send |
| `UNAUTHORIZED` | Authenticated user cannot execute the contract or access the record |
| `VALIDATION_FAILED` | Command, record state, or variables failed validation |
| `NO_RECIPIENT` | The contract could not resolve a valid recipient |
| `SUPPRESSED` | Recipient or domain is suppressed |
| `KILL_SWITCHED` | Global, tenant, provider, or contract switch disabled sending |
| `PROVIDER_FAILED` | Provider call failed after validation and audit |

## Recipient Policies

Default policy: resolve the recipient from trusted server data.

Allowed recipient sources:

| Source | Allowed For | Notes |
|--------|-------------|-------|
| `account-owner` | Auth/account flows | Uses account user email from server records |
| `business-partner-contact` | Document flows | Uses the selected contact on the document or business partner |
| `business-partner-contact-with-command-edits` | Document-send family | Base `to` set from the trusted contact, then applies the allowlisted `recipientEdits` field (default for document sends; disable per contract hook or `window.sendDocument` override) |
| `responsible-user` | Internal alerts | Uses the server-side assigned user |
| `caller-provided` | Admin/support only | Requires explicit contract, role check, reason, validation, and audit |

Reject any command that tries to override recipient, sender, Reply-To, template, or provider metadata outside the contract schema. `recipientEdits` is part of the document-send command schema; every other recipient override remains forbidden.

## Reply-To Policy

Reply-To is disabled unless the contract explicitly enables it.

When enabled:

- it must be derived from a trusted server record or allowlisted support mailbox
- it must be syntactically valid
- it must not change the sender identity
- it must be recorded in audit
- it must not permit tenant domain spoofing

## Template and Variable Policy

Variables must be allowlisted and typed. HTML variables require sanitizer policy.

| Type | Rule |
|------|------|
| `string` | Escape by default before rendering |
| `date` | Format server-side or pass a typed value plus locale |
| `currency` | Include amount and ISO currency code; avoid preformatted ambiguous strings when possible |
| `url` | Generate server-side; allowlisted hosts only |
| `html` | Only for controlled contracts; sanitize and audit sanitizer outcome |

Document notification contracts should use the default document payload unless a legacy provider template requires a specific alias:

| Variable | Source |
|----------|--------|
| `name` | Business partner/contact display name |
| `document_type` | Contract-defined document label |
| `document_number` | Document number from the trusted record |
| `download_link` | Server-generated document URL |

Amounts and document-specific aliases are compatibility exceptions, not the default. For example, `sales-invoice-send` still emits `amount` and `invoice_number` because the existing invoice provider template expects them. `sales-order-send` and `sales-quotation-send` use only the default document variables.

## Initial Contracts

### `reset-password`

Purpose: send a password reset link without revealing account existence.

Descriptor sketch:

```json
{
  "name": "reset-password",
  "version": "v1",
  "template": "reset-password",
  "caller": ["public-auth-flow", "system"],
  "recipient": { "source": "account-owner" },
  "variables": {
    "name": { "type": "string", "source": "user.displayName", "required": true },
    "link": { "type": "url", "source": "resetToken.url", "required": true }
  },
  "replyTo": { "enabled": false },
  "idempotency": { "key": "reset-password:{tenantId}:{userId}:active-token:v1", "windowSeconds": 900 }
}
```

Required edge cases:

- Unknown email returns neutral success without revealing account existence.
- Disabled or inactive accounts return the same neutral request response and do not receive a token.
- Provider failure, throttling, or kill-switch suppression does not change the neutral request response.
- Missing, expired, or already-used reset tokens are rejected by `/sws/go/password-reset/confirm`.
- A valid reset token can be used once; the password is changed, reset token fields are cleared/consumed, and the platform session token is cleared.

### `new-account`

Purpose: notify users immediately after successful local account registration.

Required edge cases:

- Registration commits before the email attempt; provider failure is audited and must not roll back account creation.
- Inactive account records are rejected by the contract resolver.
- Duplicate registration email commands return `DUPLICATE`.
- The selected UI language is forwarded only as the allowlisted `language` template variable; it does not let the browser override recipient, template, subject, body, sender, or provider metadata.

Email verification is not part of the local account flow. There are no verification fields and login/onboarding is not gated by email verification because SSO is the next authentication step.

### `environment-ready`

Purpose: notify users after onboarding successfully commits and the environment is ready.

Required edge cases:

- Onboarding fails or rolls back: do not send the email.
- Onboarding commits and the provider fails: audit the failure but keep onboarding success.
- Duplicate completion for the same environment/client id returns `DUPLICATE`.

### `password-changed`

Purpose: notify the account owner after an authenticated local password change.

Required edge cases:

- Wrong current password rejects the request and sends no email.
- Valid change rotates the platform session token and sends the notice best-effort.
- Provider failure is audited and must not roll back the password change.

### `login-alert`

Purpose: notify a user about a security-relevant login event.

Descriptor sketch:

```json
{
  "name": "login-alert",
  "version": "v1",
  "template": "login-alert",
  "caller": ["system"],
  "recipient": { "source": "account-owner" },
  "variables": {
    "name": { "type": "string", "source": "user.displayName", "required": true },
    "ip": { "type": "string", "source": "loginEvent.ip", "required": false },
    "date": { "type": "date", "source": "loginEvent.occurredAt", "required": true }
  },
  "replyTo": { "enabled": false },
  "idempotency": { "key": "login-alert:{tenantId}:{userId}:{loginEventId}:v1", "windowSeconds": 86400 }
}
```

Required edge cases:

- Missing IP or device metadata uses safe fallback text and logs missing metadata.
- High-volume attempts throttle per account and source IP.
- User has disabled security emails only if policy allows opt-out; mandatory alerts ignore preference.

Current status: the contract remains registered but login does not trigger it yet. Login alerts are deferred until the SSO and risk-policy model exists.

### Shared: document-send recipient policy

The three document `*-send` contracts (`sales-invoice-send`, `sales-order-send`,
`sales-quotation-send`) share one recipient policy. It is defined once here and
referenced from each descriptor sketch below as
`"recipient": { "$shared": "document-send-recipient-policy" }` so the three stay
in sync:

```json
{
  "source": "business-partner-contact-with-command-edits",
  "recordId": "request.recordId",
  "editingEnabled": true,
  "channels": ["to", "cc"],
  "maxRecipientsTotal": 10
}
```

### `sales-invoice-send`

Purpose: send an invoice/document notification to the recipient resolved from the document.

Descriptor sketch:

```json
{
  "name": "sales-invoice-send",
  "version": "v1",
  "template": "invoice",
  "caller": ["frontend"],
  "authorization": {
    "windowAccess": "sales-invoice",
    "recordAccess": "recordId",
    "requiresReadableDocument": true
  },
  "recipient": { "$shared": "document-send-recipient-policy" },
  "variables": {
    "name": { "type": "string", "source": "businessPartner.name", "required": true },
    "document_type": { "type": "string", "source": "contract.documentType", "required": true },
    "document_number": { "type": "string", "source": "invoice.documentNo", "required": true },
    "invoice_number": { "type": "string", "source": "invoice.documentNo", "required": true },
    "amount": { "type": "currency", "source": "invoice.grandTotal", "required": true },
    "download_link": { "type": "url", "source": "documentDownload.url", "required": true }
  },
  "replyTo": { "enabled": false },
  "idempotency": { "key": "sales-invoice-send:{tenantId}:{recordId}:send:v1:{recipientSetHash}", "derivation": "server-side", "windowSeconds": 3600 }
}
```

Required edge cases:

- Caller lacks record access: return `UNAUTHORIZED` and do not reveal record details.
- Document has no contact email: return `NO_RECIPIENT`.
- Document status is not allowed for sending: return `VALIDATION_FAILED`.

### `sales-order-send`

Purpose: send a sales order document notification to the recipient resolved from the order.

Descriptor sketch:

```json
{
  "name": "sales-order-send",
  "version": "v1",
  "template": "document",
  "caller": ["frontend"],
  "authorization": {
    "windowAccess": "sales-order",
    "recordAccess": "recordId",
    "requiresReadableDocument": true
  },
  "recipient": { "$shared": "document-send-recipient-policy" },
  "variables": {
    "name": { "type": "string", "source": "businessPartner.name", "required": true },
    "document_type": { "type": "string", "source": "contract.documentType", "required": true },
    "document_number": { "type": "string", "source": "order.documentNo", "required": true },
    "download_link": { "type": "url", "source": "documentDownload.url", "required": true }
  },
  "replyTo": { "enabled": false },
  "idempotency": { "key": "sales-order-send:{tenantId}:{recordId}:send:v1:{recipientSetHash}", "derivation": "server-side", "windowSeconds": 3600 }
}
```

Required edge cases:

- Caller lacks record access: return `UNAUTHORIZED` and do not reveal record details.
- Order has no contact email: return `NO_RECIPIENT`.
- Record is not a sales order: return `VALIDATION_FAILED`.

### `sales-quotation-send`

Purpose: send a sales quotation document notification to the recipient resolved from the quotation.

Descriptor sketch:

```json
{
  "name": "sales-quotation-send",
  "version": "v1",
  "template": "document",
  "caller": ["frontend"],
  "authorization": {
    "windowAccess": "sales-quotation",
    "recordAccess": "recordId",
    "requiresReadableDocument": true
  },
  "recipient": { "$shared": "document-send-recipient-policy" },
  "variables": {
    "name": { "type": "string", "source": "businessPartner.name", "required": true },
    "document_type": { "type": "string", "source": "contract.documentType", "required": true },
    "document_number": { "type": "string", "source": "quotation.documentNo", "required": true },
    "download_link": { "type": "url", "source": "documentDownload.url", "required": true }
  },
  "replyTo": { "enabled": false },
  "idempotency": { "key": "sales-quotation-send:{tenantId}:{recordId}:send:v1:{recipientSetHash}", "derivation": "server-side", "windowSeconds": 3600 }
}
```

Required edge cases:

- Caller lacks record access: return `UNAUTHORIZED` and do not reveal record details.
- Quotation has no contact email: return `NO_RECIPIENT`.
- Record is not a sales quotation: return `VALIDATION_FAILED`.

### `support-custom-email`

Purpose: controlled support/admin email for exceptional workflows.

This is the only permitted custom email shape. It must not be exposed to general users.

Descriptor sketch:

```json
{
  "name": "support-custom-email",
  "version": "v1",
  "template": "custom",
  "caller": ["support", "admin"],
  "authorization": {
    "roles": ["Support Admin", "System Administrator"],
    "requiresReason": true
  },
  "recipient": {
    "source": "caller-provided",
    "validateEmail": true,
    "domainPolicy": "allow-or-review"
  },
  "variables": {
    "subject": { "type": "string", "source": "request.subject", "required": true },
    "body": { "type": "html", "source": "request.body", "required": true, "sanitizer": "strict-email-html" }
  },
  "replyTo": { "enabled": true, "source": "allowlisted-support-mailbox" },
  "idempotency": { "key": "support-custom-email:{tenantId}:{recipientHash}:{subjectHash}:v1", "windowSeconds": 600 }
}
```

Required edge cases:

- Non-support user executes the command: return `UNAUTHORIZED`.
- Body contains unsafe HTML: return `VALIDATION_FAILED` or send sanitized output according to policy, and audit the sanitizer result.
- Missing reason: return `VALIDATION_FAILED`.

## Versioning Rules

- Add a new version when request shape, authorization, recipient source, variable semantics, or throttle behavior changes.
- Keep old versions only while clients still need them.
- Deprecate a version by documenting the replacement and adding observability for remaining usage.
- Do not change a contract in place when it can cause a client to send a different recipient, template, or set of variables.

**Recorded waiver (ETP-4226, 2026-06-11):** the addition of the optional `recipientEdits` field and the switch to server-derived idempotency were applied to the document-send contracts **in place on v1**, against the first and last rules above. The waiver is allowed because the only client of the email contracts is the bundled app-shell, deployed atomically with the backend — there is no client that can observe a mixed old/new state, and a command without `recipientEdits` stays byte-identical to the previous shape. The moment any external client consumes email contracts, this waiver expires: request-shape changes again require a new contract version and version-coexistence infrastructure (registry keyed by name+version, version routing) before shipping.

## Review Checklist

Before merging a contract change:

- Contract entry exists in this guide.
- At least three edge cases are listed.
- Backend tests cover authorization, recipient resolution, invalid recipient, idempotency, throttling, provider failure, audit, and Reply-To policy.
- UI maps all executor statuses used by the contract.
- Provider secret values are not present in code, docs, tests, fixtures, screenshots, or frontend bundles.
- Operations runbook and metrics are updated when behavior changes.
- Observability tests or verification scripts prove the contract emits redacted events for success, validation failure, throttle, duplicate, suppression/kill switch, and provider failure outcomes.
