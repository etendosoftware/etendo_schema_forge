# Document Send Editable Email Recipients (To / CC)

**Status:** Draft - pending stakeholder approval (revision 5)
**Date:** 2026-06-11
**Branch:** `epic/ETP-3504`
**Owner:** Schema Forge / Etendo Go
**Jira:** ETP-4226

> Revision 5 widens the scope by stakeholder decision: editable recipients
> (To/CC) become the **default behavior for ALL document-send flows** —
> sales invoice was only the motivating example. Consequences: the backend
> acceptance of `recipientEdits` moves from the sales invoice contract to the
> shared `DefaultDocumentSendEmailContract` base, the frontend chip editor is
> enabled by default in the shared modal, and `decisions.json` flips from
> per-window opt-in to per-window **opt-out/override**. Revision 4's
> resolved decisions stand: any syntactically valid email may be added, a
> single `maxRecipients` limit for all roles, no reason capture, and no BCC.

## 1. Problem

Document email flows (sales invoice, sales order, sales quotation, goods
shipment, goods receipt) propose the business partner/contact email in
`SendDocumentModal`, but the recipient field is read-only. This was
intentional: document emails are contract-driven, and the browser only sends a
minimal command to the backend email contract.

The new business requirement is different (sales invoice is the reference
example throughout, but the behavior is generic):

1. When sending a document, the modal should still propose the contact email
   as the default `To` recipient.
2. The user should be able to remove proposed email addresses.
3. The user should be able to add email addresses.
4. The user should be able to add CC recipients.
5. The frontend should validate email syntax before sending.
6. The backend should accept the edited recipient set.
7. **This is the default behavior for every document send**, not a
   per-window feature.

The change must not turn the document email endpoint into a generic email relay.
The browser must still not send provider fields such as template, subject, body,
sender, reply-to, provider metadata, provider URL, or provider credentials.

## 2. Current State

All statements in this section were verified against the code on
`epic/ETP-3504` (2026-06-11).

### 2.1 Frontend command

The app-shell helper builds a minimal command:

```json
{
  "version": "v1",
  "recordId": "E2F7A13B...",
  "intent": "send-document",
  "idempotencyKey": "sales-invoice-send:E2F7A13B:send:v1"
}
```

- `tools/app-shell/src/components/contract-ui/documentEmailSend.js`
  - derives the contract name as `{windowName}-send`
  - builds only `version` (hardcoded `'v1'`), `recordId`, `intent`, and
    `idempotencyKey` (`{contractName}:{documentId}:send:v1`)
  - posts to `/sws/neo/email-contracts/{contractName}/send`
  - has **no options parameter and no extensibility hook** — the signature is
    `buildEmailContractCommand(contractName, documentId)`
- `tools/app-shell/src/components/contract-ui/SendDocumentModal.jsx`
  - resolves the business partner email via
    `GET {contactsBaseUrl}/businessPartner/{bPartnerId}` reading `etgoEmail`
  - renders `To`, `Subject`, and `Message` as unconditionally read-only
  - the only per-window switch today is the `allowEmail` boolean prop
  - all visible strings go through `useUI()` (22 `sendModal*` keys exist in
    both `en_US.json` and `es_ES.json`)

### 2.2 Mount-point inventory (now the full activation surface)

Because editable recipients become the default, **every** mount point of the
shared modal is affected — this is the complete inventory:

| Mount point | Domain | Context |
|---|---|---|
| `tools/app-shell/src/windows/custom/sales-invoice/index.jsx` | `window:sales-invoice` | list row quick-action email |
| `tools/app-shell/src/windows/custom/shared/InvoicePreview.jsx` | `shared-custom-capability` | invoice preview email action |
| `artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx` (draft + completed paths) | `window:sales-invoice` | detail-view topbar |
| `tools/app-shell/src/windows/custom/shared/OrderPreview.jsx` | `shared-custom-capability` | sales/purchase order preview |
| `tools/app-shell/src/windows/custom/shared/QuotationPreview.jsx` | `shared-custom-capability` | quotation preview |
| `tools/app-shell/src/windows/custom/goods-shipment/GoodsShipmentPreview.jsx` | `window:goods-shipment` | shipment preview |
| `tools/app-shell/src/windows/custom/goods-receipt/index.jsx` | `window:goods-receipt` | list row quick-action |
| `artifacts/sales-quotation/custom/QuotationTopbarActions.jsx` | `window:sales-quotation` | detail-view topbar |
| `artifacts/purchase-order/custom/PurchaseOrderActions.jsx` | `window:purchase-order` | detail-view topbar |
| `artifacts/goods-shipment/custom/GoodsShipmentActions.jsx` | `window:goods-shipment` | detail-view topbar |
| `artifacts/goods-receipt/custom/GoodsReceiptActions.jsx` | `window:goods-receipt` | detail-view topbar |
| `tools/app-shell/src/components/contract-ui/ListView.jsx` | `platform-change` | generic fallback for windows with `sendDocument.enabled` |

