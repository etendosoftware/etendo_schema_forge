---
name: emails
description: Work on any email Etendo sends — changing its wording, layout, language, recipients, throttling or expiry copy; adding a new email; or diagnosing "the mail arrived in English", "the mail looks unstyled", "the mail never arrived", "the mail says the wrong number of days". Covers both stacks - the Etendo GO transactional email contracts (Etendo Go SaaS, rendered through an external provider) and the classic Core SMTP path (backoffice, portal, fiscal modules). Load this BEFORE editing anything under com.etendoerp.go/src/com/etendoerp/go/schemaforge/email/, any *EmailContract.java, EmailLayout/EmailContent/EmailMessages, the emails_*.properties catalogs, or SendDocumentModal/documentEmailSend.js. Triggers on - "mail", "correo", "email", "plantilla del mail", "email template", "el mail llega en inglés", "cambiar el texto del correo", "invitación", "reset password email", "no me llegó el mail", "already pending", "email contract", "custom template", "reenviar invitación".
---

# Etendo Emails

Etendo sends **23 distinct emails** from **two independent stacks**. Full inventory with per-email
file references: `docs/email-inventory.md`. Design decisions and rollout plan:
`docs/plans/2026-08-25-etp-5003-unified-email-template.md` (ETP-5003).

## The one rule

**Only `EmailLayout` emits markup.** A contract composes `EmailContent` blocks; it never writes a
tag, never concatenates HTML, never hardcodes a sentence. If you find yourself typing `"<p>"` inside
a contract, stop — that is how the codebase looked before ETP-5003 and how every email ended up
different from every other.

## Stack A — Etendo GO email contracts (the modern one)

```
frontend/servlet → POST /sws/neo/email-contracts/{contract}/send
  → TransactionalEmailService  (authorize → recipient → resolve → throttle → send)
    → EmailContract.resolve()  (composes EmailContent, renders through EmailLayout)
      → ApiGatewayEmailProviderAdapter → external provider
```

Everything lives in `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/email/`.

**The provider wraps nothing.** Verified 2026-08-25 against the live gateway: its `custom` template
passes our `body` through untouched, which is why `EmailLayout` emits a complete HTML document
(`<!DOCTYPE html>` … `</html>`) rather than a fragment. The provider's template allowlist is
`custom`, `reset-password`, `login-alert`, `invoice`; everything migrated to `custom` because that
is the only one whose design we own.

### Files that matter

| File | Role |
|---|---|
| `render/EmailLayout.java` | The shared document. Tables + inline CSS (Outlook), dark palette as a `prefers-color-scheme` block, logo as image + live text |
| `render/EmailContent.java` | Block vocabulary: `greeting`, `paragraph`, `cta`, `linkFallbackText`, `note`, `signature` |
| `render/AccountEmailContent.java` | Assembles the account emails from a message-key prefix |
| `render/EmailMessages.java` | Per-language copy lookup |
| `render/messages/emails_es_ES.properties` | **The copy.** `es_ES` is the fallback bundle |
| `render/EmailPalette.java` | Colour tokens, light + dark |
| `render/ValidityWindow.java` | Turns an expiry instant into "N days" / "N minutes" |
| `render/EmailEscape.java` | HTML escaping, shared |
| `contracts/*.java` | One per email: authorize, resolve recipient, compose content, delivery policy |

### How to change the wording of an email

Edit `render/messages/emails_es_ES.properties` **and** `emails_en_US.properties`. Nothing else.
A key present in one file and missing from the other is caught by `EmailMessagesTest`.

### How to change the design of every email at once

