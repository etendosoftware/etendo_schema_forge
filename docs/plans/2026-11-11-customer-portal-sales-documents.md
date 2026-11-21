# Customer portal: every sales document, one link per send

Status: **approved 2026-11-11 (all decisions below taken as proposed) · Parts A and B implemented
and approved by REVIEW and QA (2026-11-13) · Part C (accept / reject) not built — see
[Still open](#still-open)** · Created 2026-11-11 ·
Jira: **ETP-6209** (extends ETP-5267) · Flag: **`bp-portal-link`** (unchanged gate, now for all sales
document sends) · Branches: `feature/ETP-6209` in `etendo_schema_forge` and `com.etendoerp.go`

Builds on the MVP plan [`2026-09-10-bp-self-service-portal.md`](2026-09-10-bp-self-service-portal.md)
(ETP-5267). That plan stays as the record of the MVP; this one **supersedes** the parts listed in §0.
PO answers to the five open questions (Jira ETP-6209, comment 149209) are folded in and treated as
fixed (§B.0).

**Reading order.** Parts A and B below are the design as approved. Where the shipped code differs,
the two *implementation notes* sections at the end win, and the design text carries a short
"(as built: …)" pointer at each such spot. The runtime reference of the endpoints lives in
`com.etendoerp.go/docs/customer-portal.md`; the email side in
`com.etendoerp.go/docs/transactional-email-contracts.md` → *Customer portal link*.

Paths: `go/` = `modules/com.etendoerp.go/`, `sf/` = `etendo_schema_forge/`. Every `file:line` was read
on the `feature/ETP-6209` worktrees on 2026-11-11.

---

## 0. What this supersedes in the MVP plan

| MVP section | Status | Replaced by |
|---|---|---|
| §1 rows *Link trigger*, *Link lifetime*, *Revocation* | **Superseded** — trigger is now 4 contracts (5 doc types), lifetime is 48 h per send, manual revocation is removed | §A.1, §A.2, §A.6 |
| §2 endpoint list (`/me`, `/invoices`, `/invoices/{id}/pdf`) | **Superseded** — documents of every type, plus renewal | §A.4, §B.3 |
| §2.5 gate | **Kept** (one flag, per sending account). Superseded only where it says the revoke action ships, and *"why revocation is still the fast lever"* | §A.2, §A.6 |
| §3 data model (one stable row per BP, `revoked_at`) | **Superseded entirely** | §A.1 |
| §4 data flow | **Superseded** | §A.2–§A.4 |
| §5 invariants 2, 3, 7 | **Changed** (2 extended with new states, 3 becomes a per-type allow-list, 7 removed) | §A.8 |
| §6, §7 | **Superseded** where they mention revoke / stable link | §A.8, §A.9 |
| §8 out of scope | Quotations, orders, shipments move **in**; payment, editing, permanent credentials stay out | ETP-6209 scope |
| `PortalTokens` HMAC derivation (`go/src/com/etendoerp/go/portal/PortalTokens.java:38-69`) | **Superseded** — it existed only to rebuild the same stable link on every send; a per-send token never needs rebuilding | §A.1 |

---

# Part A — Link and access (ready for DEV)

## A.1 Token model: one link per send

### Decision: new table `ETGO_PORTAL_LINK`, drop `ETGO_PORTAL_ACCESS`

The MVP row means *"this BP holds a portal grant"* (one active row per `(client, bpartner)`,
`PortalAccessDal.java:84-99`). The new row means *"this email carried this link"*. Same columns would
carry a different meaning, and the new required columns (document, recipients, expiry) cannot be
`NOT NULL` on a table that already has MVP rows. There are no production users and MVP tokens need
not survive (decision), so:

- **Create** `ETGO_PORTAL_LINK` (entity `PortalLink`), all business columns `NOT NULL` from day one.
- **Drop** `ETGO_PORTAL_ACCESS` (`go/src-db/database/model/tables/ETGO_PORTAL_ACCESS.xml`, its
  `AD_TABLE` row `ED56022BB69E483CBE96889616AE0F6D` in `AD_TABLE.xml:868-872` and its `AD_COLUMN`s).
  Renaming the entity makes every MVP call site fail to compile, which forces each to be reviewed.
  **Revised (user, 2026-11-13): not dropped in this delivery.** The table shipped to `main` with the
  MVP and nobody has checked whether production holds rows, so its model XML and its `AD_TABLE`,
  `AD_COLUMN` and `AD_ELEMENT` rows are kept byte-identical to `develop` (`update.database` leaves
  table and data untouched). The code stays removed (`PortalAccessService`, `PortalAccessDal`,
  `SFPortalAccess`, the `portalaccess` route): nothing reads or writes it; only the generated DAL
  class remains. Dropped in a follow-up once production is confirmed empty (see *Still open*).
- `REVOKED_AT` (`ETGO_PORTAL_ACCESS.xml:48-51`) disappears with the table; nothing replaces it (§A.6).

New AD ids come from `make uuid`. `update.database`, `export.database` and `generate.entities` are
run by a human; this plan names no ids.

| Column | Type | Null | Meaning |
|---|---|---|---|
| `ETGO_PORTAL_LINK_ID` | VARCHAR(32) | no | PK, minted up front (`SequenceIdData.getUUID()`, as `PortalAccessService.java:181`) |
| `AD_CLIENT_ID`, `AD_ORG_ID`, `ISACTIVE`, `CREATED*`, `UPDATED*` | std | no | `AD_ORG_ID` = the document's org. Access level 3 |
| `C_BPARTNER_ID` | FK `C_BPARTNER` | no | The document's BP. **The portal scope** |
| `TOKEN_HASH` | VARCHAR(200) | no | Base64 SHA-256 of the token, **unique** (same spelling as `PortalTokens.hash`, `PortalTokens.java:135-146`) |
| `AD_TABLE_ID` | FK `AD_TABLE` | no | `C_Order`, `M_InOut` or `C_Invoice` |
| `RECORD_ID` | VARCHAR(32) | no | The document the link opens |
| `DOCUMENT_KIND` | VARCHAR(20) | no | `QUOTATION` / `ORDER` / `SHIPMENT` / `INVOICE` (check constraint). A credit note is `INVOICE`; credit-note-ness is read from `C_DocType` at display time (§B.2) |
| `LINK_ORIGIN` | VARCHAR(10) | no | `SEND` or `RENEWAL` (check constraint) |
| `PARENT_LINK_ID` | VARCHAR(32), no FK | yes | For `RENEWAL`: the expired link that triggered it |
| `ROOT_LINK_ID` | VARCHAR(32), no FK | no | The `SEND` row of the chain (equals own id on a `SEND` row). **The KPI unit "one send"** |
| `CONTRACT_NAME` | VARCHAR(80) | no | e.g. `sales-order-send`, `portal-link-renewal` |
| `ETGO_EMAIL_SEND_LOG_ID` | VARCHAR(32), no FK | yes | Best effort: history writes are swallowed on failure (`TransactionalEmailService.java:555-561`) |
| `RECIPIENTS_TO` | VARCHAR(2000) | no | Every To address, same format/size as `ETGO_EMAIL_SEND_LOG.RECIPIENTS_TO` (`ETGO_EMAIL_SEND_LOG.xml:60`) |
| `RECIPIENTS_CC` | VARCHAR(2000) | yes | Every CC address (`ETGO_EMAIL_SEND_LOG.xml:64`) |
| `EMAIL_LANGUAGE` | VARCHAR(10) | no | The send's language; the renewal email reuses it (`ETGO_EMAIL_SEND_LOG.xml:80` sizing) |
| `SENT_AT` | TIMESTAMP | yes | **NULL = pending: the email never left. A pending link is invalid** |
| `EXPIRES_AT` | TIMESTAMP | yes | Set on confirmation to `SENT_AT + TTL` |
| `FIRST_USED`, `LAST_USED` | TIMESTAMP | yes | First / last successful validation (KPI fallback when usage events are opted out) |

Indexes: unique `TOKEN_HASH`; `(AD_CLIENT_ID, C_BPARTNER_ID)`; `ROOT_LINK_ID`; `PARENT_LINK_ID`.

**The three link columns are loose references, on purpose** (review W5, decided 2026-11-12): the
XML (`ETGO_PORTAL_LINK.xml`) carries no foreign key on them and stays that way. A self-FK would need
an `AD_REF_TABLE` record to be modelled in the AD and buys nothing the code relies on — every chain
read is by id from the row itself. A foreign key to `ETGO_EMAIL_SEND_LOG` would make the future
purge of that table (deferred, `transactional-email-contracts.md` → *Readable send history*) fail on
any send that carried a link, and the column is best effort anyway. Keeping the XML unchanged also
means no new `update.database` for the review round.
Recipients in clear on a client-level table is the same privacy decision already taken for
`ETGO_EMAIL_SEND_LOG` (ETP-5069) — same data, same access level, nothing new exposed.

### Token

256-bit `SecureRandom`, base64url, generated once at mint and written into that email only; only
its hash is stored. `PortalTokens.deriveToken` and the `etendo.go.portal.tokenSecret` property
(`PortalTokens.java:74`) are **removed**: their sole reason (rebuilding a stable link,
`PortalTokens.java:38-47`) is gone, and the "unset secret ⇒ no link" degradation goes with them.

**TTL** = 48 h, constant `PortalLinkService.DEFAULT_TTL`, overridable by
`etendo.go.portal.link.ttlMinutes` / `ETGO_PORTAL_LINK_TTL_MINUTES` (read with
`ConfigPropertyReader`, non-positive or malformed ⇒ default). The override exists so QA can expire a
link in minutes instead of waiting two days.

**A new send never touches older rows** (story 3): minting only inserts. Each link lives until its
own `EXPIRES_AT`.

## A.2 Link injection in the shared document-send path

### Today

Only `SalesInvoiceSendEmailContract` overrides the paragraph hook
(`SalesInvoiceSendEmailContract.java:90-101`); the base calls it inside `resolve()`
(`DefaultDocumentSendEmailContract.java:485-490`) and renders it after the body
(`DefaultDocumentSendEmailContract.java:605`). Minting happens there, i.e. **before** suppression,
kill switch, duplicate and throttle checks (`TransactionalEmailService.java:222` vs `:245-254`,
`:421-456`). The DAL store commits only on `SENT` (`DalEmailSafetyStore.java:234-236`), but nothing
rolls the minted row back on `THROTTLED`/`DUPLICATE`/`PROVIDER_FAILED`, so the MVP can leave a live
token behind an email that never left. The per-send model must not, because "sent with link" is a
KPI denominator.

### Design — structure in the base, identity in each contract

1. **Per-contract declaration (identity lives here).** `DefaultDocumentSendEmailContract` gains
   `protected Optional<PortalDocumentKind> portalDocumentKind()` — **empty by default**. Exactly four
   contracts override it: `SalesQuotationSendEmailContract` → `QUOTATION`,
   `SalesOrderSendEmailContract` → `ORDER`, `GoodsShipmentSendEmailContract` → `SHIPMENT`,
   `SalesInvoiceSendEmailContract` → `INVOICE` (covers credit notes: they are sent from the
   sales-invoice window through `sales-invoice-send`, `sf/docs/generated-custom-windows/sales-invoice.md:58`).
   Purchase/return contracts (`ShipmentDocumentEmailContractProvider.java:39-44`,
   `PurchaseDocumentEmailContractProvider`) inherit empty ⇒ byte-identical email, no row.
2. **The base branches on structure only**: "this contract declared a kind". No spec, table or
   contract-name literal enters `DefaultDocumentSendEmailContract`. `SalesInvoiceSendEmailContract`
   loses its own `resolveAdditionalParagraphHtml` override and `renderPortalParagraph`
   (`:90-125`); the paragraph rendering moves to the base, unchanged in markup.
3. **`PortalDocumentKind`** (enum in `com.etendoerp.go.portal`, the portal's own bounded context — not
   NEO shared code) knows, per kind, the entity class, the `AD_Table` name, how to load the record and
   read `(client, organization, businessPartner)`. That is where `C_Order`/`M_InOut`/`C_Invoice`
   are named, once.
4. **Gate stays where it is**: the mint method evaluates `PortalLinkPolicy.isLinkEnabled()`
   (`PortalLinkPolicy.java:80-83`) **before writing**, exactly as `PortalAccessService.java:72-76`
   does today. Closed gate ⇒ no row, no paragraph, email byte-identical.
5. **Mint pending in `resolve()`**: `PortalLinkService.mintPending(kind, recordId, recipientSet,
   language, contractName)` (as built: `mintForSend`; the renewal uses `mintRenewal`) inserts a row with `SENT_AT = NULL`, returns `(linkId, url)`. The URL goes
   in the paragraph; `linkId` travels as a new generic field
   `EmailProviderRequest.sendCorrelationId` — **never serialized** by `toProviderPayload()` (the
   gateway Lambda drops unknown fields anyway, but an internal id must not leave by design).
   Recipients are the final set (`recipient.getRecipientSet()`, already resolved at
   `DefaultDocumentSendEmailContract.java:475-477`) — To **and** CC.
6. **Confirm on delivery**: new default no-op `EmailContract#onDelivered(EmailSendContext, String
   sendLogId)`. `TransactionalEmailService` calls it in the `STATUS_SENT` branch only
   (`:476-486`), after `recordAudit`; `recordSendHistory` (`:550-562`) and
   `EmailSendLogStore.recordSend` return the new log id (`Optional<String>`) instead of `void`.
   `DefaultDocumentSendEmailContract.onDelivered` → `PortalLinkService.confirm(correlationId,
   sendLogId, now)` (as built: `confirm(linkId, sendLogId, recipientCount)`, clock injected in the
   service) sets `SENT_AT`, `EXPIRES_AT`, `ETGO_EMAIL_SEND_LOG_ID`, then emits
   `portal.link.sent` (§A.7). Never throws into the send: a failed confirm leaves the row pending (the
   customer's link then answers "invalid") and logs ERROR — the email itself was delivered and must be
   reported as such.
   Both new hooks name no entity: they are structural extension points of the email service.
7. **Every other outcome leaves the row pending ⇒ invalid forever.** No cleanup job needed for
   correctness; pending rows older than a day can be purged later (not in scope).

Channels: the SPA send and the MCP `etendo_send_document_email` both go through
`TransactionalEmailService` (`DefaultDocumentSendEmailContract.java:267-269`), so MCP parity is by
construction. The MCP preview uses `sendDefaults` (`McpDocumentEmailTool.java:155`), which mints
nothing; `neo-headless.md:14208` already documents that the preview omits this paragraph.

**Copy**: `document.portal.intro` says *"todas sus facturas y su saldo pendiente"*
(`emails_es_ES.properties:111`, `emails_en_US.properties:98`) — wrong on a quotation. Reword to
documents, both catalogs, e.g. *"Puede consultar este documento y el resto de sus documentos en su
**portal de cliente** (enlace válido {0}):"* with `{0}` from `ValidityWindow` against `EXPIRES_AT`
(skill rule: a number in the copy comes from the record). Final wording is the user's call.
(As built, Part B: with a link the portal is the email's call-to-action button, "Ver documento en
el portal", and the "Descargar documento" button is dropped — see *Part B — implementation notes*.)

## A.3 Recipient and renewal policy (fixed by the PO)

- The token stores every To and CC of the original send (§A.1).
- **Renewal goes to exactly those recipients, To and CC, never to whoever opened the link** (PO 3
  and 4). Consequence worth stating: a leaked link can never be turned into a fresh link for the
  leak holder; at worst it re-mails the original customer.

## A.4 Endpoints and the expired-link flow

All under `/sws/portal/*` (`PortalServlet`, still isolated from NEO, `PortalServlet.java:61-75`).
`GET` stays read-only; renewal is the one write and is a `POST` (`service()` today rejects every
non-GET, `PortalServlet.java:165-169`; it is widened to `POST /renew` only).

| Endpoint | Purpose |
|---|---|
| `GET /me[/{token}]` | Validate; answer state + identity + entry document |
| `POST /renew` | Renew an expired link. Token in a header (as built: `X-Portal-Token`, not `Authorization` — implementation notes) |
| `GET /home`, `GET /documents`, `GET /documents/{kind}/{id}`, `GET /documents/{kind}/{id}/pdf` | Part B (`/home` added in Part B) |
| `GET /logo` | Unchanged (`PortalServlet.java:250-271`), scope from the link |

The MVP `/invoices` routes are removed (no consumers but `PortalPage`).

### `GET /me` states

| State | When | HTTP + body |
|---|---|---|
| **invalid** | unknown hash, pending (`SENT_AT` null), `ISACTIVE='N'`, malformed, absent | **401 `{"error":"This link is no longer valid"}` — byte-identical to today** (`PortalServlet.java:151`, `:497-499`) |
| **valid** | `SENT_AT` set and `now < EXPIRES_AT` | 200 `{state:"valid", businessPartnerName, tenantName, hasLogo, entryDocument:{kind,id}}` |
| **expired** | `SENT_AT` set and `now >= EXPIRES_AT` | 200 `{state:"expired", tenantName, hasLogo}` — no BP name, no document |
| **unavailable** | a still-valid link whose customer is blocked or inactive, or whose company's plan expired (D-1, §A.5) | 200 `{state:"unavailable", tenantName, hasLogo}` — no BP name, no document, reason never disclosed |

As built, a valid answer's `entryDocument` is `null` (plus `entryKind`) when the link's own document
left its scope (§A.8.8).

The SPA, on `expired`, **automatically** calls `POST /renew` (story 4: opening the link triggers it;
no button). `POST /renew` answers:

| Result | Body | Portal message |
|---|---|---|
| **expired-renewed** | `{state:"renewed", renewal:"sent"}` | "This link expired. We have sent a new one to the email it was sent to." |
| expired-renewed (cool-down hit) | `{state:"renewed", renewal:"recentlySent"}` | "This link expired. A new one was already sent recently; check your inbox." No email |
| **expired-blocked** | `{state:"unavailable"}` | "This link expired and a new one cannot be sent. Please contact {tenantName}." |
| invalid | 401 identical to the above | generic invalid page |
| transient | 5xx | existing retry screen (`PortalPage.jsx:305-307`) |

Why `/renew` is a POST and not a side effect of `GET /me`: email clients and link scanners pre-fetch
GETs; a GET that sends email would mail the customer on every scan. A scanner that runs JS can still
trigger it — the cool-down below is the guard.

**Blocked reason is not disclosed.** "Customer blocked", "inactive" and "plan expired" all answer the
same `unavailable`: the tenant's billing state and its internal blocking of the customer are not the
customer's business. The reason goes to the log line and the KPI event `errorCode`.

### Anti-enumeration

- An unknown token answers exactly what it answers today (401, same body), and so do pending and
  deactivated rows. Only a token **that was really emailed** can produce `expired`/`renewed`.
  Distinguishing those adds nothing to an attacker: guessing a 256-bit token is infeasible, and the
  holder of an expired token already received it.
- `POST /renew` with an unknown/pending token answers the same 401.
- `PortalRateLimiter` (30 req/min/IP, `PortalRateLimiter.java:49-53`) covers `GET /me` **and**
  `POST /renew` (own instance each). As built, the data reads (`/home`, `/documents*`) get a third
  instance at 120 req/min; over any ceiling the answer is `429` (Part B notes, N-e).

### Renewal email contract `portal-link-renewal`

New contract in `go/.../email/contracts/PortalLinkRenewalEmailContract.java`, registered in
`CoreEmailContractProvider` beside `DemoTrialNoticeEmailContract` (`:124`). Follows the
system-caller pattern of `DemoTrialNoticeEmailContract` (`:106-108`, `:211-219`):

- **System caller only** (403 otherwise). The portal request has no session; `PortalLinkService`
  invokes `TransactionalEmailService.send("portal-link-renewal", {linkId, language})` inside
  `SystemContext.call` (same helper `EnvironmentAccessGuard.checkAsSystem` uses,
  `EnvironmentAccessGuard.java:209-211`).
- **Command carries only the new pending link id** (`recordId`). Recipients, language, tenant and
  document are re-derived from the row; `allowsCallerProvidedRecipients` = false, no recipient or
  message edits (`EmailContractCommandSupport.rejectMessageEditsIfPresent`, as `:101-105`).
- `language` = row's `EMAIL_LANGUAGE`; never `OBContext` (skill rule).
- Content via `EmailContent` + `EmailLayout` only: greeting-less paragraph naming the tenant and the
  document (type label from the original contract's `{contract}.documentType`), one CTA "Open my
  portal" → new URL, `link.fallback`, validity sentence from `ValidityWindow` against `EXPIRES_AT`,
  `signature` (no Reply-To: there is no operator). Keys prefixed `portal-link-renewal.*` in
  **both** `emails_es_ES.properties` and `emails_en_US.properties` (`EmailMessagesTest` pins parity).
- `logsSendHistory()` = **true** with `getSpecName()` = the document's spec, so the renewal shows in
  the document's Emails card next to the original send (recommendation; one-line change if the user
  prefers it hidden).
- `deliveryPolicy`: idempotency key `portal-link-renewal:{tenant}:{newLinkId}:v1`; throttles
  `perRecipient(20, 3600)`, `perTenant(100, 3600)`, `global(2000, 60)` as backstop — the
  document-email ceilings; 5/h would have been a second product cap the story does not have
  (`EmailThrottleRule.java:52-118`).
- `onDelivered` confirms the renewal row (same §A.2.6 hook), then `portal.link.renewed` is emitted.

### Renewal rate limit — decided by the PO (2026-11-11): 15 min per link, no daily cap

| Property (env) | Default | Meaning |
|---|---|---|
| `etendo.go.portal.renewal.cooldownMinutes` (`ETGO_PORTAL_RENEWAL_COOLDOWN_MINUTES`) | **15** | An expired link renews at most once per cool-down: an active `RENEWAL` row with this `PARENT_LINK_ID` created inside the window — pending ones included, under a `SELECT … FOR UPDATE` on the expired link so it holds across requests and nodes — ⇒ `recentlySent`, no email, and the page still says a new link was sent. After the window, re-opening it sends a new email |
| `etendo.go.portal.renewal.maxPerDay` (`ETGO_PORTAL_RENEWAL_MAX_PER_DAY`) | **0 (no limit)** | Optional operator cap, off by default — the story sets none: active renewals (by creation) per `(AD_CLIENT_ID, C_BPARTNER_ID)` per rolling 24 h; above it ⇒ `recentlySent` |

`0` meaning "no limit" deliberately differs from the email throttle convention (non-positive ⇒
default, `DefaultDocumentSendEmailContract.java:180-193`) because "no limit" is a legitimate PO
answer here. Malformed ⇒ default with a WARN. The renewal contract's own email throttles
(per recipient 20/h, per tenant 100/h, global 2000/min — the document-email ceilings) are the email
system's anti-abuse backstop, not a product cap.

## A.5 Blocking checks before renewal (story 5)

Evaluated by `PortalLinkService.renew` in this order, on the link's BP and tenant; any hit ⇒
`unavailable`, no row, no email:

| Check | Exact source | Read |
|---|---|---|
| Contact blocked as customer | `C_BPartner.CUSTOMER_BLOCKING = 'Y'` (`etendo_core/src-db/database/model/tables/C_BPARTNER.xml:328`; property `customerBlocking`). It is the toggle the Contacts window edits (`sf/tools/app-shell/src/windows/custom/contacts/BillingPreferencesForm.jsx:385-389`) | `businessPartner.isCustomerBlocking()` |
| Contact inactive | `C_BPartner.ISACTIVE = 'N'` (`C_BPARTNER.xml:16`; Contacts `businessPartner.fields.active`, read-only in `sf/artifacts/contacts/decisions.json`) | `businessPartner.isActive()`, loaded with admin mode **and without** the active filter |
| Issuing company's plan expired | `new EnvironmentAccessGuard().checkAsSystem(clientId, "portal") != null` (`EnvironmentAccessGuard.java:152-160`, `:209-211`). Authoritative because it is what every tenant entry point uses and it applies the enforcement kill switch (`:183-194`) over `TenantEnvironmentLifecycleService.evaluateAccess` (`TenantEnvironmentLifecycleService.java:753-776`) and `EnvironmentAccessPolicy.Decision` (`EnvironmentAccessPolicy.java:46-52`) | Any non-null denial (`SUBSCRIPTION_REQUIRED`, `DEMO_TRIAL_EXPIRED`) blocks; a legacy tenant (null decision) is allowed, as on every other surface |

Notes:
- Only the master `CUSTOMER_BLOCKING` flag counts. The per-flow flags (`SO_*_BLOCKING`,
  `C_BPARTNER.xml:336-360`) are not consulted; the check constraint (`:497`) guarantees the master
  implies at least one of them.
- "Contact" = the Business Partner (the Contacts window's header entity is `C_BPartner`). An inactive
  `AD_User` whose email received the link is **not** a block (`SalesDocumentEmailRecipientResolver.java:37-39`
  only picks active users at send time).
- **Not decided by the story, needs the user (D-1):** whether the same three checks should also stop
  a still-valid link (≤ 48 h). Literal story: renewal only. Recommended: also on `GET /me` for valid
  links (cheap, and a blocked customer keeps no access) — answered as `unavailable`.

## A.6 Removing the manual revoke action (story 6)

The action never reached the UI: no SPA consumer of `portalaccess`/`hasActiveLink` exists in
`sf/artifacts` or `sf/tools` (searched 2026-11-11). The `grantPortalAccess` hits in
`sf/artifacts/contacts/*` and `sf/artifacts/user/*` are Classic's unrelated *Grant Portal Access*
process — **do not touch them**.

| Delete / change | Where |
|---|---|
| Webhook class | `go/src/com/etendoerp/go/schemaforge/webhooks/SFPortalAccess.java` (whole file) |
| Pseudo-spec route | `go/src/com/etendoerp/go/schemaforge/NeoPseudoSpecDispatcher.java:32` (import), `:236-241` (`case "portalaccess"`) |
| Service methods | `PortalAccessService.revoke` / `hasActiveAccess` (`PortalAccessService.java:131-171`) — the class itself is replaced by `PortalLinkService` |
| DAL | `PortalAccessDal.revoke` (`PortalAccessDal.java:148-158`); class replaced by `PortalLinkDal` |
| Column | `REVOKED_AT` — gone with the table (§A.1) |
| AD rows | None: no `SMFWHE_DEFINEDWEBHOOK*`, `OBUIAPP_PROCESS` or `AD_PROCESS` row names it (grep of `go/src-db/database/sourcedata`, 2026-11-11). The bridge needs none (`SFPortalAccess.java:42-47`) |
| i18n | None in `sf/tools/app-shell/src/locales` |
| Comments | `PortalLinkPolicy.java:35-38`, `PortalServlet` javadoc invariant 2 (`:82-84`) |
| Docs | `go/docs/feature-flags-and-tenant-upgrade.md:192-201` ("…and the revoke action all ship"); MVP plan pointer (§A.10) |

**Kill switch after removal**: the 48 h TTL bounds every leak; an operator can still disable one link
by SQL (`ISACTIVE='N'` ⇒ invalid). No UI — accepted by story 6.

## A.7 KPI events (story 17)

Four new constants in `UsageEventTypes` (pattern `UsageEventTypes.java:48`), added to `KNOWN`
(`:76-81`) **and** `SERVER_ONLY` (`:89-91`) — a browser must not be able to forge a "sent" or
"opened" fact. Source `backend` (no change to `ETGO_USAGE_EVENT_SOURCE_CHK`, `ETGO_USAGE_EVENT.xml:122`).
Submitted after the business write, per `UsageEventRecorder.java:40-43`.

| Type | Emitted in | `clientId` | `sessionKey` | `target` | `action` / `outcome` / `errorCode` | `properties` |
|---|---|---|---|---|---|---|
| `portal.link.sent` | `PortalLinkService.confirm`, `ORIGIN=SEND` | tenant | `ROOT_LINK_ID` | doc kind | `send` / ok | `linkId, documentTable, documentId, bpartnerId, contractName, sendLogId, recipientCount` ; `userId` = sender |
| `portal.link.opened` | `GET /me` → `valid` (once per page load, not per API call) | tenant | `ROOT_LINK_ID` | doc kind | `open` / ok | `linkId, origin, documentId, bpartnerId, firstUse` |
| `portal.link.renewed` | `POST /renew` | tenant | `ROOT_LINK_ID` | doc kind | `renew` / ok, or error with `BLOCKED_CUSTOMER`, `INACTIVE`, `PLAN_EXPIRED`, `COOLDOWN`, `DAILY_LIMIT`, `SEND_FAILED` (as built, also the email status `DUPLICATE` / `THROTTLED`; the ok event is emitted when the renewal link is confirmed) | `expiredLinkId, newLinkId?, bpartnerId` |
| `portal.document.downloaded` | `GET /documents/{kind}/{id}/pdf` → 200 | tenant | `ROOT_LINK_ID` | doc kind | `download` / ok | `linkId, documentId, isEntryDocument` |

Metrics (one send = one `ROOT_LINK_ID`; renewals inherit the root, so opening a renewed link counts
for the original send):

```sql
-- Open rate: sends whose link (or a renewal of it) was opened at least once / sends with link
SELECT count(DISTINCT o.session_key)::numeric / NULLIF(count(DISTINCT s.session_key), 0)
  FROM etgo_usage_event s
  LEFT JOIN etgo_usage_event o ON o.session_key = s.session_key AND o.event_type = 'portal.link.opened'
 WHERE s.event_type = 'portal.link.sent' AND s.ad_client_id = :tenant AND s.occurred_at >= :from;

-- Recurring access: customers who entered from >= 2 distinct sends
SELECT properties::json->>'bpartnerId' AS bpartner, count(DISTINCT session_key) AS sends_opened
  FROM etgo_usage_event
 WHERE event_type = 'portal.link.opened' AND ad_client_id = :tenant
 GROUP BY 1 HAVING count(DISTINCT session_key) >= 2;
```

The story's "sent **docs** whose link was opened" is the same query with
`DISTINCT properties->>'documentId'` instead of `session_key`; both are kept available, the user picks
the headline. With `usage.events.enabled=false` (`UsageEventRecorder.java:65`) the same numbers come
from `ETGO_PORTAL_LINK` (`SENT_AT`, `FIRST_USED`, `ROOT_LINK_ID`).

Known inflation: corporate link scanners that execute JS count as opens. Not filtered in this
story; noted for the KPI owner.

## A.8 Security invariants (MVP §5, revised)

1. **Scope comes only from the validated row** — unchanged. `PortalSession` (package-private
   constructor, `PortalSession.java:39-46`) gains `linkId`, `rootLinkId`, `entryDocument`; still no
   path from a request parameter to a client or BP id.
2. **Unknown = pending = deactivated = malformed** → identical 401 (extended: `expired` is a new,
   distinguishable state, only for really-sent tokens, §A.4).
3. **Every document read filters tenant + BP + sales side + a per-type docstatus allow-list**
   (§B.1) — replaces the single `docstatus = 'CO'` of `PortalInvoiceQuery.java:44`, `:55-60`.
   Centralised in one `PortalDocumentQuery`; no endpoint composes its own query. An allow-list, not a
   deny-list, so an unknown future status is hidden by default.
4. Token never logged, header after first load (`PortalServlet.java:419-429`) — unchanged; the
   renewal email never contains the expired token.
5. `no-store` on every response (`PortalServlet.java:161-164`) — unchanged, applies to `POST /renew`.
6. Rate limit on `GET /me` and `POST /renew` — extended (as built, also on the data reads: 30 / 30 /
   120 per minute per client IP; see the W6 note for how the client IP is resolved in production).
7. ~~Manual revocation~~ — **removed**; replaced by 48 h TTL + renewal only to original recipients.
8. **New**: out-of-scope or hidden document → 404 never 403 (unchanged rule, MVP §6), now also for a
   valid link whose own entry document became hidden (reactivated to draft): `/me` still answers
   `valid` with `entryDocument: null`; the SPA opens the list with a notice.
9. **New**: the endpoints never read the flag (MVP §7 claim, still asserted).

## A.9 Tests for the testers (behaviours, not code)

**tester-go (JUnit, `go/src-test`)** — note: the MVP `com.etendoerp.go.portal` package has **no
JUnit test today** (no file under `src-test` references `PortalAccessService`, `PortalServlet`,
`PortalTokens`, `PortalRateLimiter`); reuse-first applies to `SalesDocumentEmailContractsTest` and
`InitialEmailContractsTest`.
- Gate closed ⇒ each of the 4 sales contracts sends a byte-identical email **and no `ETGO_PORTAL_LINK`
  row** (row count). Purchase/return contracts never mint, gate open or closed.
- Gate open ⇒ one row per send, To and CC stored, `SENT_AT` null until `onDelivered`.
- `THROTTLED`, `DUPLICATE`, `SUPPRESSED`, `PROVIDER_FAILED` ⇒ row stays pending ⇒ `/me` answers 401.
- Two sends of the same document ⇒ two distinct tokens, both valid; the first is untouched.
- `/me`: valid / expired at `EXPIRES_AT` boundary (injectable clock) / pending / unknown ⇒ unknown,
  pending and deactivated bodies byte-identical to today's 401.
- `/renew`: customer-blocked, inactive BP, plan expired (denial) ⇒ `unavailable`, no row, no email,
  event with the right `errorCode`; legacy tenant (null decision) ⇒ renews; enforcement kill switch
  on ⇒ renews.
- `/renew`: recipients = original To+CC exactly; language = original; opener's identity unused;
  15-minute per-link cool-down (re-open inside it ⇒ `recentlySent`, no email; after it ⇒ new
  email); daily cap off by default, honoured when configured (`0` = unlimited, malformed ⇒
  default); renewal chain keeps
  `ROOT_LINK_ID`.
- `portal-link-renewal` refuses a non-system caller (403) and caller-supplied recipients/edits.
- KPI events emitted once per outcome with the documented fields; `UsageEventTypes` server-only.
- Cross-BP and cross-tenant isolation on every endpoint (the MVP §7 critical test, now with 4 kinds).
- `SFPortalAccess` gone: `GET /sws/neo/portalaccess` answers the dispatcher's unknown-pseudo-spec response.

**tester-functional (Vitest / Playwright mocked, per `docs/e2e-testing-guide.md`)**
- `PortalPage`: valid ⇒ opens entry document detail; expired ⇒ auto `POST /renew` once (not on
  re-render) ⇒ renewed / recentlySent / unavailable messages; invalid ⇒ unchanged generic page.
- Language: default `es_ES` regardless of browser locale; switch to `en_US`; every new key in both
  locales (and `es_AR`, which the MVP keys already ship).
- E2E mocked: link → document → list → filter → other document → PDF; expired link journey.

## A.10 Docs to update in the same change

- `com.etendoerp.go/docs/feature-flags-and-tenant-upgrade.md:177-201` — flag now covers 4 contracts;
  remove revoke; mention renewal is not gated.
- `com.etendoerp.go/docs/neo-headless.md:14208` — "the portal link on sales invoices" → sales documents.
- `com.etendoerp.go/docs/transactional-email-contracts.md` — new contract, new properties
  (`portal.link.ttlMinutes`, `portal.renewal.*`), removed `portal.tokenSecret`, the `onDelivered`
  hook and `sendCorrelationId`.
- `sf/docs/email-inventory.md` (around `:196`) — 4 contracts carry the link; new `portal-link-renewal`.
- `sf/docs/feature-flags.md:230` and `sf/flags-registry.json:396-404` — description/plan link.
- `sf/.claude/skills/emails/SKILL.md` — email count and per-email note for the renewal.
- MVP plan header: one-line pointer "Superseded in part by `2026-11-11-customer-portal-sales-documents.md`".

## A.11 User-visible changes

- Quotation, order, shipment, invoice and credit-note emails carry a portal paragraph (only for
  accounts with `bp-portal-link`), with new wording mentioning documents and validity. Since Part B
  the portal link is the email's button and replaces "Descargar documento".
- Every link expires 48 h after its send; older links keep working until their own expiry.
- Opening an expired link mails a new one to the original To/CC and says so on screen; blocked,
  inactive or expired-plan tenants get a "cannot send, contact {company}" message.
- New email "portal-link-renewal" (ES/EN); it appears in the document's Emails card (D-3 confirmed).
- The backend-only revoke endpoint disappears (no visible UI change).
- MVP stable links stop working (no production users).

---

# Part B — Portal content (fully designed, PO answers applied)

## B.0 PO answers (fixed)

1. Filters: **quick filters only** — document type, status, date range. Advanced filter out.
2. Drafts never shown. Voided/closed shown. Pre-completion states hidden.
3. / 4. Renewal recipients = original To + CC (Part A).
5. Detail = **read-only**: header info, status, payment block (invoices), document links, PDF. No
   form, no lines grid.

## B.1 Visible documents per type (allow-list)

Sales side only (`isSalesTransaction`, as every resolver: `DalOrderEmailDocumentResolver.java:57`,
`DalShipmentEmailDocumentResolver.java:52`, `PortalInvoiceQuery.java:59`), `IsActive='Y'`, tenant + BP
from the link.

| Kind | Table / discriminator | Visible `DocStatus` | Hidden |
|---|---|---|---|
| Quotation | `C_Order`, doc type `SOSubType` in (`OB`,`ON`) (`DalOrderEmailDocumentResolver.java:117-127`) | `UE`, `CO`, `CA`, `ETGO_CI`, `CL`, `CJ`, `VO` | `DR`, `TMP`, `IP`, anything else |
| Order | `C_Order`, `SOSubType` not in (`OB`,`ON`) (`:109-115`) | `CO`, `CL`, `VO` | `DR`, `IP`, `TMP`, … |
| Shipment | `M_InOut`, sales side, not a customer return (`isReturn` false) | `CO`, `CL`, `VO` | `DR`, … |
| Invoice / credit note | `C_Invoice`, sales side | `CO`, `CL`, `VO` | `DR`, … |

Rationale: a quotation is sendable in every status but draft (`SalesQuotationSendEmailContract.java:45-48`),
so `UE` (sent for evaluation) is a status the customer already holds; the other three are sendable
only when completed (`DefaultDocumentSendEmailContract.java:311-313`). Codes come from the status
catalog the app orders by (`sf/tools/app-shell/src/lib/statusBadge.js`, `STATUS_ORDER`).

Credit note discriminator = the app's own subset filter: doc type `etsgIsRectificative = true` OR
`documentCategory` in (`ARC`, `ARI_RM`) (`sf/docs/generated-custom-windows/sales-invoice.md:58`).

## B.2 Status and payment status "exactly as the app"

**Document status label and colour** — the SPA reuses, unchanged:
- `statusLabel(code, dictionary, …)` (`statusBadge.js:192-215`): `AD_Ref_List_Trl` labels from the
  locale `statuses` block (`locales/es_ES.json:27940`), falling back to the `status*` keys.
- `getStatusBadgeProps` for the badge, as the lists do. Quotation uses the same keys as
  `QuotationStatusBadge` (`sf/artifacts/sales-quotation/custom/QuotationStatusBadge.jsx:3-12`).
- Backend sends the **code** only; never a label.

**Invoice payment status** — the MVP portal invents its own four states with its own key
(`portalInvoices.js:35-40`, `portalInvoicePartiallyPaid`), and its due date is
`ETGODueDate` (`PortalServlet.java:457`). The app differs on both, so the portal switches to the
app's sources:
- Badge: `resolveInvoicePaymentBadge` (`sf/tools/app-shell/src/windows/custom/shared/invoicePaymentBadge.js:46-100`)
  — `paid` / `partial` / `pending` / `credit-available` / `credit-applied`, sign-of-total rule
  (ETP-4841) included — plus **overdue** decided from installments as the detail topbar does
  (`sf/artifacts/sales-invoice/custom/InvoiceTopbarExtra.jsx:147-181`). Labels `statusPaid`,
  `statusOverdue`, `statusPartial`, `statusPending`, `cpFavorBadge`, `cpCreditFullyApplied`.
- List due-date dot: `getDueDateState` + `getLatestInstallmentDueDate`
  (`sf/tools/app-shell/src/lib/invoiceDueDate.js:3`, `:28`) — due date = latest installment.
- Backend therefore returns per invoice: `grandTotalAmount`, `outstandingAmount`, `documentStatus`,
  and `installments[] {dueDate, amount, paidAmount, outstandingAmount}` from
  `FIN_Payment_Schedule` (detail), plus `latestDueDate` and `anyInstallmentOverdue` (list, computed
  server-side to avoid N+1). `portalInvoices.js` `resolveInvoiceStatus` / `PORTAL_INVOICE_STATUS`
  and the `portalInvoicePartiallyPaid` key are deleted.
- `pisPaymentState` (transfer states) is purchase-only (`invoicePaymentBadge.js:71-73`); never sent.

## B.3 Endpoints

| Endpoint | Returns |
|---|---|
| `GET /home` (added in Part B) | pending-payment balances, one tile per kind with its count and highlight, recent documents — server-side aggregates |
| `GET /documents?type=&status=&dateFrom=&dateTo=&limit=&offset=` | `{documents:[{kind, isCreditNote, id, documentNo, date, currency, grandTotalAmount, documentStatus, …invoice payment fields}], totalCount, offset, limit, balances}` |
| `GET /documents/{kind}/{id}` | header detail + `links[]` + `hasPdf` |
| `GET /documents/{kind}/{id}/pdf` | the PDF stream |

- One `PortalDocumentQuery` (replaces `PortalInvoiceQuery`) — as built it is HQL on the session,
  one kind per list request (the sidebar has one list per kind), not a native `UNION ALL`; the
  rest of this bullet holds. Design text: native SQL `UNION ALL` over the three
  tables, each arm carrying the full scope + allow-list of §B.1, all values bound, `ORDER BY date
  DESC, documentNo DESC` (deterministic paging, as `PortalInvoiceQuery.java:68-71`), `LIMIT/OFFSET`,
  page clamp kept (`PortalServlet.java:121-132`).
- `type` ∈ `quotation|order|shipment|invoice|creditNote`; `status` ⊆ the visible set of the selected
  type(s) (others ignored, never an error); dates `yyyy-MM-dd` calendar days.
- `balances` (outstanding per currency over all visible invoices, not the page) kept from
  `PortalServlet.java:300-336`.
- `{id}` outside scope, wrong kind, or hidden status ⇒ 404.

## B.4 List

> **As built (2026-11-13 design rework):** status *groups* as tabs, "all time" by default, and
> the board's columns — see "Design rework" in the Part B implementation notes, which supersedes
> the design text below.

- Columns: **Type**, **Number**, **Date** (quotation/order `DateOrdered`, shipment `MovementDate`,
  invoice `DateInvoiced`), **Total**, **Status**; invoices additionally **Payment status**, **Due
  date** (dot), **Outstanding**. **Shipments have no total** (`M_InOut` carries no amount) ⇒ "—".
- Quick filters: type (5 values), status (options = visible codes of the chosen type, ordered by
  `compareStatusCodes`), date range. **Default range: the last month** — rolling, today minus one
  month to today. *Interpretation to confirm (D-2)*: "last month" could also mean the previous
  calendar month.
- Amounts via `formatCurrency`; dates via `parseCalendarDate`/`formatCalendarDate` (repo rules).
- Mobile: below `md` (768 px) rows collapse to cards (number, type, date, total, status). The
  same breakpoint swaps the sidebar for the bottom navigation, so list and shell change layout
  together; `sm` (640 px) would leave a 640-767 px band with the bottom bar over a desktop table.
- Empty state per filter; summary card of outstanding balance stays.

## B.5 Document detail (read-only)

> **As built (2026-11-13 design rework):** the left pane is the real printable in the app's PDF
> viewer; see "Design rework" in the Part B implementation notes.

Entry: the link opens the detail of `entryDocument`; "All my documents" goes to the list; links
navigate to other details. State kept in the SPA (`?view=list` / `?doc=<kind>:<id>` on
`/portal/:token`), token stays in the path only (MVP invariant 4).

Blocks:
1. Header: type label, number, date, status badge, issuing company name + logo (story 8, already
   `tenantName` + `/logo`), BP name. Per kind: quotation valid-until; order/quotation total; shipment
   movement date; invoice date, due date, total.
2. **Payment block** (invoices only): badge (§B.2), outstanding, installments (due date, amount,
   status). No pay action (out of scope).
3. **Related documents** (§B.6) as chips with type, number, status.
4. **Printable**: "Download PDF" (and inline preview where the browser supports it).
No lines grid, no form (PO 5).

## B.6 Document links "like the app"

Computed **server-side**, then each candidate is re-checked through `PortalDocumentQuery.findInScope`
(same BP, visible status); anything else is dropped silently — e.g. a rectificativa linked to
another BP's invoice, which Verifactu orgs allow (`RectifiableInvoiceUtils.java:273`).

| From | To | Data link (the one the app uses) |
|---|---|---|
| Quotation | orders, invoices, shipments | `C_Order.Quotation_ID`; invoices from the quotation; `linkedShipments` (`QuotationShipmentLinks.java:45`) — app: `salesRelatedDocs.js:86` |
| Order | quotation, shipments, invoices | `Quotation_ID`; `M_InOut.C_Order_ID`; invoice lines' order lines — app: `salesRelatedDocs.js:102` |
| Shipment | orders, invoices | `linkedOrders` (`GoodsShipmentHeaderHandler.java:98`); `C_InvoiceLine.M_InOutLine_ID` |
| Invoice | orders, shipments, origin invoices, rectifying invoices | `linkedOrders`; `linkedShipments` (`SalesInvoiceHeaderHandler.java:573`); `C_Invoice_Reverse` both ways (`AbstractInvoiceHeaderHandler.java:83`, `:93`) — app: `salesRelatedDocs.js:115` |

The NEO enrichers are not called through NEO (the portal stays isolated, `PortalServlet.java:61-69`);
where they delegate to plain DAL helpers (`InvoiceRectificationLinkSupport`, `QuotationShipmentLinks`)
those helpers are reused directly, otherwise `PortalDocumentLinks` writes its own scoped query.

## B.7 PDF identical to the emailed one

The email's download link serves the record's **main attachment** at download time
(`NeoDocumentDownloadService.java:254-271`); the portal already serves the same thing for invoices
(`PortalServlet.java:374-408`). Generalised: `handleGetMain(kind.tableName, id)` + client check, for
all four kinds. Same file by construction, including after a re-print (both serve the new main).
**As built (QA BUG-1):** `handleGetMain` and `NeoAttachmentsDownloader` resolve through the
session's tenant, which a portal request does not have, so both the lookup and the stream now go
through `AnonymousAttachmentStreamer` — the email download link's session-less path, extracted from
`NeoDocumentDownloadService` and shared by both callers. It bypasses
`AttachImplementationManager.download()` (ETP-5304), which also settles the "risk to verify" below.

Two consequences the user should know:
- **A document never emailed or printed has no main attachment** (the SPA caches it before sending,
  `DefaultDocumentSendEmailContract.java:254-257`) ⇒ `hasPdf:false` and "PDF not available".
  Rendering server-side for those is out of scope here (would be a seventh producer of the printable).
  **Changed by the user (2026-11-13):** the portal now shows and downloads the PDF of such a
  document too, without a seventh producer — it reuses the MCP's server-side render (ETP-6013,
  `NeoPrintableRenderer` on `NeoPrintAfterComplete`'s worker) on the first `/pdf` request and
  stores the result as the main attachment, exactly as that render stores it. The render runs as
  the user who sent the document (the root link's `CREATEDBY`) with their default (else first
  active) role in the link's client, and the document's organization; the worker's D23 write
  check, its in-JVM join and its advisory lock apply. `hasPdf` is true for a stored PDF or a
  renderable kind; a render that cannot happen answers 404 and the page shows the data sheet with
  "PDF no disponible". See go `docs/customer-portal.md` §5.
- **Risk to verify in QA**: the emails skill records that the email download link answers 500 for
  documents in a real organization, because `AttachImplementationManager.download` checks readable
  orgs in a session-less request. The portal streams through the same call
  (`NeoAttachmentsDownloader.java:103`). If the MVP invoice download already works in a real org,
  fine; if not, this story inherits the bug for all five types. *(Superseded: the shared
  `AnonymousAttachmentStreamer` never calls that check; live confirmation on a real organization is
  still listed under [Still open](#still-open).)*

## B.8 Language and branding

- Default `es_ES` whatever the browser says; a visible ES/EN switch (`useLocaleSwitch`,
  `PortalPage.jsx:266`) remembered per viewer in `localStorage` (try/catch). The switch does not
  change the renewal email language (that is the send's).
- Header: tenant logo (`/logo`, `CompanyLogoResolver`) + tenant name, on every view (story 8).

## B.9 Frontend changes (`sf/tools/app-shell/src`)

- `pages/PortalPage.jsx`: state machine `loading → valid(detail|list) | expired → renewing →
  renewed|recentlySent|unavailable | invalid | transientFailure`; auto-renew fired once per token.
- `lib/portal/portalApi.js`: `fetchPortalIdentity` returns `state`; new `renewPortalLink`,
  `fetchPortalDocuments`, `fetchPortalDocument`, `fetchPortalDocumentPdf`; the 401/403/404 collapse
  into `PORTAL_ERROR.invalidLink` stays (`portalApi.js:49`, `:62`, `:65`); `fetchPortalInvoices` /
  `fetchInvoicePdfBlob` removed.
- `lib/portal/portalInvoices.js`: keep `portalPdfFileName` (generalised to any kind); remove the
  private payment-state logic (§B.2).
- New presentational components under `pages/portal/` (list, filters, detail, payment block, links);
  all strings via `useUI()`, keys in `en_US`, `es_ES`, `es_AR`.
- Routes unchanged (`runtime-routes.jsx:97`, `:101`).

Tests for tester-functional (additions to §A.9): list default range and each quick filter; hidden
statuses never requested/shown; payment badge parity with `resolveInvoicePaymentBadge` for credit
and partial cases; shipment total "—"; entry document hidden ⇒ list + notice; mobile card layout;
PDF unavailable state.

---

## Decisions (taken by the user, 2026-11-11)

| Id | Decision | Decided |
|---|---|---|
| D-1 | Apply blocked / inactive / plan-expired to **valid** links too, not only renewal | **Yes**: a still-valid link answers `unavailable` |
| D-2 | "Last month" default range | **Rolling**: today − 1 month … today (the ticket's "el listado por defecto muestra el último mes"). A link that names a status group opens on all time — see Part B notes |
| D-3 | Renewal email visible in the document's Emails card | **Yes** |
| D-4 | Renewal limits | **Decided by the PO (2026-11-11): 15 min per link, no daily cap.** Both remain configurable (`cooldownMinutes`, `maxPerDay`, `0` = unlimited, the default) |
| D-5 | KPI headline unit | **Per send** (`ROOT_LINK_ID`) |
| D-6 | Portal paragraph wording (ES/EN) | **The §A.2 draft**, with the validity stated in hours |

## Part A — implementation notes (2026-11-11)

Where the code differs from the text above, and why:

- **`/invoices` and `/invoices/{id}/pdf` were kept** for the Part A round only (§A.4 said they go).
  They were **removed** in Part B review cycle 1 (see *Part B — implementation notes*).
- **Loose references.** `PARENT_LINK_ID`, `ROOT_LINK_ID` and `ETGO_EMAIL_SEND_LOG_ID` are plain
  `VARCHAR(32)` with no DB foreign key (§A.1 said FK). A self-reference needs an `AD_REF_TABLE`
  record to be modelled in the AD, and the send-log id is best effort anyway. The origin column is
  `LINK_ORIGIN` (not `ORIGIN`).
- **DAL access by entity name.** `PortalLinkDal` addresses `ETGO_Portal_Link` by entity name, so the
  code compiles without `generate.entities`, but **creates rows through the entity's mapping class**
  (`ModelProvider` → `OBProvider`) whenever `generate.entities` has produced one, falling back to a
  `DynamicOBObject` only when the runtime has no mapping class. The first version always used
  `DynamicOBObject`, as `DalEmailSendLogStore` does; with a generated class, re-reading that row in
  the same session failed with `WrongClassException` and aborted the transaction (live test). Property names are
  derived from `AD_Column.Name` (`NamingUtil#getPropertyMappingName`): `bpartner`, `tokenHash`,
  `table`, `record`, `documentKind`, `linkOrigin`, `parentLink`, `rootLink`, `contractName`,
  `emailSendLog`, `recipientsTo`, `recipientsCC`, `emailLanguage`, `sentAt`, `expiresAt`,
  `firstUsed`, `lastUsed`.
- **History of a System-context send.** The renewal runs as System (no portal session).
  `DalEmailSendLogStore` now owns such a row by the command's tenant at organization `*` instead of
  client `0`, so D-3 works. Only System-context sends with a tenant are affected; no existing
  contract that logs history runs as System.
- **`EmailSendLogStore#recordSendReturningId`** is a new default method rather than a changed return
  type, so existing implementations and tests keep compiling.
- **D-1 on the data endpoints.** The data reads (as built after Part B: `/home`, `/documents*`)
  answer the generic 401 for an expired or unavailable link — the page then re-checks `/me` once
  (QA BUG-2); `/logo` answers for any sent link (the expired page shows the company's branding).
- **The portal token travels in `X-Portal-Token`, not `Authorization`** (live-test fix). The
  SPA's request helper decides `Authorization` from the app's session credential scheme; with an
  Etendo GO session in the browser the scheme resolves to `cookie` and an explicit token is dropped,
  so the portal got no token and answered "invalid" to a valid link (incognito worked). With no GO
  session the scheme resolves to `bearer` (`auto` + no CSRF proof), which is why it only failed for
  signed-in browsers — but production is one domain for every tenant, so any customer who also uses
  Etendo GO would have hit it. `PortalServlet#resolveToken` reads `X-Portal-Token` first, then the
  `/me/{token}` path, then `Authorization: Bearer` (legacy), so a GO session's own credential is
  never what opens the portal. This supersedes MVP §5.4's "sent as an `Authorization` header".
- **Client IP behind the load balancer (review W6) — resolved by infra, no code change.**
  `PortalRateLimiter` keys on `HttpServletRequest#getRemoteAddr`. Behind a proxy that would be the
  proxy's address, so every visitor would share one bucket per node. The production path, as
  confirmed by infra (2026-11-13):
  - Traffic goes **browser → CloudFront → ALB → Tomcat**.
  - Infra added **`RemoteIpValve`** to the Tomcat image. From the **next production deploy** on,
    `getRemoteAddr()` returns the real client IP, so every portal rate limit (30/min `/me`, 30/min
    `/renew`, 120/min data reads) is **per client**. Until that deploy, the limits still count per
    proxy address.
  - **One `etendo-core` task** runs (two, briefly, during a deploy). The counters are in memory, so
    they are per task and **reset on every deploy**; with a single task that is the whole fleet.
    If the service is ever scaled out, each task counts on its own, which multiplies the effective
    ceiling by the task count.
  - **`X-Portal-Token` passes through CloudFront and the ALB** untouched; no forwarding rule is
    needed for the portal's own header.

  The code stays as it is; there is no `X-Forwarded-For` parsing in the portal and none must be
  added (the valve is the one trusted place that reads it).
- **Renewal concurrency (review W1).** `PortalLinkService#renew` locks the expired link's row
  (`SELECT … FOR UPDATE`) and counts renewals by creation, pending ones included; a failed attempt
  deactivates its pending row. Chosen over committing before releasing an in-JVM lock because the
  row lock also holds across nodes and needs no extra commit in the send path.
- **Confirmation is committed at once (review W3).** After a successful confirm the service commits,
  so a later failure in the same request cannot invalidate the link the customer already holds.
  Safe because both portal contracts carry an idempotency key: the send's history and audit rows are
  already committed. A failed confirm is rolled back on its own and the session reopened.
- **`POST /renew` extra answers:** `{state:"valid"}` when the link had not expired, `503` when the
  email could not be sent (the page offers a retry).

## Part B — implementation notes (2026-11-12)

**Design.** Built from the PO's six screens (desktop Inicio / Listado / Documento, mobile Inicio /
Listado / Documento). Colours come from the app-shell semantic tokens (`bg-background`, `bg-card`,
`bg-muted`, `border-border`, `text-muted-foreground`, `bg-primary`, the lime
`--accent-highlight`), never from the design's hex values; statuses and payment states use the
app's own helpers (`DocumentStatusPill` / `statusLabel`, `StatusTag` tones,
`resolveInvoicePaymentBadge`, `getDueDateState`). Headings inherit Plus Jakarta Sans from the
app's global `h1–h6` rule.

**Design rework (2026-11-13, user: "hacelo como está en el diseño").** The first build did not
match the six boards; every screen was redone to match them 1:1 in layout, structure, spacing,
components and copy, colours through the app-shell tokens (`--status-*` for every badge, the lime
`--accent-highlight`, `bg-muted`, `bg-card`, `bg-primary`). Each view draws its own desktop and
mobile headers, as the boards do; the shell is only the sidebar and the bottom bar.

- **Inicio (Main / Movil-Inicio).** Header: title and breadcrumb, and the **search across every
  kind** as a centred pill (`GET /sws/portal/search?q=`, newest matches first, 8 at most).
  Greeting "Hola, <cliente>" + "Esto es lo que tienes pendiente con <empresa>", and the period
  button ("Últimos 3 / 6 / 12 meses", default 12), which drives the chart. "Requiere tu atención":
  one tile per kind with the figure it calls out — quotations "Por responder" (the `awaiting`
  group), invoices "Vencidas" (`overdue`), **orders "En curso"** (completed and not yet fully
  delivered or invoiced: a line with `orderedQuantity ≠ deliveredQuantity` or `≠
  invoicedQuantity`), shipments "Este mes" — and a click opens that list on the matching tab. "Tu
  saldo": "Pendiente de pago" (per currency, with its overdue part) and **"Pagado este año"**
  (`Invoice.totalPaid` over the completed and closed invoices issued this calendar year, per
  currency; the chip counts those invoices). "Documentos recientes" ("Ver todos" opens the list of
  the newest document's kind) and **"Facturado por mes"** (grand total of the completed and closed
  invoices per month over the chosen period, in the currency invoiced in most months, empty months
  at 0) with "Al día con X de Y facturas del año" (Y: this year's invoices; X: those with no
  instalment past due and owing). Mobile: brand bar with a search button, the dark "Pendiente de
  pago" card ("Ver facturas pendientes" opens Facturas · Pendientes), the 2×2 tiles and the recent
  documents; no chart and no "Tu saldo" card, as on the board.
- **Listados (Listado / Movil-Listado).** Header: title + count chip + breadcrumb, the search by
  number or reference as the centred pill. Toolbar: the status groups as segmented tabs, the date
  button and refresh. **The date range opens on the rolling last month (D-2)**, already applied in the date button;
  the customer can pick any other range, "all time" included. A list opened from a link that names
  a status group — the home tiles ("Por responder", "Vencidas", "En curso") and "Ver facturas
  pendientes" — opens on all time instead: those links ask for everything in that state, and an
  overdue or unanswered document may be older than a month. "Ver todos", the sidebar and the
  bottom bar open the plain list, so the last month. (A first rework opened every list on "all
  time" after the board's "Cualquier fecha"; reverted, it broke the ticket's acceptance criterion.) Columns as the board — "Fecha de <tipo>", "Nº
  documento", "Referencia", quotations "Válido hasta" with its dot (foreground while it can still be
  answered, destructive once past, plain muted text once answered), "Estado", "Base imponible",
  "Imp. total" — with, for invoices, "Vencimiento" (the app's due-date dot), "Estado de pago" and
  "Pendiente"; a totals row; "Todos los registros cargados" when everything is loaded. Mobile:
  header with title, count, search pill and full-width tabs; one card per document (number, badge,
  reference, date and a second line: quotations "Pedido <nº>" once an order was generated from them
  — the list now returns `orderNo` for quotations — "Caducó el <fecha>" when open and past, or
  "Válido hasta <fecha>"; invoices "Vence el <fecha>" and the outstanding).
- **Status groups (the tabs).** Customer-facing groups, defined once in
  `PortalDocumentQuery.GROUPS` (`?group=`, each a subset of the kind's allow-list plus, where the
  status cannot say it, a condition on the document); badges inside keep the app's own status
  labels:

  | Kind | Tab | Statuses | Extra condition |
  |---|---|---|---|
  | Presupuestos | Por responder | `UE`, `CO` | — (`CO` is completed but not answered: the app's convert / reject actions accept it) |
  | | Aceptados | `CA`, `ETGO_CI` | — |
  | | Rechazados | `CJ` | — |
  | Pedidos | En curso | `CO` | a line not fully delivered or not fully invoiced |
  | | Completados | `CO`, `CL` | `CL`, or no such line |
  | | Anulados | `VO` | — |
  | Albaranes | Entregados | `CO`, `CL` | — |
  | | Anulados | `VO` | — |
  | Facturas | Pendientes | `CO`, `CL` | `outstandingAmount ≠ 0` (overdue included) |
  | | Vencidas | `CO`, `CL` | an instalment past due with money owed |
  | | Pagadas | `CO`, `CL` | `outstandingAmount = 0` |

  "Todos" is every visible status. Quotations `CL` and `VO`, and voided invoices, appear under
  "Todos" only.
- **Documento (Documento / Movil-Documento).** Header: back, "<Tipo> <Nº>", "Mis documentos /
  <Tipo> / <Nº>". Left pane: **the real printable** — the main attachment, the very file the email
  links to (§B.7) — in the app's `PdfViewer` with the board's three controls (zoom in, full screen
  through the app's `FileLightbox`, zoom out) on the page's top-right corner; the blob is still
  rebuilt as `application/pdf` (N-d). The page is a centred white card on a canvas one step darker than
  the app background (`--border-subtle`, as the design's): by default it takes the readable width —
  900 px, or the pane minus its 20 px gutters when narrower — and the rest of the page and the next
  pages scroll under the controls, which stay put. Fit-to-page was tried and dropped: a real A4 page
  fitted to a 960 px tall screen is about 590 px wide and its body text about 7 px (the design's
  page is an HTML mock with no A4 blank space). Zoom scales the default; the size is handed to
  `PdfViewer`, no CSS transform.
  Only when the document has no printable (or it fails to load) does the pane show a sheet drawn
  from the data, under "PDF no disponible". Right pane: title + "Emitido por <organización>",
  "Descargar PDF", the summary card (Total; Fecha, Válido hasta, Estado, Base imponible, Impuestos —
  plus Vencimiento, Estado de pago and Pendiente for invoices, and the instalments when more than
  one) and "Documentos relacionados": this document ("Este"), the real related ones (each opens its
  own preview), then the chain steps that do not exist yet, dashed (quotation → pedido →
  albarán · factura; nothing for a voided, rejected or closed document). Mobile: top bar with back,
  title, "Emitido por" and a download button; the summary card; "Líneas" with "Ver PDF" (full
  screen); the related documents.
- **Sidebar.** Brand, "General · Inicio", "Mis documentos" with the count chips (quotations to
  answer, overdue invoices), and at the bottom the ES/EN switch and "Creado con etendo.ai". Mobile
  bottom bar: Inicio, Presupuestos, Facturas, "Más" (Pedidos, Albaranes).
- **"Válido hasta" shows "—" (investigated).** The backend sends it (`Order.validUntil`,
  `C_Order.ValidUntil`, on every quotation row and detail). The data is empty: on the local
  database all 29 sales quotations have `ValidUntil` null, because the quotation window never fills
  it — its decisions declare a `ValidUntil_Default` rule (order date + 30 days) that the generated
  form does not apply (`docs/generated-custom-windows/sales-quotation.md`). Not a portal bug; the
  default belongs to the sales-quotation window.

- **Detail side panel = the app's own preview cards (user decision, 2026-11-13).** Below the
  panel header ("<Tipo> <Nº>", "Emitido por", "Descargar PDF") the portal renders the shared
  `windows/custom/shared/preview-cards` the app's QuotationPreview / OrderPreview / InvoicePreview
  use: `SummaryCard` with the props each app preview passes for its kind (contact, date, status,
  valid until for quotations, due date for invoices) plus `InfoRow` rows the portal adds (payment
  state, outstanding, payment method, tax base, taxes); shipments use `MovementSummaryCard`, like
  the app's shipment/receipt previews. Related documents use the shared `RelatedDocumentsCard` in
  its new **pre-resolved items mode** (`items` + `onOpen`: same rows, no NEO fetch, no refresh, no
  app navigation; the rows are the app's own, layout included; without `items` the card is
  unchanged for every app caller). The panel is 380 px wide, the app preview panel's width
  (`GenericPreviewModal`), and the rows the portal adds end in a colon like the card's own. This replaces the
  portal's own summary and its "Este" / dashed chain-step rows. `PaymentsCard` is not reused: it
  renders `FIN_Payment` records and opens them in the internal payment windows, while the portal
  has (and shows) the invoice's instalments; exposing payments would need a new read of internal
  financial records. `EmailsCard` and the app's action buttons stay out (internal only).

- **Whole rows open the document.** Every list row (desktop table, mobile cards, recent
  documents, search results, related documents) opens that document's preview anywhere it is
  clicked, as the app's list rows do; the document number keeps its own control. The table rows,
  which are not native controls, also take a link role, a tab stop, Enter / Space and a focus ring
  (`portalRowActivation`); the others are buttons and get the same focus ring.

- **Design pass (2026-11-13, live render vs boards).** Sidebar: the logo sits in a fixed 32×32
  rounded tile (`object-contain` on the card background, initials when there is none); the footer
  is a top rule with the language trigger and "Creado con etendo.ai" with the etendo.ai mark. The
  language works as in the app: the trigger (`Languages` icon, current flag and name) opens the
  app's `DropdownMenu` with the user menu's own "Idioma" section (`LanguageMenuSection`, extracted
  from `UserAvatarButton` with its `APP_LOCALES`: English, Español); on mobile the same trigger
  sits in the top bar. The design's user (the sidebar's user row, the mobile "VG" avatar) shows the
  customer the link belongs to (`/me` `businessPartnerName`): a person icon and the name (ellipsis,
  full name as tooltip) above the language trigger, and an initials avatar on the right of the
  mobile top bars. Informative only — no chevron, no menu, nothing to click; nothing without a name. Home: the uppercase
  section titles are set in Inter like the design's (the global `h1–h6` Plus Jakarta Sans rule ran
  their words together); "Requiere tu atención" and "Tu saldo" hug their content; desktop "Tu
  saldo" is pending + paid pills only (the overdue line is mobile-only); the chart's axis uses the
  dashboard's `niceScale` / `formatDashboardAxisTick` (round ticks); "1 factura" through the app's
  `_one` / `_plural` keys. Invoices: a "Tipo de documento" column between the date and the number,
  as in the app's sales-invoice list, with that list's own badge (`transactionDocument`:
  "Factura" info pill, "Factura rectificativa" primary pill; the portal row's `isCreditNote` is the
  server's answer for the same rule), also on the mobile card; table cells do not wrap, "Referencia"
  takes the leftover width with an ellipsis, and up to 1280 px the invoice list drops "Base
  imponible" (back from 1536 px; it stays in the detail) so "Imp. total" and "Pendiente" fit. Mobile: the status tabs scroll sideways instead of wrapping, and the mobile base text
  is 16 px as on the boards.

- **"Documentos recientes" (home).** Number, status and amount sit in fixed-width cells, as on the
  board, so they line up row to row (amounts right-aligned in a 110 px pill; a long number
  truncates with a tooltip, a long status wraps in its cell); "Ver todos" is an underlined link.
  **Home-only exception to the overdue rule:** a recent invoice shows the app's "Vencida"
  (`statusOverdue`, destructive) from the row's server `overdue` flag (an instalment past due with
  money owed, server day), as the board does, because recent rows carry no instalments. The lists
  keep the app grid's rule (no overdue badge, the due-date dot carries it) and the detail keeps
  deciding it from its instalments.

**Agreed OUT items (the only design elements not built).** The account / user menu (no login);
"Ayuda y soporte"; "Albaranes de devolución" (returns are out of scope); the checkboxes and
"Descargar seleccionados"; the advanced "Filtros"; "Comentarios"; Aceptar / Rechazar and the
quotation's "Al aceptar" hint (Part C).

**Design deviations.** None beyond the agreed OUT items above.

**Backend (`com.etendoerp.go`).** `GET /sws/portal/home?months=`, `GET /sws/portal/search?q=`,
`GET /sws/portal/documents?group=`,
`GET /sws/portal/documents/{kind}/{id}` and `/pdf`, in `PortalDocumentsEndpoint`, all reads through
`PortalDocumentQuery` (scope + per-kind discriminator + status allow-list of §B.1, HQL on the
session) and related documents through `PortalDocumentLinks` (§B.6, each candidate re-scoped). No
N+1: a list page is one query plus one grouped payment-schedule query plus one totals query; the
home is a fixed number of aggregates. The MVP's `/invoices` and `/invoices/{id}/pdf` (and
`PortalInvoiceQuery`, `fetchPortalInvoices`, `fetchInvoicePdfBlob`) were **removed** in review
cycle 1 (W1): they applied a second, narrower scope rule (completed invoices only) and nothing
called them any more.

**Email (user-confirmed with the PO).** With `bp-portal-link` on, the four sales document emails
make the portal link the call-to-action button ("Ver documento en el portal") and drop the
"Descargar documento" button; `document.portal.intro` keeps the validity sentence. With the flag
off, or for purchase and return contracts, the email is byte-identical. The base contract branches
only on whether a link was minted.

**Review fold-ins.** W-b: the renewal row lock is held across the provider call — documented on
`PortalLinkService#renew` rather than a `lock_timeout`, so a waiting open gets the right answer
instead of an error. S1: `validate`, `findSentLink` and `renew` enter admin mode themselves.

**Review cycle 1 fold-ins (Part B).**
- **Returns are out of scope (N-a, PO decision).** The order list excludes the return-material
  orders (`DocSubTypeSO = 'RM'`) besides the quotations (`PortalDocumentQuery.NON_ORDER_SUBTYPES`).
- **Overdue (N-b).** The home's overdue balance and "Vencidas" highlight are server aggregates, so
  they use the server's calendar day. The per-document badge and due-date dot are decided in the
  browser's local day like the app: the badge says "Vencida" only on the detail, from the
  instalments (as the invoice topbar does); lists carry overdue on the due-date dot only (as the
  invoice list grid does). Around midnight the two can differ by one day for a customer in
  another time zone; accepted.
- **Badge mapping (N-c).** No shared payment-kind-to-tag helper exists; `portalPresentation.js`
  points at its source of truth (`invoicePaymentBadge.js` and the invoice topbar labels).
- **"Ver PDF" (N-d).** The blob is rebuilt as `application/pdf` before it gets an object URL, so the
  dialog's iframe can only ever render a PDF whatever type the response declared. No `sandbox`:
  Chromium's built-in PDF viewer refuses to render inside a sandboxed frame.
- **Unknown entry kind.** An entry document whose kind the page does not know opens home instead
  of failing, as an unknown kind in the URL already did.
- **Dead code.** `portalInvoices.js` keeps only `portalPdfFileName`; the MVP's
  `resolveInvoiceStatus` / `PORTAL_INVOICE_STATUS` went with the `/invoices` list.
- **Rate limits (N-e).** Every token-validating endpoint is rate limited per IP, each with its own
  counter: `GET /me` 30/min, `POST /renew` 30/min, and the data reads (`/home`, `/documents*`)
  120/min shared, since paging, filtering and opening documents make several calls a minute.
  Over the ceiling the answer is `429`. All three key on `getRemoteAddr()`, which is the real
  client IP in production once `RemoteIpValve` ships (W6, resolved by infra — see *Part A —
  implementation notes*).

**QA cycle 1 fold-ins (Parts A+B, 2026-11-13).**
- **PDF without a session (BUG-1).** The portal resolved the main attachment through
  `NeoAttachmentsHelper.handleGetMain` and streamed it through `NeoAttachmentsDownloader`, both
  tenant-of-the-session APIs; a portal request has no tenant, so `hasPdf` read false and `/pdf`
  answered 404. Both now use the email download link's session-less path, extracted from
  `NeoDocumentDownloadService` into `AnonymousAttachmentStreamer` (one implementation, two callers):
  native-SQL lookup of the main attachment plus an explicit check that it belongs to the link's
  client, then the handler-level stream. The email link answers exactly as before. To be confirmed
  live on a tenant with a real (non-`*`) organization.
- **Mid-session closure (BUG-2).** A data read answering 401 after `/me` said "valid" re-runs `/me`
  once, so an expired link renews and an unavailable one shows its screen; only a token still
  refused after that re-check ends on the dead-link page. One re-check per navigation, no loop.
- **Issuing company (BUG-4).** The logo resolves from the organization of the document the link was
  sent for (`CompanyLogoResolver` with the link's organization, falling back as it does). **Decision:
  the document scope stays client-wide**: every tenant has a single organization today; if
  multi-organization tenants appear, scoping the lists by organization is a separate change.
- **Download event (BUG-5).** `portal.document.downloaded` is emitted only after the file was
  actually streamed; a failed read emits nothing.
- **Mobile invoice card (BUG-6).** Shows the outstanding amount under the total, and the document
  status next to the payment state when it is not `CO` (closed, voided), as the table does.
- **Hidden entry document (BUG-7, §A.8.8).** `/me` answers `entryDocument: null` when the link's own
  document is no longer in its scope, plus `entryKind`; the page opens that kind's list (home when
  the kind is unknown) with the notice "El documento de este enlace ya no está disponible…".
- **Status filter.** `?status=` values are trimmed one by one; empty values are dropped.
- **Dead MVP copy (BUG-8).** The MVP's invoice-only i18n keys were removed from the three locales.

**Main screen aligned with the designer's spec (2026-11-17, desktop only).** Home and shell only;
the list, detail, decision and confirmation screens keep their current design until their own spec
arrives, so every shared piece takes the new look as an opt-in (`PortalSection variant="dashboard"`,
`PortalSearchPill variant="header"`, `PortalDesktopHeader size="lg"`).
- **Rail.** Expanded (default, 240 px): the etendo.ai mark and name (the link to the product site
  that used to be the footer's "Creado con etendo.ai"), the collapse button, the company (tenant
  logo and name; no chevron — a link belongs to one company), "General · Inicio", "Mis documentos"
  with the kinds in alphabetical order of the viewer's language and their count chips (blue
  quotations to answer, red overdue invoices), the promo card "Lleva tu negocio más lejos" with
  "Empieza gratis", then the customer and the ES/EN switch. Collapsed (56 px): icons only; "Mis
  documentos" shows the total count and expands the rail. The promo card shows only while expanded.
  The choice is remembered per browser (`localStorage`, `etendo.portal.railCollapsed`; the rail
  works without it).
- **Top bar.** "Portal del cliente" (20/32) with the same subtitle, the 392 px white search pill.
- **Branding update (Figma, 2026-11-20; supersedes the etendo.ai mark above).** The rail header
  shows the issuing company instead of the etendo.ai mark: its round 40×40 logo (initials without
  one) and, expanded, its name beside it; the company block that sat below the header is gone, and
  the collapsed rail no longer has an "Empresa" item (toggle, Inicio, Mis documentos). The Etendo
  link moved to the top bar's right column as a dark pill "Creado con Etendo / Conoce más" (from
  `lg` up) and, on the mobile Inicio bar, as the compact lime tile left of the search button. Both
  open `ETENDO_PRICING_URL` (`PortalBits.jsx`; provisional `https://etendo.ai` until marketing
  sends the pricing URL with its UTM).
- **Etendo link on every view (user decision, 2026-11-20; PROVISIONAL until the designer sends the
  mobile design).** Desktop headers (Inicio, the lists, the document detail) carry the exact-Figma
  pill from `lg` up and the compact lime circle between `md` and `lg` (one or the other, never both:
  `PortalCreatedWithHeaderLink`). Below `md` the compact circle sits in each view's mobile top bar,
  left of the other controls: Inicio (search, avatar), lists (avatar), detail (PDF download). The
  detail drawer has no header of its own; the list header behind it carries the link.
- **Body.** Greeting with the smiley tile; tiles 154 px with the icon bubble, the 60 px figure and a
  pill badge (icons: FileText, Receipt, ShoppingCart, Package — the closest Lucide glyphs to the
  design's Phosphor ones); "Tu saldo" now lists "Pagado este año" first, each with a count pill and
  an amount badge; "Documentos recientes" has the round arrow button (desktop) and rows with packed
  pills, no amount pill for a shipment; section headers in Space Mono 12/16 (the font the app
  already loads for `.font-mono`).
- **Chart.** A legend item per series (one today: "Facturado"; built as a series list so a second
  one can join), a vertical / horizontal switch, the success gradient, dotted gridlines at the
  dashboard helpers' round ticks and a dark tooltip with month and amount on hover or focus.
- **Colours.** Badges keep the app's status tokens (statuses must look as in the app), which differ
  slightly from the spec's hex values (e.g. the info blue).
- **Pending with the PO (Jira comment 149666) — answered 2026-11-18, see "PO answers to the
  redesign" below.** Still open: the "Ingresos" / "Gastos" legend is not drawn (the single invoiced
  series keeps its label) and "Ayuda y soporte" stays provisional (pending marketing). Not built
  either: the top-bar buttons the design hides.
- **PO answers to the redesign (2026-11-18).**
  1. "Empieza gratis" opens the app's public sign-up, `https://app.etendo.ai/onboarding`
     (`ETENDO_SIGNUP_URL` in `PortalShell.jsx`; the route is `onboarding` in `runtime-routes.jsx`),
     in a new tab with `rel="noopener noreferrer"`. The etendo.ai brand still opens etendo.ai.
  2. Search (superseded by the PO final answers below: the pill is now shared): the PO asked for
     the app's own search component without the microphone. **Not
     reused:** the app's search is not a component but inline markup inside `TopBar.jsx`, wired to
     the authenticated app context (`useGlobalSearch` / `GlobalSearchProvider`, vector-search
     contracts, the menu); extracting it is a shared-component refactor of its own, and forking it
     was ruled out. The portal keeps its search pill on `searchPortalDocuments`. The app's search
     has no microphone either.
  3. "Albaranes de devolución": not shown anywhere in the portal (no kind, tab or filter; the
     backend lists only `C-` shipments and leaves return-material orders out). Nothing to remove.
  4. "Ingresos" / "Gastos": no answer yet, unchanged.
  5. "Ayuda y soporte": pending marketing, unchanged.
  6. Status names: the list tabs (and the funnel's choices) use the app's status keys
     (`statusUnderEvaluation`, `statusAccepted`, `statusRejected`, `statusInProcess`,
     `statusComplete`, `statusVoid`, `statusPending`, `statusOverdue`, `statusPaid`); the portal
     copies `portalGroup*` were removed from the locales. "Entregados" (`portalGroupDelivered`)
     stays, as the app has no status of that name. The row badges already used the app's
     `statusLabel`. The home's attention tiles ("Por responder", "Vencidas", "En curso", "Este
     mes") are counts, not statuses, and are unchanged.
  7. Language: provisionally as in the app, inside the user menu. The customer (the rail's row,
     expanded or collapsed, and the mobile avatar on Inicio and the lists) opens the app's
     `DropdownMenu` with the app's `LanguageMenuSection`; the standalone language switch is gone.
     The menu holds only the language: the portal has no login, so the app's account entries do
     not apply. With no customer name there is no user, hence no menu.
  8. Comments box: never built in the portal (an agreed OUT item); nothing to remove.
  9. "Descargar seleccionados" and the row checkboxes (select-all included) are removed for now
     (performance); a document still downloads from its detail.
- **PO final answers (2026-11-18, supersede the matching points above).**
  - 2 (search): decided. Only the visual pill was extracted from the app's top bar into the shared,
    presentational `components/layout/SearchBar.jsx` (search icon, optional leading slot, input; no
    microphone, no state); `TopBar.jsx` renders it with the same classes and test ids and keeps
    `useGlobalSearch`, the scopes, the vector search and its popup. The portal's `PortalSearchPill`
    now renders that bar on Inicio and the lists (the old Phosphor/Lucide pill and its `header`
    variant are gone), keeping its own data source (`searchPortalDocuments`, the list's query) and
    its own results panel, so the customer only sees their documents. Visible change in the portal:
    the pill takes the app's look (44px, the app's search background) on desktop and mobile.
  - 4: the chart's legend reads only "Gastos" (en "Expenses", the app's `expenses` key): one series,
    since what the customer was invoiced is their expense. The legend swatch is green to match the
    bars (user decision; the Figma's red "Gastos" swatch was an artefact of the generic chart).
  - 5: "Ayuda y soporte" is removed from the rail (link, help URL constant and icon). The
    `helpAndSupport` key stays: the app's side menu uses it.
  - 7: the user menu has the app's user-popup look: a header with the customer's name and email,
    then the language. `GET /sws/portal/me` now also answers `email` (additive): the first valid To
    of the link's root send, the address the portal already treats as the customer
    (`PortalDecisionService.confirmationRecipient`), `""` when none.
  - A (app, sales quotation: create a reject reason from the editable "Motivo de rechazo"): built
    (user decision). The field offers "+ Crear razón" and opens the reject flow's own
    `CreateRejectReasonModal` (`createRejectReason` action); the created reason is selected in the
    field. The generic `allowCreate` could not do it (it POSTs `{ name }` to a CRUD spec and reject
    reasons have none), so a small backwards-compatible hook was added: `FieldCreateContext`, read by
    `EntityForm`'s searchable selector and provided by the window's custom code
    (`windows/custom/sales-quotation/index.jsx`); no `decisions.json` change
    (`docs/ui-customization.md` §19d).
  - B (internal reasons in the notes): investigated, no change. No path writes the tenant's reason
    into the notes; the only notes write is the portal's own line (`PortalDecisionService.appendNote`).
- **Pixel pass against the Figma (2026-11-17, user: "tal cual el figma").** Compared side by side
  with the reference captures at 1440×703 in both rail states. Icons are the design's Phosphor ones
  (`@phosphor-icons/react`, already a dependency). The rail footer is a rule, then "Ayuda y soporte"
  (https://help.etendo.ai, provisional, new tab) and the customer, each with a chevron; **no
  language switch in the rail** (user decision; superseded 2026-11-18: the language now lives in
  the user menu opened from the customer, see the PO answers above). The company box shows the tenant logo, its name and a decorative chevron.
  Badges on the main screen use the Figma's hex colours (`PortalTag palette="figma"`), not the app
  palette: a quotation awaiting an answer is blue, an invoice to pay yellow. The status **names**
  stay the app's ("Bajo evaluación", "Completado", "Vencidas") until the PO decides (they conflict
  with the "statuses exactly as the app" criterion). Row 1 is 226px tall; at the 1440px design width its four
  tiles are 205px and "Requiere tu atención" hugs them (901px) while "Tu saldo" takes the rest
  (259px rail expanded, 443px collapsed, as the two Figma frames). Other widths keep that rail
  state's 901 : 259 or 901 : 443 proportion ("Tu saldo" never under 258px; the shell exposes the
  rail state as `data-rail` for this);
  row 2 is 320px tall with "Documentos recientes" and the chart at 520 : 840 (documents never under
  440px, so a row stays on one line) and the chart filling its card. Rows never stretch to the
  window — the body scrolls — checked at 1280, 1366, 1440, 1536 and 1920 in both rail states.
  The 226 / 320 px heights are minimums: real content (several currencies, long amounts, many
  recent rows) grows the row and both cards keep the same height; balance badges sit side by side
  and wrap, a recent row wraps rather than clips, a 4–5 digit tile figure steps down in size, and
  the collapsed "Mis documentos" badge reads "99+" past 99; chart
  months are three capitalised letters ("Sep", not "sept"), ticks "1,5K", sparse dotted gridlines.
- **Rail = Figma component "Portal Cliente Navigation Rail" (Expandido / Comprimido).** 62px header,
  224×32 company selector, group headings, 32px items (no kind icons in "Mis documentos"), the
  banner pushed to the bottom of the menu list, footer items with chevrons; collapsed: 36×36 grey
  buttons and the 18px #F3164E count badge. Desktop page background #F3F5F9.
- **Document detail side panel (desktop, Figma 2026-11-17).** 320px panel: title, "Emitido por" and
  a close button (back to the list); one wrapping row of 32px buttons — Aceptar (primary) and
  Rechazar where the quotation can be answered (the decision popups behind them are unchanged), and
  Descargar PDF; the "Detalles" card (total header; date, validity, status, tax base, taxes, plus
  the invoice rows the story requires) and "Documentos relacionados" with a refresh button that
  re-reads the document in place. Not built: "Comentarios" (on hold, no backend) and the greyed
  "Pedido – Pendiente de creación" placeholder (user decision). The mobile detail keeps the app's
  preview cards.
- **"Panel PDC" (desktop detail content, Figma).** The PDF area (#E3E7EC, rounded 12px on the left,
  24px top / 28px side padding, the page filling its width and running into the bottom edge,
  scrolling inside) and the 320px white side panel (rounded 12px on the right; 68px header with
  "Emitido por: …" and a 36×36 close button). Toolbar: the Figma's 4-button group — zoom in, full
  screen (as before), zoom out and a kebab whose only item is "Descargar PDF" (the design gives it
  no behaviour, so it offers nothing the portal did not already do).
- **Desktop list = Figma "PC Presupuestos".** Header: the kind's title (20/32) with the kind's total
  as a badge (the home tile's figure; the current query's when the home is not loaded) and the
  "Mis documentos / <kind>" breadcrumb; the white search pill. Toolbar (padding 8px): the kind's
  status tabs (#F3F5F9, selected white + shadow-sm), the date-range button (the app's picker in the
  Figma's button), a funnel with the same status choices (the portal has no other quick filter),
  and refresh ("Descargar seleccionados" and the checkbox column were removed by the PO answers of
  2026-11-18). Table: the kind's columns at the Figma's widths, 40px
  rows with #E3E7EC rules, "Válido hasta" with a #FFC233 dot while the quotation can be answered
  (red once past), Figma-palette status badges, and one "Total" row per currency of the rows shown.
  Orders, shipments and invoices keep their own tabs and columns (invoices: type, due date,
  payment state, outstanding; shipments: no amounts, no totals). Mobile list unchanged.
- **Desktop detail = drawer over the list (Figma prototype).** A document opens over its kind's list,
  which stays mounted underneath (tab, range and scroll kept): a backdrop dims the whole viewport
  (`--scrim` at 35%), and "Panel PDC" floats 8px from the top, right and bottom, 70% of the
  viewport wide (720–1344px; 1008px at 1440), with no page header. It closes with the panel's X,
  Escape or a click on the backdrop; focus is trapped inside and returns to the opening row; a 200ms
  slide-in respects reduced motion. `?view=doc&kind=&id=` keeps working: a deep link (the email's,
  the home's tiles and recent rows) renders that kind's list behind the drawer, and closing lands on
  it; a document opened from a tab carries `&group=` so closing returns to that tab. "Documentos
  relacionados" lists only the other documents: the open one is left out (user decision,
  2026-11-18; it used to head the list as "Este", key `portalRelatedThis`, now removed), and with
  none the section shows its empty state. Mobile keeps the full-page
  detail (its list stays mounted but hidden).
- **Decision popups and confirmation page (Figma, 2026-11-17).** One 456px modal style (white, r8,
  the "Overlay/Light" shadow, 32px round close, 40px fully rounded buttons). Aceptar → "¿Deseas aceptar
  este presupuesto?" (the recipient's email box) → Continuar sends; Rechazar → the six reasons
  (Figma radios; "Otros" requires "Describe el motivo"; Continuar disabled until valid) → "Confirma
  tu decisión por correo" (Cancelar · Volver · Enviar solicitud) sends; both end on "Revisa tu
  correo electrónico" (Entendido). The recipient is the backend's `decision.email` (first To
  of the original send, shown in full). The email link's landing no longer enters the portal by itself:
  it shows "¡Presupuesto aceptado!" / "¡Presupuesto rechazado!" with the summary (number, issue date
  or reason, total, status — app label, Figma colour) and "La empresa emisora ha sido notificada…",
  and its "Portal de clientes" button enters the portal on the quotation, with no notice (removed
  2026-11-18: the Figma has none; hidden without a portal token). The other landing states keep their logic in the same page.
  Backend fields (additive, `com.etendoerp.go`): `date`, `grandTotal`, `currency`, `documentStatus`
  on the decision view/confirm answers; `decision.email` on a decidable quotation's detail.

---

# Part C — Accept / reject a quotation from the portal (planned and built 2026-11-13; PO answers in C.13)

PO spec: Isa, Jira comment 149221 + the rewritten description. C.0–C.11 are the plan as written
before the PO's answers; what was built is in C.12 and C.13. Evidence paths: `go/` = `com.etendoerp.go`, `sf/` = this repo, `core/` = Etendo core.

## C.0 Scope

In: Aceptar / Rechazar on a quotation that is pending and not expired; a mandatory reason on
reject (fixed list, "Otros" + free text); confirmation by email to the quotation's original To recipient
only (single-use, never-expiring link); on confirmation, re-check and apply (first confirmed
wins); notice email to the user who sent the quotation; KPI hook points.
Out (PO): generating the order, changing a confirmed decision, in-app notification, KPI semantics.

## C.1 How the app accepts and rejects today

| Action | App UI | Backend | Result |
|---|---|---|---|
| Reject | `sf/artifacts/sales-quotation/custom/RejectQuotationModal.jsx:116-136` posts `…/quotation/{id}/action/rejectQuotation` with `{rejectReason: <C_Reject_Reason_ID>}`; reasons come from the tenant's `C_Reject_Reason` selector (`:52`), creatable inline (`CreateRejectReasonModal`) | `go/…/schemaforge/RejectQuotationHandler.java:132-176` (`reject`): requires `UE` (`:74-75`, `:150`), an active reason (`:154-157`); writes `C_Reject_Reason_ID`, `DocStatus = CJ`, `Processed = Y` by DAL (`:159-163`), no `C_Order_Post`. Also reached by `DocAction = RJ` (`SalesQuotationHeaderHandler.java:150`) | `CJ` "Cerrado - Rechazado"; the reason is stored in **`C_Order.C_Reject_Reason_ID`** (a tenant-defined list, not free text) |
| "Accept" | Confirmar (`QuotationTopbarActions.jsx:26`, only for `CO`/`UE`) opens `QuotationConfirmModal`: **Pedido** → `action/Convertquotation` (`QuotationConfirmModal.jsx:138`), **Factura** → `action/createDraftInvoice` (`:191`) | `core/src/org/openbravo/erpCommon/ad_process/ConvertQuotationIntoOrder.java:302` sets the quotation to `CA`; the invoice path marks it `ETGO_CI` (`CreateDraftInvoiceHandler#markQuotationAsInvoiceCreated`) | **The app has no "accepted without an order" state**: accepting *is* converting (`CA` / `ETGO_CI`) |

**Proposal for "accepted, no order": a new status `ETGO_AC` "Aceptado" / "Accepted", added by
com.etendoerp.go to the order status list** (`AD_Reference FF80818130217A350130218D802B0011`). The
core value `AP` "Approved / Aprobado" is in that list but **inactive** (`isactive='N'`, module `0`,
read-only DB check), and Classic rows are never reactivated or edited. The precedent is the
module's own `ETGO_CI` "Closed - Invoice Created" (`go/src-db/database/sourcedata/AD_REF_LIST.xml:267`),
added to the same list for the invoice path. `ETGO_AC` is written the way the app's reject writes
`CJ` (DAL, `Processed = Y`, no `C_Order_Post`), in a new method next to `reject` in the
sales-quotation customization (see C.8).
- **AD:** one `AD_REF_LIST` row (`make uuid`) in the module, plus its translations (es_ES
  "Aceptado", en_US "Accepted"; es_AR as es_ES). Note `ETGO_CI` itself has **no real es_ES
  translation** in the DB (its es_ES name is still "Closed - Invoice Created") — the same gap to avoid
  here, and worth fixing for `ETGO_CI` in the same change if the translation path is the same.
  **Needs `update.database` and `export.database`.**
- **App:** Confirmar (convert to order or invoice) must open for `ETGO_AC` too —
  `QuotationTopbarActions.jsx:26` gates it to `CO`/`UE`; `ConvertQuotationIntoOrder` does not check
  the status (it only writes `CA`, `:302`), but the createDraftInvoice path and the backend/MCP
  advertised actions (`SalesQuotationHeaderHandler.java:144-150`) must accept it as well. The
  status label: `statusLabel` (`sf/tools/app-shell/src/lib/statusBadge.js:207-208`) and the related
  documents' `STATUS_KEYS` map no `ETGO_AC` → add `statusAccepted` (three locales) and its tone
  (`getStatusTone`: success, like `CA`).
- **Portal:** `ETGO_AC` joins the quotation allow-list (`go/…/portal/PortalDocumentQuery.java:62`) and
  the "Aceptados" group (`:90`).

**Reject reason.** The app stores a *reference* to a tenant-defined `C_Reject_Reason`, not text; the
PO asks for a fixed list and for the reason "in the quotation's notes". Proposal: (1) resolve the
fixed reason to the tenant's `C_Reject_Reason` row of that name, creating it on first use with the
same code `CreateRejectReasonHandler` uses (`go/…/CreateRejectReasonHandler.java:40-57`), and call
the app's own `reject` with it — so the app shows the same reason it would have; (2) append the
reason and, for "Otros", the free text to `C_Order.Description`, the window's notes field
(`sf/artifacts/sales-quotation/decisions.json:9`, `notesField: "description"`) as
`Rechazado desde el portal: <reason>[ — <text>]`. → **Q2** (create reasons in the tenant vs. a
pre-seeded list; language of the stored reason name).

## C.2 "Pending" and "expired"

- **Pending = `UE`.** It is the only status the app's reject accepts (`RejectQuotationHandler.java:150`).
  `CO` quotations are offered conversion in the app (`QuotationTopbarActions.jsx:26`) but not reject;
  the portal lists `CO` under "Por responder" (`PortalDocumentQuery.java:89`). → **Q3**: should `CO`
  also get the buttons (the reject path would then need `CO` too)?
- **Expired = `ValidUntil` < today (server calendar day).** **`ValidUntil` null = not expired.** On the
  local DB all 29 sales quotations have it null: the window never fills it (its `ValidUntil_Default`
  rule is declared but not applied, `sf/docs/generated-custom-windows/sales-quotation.md:148`).
  Treating null as expired would hide the buttons everywhere. **Decided (user, 2026-11-13): no
  `ValidUntil` = not expired.**

## C.3 Who confirms — the original To recipient (decided, user 2026-11-13)

The confirmation email goes to **the address the quotation was sent to**: the To recipients stored
on the portal link's **root send**, `ETGO_PORTAL_LINK.RECIPIENTS_TO` of the row named by the session's
`ROOT_LINK_ID` (a renewal copies the original recipients, so the root is the send itself). Never the
CC recipients, and not a separately resolved contact (the quotation's `C_Order.AD_User_ID` is a hidden
field and empty on all 29 local quotations).
- **Several To addresses: the first one.** It is the primary recipient the sender put first in the
  send modal (whose default is the customer's own address, `SalesDocumentEmailRecipientResolver.java:29-43`).
  Mailing all of them would let any of several people confirm for the company and turns the
  first-confirmed-wins rule into a race between them; one confirmer keeps the two-factor meaning of
  the PO's spec. The stored order of `RECIPIENTS_TO` is the send's order.
- **Empty To** (should not happen for a sent link, but the column is a list): the buttons are shown
  **disabled** with "No podemos confirmar tu decisión desde aquí. Ponte en contacto con {empresa}."
- **Masked in the portal (decided):** "Se ha enviado un correo a v•••@dominio.com para confirmar la
  decisión." — the portal is reachable by anyone holding a forwarded link.

## C.4 Data model — `ETGO_PORTAL_DECISION` (new table, `update.database` + `export.database`)

| Column | Type | Notes |
|---|---|---|
| `ETGO_PORTAL_DECISION_ID` | ID | `make uuid` for the AD records |
| `AD_CLIENT_ID`, `AD_ORG_ID`, std audit, `ISACTIVE` | | the quotation's client / org |
| `C_ORDER_ID` | FK `C_Order` | the quotation |
| `ETGO_PORTAL_LINK_ID` | FK `ETGO_PORTAL_LINK` | the session that asked (audit, KPI) |
| `DECISION` | list `ACCEPT` / `REJECT` | |
| `REASON_CODE` | list `PRICE`, `DELIVERY`, `PAYMENT_TERMS`, `OTHER_SUPPLIER`, `NOT_NEEDED`, `OTHER` | reject only |
| `REASON_TEXT` | varchar(2000) | required when `OTHER` |
| `TOKEN_HASH` | varchar(64), unique | SHA-256 of a 256-bit token (as `PortalTokens`); the token itself is only in the email |
| `RECIPIENT_EMAIL` | varchar | the first To recipient of the root send (C.3), for audit |
| `STATUS` | list `PENDING` / `CONFIRMED` / `VOIDED` / `NOT_APPLIED` | `NOT_APPLIED`: opened when the quotation was no longer pending / was expired |
| `REQUESTED_AT`, `CONFIRMED_AT`, `VOIDED_AT` | timestamps | |
| `ETGO_EMAIL_SEND_LOG_ID` | FK | the confirmation email |

**First confirmed wins.** Confirm runs in one transaction: `SELECT … FROM C_Order WHERE C_Order_ID = ?
FOR UPDATE` (the W1 pattern, `go/…/portal/PortalLinkDal.java:208-211`), then re-read the quotation
(still `UE`, not expired), then check no `CONFIRMED` decision exists for it; apply the decision
(C.1), mark this row `CONFIRMED`, every other `PENDING` row of the quotation `VOIDED`, commit; the
sender notice and the KPI event go **after** the commit (as `onDelivered` does since Part A).
Single use: a row not `PENDING` answers its outcome again (idempotent page), never re-applies.
Never expires: no TTL column. A request is minted pending until its email leaves (Part A's
pending-until-sent rule), so a failed send leaves no usable token.

## C.5 Endpoints (`/sws/portal/*`, `PortalServlet`, isolated from NEO)

- **`POST /quotations/{id}/decision`** — `X-Portal-Token`, body `{decision, reasonCode?, reasonText?}`.
  Scope: `findInScope(session, QUOTATION, id)`; then pending + not expired + a To recipient on the
  root send (else 409 `not_pending` / `expired` / `no_recipient`). Rate limits: the data limiter **plus** a per-quotation
  cool-down (e.g. 2 min, configurable like `PortalLinkConfig.java:48-50`) so the button cannot be used
  to spam the contact. Answers `{state: "sent", email}`. Requires `validate` = valid (an
  expired link renews first, as today).
- **`GET /decisions/me`** and **`POST /decisions/confirm`** — the confirmation landing. The token is
  read from `X-Portal-Decision-Token` (the email link is `/portal/decision/{token}`; the SPA moves it
  from the path to the header, the `X-Portal-Token` pattern; never in a query string). `GET` shows
  what will be applied (document, decision, reason) and the company — **nothing is applied on GET**,
  so mail scanners that pre-fetch links cannot confirm; the page's button does the `POST`.
  States: `pending` (show + confirm button), `confirmed` (already applied: says which),
  `voided` (another request was confirmed first), `not_applied` (no longer pending / expired),
  unknown token → the same generic invalid page as the portal. Rate-limited like `/me`.
  **Decided (user, 2026-11-13): one click on the landing confirms; opening the link alone never
  applies the decision** (mail scanners pre-fetch links). The re-check of the PO's spec runs on that
  click.

## C.6 Emails (transactional contracts, `emails` skill)

- **`portal-quotation-decision-confirm`** — to the first To recipient of the root send only (C.3; no
  CC), language = the link's email language. ES: subject "Confirma tu decisión sobre el presupuesto {numero}"; body "Has pedido
  {aceptar|rechazar} el presupuesto {numero} de {empresa}{, motivo: …}. Pulsa el botón para
  confirmarlo. Si no lo has pedido tú, ignora este correo." CTA "Confirmar decisión". EN mirror.
- **`portal-quotation-decision-notice`** — to the user who sent the quotation (the root link's
  `CREATEDBY`, as the PDF render, `go/…/portal/PortalPrintable.java`), at the **ETGO_ACCOUNT email**
  (`go/…/common/GoAccountResolver.java:76`, `findAccountByUsername`) — `AD_User.Email` is not filled
  by onboarding. ES: "{cliente} ha {aceptado|rechazado} el presupuesto {numero}{ — motivo: …}." EN mirror.
  No sender resolvable (a system-created root, an inactive user, no account): no notice, logged —
  the decision still applies and shows in the app.
- **Structure yes, identity no:** both are their own contracts in the portal's bounded context
  (like `PortalLinkRenewalEmailContract`); the shared send path is untouched and names no window.
  The accept/reject writes live in the sales-quotation customization, not in shared code.

## C.7 SPA (`sf/tools/app-shell/src/pages/portal/`)

- **Detail (desktop):** Aceptar (primary) and Rechazar (outline) in the right panel's header row,
  before "Descargar PDF", exactly where the board draws them; **mobile:** the board's bottom action bar
  ("Al aceptar, {empresa} recibirá tu confirmación…", Rechazar | Aceptar presupuesto). Shown only when
  the detail says `canDecide` (new detail field computed server-side: pending + not expired + a To
  recipient on the root send; plus `decisionBlockedReason` for the disabled state of C.3).
- **Reject modal:** the app's `RejectQuotationModal` cannot be reused as is — it selects tenant
  reasons through NEO and can create them (`RejectQuotationModal.jsx:52`, `:288`). A portal modal with
  the same frame and classes, a radio list of the six fixed reasons and a required textarea for
  "Otros". → reuse its layout constants by extracting them if worthwhile (decide in DEV).
- **"Correo enviado" state:** the panel replaces the buttons with "Se ha enviado un correo a
  {email} para confirmar la decisión." and a pending note until the page reloads.
- **Landing `/portal/decision/:token`:** brand + document + decision + reason + "Confirmar" →
  result screen per state of C.5. Route registered next to `/portal/:token` (`runtime-routes.jsx`).
- After a confirmed decision the quotation simply shows its new status (`ETGO_AC` / `CJ`); no buttons.

## C.8 Backend placement and MCP parity

- Accept/reject writes: a small public method pair on the sales-quotation customization —
  `RejectQuotationHandler#reject` refactored to expose `rejectQuotation(Order, RejectReason)` and a new
  `acceptQuotation(Order)` (`ETGO_AC`). **`RejectQuotationHandler` is still `@Named`-bound**
  (`RejectQuotationHandler.java:69`): touching it means migrating its pair to `@NeoExtension` in the
  same PR (CLAUDE.md, ETP-5588). The portal calls these methods directly (in admin mode, the
  quotation's client/org), never through NEO.
- **MCP / app parity:** the app and MCP reject flows are unchanged. New for the app/MCP only if Q1 =
  `ETGO_AC`: Convertquotation must be offered on `ETGO_AC` in the window and in the MCP's advertised actions
  (`SalesQuotationHeaderHandler.java:144-150`); declare it in `neo-headless.md` §4.12.9 if any channel
  differs. No new MCP tool.

## C.9 Tests (for the testers) and effort

- go (JUnit): decision request (scope, pending/expired/no-contact refusals, cool-down, rate limit);
  confirm (apply accept → `ETGO_AC`, reject → `CJ` + reason + notes; first-confirmed-wins with two pending;
  idempotent second open; `not_applied` after a status change / expiry; unknown token = generic 401);
  token hash only stored; emails (recipient = first To of the root send only, no CC; notice to the sender's account
  email; ES/EN); reason find-or-create; `ETGO_AC` convertible (order and invoice) and advertised in `SalesQuotationHeaderHandler`; first To
  recipient chosen, CC never mailed, empty To refused.
- sf (Vitest): buttons only with `canDecide`, disabled reason, reject modal validation ("Otros"
  requires text), sent state with the full email, landing states; mocked E2E: request → landing → confirm.
- **Effort (rough):** backend 4.5–5.5 d (table + AD, the `ETGO_AC` list value and translations,
  endpoints, lock, two contracts, quotation methods + `@NeoExtension` migration, convert on
  `ETGO_AC`), SPA 2.5–3 d (portal, plus the app's Confirmar gate and status labels), tests 2–3 d,
  docs 0.5 d → **~10–12 d**. If Q1 falls back to "stay in UE", subtract ~1 d.

## C.10 User-visible changes

Portal: Aceptar/Rechazar on pending quotations; reject modal; "correo enviado" state; the
confirmation landing; the new status shown after confirmation. Customer's inbox: the confirmation
email. Seller's inbox: the decision notice. App (if Q1 = `ETGO_AC`): quotations in "Aceptado", with
Confirmar (convert) available on them; rejected ones show the portal reason and the note.

## C.11 Decisions and open questions

**Decided (user, 2026-11-13):** a quotation with no `ValidUntil` is not expired (C.2); the
confirmation goes to the first To recipient of the root send, never CC, buttons disabled when there is
none (C.3); the portal shows the address in full (C.3, revised to follow the Figma; it was masked first); one click on the landing confirms, opening the
link never applies (C.5). By this plan: no sender notice when the sender cannot be resolved (C.6);
KPI: only the hook points (`decision.requested`, `decision.confirmed`, `decision.voided`,
`decision.not_applied` call sites in the service), names and semantics per the PO's new KPI
definition.

**Answered by the PO (Jira) and agreed with the user on a call, 2026-11-13** — see C.13:

| Id | Question | Proposal (original) |
|---|---|---|
| Q1 | Status of a quotation accepted without an order | New module value `ETGO_AC` "Aceptado" (like `ETGO_CI`), convertible later from the app. Fallback: stay in `UE` and record the acceptance only in `ETGO_PORTAL_DECISION` (the app then shows nothing) |
| Q2 | Reject reasons | The tenant's reject-reason list (`C_Reject_Reason`), with the six fixed reasons created if missing, and the "Otros" text in the quotation's notes |
| Q3 | Which statuses can be decided | Only `UE` (as the app's reject); `CO` is not offered |

## C.12 Implementation notes (2026-11-13, built; PO answers applied the same day, C.13)

Built in both repos following C.0–C.11.

- **Backend (`com.etendoerp.go`).** Table `ETGO_PORTAL_DECISION` (`src-db/.../tables/ETGO_PORTAL_DECISION.xml`,
  native SQL only, no AD registration — **needs `update.database` then `export.database`**).
  `QuotationDecisions` (sales-quotation customization): `isDecidable` (`UE`), `reject` (the app's
  own writes, also used by `RejectQuotationHandler`, behaviour unchanged), `accept` (`ETGO_AC`).
  `RejectQuotationHandler` keeps its `@Named`: it is a CDI bean injected by type into
  `SalesQuotationHeaderHandler`, not bound through `ETGO_SF_ENTITY.Java_Qualifier` (no row names
  it), so no NeoExtension migration applies. `PortalDecisionService` (request, mint, markSent, view,
  confirm, the first-confirmed-wins transaction), `PortalDecisionScope`, `PortalDecisionEvents` (KPI
  hook points, empty), two contracts in `email/contracts`, copy in `emails_{es_ES,en_US}.properties`,
  routes in `PortalServlet`, the detail's `decision` block.
- **SPA.** `PortalDecisionActions` (desktop panel row before "Descargar PDF"; mobile bottom bar),
  the portal reject modal (six fixed reasons; the "Otros" text is shown, required and sent only for
  "Otros", cleared when another reason is picked — the server also drops it), the "correo
  enviado" state, `PortalDecisionPage` at `/portal/decision/:token`, i18n in three locales.

## C.13 PO answers applied (2026-11-13)

1. **Q1 — accept → `ETGO_AC` "Aceptado".** One `AD_REF_LIST` row of the module in the order status
   list (`FF80818130217A350130218D802B0011`, id `7BD5D4F5C69F426C879D5F22823C6C3D`). Its Spanish name
   ("Aceptado", es_ES and es_AR) and the fixed `ETGO_CI` one ("Cerrado - Factura creada") are written by
   the module script `EnsureDocumentStatusTranslationsScript` on every `update.database`: the module
   ships no translation module, so `export.database` never exports `_TRL` rows (the
   `EnsureSupportAccessSeedScript` precedent). `PortalDecisionService.ACCEPT_AVAILABLE` and
   `PORTAL_ACCEPT_ENABLED` stay as switches, now `true`. The app converts an `ETGO_AC` quotation like a
   `UE` one: Confirmar (`QuotationTopbarActions`, the row kebab, `QUOTATION_CONFIRMABLE_STATUSES`),
   `createDraftInvoice` (`requireQuotationInvoiceable`), `Convertquotation` (no status check); the MCP's
   refusal texts name it. Label/tone: `statusAccepted`, `statuses.ETGO_AC`, `quotationStatus.ETGO_AC`,
   success; `STATUS_KEYS` of related documents. Print shows on it (`hidePrintWhen`). The portal lists it
   in its allow-list and the "Aceptados" group. **Reject on `ETGO_AC`:** not offered (the app's rule
   stays `UE` only — menu, `RJ`, `rejectQuotation`, portal); nothing depends on rejecting an accepted
   quotation. Not done: `STATUS_ORDER` in `lib/statusBadge.js` (the list sort order) is mirrored in
   app-shell-core and pinned by a parity test, so `ETGO_AC` sorts as an unknown code until core adds it.
2. **Q3 — only `UE`, not expired.** Unchanged.
3. **Reject reasons (replaces Q2).** The portal reason is never mapped to the tenant's
   `C_Reject_Reason` (tenant reasons can be internal, e.g. "deudor", and must never reach the customer);
   "Otros" never creates one. The reason and the "Otros" text go to the quotation's notes, as before.
   The seam `rejectReasonFor` was removed (it returned `null`); the decision is documented at the call.
   The app lets the seller **edit** `rejectReason` on a rejected (`CJ`) quotation:
   `decisions.json` → `visibility: editable`, `readOnlyLogic: @DocStatus@!'CJ'` (the AD logic locked it
   exactly on `CJ`), a plain Save limited to that field (`keepSaveWhenCompletedFields`, `CJ` out of
   `hideSaveStatuses`). The ETP-4006 trap (an editable table-reference field gets the defaults'
   first-option fallback) is closed in `SalesQuotationHeaderHandler.afterHandle` (DEFAULTS drop
   `rejectReason`). Needs `make regen ONLY=sales-quotation PUSH_TO_NEO=1` + `export.database` (the NEO
   field is still read-only until pushed).
4. **Quotation PDF "Motivo" (Jira comment 149518 point 5, revised by QA).** A rejected quotation's
   printable shows one observation line "Motivo: <reason>" with the customer's own portal reason
   only (and the "Otros" text), read from the portal's note line; that line is left out of the
   observations so "Motivo" is not printed twice. Built in `buildQuotationData` and
   `QuotationPrintableData` (every producer). **The tenant's reject reason is never printed**: it
   can be internal, and this is the PDF the customer downloads from the portal and receives by
   email. A quotation rejected without a portal reason (e.g. in the app) prints no "Motivo" line.
   **Cache:** editing the quotation moves the quotation's `updated`, so the stored PDF goes stale; the
   app's preview re-renders it, and the portal's `/pdf` now re-renders a stored PDF older than the
   document before serving it (D29).
5. **One step for the 2FA.** The confirmation email's button names the decision ("Confirmar rechazo" /
   "Confirmar aceptación") and is the confirmation: the landing's script sends `POST /decisions/confirm`
   on open (once per open, also under StrictMode) and shows the result ("Has rechazado el presupuesto
   {n}", already applied, superseded, no longer pending, expired; a failed POST offers a retry). A bare
   GET applies nothing. Confirm answers `appliedNow` (true only on the applying call; a re-open no longer
   re-sends the seller's notice). The portal's "sent" message tells the customer to press the button in
   the email.
   **Accepted trade-off (the PO chose the one-step flow):** a mail scanner that executes the page's
   JavaScript could confirm a pending decision. The token is single-use, and the email only ever
   reaches the quotation's main recipient (the first To of the original send). Review follow-ups
   (Alex W2/W3): the request's cool-down runs under the quotation row lock and ignores requests
   whose email did not leave; `confirm` re-runs the portal access checks (blocked or inactive
   customer, expired plan) and applies nothing when the portal is closed for the customer.
6. **Footer.** "Creado con etendo.ai" links to `https://etendo.ai` (new tab, `noopener noreferrer`); no
   shared constant existed.
7. **The confirmation lands in the portal (PO, 2026-11-16).** The landing no longer ends on its own
   card. After the one-step confirmation, whatever its state (applied now, answered before,
   superseded, no longer pending, expired), the server mints a new portal link like a renewal (same
   tenant, Business Partner, recipients and language as the decision's link; 48 h from now;
   `LINK_ORIGIN = DECISION`, parent = the decision's link, root = its root) and marks it usable at
   once, since no email carries it (`PortalDecisionEntry`). Its raw token comes back only in the
   confirm POST's answer (`portalToken`, `quotationId`). The SPA opens
   `/portal/<token>?view=doc&kind=QUOTATION&id=<quotationId>` (replacing the landing in the history),
   with no notice: the one-off arrival banner ("Has aceptado / rechazado el presupuesto {n}", "Ya
   habías respondido…", `PortalArrivalNotice`, router state) was removed on 2026-11-18, as the Figma
   has none and the confirmation page already says what happened; its `portalNotice*` keys left the
   locales. Opening the portal records `portal.link.opened` as usual
   (origin `DECISION`). No link, and the landing keeps its card: invalid token, portal closed for the
   customer by the access checks, or minting failed; the decision itself is applied or not exactly as
   before. Bound: at most 10 `DECISION` links per decision link and day, besides the confirm route's
   rate limiter. **Needs `update.database`** (`ETGO_PORTAL_LINK_ORIGIN_CHK` accepts `DECISION`).

---

## Still open

Parts A and B are done. This plan stays in `docs/plans/` (not `completed/`) until the items below
are closed or moved to their own ticket.

| Item | State | Notes |
|---|---|---|
| **Part C — accept / reject a quotation from the portal** | **Built, PO answers applied** | See Part C, C.13. Open: `ETGO_AC` in the core `STATUS_ORDER` (sort order only). |
| **KPI semantics** | **Defined by the PO, emitted** | PO metrics (etendo-ai#22, 2026-11-16): invoices downloaded from the portal ÷ invoices sent with a portal link (≥ 30 %, also monthly absolute) and quotations answered from the portal ÷ quotations sent with a link (≥ 20 %, split accepted/rejected, manual decisions excluded). Emitted as Mixpanel backend KPIs by `PortalKpiTelemetry` (com.etendoerp.go): `backend_portal_document_sent` and `backend_portal_document_downloaded` (`type`, once per document; "first download" stamped atomically on `ETGO_PORTAL_LINK.FIRST_DOWNLOADED`, needs `update.database`) and `backend_quotation_decided` (`decision`, `source` portal/app; an app conversion of a portal-accepted `ETGO_AC` quotation is not counted again). Contract and Mixpanel recipes: go `docs/backend-observability.md` → *Customer Portal KPIs (ETP-6209)*. The `portal.*` usage events of §A.7 are unchanged. |
| **Drop the unused `ETGO_PORTAL_ACCESS`** | **Follow-up, after a production check** | Kept as on `develop` in this delivery (§A.1, revised 2026-11-13). Check production for rows; if empty, drop the model XML and its dictionary rows in their own change. |
| **Retention / purge job for `ETGO_PORTAL_LINK`** | **Asked of the PO** | Nothing deletes rows today. Pending rows (the email never left) are invalid forever and harmless (§A.2.7); expired rows are kept because **an expired link can be renewed at any age** — there is no maximum. The PO was asked the maximum age after which an expired link should no longer renew; that answer decides both the renewal cut-off and how long rows must be kept. |
| **Plain-text 500 on the portal PDF route** | Optional cleanup | `GET /sws/portal/documents/{kind}/{id}/pdf` streams through `AnonymousAttachmentStreamer`, whose failure path writes a `text/plain` body (`writePlainError`) — the email download link's format — while every other portal error is JSON. The page only reads the status, so nothing is broken; aligning it would mean a JSON error for the portal caller without changing the email link's answers. |
| Live check of the PDF on a real organization | To confirm | QA BUG-1 was fixed through the shared streamer; confirm `/pdf` and `hasPdf` live on a tenant whose documents sit in a real (non-`*`) organization. |