Because the behavior change lives **inside the shared modal**, mount points do
not need individual threading to get the default — they inherit it. Only
windows that want to opt out or tune limits need configuration.

### 2.3 Backend reality (com.etendoerp.go)

Contracts are not JSON descriptors: they are Java CDI beans under
`com.etendoerp.go.schemaforge.email(.contracts)`, discovered via
`WeldUtils.getInstances(EmailContractProvider.class)`.

- Route: `NeoBuiltInEndpointHandler` matches
  `/email-contracts/{contractName}/send` and calls
  `TransactionalEmailService.send(contractName, body)`.
- Document send contracts (`sales-invoice-send`, `sales-order-send`,
  `sales-quotation-send`, …) extend `DefaultDocumentSendEmailContract`,
  registered by `SalesDocumentEmailContractProvider`.
  `DefaultEmailContractRegistry` keys contracts by name;
  `EmailContractCommandSupport.VERSION` is `"v1"` and other versions are
  rejected. **This stays as-is** — evolving v1 in place means no registry or
  version-routing changes.
- Recipient resolution returns a **single String**
  (`EmailRecipientResolution`, `EmailProviderRequest`, `EmailAuditRecord` all
  model one recipient). Resolution order: `C_BPartner.EM_Etgo_Email`, falling
  back to the first active `ADUser` email. Moving to a multi-channel set is
  the main backend work of this proposal.
- Idempotency: `resolveSendIdempotencyKey()` **trusts the caller-supplied
  key** (`firstNonBlank(callerKey, derivedKey)`); dedup is stored in
  `ETGO_Email_Safety` with no TTL.
- Throttle scopes applied to document sends today: global, per-tenant,
  per-record, per-recipient, per-domain. `perUser` exists in the framework but
  is not applied to document sends.
- Suppression: kill switches exist at global/tenant/template scope. There is
  **no per-address or per-domain suppression list**.
- Response statuses: `UNAUTHORIZED`, `VALIDATION_FAILED`, `SUPPRESSED`,
  `DUPLICATE`, `PROVIDER_FAILED` exist. `NO_RECIPIENT` does **not** — an empty
  recipient currently maps to `VALIDATION_FAILED`.
- Audit stores a single SHA-256 `recipientHash` plus plaintext
  `recipientDomain`; raw addresses are never persisted.

### 2.4 Policy documents

- `docs/transactional-email-framework.md` — "must not become a generic email
  relay" (rule 1); named, versioned contract commands only (rule 4);
  server-side recipients by default (rule 5); and **rule 6: caller-provided
  recipients are allowed only for explicit admin/support contracts** with role
  checks, throttle, reason capture, and audit.
- `docs/email-contracts.md` — the modal must not include `to`, `template`,
  `data`, `subject`, `body`, sender, reply-to, or provider metadata; documents
  the document-send contracts; and rules that a contract should not change in
  place when the change can alter recipients ("Add a new version when request
  shape … changes").
- `docs/document-email-contract-implementation.md` — "Keep recipient preview
  fields read-only" and an **unconditional** PR-checklist item "Recipient
  fields shown in the UI are read-only".
- `docs/generated-custom-windows/sales-invoice.md` (and the guides of every
  other window with a send flow) — document the contact pre-fill behavior.
- `docs/ops/transactional-email-security.md` — logging rules and the redacted
  observability sink table. Note: there is no formally named "email audit
  redaction/storage policy" document; this proposal requires naming one (see
  section 10).

