# Document Email Contract Implementation Tutorial

Use this tutorial when an agent or developer needs to add, change, or review a document-send email flow exposed from a Schema Forge window.

Schema Forge owns the contract methodology, generated UI integration points, app-shell behavior, and window documentation. Etendo Go owns runtime execution, provider configuration, persistence, authorization, recipient resolution, document-link generation, and operational enforcement.

Read this document as a step-by-step implementation guide. Use [transactional-email-framework.md](transactional-email-framework.md) for the security model and [email-contracts.md](email-contracts.md) as the contract reference.

## Mental Model

A document email is not a browser-composed email. It is a backend-governed business action.

```text
User clicks Send
  -> app-shell sends a minimal contract command
  -> Etendo Go validates the user, tenant, role, organization, record, and document state
  -> the document contract resolves recipient, variables, and download link server-side
  -> safety controls run: idempotency, throttle, suppression, kill switches, audit
  -> provider adapter sends the approved template
```

The browser must never send provider payload fields such as `to`, `template`, `data`, `subject`, `body`, sender, Reply-To, provider URL, provider credentials, or a caller-provided download link. The only recipient-related command field the browser may send is the allowlisted `recipientEdits` of the document-send family (see [email-contracts.md](email-contracts.md)); the backend stays authoritative over the final recipient set.

## Ownership Map

| Area | Repository | Owner | What Belongs There |
|------|------------|-------|--------------------|
| Contract rules and methodology | `etendo_schema_forge` | Schema Forge | Documentation, naming, window integration rules, frontend command shape, tests for app-shell behavior |
| App-shell send action | `etendo_schema_forge` | Schema Forge | `SendDocumentModal`, `documentEmailSend.js`, generated/custom window wiring |
| Runtime contract execution | `com.etendoerp.go` | Etendo Go | Contract registry/provider, Java contract descriptors, authorization, recipient and variable resolvers |
| Document file/link backend | `com.etendoerp.go` | Etendo Go | Preview cache bridge, S3-backed document storage, signed download endpoint |
| Provider integration | `com.etendoerp.go` | Etendo Go/Ops | Provider adapter, provider configuration, secrets, metrics, kill switches |

## Before You Start

1. Confirm the working repository and branch.
2. Read [transactional-email-framework.md](transactional-email-framework.md), [email-contracts.md](email-contracts.md), and this tutorial.
3. If the flow belongs to a window, open [generated-custom-windows/INDEX.md](generated-custom-windows/INDEX.md) and then `docs/generated-custom-windows/<window>.md`.
4. Confirm whether the window already has a document preview/PDF flow.
5. Confirm whether the backend contract already exists in `com.etendoerp.go`.
6. Confirm the target provider template variables. The default document payload must remain minimal unless the provider template requires compatibility aliases.

Do not hardcode or guess window, menu, process, or tab identifiers. Use Schema Forge artifacts, NEO configuration, or DB/menu-cache discovery.

## Naming Rule

Document-send contracts use the Schema Forge spec name plus `-send`.

```text
{document-spec-name}-send
```

Examples:

| Window / Spec | Contract Name |
|---------------|---------------|
| `sales-invoice` | `sales-invoice-send` |
| `sales-order` | `sales-order-send` |
| `sales-quotation` | `sales-quotation-send` |

The frontend derives the contract name generically from `windowName`. Do not add document-specific frontend branches such as:

```js
windowName === 'sales-invoice' ? 'sales-invoice-send' : `${windowName}-send`
```

If a document needs different backend behavior, implement that variation in its backend contract provider/resolver, not in the shared frontend resolver.

## Default Document Payload

Document-send contracts should use this minimal payload by default:

| Variable | Source |
|----------|--------|
| `name` | Business partner or contact display name |
| `document_type` | Contract-defined document label |
| `document_number` | Document number from the trusted record |
| `download_link` | Server-generated document URL |

Do not include amounts by default. `amount`, `invoice_number`, or other aliases are compatibility exceptions only when the provider template already requires them. Document the exception in [email-contracts.md](email-contracts.md).

## Step 1: Define The Contract In Documentation

Update [email-contracts.md](email-contracts.md) with the contract descriptor.

Each document-send contract must document:

- `name`
- `version`
- `template`
- `caller`
- `authorization`
- `recipient`
- `variables`
- `replyTo`
- `links`
- `throttle`
- `idempotency`
- `audit`
- `suppression`
- `killSwitch`
- `edgeCases`