`render/EmailLayout.java`. Constraints that are not negotiable:
- tables and inline styles only — no flex, grid or absolute positioning (Outlook uses Word's engine)
- the CTA needs its `v:roundrect` VML twin or Outlook drops the button background
- the logo must stay image + text so the brand survives blocked images
- keep the document well under 100KB or Gmail clips it

### How to add a new email

1. Add the copy keys to both properties files, prefixed with the contract name.
2. Write the contract in `contracts/`, composing `EmailContent` (or reuse `AccountEmailContent`
   when it is a greeting + paragraph + optional button).
3. Register it in the matching `EmailContractProvider`.
4. Give it a `deliveryPolicy` — idempotency key plus throttles. Copy the closest sibling.
5. Never accept `to`, `template`, `data`, `from` or `replyTo` from the browser.

### A number in the copy always comes from the record

Any sentence stating a validity window interpolates it — never a literal. This has burned us three
times in one day: the design mockup said 24 hours for a 7-day token, `DAYS.between` truncated 6.999
days to "6 days", and the reset screen said 15 minutes for a 30-minute token. Use
`ValidityWindow.daysUntil` / `minutesUntil` against the expiry the caller passes.

## Stack B — Core SMTP (the classic one)

`EmailManager.sendEmail` → `EmailSenderDispatcher` → an `EmailSender` implementation. Used by
Print & Send, the portal emails (the only real `.ftl` templates in the codebase), `[OB Alert]`
alert rules, TicketBAI, currency sync, SII. **Not migrated to the shared layout** and out of scope
for ETP-5003 except the two portal emails.

`GoProviderEmailSender` bridges the two: with no SMTP configured, a Core-stack email goes out
through the GO provider. It is a fallback, not an override — SMTP wins when present.

## Per-email notes

### company-invitation
- **Creating an invitation twice does not resend it.** With one already pending, the create call
  returns `"An invitation is already pending for this email"` and sends nothing. That is the create
  path's dedup, not a dead end: resending is the separate admin endpoint
  `CompanyInvitationService.resendInvitation` / `SFResendInvitation` (ETP-4830), behind the
  frontend's Resend button, which re-issues the invitation and invalidates the previous token.
- The resend goes through the same contract, so it inherits the shared layout with no extra work.
- To retest the create path locally, delete the row:
  `DELETE FROM etgo_invitation WHERE email = '...';`
- Validity is 7 days (`CompanyInvitationService.INVITATION_TTL_DAYS`).
- The greeting is omitted when the invited email has no Etendo user behind it yet.

### reset-password
- The token lives **30 minutes** (`EtendoGoJwtServlet.PASSWORD_RESET_TTL_SECONDS`). The servlet
  passes `expiresAt` in the command and the copy interpolates the remaining minutes.
- **Known debt:** the reset screen states the duration from a locale literal
  (`onboardingResetLinkDuration`), not from the server. It said 15 minutes for a 30-minute token
  until ETP-5003 corrected it. The screen lives in `@etendosoftware/etendo-go-core`, so making it
  read the real TTL needs an API change and a PR in that repo. **If you change
  `PASSWORD_RESET_TTL_SECONDS`, update that locale key too** — in `es_ES`, `es_AR` and `en_US`.

### password-changed
- Sent from **both** password-change paths: `handleChangePassword` (in-app, asks for the current
  password) and `handlePasswordResetConfirm` (the emailed recovery link). It used to fire only from
  the first, which was backwards — the recovery path is the one an attacker with a stolen link would
  take, so it is where the notice matters most (fixed in ETP-5003).
- The copy points at self-service recovery *before* support, naming the screen's own label,
  "¿Olvidaste tu contraseña?" / "Forgot password?". Keep it matching the real label: someone reading
  this email is looking for that exact button, usually in a hurry.
- Its command carries a per-send `recordId` (account id + UUID), so two changes in a row are not
  collapsed into one by the duplicate check. Do not "clean that up" into a plain account id.

### verify-email and the two welcomes
- The epic added email verification: `verify-email` plus a verification link on the admin's
  `new-account`, and `handleOnboarding` answers `403 EMAIL_NOT_VERIFIED` until the address is
  confirmed. Both state a real 24-hour window read from the stored expiry.
- **An invited operator is exempt by design.** The invitation is itself proof that somebody meant to
  reach the address, and an operator never runs onboarding — the only flow the gate protects. Their
  welcome is a separate contract, `new-account-invitee`, whose button goes to the dashboard.
- So there are two welcomes on purpose. Do not "simplify" them back into one: they ask the reader
  for different things.

### organization-joined
- Sent when an invitation is accepted, naming the organization. Keyed on the invitation record, so a
  retried accept does not send twice.
- Its sibling: accepting an invitation *also* sends `new-account` when the account is created right
  there. That welcome uses `sendNewAccountForInvitee`, whose button points at the dashboard — an
  operator never runs onboarding, so the standard welcome link would strand them.

### login-alert
- Registered, migrated, reachable over the endpoint — and **nobody calls it**. There is no producer
  in either repo.
- **This is deliberate, as of 2026-08-26: we are not sending it yet.** The contract and its catalog
  entries stay in place so the work is not lost, but no sign-in path should be wired to it until
  that decision is revisited. Do not "fix" the missing producer.
- Because it never leaves the system, it cannot be verified in an inbox — treat it as dormant, not
  as working.

### The gateway Lambda is a third repo, and it can silently drop fields
Document emails send a `Reply-To` carrying the operator's own address, so the customer can answer a
real person instead of `noreply@`. It reached the gateway and went nowhere: the Lambda read `to`,
`template` and `data` and **ignored everything else in the payload** — both `replyTo` and the `cc`
an operator adds in the send modal.

That Lambda is not in either of the two repos. It lives in
**`etendosoftware/etendo-go-infraestructure`**, at `lambda/ses-email-sender/index.py`, in **Python**,
and its workflow publishes to AWS account `278186107973` (`eu-west-3`) on merge to `main`. Both
mappings were added, merged and verified in a real inbox on 2026-08-26 — so there are now **three**
repos in the path of a document email, not two.

**The lesson is the diagnosis, not the fix:** a field can leave Etendo correctly and still never
reach the inbox. Before changing Java, POST straight to the gateway with no Java in the path — that
is what proved it in one request. `EmailSenderIdentity` logs a WARN when it resolves no address, so
"we never sent one" and "the provider dropped it" are distinguishable from the logs alone.

Adding a new field to `EmailProviderRequest.toProviderPayload()` means adding it to that Lambda too,
or it is dead weight. Full history: `docs/plans/2026-08-26-reply-to-email-gateway-lambda.md`.

### Known issue: the document download link (not fixed)
The link in a document email answers **500 for any document in a real organization**; it only works
for documents in organization `*`, which is why test datasets and demo instances look healthy.

`AttachImplementationManager.download` checks readable access on the referenced document, and this
route is deliberately unauthenticated (`NeoServlet` handles it before authentication, since the
signed token is the authorization), so the context can only read organization `0`. Admin mode does
not lift that check — it reads `getReadableOrganizations()` directly. Behind it sits a second
filter: `CoreAttachImplementation.downloadFile` re-resolves the folder through a criteria that
filters on readable *clients*, finds nothing, and silently falls back to the legacy
`<tableId>-<recordId>` layout — harmless only where files were stored that way.

A working fix exists and was verified against two clients in real organizations, then reverted by
decision. The patch is kept at `docs/plans/drafts/backup-download-fix/` (gitignored); reapply with
`git am` from the `com.etendoerp.go` repo. Do not re-diagnose this from scratch.

### Emphasis is `**markers**` in the copy, not `<strong>` in Java

Bold is written in the copy itself — `document.body = Le enviamos su {0} **{1}**.` — and turned into
`<strong>` by `EmailEscape.applyBold`. Both paths use it: the module's own composition and the
operator's edited message.

It replaced a `emphasised()` helper that wrapped an interpolated value in `<strong>` before it
reached the sentence. That only worked for copy the module composed itself: **the moment an operator
edited the message, every bold run disappeared and there was no way to put one back**. Expressing it
in the copy means the operator reads exactly the markers that will render, and one catalog string
works on both sides.

**`applyBold` must run after `escapeHtml`, never before.** Asterisks survive escaping untouched, so
escaping first gives you emphasis *and* an inert `<script>`. Reversed, you are emitting
caller-controlled markup. `EmailEscapeTest` pins that ordering.

Deliberately bold only. An unclosed `**` is left alone and a run never spans a line break. If a
second marker is ever wanted (italics, lists, links), reach for a markdown library — do not add a
second regex. `OrganizationJoinedEmailContract` and `CompanyInvitationEmailContract` still carry
their own local `emphasised()`; they were left alone and are the remaining callers to migrate.

### ⚠ The document email default copy lives in TWO places
The send modal composes the default subject and message itself, and the module composes the same two
sentences for a send that carries no edits. Both must say the same thing:

| Side | Where |
|---|---|
| Modal | `SendDocumentModal.jsx` (`defaultSubject`, `defaultMessage`) + `sendModalDefaultMessage` in `tools/app-shell/src/locales/*.json` |
| Module | `document.subject.withRecipient` and `document.body` in `emails_*.properties` |

The greeting is part of the modal's **message** box, not something the module adds afterwards — the
operator has to be able to read and edit how the customer is addressed. So the module skips its own
greeting whenever a message is supplied, and composes one only for a command carrying no message at
all. And since ETP-5003 the modal **always** sends subject and message, edited or not: omitting them
left the module recomposing from its catalog in whatever language the command carried, so a command
with no `language` rebuilt in Spanish what the operator had just read in English.

The duplication is deliberate — it saves a request on every open of the modal — and it is guarded by
`defaultCopyInSync.vitest.js`, which reads the module's catalog and fails when the two drift. It
checks **both** languages and the `**` markers; it compared only `es_ES` until the English pair was
found to disagree outright ("Hi {0}, / attached below" against "Hello {bpName}, / below"). That
guard only runs where the `com.etendoerp.go` checkout exists, which is the machine of anyone editing
either side.

**Editing one side means editing the other.** They diverged once already: the modal derived its
label from the AD menu while the module used its catalog, so an operator read one subject on screen
while the customer received another — and a comment in the Java saying "the two must agree" did not
stop it. If the guard fails, fix the copy; do not relax the test.

### The six document emails
- One implementation, `DefaultDocumentSendEmailContract`, parameterised six times. Contract name is
  always `` `${windowName}-send` ``.
- All six render through `EmailLayout` since F3 (2026-08-26). Editing the subject or message no
  longer changes how the email looks — that used to drop a branded invoice to a bare `<p>` layout.
- The document-type label comes from `{contract}.documentType` in the catalog, read by language,
  falling back to the contract's constructor value so a missing key never puts a raw key in a
  customer's subject line.
- The default copy is duplicated in the frontend on purpose — see the section above.

### The send modal's preview has two modes
`renderPdfPreviewNode` picks: the real PDF when `pdfBlobUrl` is ready, a spinner while
`pdfBlobLoading`, and otherwise a **raw HTML fallback** fetched from
`POST /api/reports/{reportId}/render` with `format: 'html'` and written straight into the iframe.
That fallback is unpaginated and renders at its natural width, so it looks visibly wrong inside the
60% panel — content cut off on the right, no PDF viewer chrome.

A caller that passes `pdfBlobUrl` but forgets `pdfBlobLoading` (it defaults to `false`) skips the
spinner branch entirely and shows that fallback whenever the operator opens the modal before
jsreport has finished — intermittent by nature, and easy to misread as a rendering bug. Fixed on
2026-08-26 in `InvoicePreview`, `OrderPreview`, `QuotationPreview` and `GoodsShipmentPreview`; pass
**both** props when wiring a new one.

## Body copy is markup

`AccountEmailContent` emits the body through `paragraphHtml`, so copy can emphasise a name. That
makes **escaping the caller's job**: any value interpolated into a body must go through
`EmailEscape.escapeHtml` first. `login-alert` does this for the IP and date it takes from the
request. Forget it and you have HTML injection in an email, not just a broken word.

## Language

The language is the **recipient's**, passed explicitly in the command. Never read it from
`OBContext`: the email is built while the *sender's* session is active.

- Missing or unsupported language falls back to **Spanish**, the product's default. Since ETP-5003
  the document contract also **logs a warning** when a command arrives without one: the fallback is
  indistinguishable from a correct Spanish send, so it must not be silent. It stays a fallback
  rather than a rejection — refusing to send an invoice over a missing header field is worse.
- `EmailMessages` deliberately refuses the JVM's default locale as a fallback — `getBundle` consults
  it before giving up, so a server running under `en_US` would answer a `pt_BR` request in English.
- A frontend that triggers an email must post the operator's locale. `InviteUserDialog` did not, and
  every invitation went out in English until ETP-5003.

## What is recorded in the database

`ETGO_Email_Safety`, one row per send attempt with `RECORD_TYPE = 'AUDIT'`, written by
`DalEmailSafetyStore.recordAudit`. It is an anti-abuse ledger, **not** a history anyone can read:

- The recipient is stored as **SHA-256**, only the domain is in clear. You can verify a known
  address, you cannot list who was mailed.
- **No subject, no body, no attachment** is kept.
- `payload.userId` is null in practice; the real sender is in Etendo's own `CREATEDBY` column.
- Rows are written under `AD_CLIENT_ID = '0'`. The tenant is in the `TENANT_ID` column — **filter on
  that**, not on client, or a per-tenant query returns nothing.
- There is no AD window over the table; SQL is the only way in.

Stack B writes nothing here. If someone asks for a per-document "sent history" with recipient and
subject, that is new columns and a privacy decision, not a query.

## Why an email did not arrive

Work down this list before suspecting the provider:

1. **A pending record blocks it** — invitations only.
2. **Throttled.** Each contract declares limits per tenant, user, record, recipient, domain and
   globally. `company-invitation` allows 3 per recipient per 15 minutes. Deleting the record does
   not reset the counter, which lives in the safety store.

   **The document-send family blocks development by default:** `perRecord` is **3 sends of the same
   document per hour**, so the fourth test send of one invoice is refused for the rest of the hour.
   Per recipient it is 20/hour, which testing against your own address also reaches. Since ETP-5003
   each ceiling is configurable — set `etendo.go.email.throttle.maxPerRecord` (and `…maxPerRecipient`,
   `…maxPerUser`, `…maxPerTenant`, `…maxPerDomain`) in the Etendo root `gradle.properties`. Defaults
   are the production values, so configuring nothing changes nothing.

   Raising a ceiling **resets the counter by itself** — `findThrottle()` matches the row on
   `maxAttempts`/`windowSeconds` too, so a new ceiling starts a fresh row at zero. Never clear
   `ETGO_Email_Safety` by hand to unblock someone. A malformed override (`0`, negative, non-numeric)
   is ignored with a warning rather than honoured: `EmailThrottleRule` clamps with `Math.max(1, …)`,
   so a typo would otherwise mean *one* email per hour.
3. **Duplicate.** The idempotency key is server-derived; re-sending the same record to the same
   recipients answers `DUPLICATE`.
4. **Provider disabled or unconfigured** — `etendo.go.email.provider.enabled` / `.baseUrl` /
   `.apiKey`, in `gradle.properties` or `ETGO_EMAIL_PROVIDER_*`.
5. Check the record's status: `SENT` means it left; `DELIVERY_FAILED` means it did not.

Note a local instance usually points at the **production** gateway, so local tests send real email.
Use your own address.

## Testing

The render package depends only on commons-lang3 and log4j, so it compiles and runs standalone —
useful for a fast loop without a full module build:

```bash
J17=~/.sdkman/candidates/java/17.0.15-amzn      # the project is Java 17; a default javac 11 fails
L=WebContent/WEB-INF/lib
CP="$L/commons-lang3-*.jar:$L/log4j-api-*.jar:$L/junit-4.12.jar:$L/hamcrest-all-1.3.jar"
$J17/bin/javac -d /tmp/out -cp "$CP" \
  modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/email/render/*.java \
  modules/com.etendoerp.go/src-test/src/com/etendoerp/go/schemaforge/email/render/*.java
$J17/bin/java -cp "/tmp/out:modules/com.etendoerp.go/src:$CP" \
  org.junit.runner.JUnitCore com.etendoerp.go.schemaforge.email.render.EmailLayoutTest
```

Put the freshly compiled classes **first** in the classpath: `build/classes` holds the previous
build and silently wins otherwise, making passing code look broken.

`InitialEmailContractsTest` covers the contracts end to end and needs Mockito plus the full project
classpath. Rendering a preview to eyeball in a browser beats guessing — build an `EmailContent`,
call `EmailLayout.render`, write it to a file and open it.

Changing a contract's template or default language **will** fail assertions in
`InitialEmailContractsTest`. Update them to pin the new behaviour; do not delete them.