**Approving this proposal is approving two explicit policy amendments:**

1. Framework rule 6 — document-send contracts accept caller recipient
   *edits* through an explicitly allowlisted command field **by default**,
   with the backend remaining authoritative. **Reason capture is explicitly
   waived** for document-send recipient edits (stakeholder decision): the
   send action plus the hashed audit evidence is sufficient context. This is
   a larger amendment than a per-contract exception — the rule's default for
   the document-send family inverts — and must be written accordingly.
2. The versioning rule in `email-contracts.md` — waived for this change:
   the document-send contracts evolve in place because their only client is
   the bundled app-shell, deployed atomically with the backend. The waiver
   must be recorded in the doc; once external clients consume email
   contracts, in-place changes of this kind become forbidden again and
   version coexistence must be built first.

## 3. Proposal

Extend the **document-send contract family** (v1, in place) with an optional,
contract-scoped `recipientEdits` field covering two channels: `to` and `cc`.
Acceptance lives in `DefaultDocumentSendEmailContract`, so every document
contract inherits it. No new contract version, no version-coexistence
infrastructure, no BCC.

The UI remains document-specific and contract-driven:

- the contact email is still proposed from trusted business partner/contact
  data, landing in the `To` channel;
- the user edits the recipient lists in the modal (To: add/remove; CC: add
  only — base recipients never originate in CC); **this is the default for
  every document send modal**;
- the browser sends only the contract command plus the allowlisted
  `recipientEdits` field;
- the backend re-resolves the document, access rights, document state, base
  recipients, final recipients, variables, and download link before sending.

Recommended command shape (sales invoice as example):

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

Semantics of absence: a command **without** `recipientEdits` resolves exactly
the trusted base recipient set, as today. The frontend only includes
`recipientEdits` when the user actually changed something, so untouched sends
remain byte-identical to the current command — that is the backward-compat
guarantee.

`recipientEdits` is not a provider payload. It is an allowlisted command field
defined by the document-send contract family. Contracts outside that family
(auth/account contracts) reject it with `VALIDATION_FAILED` rather than
silently ignoring it, as does any document contract whose window explicitly
disabled editing (see section 5).

**Idempotency becomes server-derived for document-send contracts.** The base
contract derives the authoritative key as

```text
{contractName}:{tenantId}:{recordId}:send:v1:{recipientSetHash}
```

where `recipientSetHash` is a SHA-256 over the sorted, normalized
`channel:address` tuples of the **final** recipient set. The frontend cannot
compute this (it does not know `tenantId` and is not authoritative over the
final set), so the client-supplied `idempotencyKey` is ignored by document
sends and the modal stops sending it. This also closes an existing weakness:
today the caller key is trusted as-is. No `baseFingerprint` or preview
endpoint is needed — the server trusts no frontend fingerprint.

## 4. Recipient Semantics

The backend calculates recipients in this order (identical for every
document-send contract; document loading and base-recipient resolution remain
per-contract via the existing resolver injection):

1. Authorize the authenticated user for the contract's window, tenant,
   organization, and record access.
2. Load the document and validate that its status is sendable.
3. Resolve the base recipient set from trusted business partner/contact data.
   Base recipients belong to the `to` channel.
4. Normalize requested additions and removals per channel:
   - trim whitespace;
   - lower-case the domain;
   - remove duplicates within the channel;
   - reject empty values;
   - reject syntactically invalid emails.
5. Apply `to.remove` against the base set, then apply `to.add` and `cc.add`.
6. Deduplicate across channels with precedence `to > cc` (an address in `to`
   is silently dropped from `cc`).
7. Enforce final recipient constraints:
   - at least one `to` recipient (a send with only CC is invalid);
   - maximum recipient count **across both channels** (10, same limit for
     all roles — no admin/support override, by stakeholder decision);
   - no suppressed recipient or domain, in either channel;
   - no blocked domain policy, in either channel;
   - no invalid address after normalization.
8. Generate variables and `download_link` server-side.
9. Derive the idempotency key from the final set hash; apply idempotency and
   throttle across both channels.
10. Audit the resolved outcome and call the provider only after all
    validation passes.