Use this minimum descriptor shape:

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
  "recipient": {
    "source": "business-partner-contact",
    "recordId": "request.recordId"
  },
  "variables": {
    "name": { "type": "string", "source": "businessPartner.name", "required": true },
    "document_type": { "type": "string", "source": "contract.documentType", "required": true },
    "document_number": { "type": "string", "source": "document.documentNo", "required": true },
    "download_link": { "type": "url", "source": "documentDownload.url", "required": true }
  },
  "replyTo": { "enabled": false },
  "idempotency": {
    "key": "sales-order-send:{tenantId}:{recordId}:send:v1",
    "windowSeconds": 3600
  }
}
```

Document at least three concrete edge cases. The minimum set is:

1. Caller lacks record access: return `UNAUTHORIZED` and do not reveal record details.
2. Document has no valid recipient email: return `NO_RECIPIENT`.
3. Document state is not allowed for sending: return `VALIDATION_FAILED`.
4. Duplicate command arrives within the idempotency window: return `DUPLICATE` without another provider call.
5. Global, tenant, provider, or contract kill switch is active: return `KILL_SWITCHED`.

## Step 2: Update The Window Documentation

If the email action is visible from a generated/custom window, update `docs/generated-custom-windows/<window>.md`.

Document:

- where the user can trigger the send action;
- which contract name is used;
- whether the preview PDF is cached before send;
- the editable recipient behavior: which contact email is proposed as the To chip, and whether the window keeps the default (editable To/CC) or disables editing via `window.sendDocument.editableRecipients: false`;
- expected user-facing states for success, duplicate, no recipient, validation failure, unauthorized, provider failure;
- tests or smoke checks that cover the flow.

For example:

```md
Email send: the Send Document modal calls the `sales-order-send` contract with
a minimal command. The contact email is proposed as an editable To chip; the
user can remove it, add To recipients, and add CC recipients. The browser sends
recipient changes only through the allowlisted `recipientEdits` field — never
template, subject, body, or provider metadata. The base recipient is resolved
server-side from the trusted business partner/contact record and the backend
re-validates the final set.
```

## Step 3: Wire The Frontend Command

The shared app-shell helper is `tools/app-shell/src/components/contract-ui/documentEmailSend.js`.

The command sent by the browser must stay minimal:

```json
{
  "version": "v1",
  "recordId": "E2F7A13B...",
  "intent": "send-document",
  "idempotencyKey": "sales-order-send:E2F7A13B:send:v1"
}
```

When the user edited the recipient lists, the command adds the allowlisted
`recipientEdits` field and omits the client `idempotencyKey` (the server
derives it from the final recipient set — see
[email-contracts.md](email-contracts.md)):

```json
{
  "version": "v1",
  "recordId": "E2F7A13B...",
  "intent": "send-document",
  "recipientEdits": {
    "to": { "add": ["ap@customer.com"], "remove": ["contact@customer.com"] },
    "cc": { "add": ["pm@customer.com"] }
  }
}
```

Expected request:

```http
POST /sws/neo/email-contracts/{contractName}/send
Authorization: Bearer <jwt>
Content-Type: application/json
```

Frontend rules:

1. Derive contract name generically as `{windowName}-send`.
2. Recipients are **editable by default** for document sends: the contact email is proposed as an editable To chip; the user can remove it, add To recipients, and add CC recipients. Edits travel only through the command-scoped `recipientEdits` field. Render the read-only recipient input only where a window or contract explicitly disables editing (`window.sendDocument.editableRecipients: false` in `decisions.json`, or the contract's `isRecipientEditingEnabled()` hook).
3. Validate recipient syntax client-side as user experience only: disable Send while any entered email is invalid, while the final To list is empty, or while the total across To and CC exceeds the effective max (default 10). The backend re-validates everything.
4. Never include `to`, `template`, `data`, `subject`, `body`, sender, Reply-To, provider URL, provider metadata, or provider credentials in the command. `recipientEdits` is the only recipient-related field, and it is omitted when the user made no edits (untouched sends stay byte-identical to the legacy command).
5. Map executor statuses to user-facing messages without exposing internal exception details.
6. Disable send while a required preview blob is still loading and no cacheable source exists.

`SendDocumentModal` may receive `pdfBlob`, `pdfBlobUrl`, and `cachePreviewBeforeSend` when the current document flow already generated a PDF preview.

## Step 4: Prepare The Download Link

The email template should receive a backend-generated `download_link`.

Current bridge:

```text
app-shell generated PDF blob
  -> POST /sws/neo/preview-file
  -> POST /sws/neo/email-contracts/{contractName}/send
  -> backend contract generates signed /document-download/{token}
```

This preview-cache bridge is temporary. It exists so the backend can generate a signed download link for a PDF that was already rendered in the browser flow.

Target architecture:

```text
document render or accepted PDF
  -> S3-backed storage
  -> backend generates short-lived signed download token
  -> email receives server-generated download_link
