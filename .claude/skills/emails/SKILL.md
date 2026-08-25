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
  in either repo. Decide whether to wire it or drop it before treating it as live.

### The six document emails
- One implementation, `DefaultDocumentSendEmailContract`, parameterised six times. Contract name is
  always `` `${windowName}-send` ``.
- An operator who edits subject or message switches that send to the content template.
- **Known debt:** the default subject is computed twice — `SendDocumentModal.jsx:406` in JS and
  `buildSubject` in Java — and already diverges under `en_US`. F3 of ETP-5003 makes the backend the
  single source.

## Body copy is markup

`AccountEmailContent` emits the body through `paragraphHtml`, so copy can emphasise a name. That
makes **escaping the caller's job**: any value interpolated into a body must go through
`EmailEscape.escapeHtml` first. `login-alert` does this for the IP and date it takes from the
request. Forget it and you have HTML injection in an email, not just a broken word.

## Language

The language is the **recipient's**, passed explicitly in the command. Never read it from
`OBContext`: the email is built while the *sender's* session is active.

- Missing or unsupported language falls back to **Spanish**, the product's default.
- `EmailMessages` deliberately refuses the JVM's default locale as a fallback — `getBundle` consults
  it before giving up, so a server running under `en_US` would answer a `pt_BR` request in English.
- A frontend that triggers an email must post the operator's locale. `InviteUserDialog` did not, and
  every invitation went out in English until ETP-5003.

## Why an email did not arrive

Work down this list before suspecting the provider:

1. **A pending record blocks it** — invitations only.
2. **Throttled.** Each contract declares limits per tenant, user, record, recipient, domain and
   globally. `company-invitation` allows 3 per recipient per 15 minutes. Deleting the record does
   not reset the counter, which lives in the safety store.
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