**Allowed addresses (stakeholder decision):** additions may be **any
syntactically valid email** — they are not restricted to addresses tied to
the business partner/contact records. The guardrails are the ones above:
normalization and syntax validation, the suppression list, the recipient
count limit, per-recipient/per-domain throttling, and the hashed audit trail.

Frontend validation is user experience only. Backend validation is
authoritative.

## 5. Architecture & Domain Boundaries

This monorepo enforces `docs/ops/domain-boundary-check.md`: PRs must not mix
`platform-change` (shared `contract-ui`), `shared-custom-capability`
(`windows/custom/shared`), `generator-change`, and `window:<name>` scopes
without an approved `docs/plans/<ticket>-cross-domain.md` exception. Known
cross-domain debt already exists (the `ETP-*-cross-domain.md` plans) and is
being worked down; **this feature must not add to it**. The design below keeps
every slice inside one domain.

### 5.1 Design rules

1. **The default lives in shared code; overrides live in `decisions.json`.**
   Editable recipients are the built-in behavior of `SendDocumentModal` —
   that is a legitimate `platform-change`, not a window feature. A window
   that needs different behavior declares an **override**:
   `window.sendDocument: { editableRecipients: false }` to lock recipients,
   or `{ cc: false }` / `{ maxRecipients: 5 }` to tune. The generator emits
   the override into the spec; absence of config means the default applies.
   Overrides survive pipeline re-runs because they are decisions, not code.
2. **No window-name conditionals in shared code.** `SendDocumentModal` and
   `documentEmailSend.js` never check `windowName`; behavior differences come
   only from the spec-derived `sendPolicy` override object.
3. **Mount points need no changes to get the default.** They inherit it from
   the shared modal. Only a window with an override forwards its
   spec-derived policy (one opaque prop), keeping window specifics out of
   `shared/`.
4. **Backend mirrors the same default/override split.**
   `DefaultDocumentSendEmailContract` accepts `recipientEdits` by default and
   owns the generic algorithm of section 4; a per-contract hook lets a
   contract disable editing or tighten limits. No document-specific logic in
   `TransactionalEmailService`, the registry, or other generic framework
   classes; the multi-channel model, `NO_RECIPIENT`, and the suppression list
   are framework primitives.
5. **No new cross-direction imports.** `artifacts/*/custom/` components
   already import the shared modal (existing, accepted pattern); they keep
   consuming the same public API. Nothing in `tools/app-shell` may import
   from `artifacts/`.

### 5.2 PR slicing (one domain per PR)

| # | Repo / domain | Content | Inert until |
|---|---|---|---|
| 1 | `com.etendoerp.go` — framework | Multi-channel recipient model (`to[]`/`cc[]` through resolution, provider request, adapter), `NO_RECIPIENT` status, per-address/domain suppression list, multi-recipient audit fields, server-derived idempotency support | no contract accepts `recipientEdits` |
| 2 | `com.etendoerp.go` — contract family | `recipientEdits` DTO + default acceptance in `DefaultDocumentSendEmailContract` (with per-contract disable/tune hook), recipient-edit resolver, `perUser` throttle, tests | frontend never sends `recipientEdits` |
| 3 | schema-forge — `generator-change` | `decisions.json` schema for the `window.sendDocument` **override** (disable/tune) + generator emission + pipeline-validator rule if needed | no window declares an override (none needed at launch) |
| 4 | schema-forge — `platform-change` | Chip editor (To/CC) **enabled by default** in `SendDocumentModal`, `documentEmailSend` options support, i18n keys — this is the activation PR for every document flow at once | — (activation) |
| 5 | schema-forge — docs & e2e | Window guides of every send-capable window (sales-invoice as the reference example, plus order/quotation/shipment/receipt) + mocked e2e for the chip editor | — (same PR set as 4 per the Documentation Freshness policy; if the boundary gate flags docs of multiple windows alongside the platform change, attach the standard `docs/plans/<ticket>-cross-domain.md` plan — precedent: ETP-4030) |

Each PR is independently shippable and inert until PR 4 lands; PR 4 is the
single switch that turns the default on everywhere. Backend PRs pair with the
schema-forge PRs by sharing the feature branch name, per
`docs/branch-workflow.md`.

## 6. Frontend Design

### 6.1 Scope