```

Rules for signed links:

- The token must bind the contract, spec, record, client/tenant, semantic send key, and expiration.
- The signature must make the payload tamper-evident.
- The browser must not provide arbitrary download URLs to the email contract.
- Expired or invalid signatures must not reveal whether the record exists.

Example decoded link payload:

```json
{
  "v": "v1",
  "contract": "sales-invoice-send",
  "spec": "sales-invoice",
  "record": "020F2261BE24434DB834B55B9E275237",
  "client": "802509E12436405C86BA1FD5B1DF508C",
  "send": "sales-invoice-send:020F2261BE24434DB834B55B9E275237:send:v1",
  "exp": 1781007555
}
```

## Step 5: Implement Runtime In Etendo Go

The Java runtime belongs in `modules/com.etendoerp.go`.

The implementation should follow dependency injection boundaries:

1. Add or extend a server-side `EmailContract` descriptor for the document.
2. Add a document-owned record resolver that loads the trusted document data.
3. Resolve recipient from trusted business partner/contact data.
4. Resolve variables from trusted records.
5. Generate `download_link` server-side.
6. Register the contract through an injected provider/registry extension.
7. Keep the core email framework generic.

Do not put document-specific methods such as `resolveBusinessPartnerEmail` in a general email framework class. That logic belongs in a document record resolver, document recipient resolver, or document contract implementation that is injected into the framework.

Avoid this pattern:

```text
EmailContractResolver
  -> if sales invoice, call invoice method
  -> if sales order, call order method
  -> if quotation, call quotation method
```

Prefer this pattern:

```text
Email framework package
  -> discovers/invokes EmailContractProvider implementations

Document email package
  -> provides SalesInvoiceSendContract
  -> provides SalesOrderSendContract
  -> provides SalesQuotationSendContract
  -> each contract injects its own document resolver