The chip editor is the default rendering of the recipient field in
`SendDocumentModal` for every flow that mounts it (full inventory in section
2.2). No mount point needs threading; windows keep working unchanged and gain
the editable behavior when PR 4 lands. The per-window `decisions.json`
override exists for opt-out or tuning, and **no window needs it at launch**.

### 6.2 UI Behavior

The read-only `To` input is replaced by a recipient chip editor (default; a
`sendPolicy` override with `editableRecipients: false` restores the read-only
input):

- initial `To` chips come from the existing contact email resolution;
- each chip has a remove action;
- the input accepts typed emails via Enter, comma, or blur;
- invalid entries remain in edit state with a visible validation error;
- duplicates are ignored or merged into the existing chip (across channels
  too, mirroring the backend `to > cc` precedence);
- the CC row is collapsed behind an "Add CC" affordance and renders the same
  chip editor when expanded (add-only);
- the Send button is disabled while any entered email is invalid;
- the Send button is disabled when the final `To` list is empty;
- a counter/validation message appears when the total across channels exceeds
  the effective max (default 10);
- Subject and Message remain read-only because the contract owns template and
  variables.

**i18n (mandatory):** every new string needs a key in BOTH `en_US.json` and
`es_ES.json`. At minimum: chip remove action label, recipient input
placeholder, invalid-email inline error, the "Add CC" toggle label, the CC
field label, and the max-recipients message. The existing
`sendModalNoRecipient` and `sendModalValidationFailed` keys cover the
server-side responses.

Recommended frontend helper additions (pure functions, unit-testable):

- `normalizeEmailAddress(value)`
- `isValidEmailAddress(value)`
- `normalizeRecipientList(values)`
- `buildRecipientEdits(baseRecipients, finalRecipientsByChannel)`

### 6.3 Command Builder

`documentEmailSend.js` extends its signature with an options argument, and the
new args must be threaded through the full chain
(`SendDocumentModal` → `sendDocumentFromModal` → `sendDocumentEmail` →
`buildEmailContractCommand`):

```js
buildEmailContractCommand(contractName, documentId, {
  recipientEdits,
});
```

Rules:

- when the user made **no edits**, the builder emits the exact command it
  emits today (no `recipientEdits`, client `idempotencyKey` kept) — untouched
  sends are byte-identical across every flow;
- when `recipientEdits` is present, the builder omits `idempotencyKey`
  (server-derived; see section 3);
- the builder must never accept or forward provider fields: `to`, `template`,
  `data`, `subject`, `body`, `sender`, `replyTo`, or provider metadata —
  `recipientEdits` is the only recipient-related field, and it is allowlisted
  per contract family.

## 7. Backend Design

Runtime implementation belongs in `com.etendoerp.go`. With versioning out of
scope, the work splits into **new framework primitives** (the bulk — the
runtime models a single recipient today, see section 2.3) and **document-send
base-class additions**. Contract identities, the registry, and
`validateCommand()` are untouched.

### 7.1 New framework primitives (PR 1)

1. **Multi-channel recipient model.** Extend `EmailRecipientResolution`,
   `EmailProviderRequest`, and the provider adapter contract to carry
   `to[]` and `cc[]`. Contracts that resolve a single recipient keep working
   through a compatibility constructor (single `to`).
2. **`NO_RECIPIENT` status.** New constant and branch in
   `TransactionalEmailService` (today an empty recipient collapses into
   `VALIDATION_FAILED`).
3. **Per-address / per-domain suppression list.** New safety-store capability
   (the existing kill switches only cover global/tenant/template scope).
4. **Multi-recipient audit.** Extend the audit record with redacted evidence:
   base / added / removed / final recipient hash lists (per channel), final
   recipient domains, validation result, suppression result. Raw addresses
   are never used in metrics labels; only SHA-256 hashes are persisted, per
   the policy named in section 10.
5. **Server-derived idempotency.** Allow a contract to declare its
   idempotency key authoritative (caller key ignored) and to incorporate a
   `recipientSetHash` over the final set.

### 7.2 Document-send base-class additions (PR 2)

1. Add a typed DTO for `recipientEdits` (per-channel add/remove with the
   normalization rules of section 4) and accept it **by default** in
   `DefaultDocumentSendEmailContract`. Expose a per-contract hook to disable
   editing or tighten `maxRecipients`. Contracts outside the document-send
   family reject a command containing `recipientEdits` with
   `VALIDATION_FAILED`, as does a document contract whose editing hook is
   disabled.
2. Generic recipient-edit resolver in the base class: trusted base set →
   command edits → cross-channel dedup → constraints → `NO_RECIPIENT` when
   the final `to` set is empty. Per-document base-set resolution stays in the
   injected document resolvers (existing pattern).
3. Delivery policy: existing global/tenant/record/recipient/domain throttle
   rules plus `perUser` (the framework already provides
   `EmailThrottleRule.perUser()`; it is simply not applied to document sends
   yet).
4. Switch document sends to server-derived idempotency
   (`{contractName}:{tenantId}:{recordId}:send:v1:{recipientSetHash}`).

### 7.3 Deferred (build only when needed)

- **Contract version coexistence** (registry keyed by name+version, version
  routing, per-contract accepted versions). Required the moment an external
  client consumes email contracts; out of scope now by stakeholder decision.
- **BCC channel.** Dropped from scope by stakeholder decision. The
  `recipientEdits` structure and the multi-channel model admit a `bcc`
  channel later without schema breakage; adding it would also require
  provider-adapter capability verification (never silently downgrade BCC to
  a visible channel).
- A true `perContract` throttle scope (`SCOPE_TEMPLATE` approximates it).

## 8. Contract Behavior Sketch