```

The core framework must know about contracts, commands, responses, safety controls, audit, and provider adapters. It must not know the fields or tables of each business document.

### Multi-Channel Recipient Resolution (To/CC)

Point 3 above resolves the trusted **base** recipient — that part is unchanged and stays in the injected per-document resolver. With editable recipients (ETP-4226), `DefaultDocumentSendEmailContract` then applies the generic resolution algorithm on top of that base. Every document-send contract inherits it; do not reimplement it per document.

The order is fixed:

1. **Base To set.** The trusted business partner/contact email lands in the `to` channel. Base recipients never originate in `cc`.
2. **Normalize the edits.** For each list in `recipientEdits` (`to.add`, `to.remove`, `cc.add`): trim whitespace, lower-case the domain, drop empty values, dedup within the channel, and reject syntactically invalid emails (`VALIDATION_FAILED`, provider never called).
3. **Apply `to.remove`** against the base set (case-insensitive comparable key).
4. **Apply `to.add` and `cc.add`.**
5. **Cross-channel dedup** with precedence `to > cc`: an address present in `to` is silently dropped from `cc`.
6. **Enforce final constraints:**
   - at least one `to` recipient — a send with only CC is invalid;
   - maximum recipient count across both channels (default 10, single limit for all roles);
   - no suppressed recipient or domain in either channel (`SUPPRESSED`);
   - no invalid address after normalization.
7. **`NO_RECIPIENT` when the final `to` set is empty** — this covers both "base contact has no email and no valid additions" and "user removed every base recipient without replacement". It replaces the old collapse into `VALIDATION_FAILED` for empty recipients.

A command **without** `recipientEdits` skips steps 2–5 and resolves exactly the single trusted base recipient, as before. A contract can disable editing (`isRecipientEditingEnabled()` returns `false`) or tighten the limit (`maxRecipientsTotal()`); a disabled contract rejects any command carrying `recipientEdits` with `VALIDATION_FAILED`.

Idempotency and throttle then run over the **final** set: the key is server-derived as `{contractName}:{tenantId}:{recordId}:send:v1:{recipientSetHash}`, and per-recipient/per-domain throttle rules iterate every address in both channels.

## Step 6: Backend Validation Rules

A document-send contract must validate in this order:

1. Command shape and version.
2. Authenticated user, role, client, organization, and warehouse context when relevant.
3. Contract enabled state and kill switches.
4. Record access without leaking record existence.
5. Document type and allowed status.
6. Recipient resolution and validation.
7. Variable resolution and required fields.
8. Download link generation.
9. Idempotency and throttle.
10. Audit entry.
11. Provider call.

If validation fails before the provider call, return a contract status such as `UNAUTHORIZED`, `NO_RECIPIENT`, `VALIDATION_FAILED`, `THROTTLED`, `SUPPRESSED`, or `KILL_SWITCHED`. Do not call the provider for blocked sends.

## Step 7: Tests Required In Schema Forge

For app-shell changes, add or update tests near:

- `tools/app-shell/src/components/contract-ui/__tests__/SendDocumentModal.test.js`
- `tools/app-shell/src/components/contract-ui/__tests__/SendDocumentModal.vitest.jsx`
- `tools/app-shell/src/components/contract-ui/__tests__/documentEmailSend.test.js`
- `tools/app-shell/src/components/contract-ui/__tests__/documentEmailSend.vitest.js`

Required frontend assertions:

1. The contract name is derived generically from `windowName`.
2. An untouched send contains only `version`, `recordId`, `intent`, and `idempotencyKey` — byte-identical to the legacy command. A send with recipient edits contains `version`, `recordId`, `intent`, and `recipientEdits`, and omits the client `idempotencyKey`.
3. The command does not contain `to`, `template`, `data`, `subject`, `body`, sender, Reply-To, or provider metadata. `recipientEdits` is the only recipient-related field ever sent.
4. The To chip editor is rendered by default; `sendPolicy: { editableRecipients: false }` restores the read-only input; Send is disabled on invalid entries, empty final To, or more than the effective max recipients.
5. Preview cache runs before contract send when `pdfBlob` or `pdfBlobUrl` is available.
6. If preview cache fails, the contract send is not called.
7. Send is disabled while the required preview source is loading and unavailable.
8. User-facing errors do not expose raw internal exception details.

Suggested commands:

```bash
cd tools/app-shell
node --test src/components/contract-ui/__tests__/SendDocumentModal.test.js src/components/contract-ui/__tests__/documentEmailSend.test.js
npm run test:vitest -- src/components/contract-ui/__tests__/SendDocumentModal.vitest.jsx src/components/contract-ui/__tests__/documentEmailSend.vitest.js
```

If the change touches shared app-shell behavior, also run the repository-level test command from the repository root according to the PR scope.

## Step 8: Tests Required In Etendo Go

The Etendo Go PR should include Java tests for:

1. Contract registry/provider lookup.
2. Accepted minimal command.
3. Rejection of forbidden provider payload fields.
4. Authorization failure.
5. Document not found or inaccessible without information leakage.
6. Invalid document status.
7. Recipient missing or invalid.
8. Default payload variables.
9. Compatibility variables, only where explicitly documented.
10. Signed download link generation.
11. Invalid or expired download token.
12. Idempotent duplicate.
13. Throttle.
14. Kill switch.
15. Provider failure after validation and audit.

Run tests from the Etendo root, not from the module directory.

## Step 9: Smoke Validation

Use a local or experimental Etendo server to validate the end-to-end behavior.

Minimum smoke cases:

1. Send an allowed document with a valid recipient: expect `SENT` or accepted provider status.
2. Repeat the same command with the same idempotency key: expect `DUPLICATE` or no second provider call.
3. Send a document with no recipient: expect `NO_RECIPIENT`.
4. Send a draft/invalid-status document when not allowed: expect `VALIDATION_FAILED`.
5. Open the generated `document-download` link before expiration: expect PDF download.
6. Alter one character in the signed token: expect rejection.
7. Use an expired token: expect rejection.

Record the endpoint, contract, record id, expected result, actual result, and evidence in the PR or QA notes. Do not commit bearer tokens, cookies, provider secrets, or signed links that expose real customer data.

## Common Mistakes

| Mistake | Correct Approach |
|---------|------------------|
| Adding `to` or `template` to the browser request | Resolve recipient and template in the backend contract |
| Adding document-specific branches to shared frontend helpers | Derive contract names generically and move differences to backend contracts |
| Putting business-document lookup methods in the core email framework | Inject document-specific contract providers/resolvers |
| Including `amount` in every document payload | Use the minimal default payload; add `amount` only for explicit template compatibility |
| Treating the preview blob URL as the email link | Cache/store the file and let backend generate a signed download link |
| Logging raw provider payloads or secrets | Log request/audit ids, contract, status, and redacted metadata only |
| Updating generated files manually | Update generators/source decisions and regenerate |

## Pull Request Checklist

- Contract entry exists in [email-contracts.md](email-contracts.md).
- Window guide is updated when a window flow changes.
- Frontend sends a contract command, not provider payload; recipient changes travel only through the allowlisted `recipientEdits` field.
- Recipients are editable by default for document sends (To chips + CC); the read-only recipient input appears only where the window/contract explicitly disables editing (`window.sendDocument.editableRecipients: false` or the contract hook).
- Default document payload stays minimal.
- Optional variables are justified by provider-template compatibility.
- Preview cache or storage handoff is documented.
- Backend contract is injected; core framework remains document-agnostic.
- Authorization, recipient resolution, download-link generation, safety controls, audit, and provider behavior are tested.
- Smoke evidence is recorded when the flow is end-to-end testable.