Illustrative only — contracts are Java CDI beans, not JSON files; this sketch
documents the semantics the document-send base contract must encode after the
change, using `sales-invoice-send` as the example:

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
  "recipient": {
    "source": "business-partner-contact-with-command-edits",
    "recordId": "request.recordId",
    "editSource": "request.recipientEdits (optional)",
    "editingEnabled": true,
    "channels": ["to", "cc"],
    "baseChannel": "to",
    "validateEmail": true,
    "maxRecipientsTotal": 10,
    "allowRemoveBaseRecipient": true,
    "allowAdditionalRecipients": true,
    "additionalRecipientPolicy": "any-syntactically-valid",
    "requireNonEmptyTo": true
  },
  "variables": {
    "name": { "type": "string", "source": "businessPartner.name", "required": true },
    "document_type": { "type": "string", "source": "contract.documentType", "required": true },
    "document_number": { "type": "string", "source": "invoice.documentNo", "required": true },
    "invoice_number": { "type": "string", "source": "invoice.documentNo", "required": true },
    "amount": { "type": "currency", "source": "invoice.grandTotal", "required": true },
    "download_link": { "type": "url", "source": "documentDownload.url", "required": true }
  },
  "replyTo": { "enabled": false },
  "idempotency": {
    "key": "sales-invoice-send:{tenantId}:{recordId}:send:v1:{recipientSetHash}",
    "derivation": "server-side",
    "windowSeconds": 3600
  }
}
```

`editingEnabled: true` is the family default; a contract or a window override
can set it to `false`.

## 9. Required Edge Cases

At minimum, the document-send contract family must define and test these
cases (sales invoice as the reference fixture):

1. User lacks document access: return `UNAUTHORIZED`; do not reveal whether
   the record exists.
2. Document status is not sendable: return `VALIDATION_FAILED`; do not call
   the provider.
3. Command without `recipientEdits`: resolves the trusted base set, exactly
   today's behavior, for every document contract.
4. Base contact has no email and the user provides no valid additions: return
   `NO_RECIPIENT`.
5. User removes all base recipients and adds no valid replacement: return
   `NO_RECIPIENT`.
6. Final `to` set is empty but CC has entries: return `NO_RECIPIENT`.
7. User adds an invalid email (either channel): return `VALIDATION_FAILED`;
   do not call the provider.
8. Same address in `to` and `cc`: normalized by channel precedence, send
   proceeds, audit reflects the deduplicated set.
9. User adds a suppressed recipient or domain (either channel): return
   `SUPPRESSED`; do not call the provider.
10. Duplicate command with the same final recipient set (both channels)
    returns `DUPLICATE`.
11. Same document sent to a different final recipient set uses a different
    idempotency key.
12. Total recipients across channels exceed the effective limit: return
    `VALIDATION_FAILED`.
13. `recipientEdits` sent to a non-document contract (e.g. an auth contract)
    or to a document contract with editing disabled: return
    `VALIDATION_FAILED`.
14. Provider adapter does not support multiple recipients / CC delivery:
    return `VALIDATION_FAILED`; never silently truncate the recipient set.
15. Provider failure after validation returns `PROVIDER_FAILED` and preserves
    audit evidence.

## 10. Policy Amendments & Documentation Updates

If approved, the implementation PRs must update:

- `docs/transactional-email-framework.md`
  - **amend rule 6**: document-send contracts accept contract-scoped
    recipient edits through an allowlisted command field **by default**,
    backend authoritative, **reason capture explicitly waived** for document
    sends (stakeholder decision — see section 13); caller-provided
    recipients outside the document-send family remain admin/support-only
  - keep the ban on generic provider payloads
- `docs/email-contracts.md`
  - document the optional `recipientEdits` schema as a document-send family
    field (sales invoice as example)
  - **record the versioning-rule waiver**: this in-place change is allowed
    because the only client is the bundled app-shell deployed atomically;
    once external clients exist, request-shape changes require a new version
    and coexistence infrastructure
- `docs/document-email-contract-implementation.md`
  - replace the unconditional "recipient fields are read-only" rule (body and
    PR checklist) with: **editable by default for document sends** through
    command-scoped recipient edits; read-only only where a window/contract
    explicitly disables editing
  - add a tutorial section for multi-recipient/multi-channel resolution (Step
    5 currently describes single-recipient resolution only)
- `docs/generated-custom-windows/*.md` — **every send-capable window guide**
  (sales-invoice as the reference example, plus sales-order, purchase-order,
  sales-quotation, goods-shipment, goods-receipt): recipients are proposed
  from contacts and editable (To/CC) before send
- `docs/ops/transactional-email-security.md`
  - **formally name the "email audit redaction/storage policy"** (earlier
    drafts referenced it by name but no such named policy exists — the
    content lives unlabeled in the logging rules and observability sink
    table)
  - document audit, suppression, and incident review behavior for edited
    document recipients
- `docs/decisions-reference.md`
  - document the `window.sendDocument` override options (disable/tune)

## 11. Test Plan

### Schema Forge / App Shell

Update or add tests near:

- `tools/app-shell/src/components/contract-ui/__tests__/SendDocumentModal.vitest.jsx`
- `tools/app-shell/src/components/contract-ui/__tests__/SendDocumentModal.test.js`
- `tools/app-shell/src/components/contract-ui/__tests__/documentEmailSend.vitest.js`
- `tools/app-shell/src/components/contract-ui/__tests__/documentEmailSend.test.js`
  (node:test source-shape assertions — the builder signature changes)
- `tools/app-shell/src/windows/custom/shared/__tests__/InvoicePreviewModal.vitest.jsx`
- `artifacts/sales-invoice/custom/__tests__/InvoiceTopbarExtra.test.js`
- `tools/app-shell/src/lib/__tests__/mockFetch.test.js`
- `e2e/tests/flows/i18n-etp4003.mocked.spec.js` (plus a dedicated mocked e2e
  flow for the chip editor, following `row-quick-actions.mocked.spec.js`)

Required assertions:

1. The send modal proposes the contact email as an editable `To` chip **by
   default** (sales invoice fixture; at least one non-invoice flow asserted
   too).
2. User can remove the proposed email.
3. User can add a syntactically valid email to To and CC.
4. Invalid email (either channel) disables Send and shows a validation
   message.
5. Empty final `To` list disables Send (even with CC entries).
6. Total recipients over the effective max disables Send with a message.
7. The command includes `recipientEdits` only when the user actually edited
   recipients, and omits the client `idempotencyKey` in that case.
8. The command never includes provider fields: `to`, `template`, `data`,
   `subject`, `body`, sender, reply-to, or provider metadata.
9. A send with **no user edits** emits a command byte-identical to today's,
   for every flow (regression across order, quotation, shipment, receipt,
   and the `ListView` fallback).
10. A `sendPolicy` override with `editableRecipients: false` restores the
    read-only input.
11. New i18n keys exist in both `en_US.json` and `es_ES.json`.

### Etendo Go Backend

Reuse the existing JUnit4 + Mockito pattern (`InMemoryEmailSafetyStore`,
`FakeProviderAdapter`, `InitialEmailContractsTest`). Cover:

1. command without `recipientEdits` behaves exactly as before for every
   document contract (pin with the existing contract tests);
2. authorization before recipient resolution;
3. added recipients per channel; removed base recipients;
4. cross-channel dedup precedence `to > cc`;
5. final empty `to` list → `NO_RECIPIENT` (new status);
6. invalid email syntax per channel;
7. suppression by recipient and domain, both channels;
8. final-recipient-set idempotency (server-derived; client key ignored);
9. throttle by user, record, recipient, and domain across both channels;
10. `recipientEdits` accepted by default across the document-send family;
    rejected by non-document contracts and by a contract with editing
    disabled via the hook;
11. provider adapter without multi-recipient/CC capability →
    `VALIDATION_FAILED`;
12. provider failure after audit creation;
13. multi-recipient audit hash lists persisted, no raw addresses;
14. no acceptance of template, subject, body, sender, reply-to, provider URL,
    or provider metadata from the browser.

## 12. Rollout

Follow the PR slicing of section 5.2, in order — each step is inert until
PR 4, which activates the default everywhere at once:

1. Backend framework primitives (multi-channel model, suppression list,
   audit, `NO_RECIPIENT`, server-derived idempotency support).
2. Backend `recipientEdits` default acceptance in
   `DefaultDocumentSendEmailContract` (with disable/tune hook).
3. Generator support for the `window.sendDocument` override in
   `decisions.json` (no window uses it at launch).
4. App-shell chip editor enabled by default + command builder support —
   the activation switch for all document flows.
5. Window guides + e2e in the same PR set as 4 (Documentation Freshness).
6. Monitor audit events for invalid recipient edits, suppression, throttling,
   duplicate sends, and provider failures across all document contracts.
7. If a specific window needs to restrict editing later, it opts out via its
   own `decisions.json` override — no shared-code changes.

## 13. Resolved Decisions

All previously open questions were resolved by the stakeholder (2026-06-11):

1. **Additional recipients: any syntactically valid email.** Additions are
   not restricted to business partner/contact records. Guardrails:
   validation, suppression list, count limit, throttling, hashed audit
   (section 4).
2. **Single `maxRecipients` limit for all roles.** No higher limit for
   support/admin users.
3. **No reason capture for removed base recipients.** The framework rule 6
   amendment explicitly waives reason capture for document-send recipient
   edits; the send action plus hashed audit evidence is sufficient.
4. **BCC dropped from scope.** Editable channels are `to` and `cc` only.
   BCC can be added later as a new `recipientEdits` channel (section 7.3).
5. **Editable recipients are the DEFAULT for all document sends.** Sales
   invoice was the motivating example, not the scope. Per-window
   `decisions.json` config is an opt-out/override, not an opt-in.

Resolved in earlier revisions:

- *Recipient fingerprint / preview endpoint* — no frontend fingerprint is
  trusted; the send endpoint derives everything server-side (section 3).
- *New contract version* — not now; the document-send contracts evolve in
  place with an optional field, and version-coexistence infrastructure is
  deferred until an external client exists (recorded as a versioning-rule
  waiver in section 10).

## 14. Recommendation

Approve the in-place document-send extension with the section 5 architecture.

It satisfies the user requirement (editable To plus CC as the default for
every document send) while preserving the email-framework boundary: the
browser edits recipients only through a named, allowlisted, contract-family
field, and the backend owns authorization, recipient resolution, validation,
throttling, idempotency, suppression, audit, template selection, variables,
and provider execution. The default lives in shared code (one switch, PR 4);
per-window deviations are declarative `decisions.json` overrides that survive
pipeline re-runs; untouched sends remain byte-identical to today's commands.

Be aware when scheduling: the backend is the critical path. The multi-channel
recipient model through resolution, provider request, adapter, and audit —
plus the suppression list and `NO_RECIPIENT` — are new framework primitives,
not extensions of existing hooks. The blast radius of PR 4 is also wider than
in earlier revisions (every send flow activates at once), so the no-edit
regression suite of section 11 is the gate for merging it.
