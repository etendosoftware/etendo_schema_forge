# Customer portal: every sales document, one link per send

Status: **approved 2026-11-11 (all decisions below taken as proposed) · Part A implemented and
approved, Part B implemented 2026-11-12** · Created 2026-11-11 ·
Jira: **ETP-6209** (extends ETP-5267) · Flag: **`bp-portal-link`** (unchanged gate, now for all sales
document sends) · Branches: `feature/ETP-6209` in `etendo_schema_forge` and `com.etendoerp.go`

Builds on the MVP plan [`2026-09-10-bp-self-service-portal.md`](2026-09-10-bp-self-service-portal.md)
(ETP-5267). That plan stays as the record of the MVP; this one **supersedes** the parts listed in §0.
PO answers to the five open questions (Jira ETP-6209, comment 149209) are folded in and treated as
fixed (§B.0).

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
   language, contractName)` inserts a row with `SENT_AT = NULL`, returns `(linkId, url)`. The URL goes
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
   sendLogId, now)` sets `SENT_AT`, `EXPIRES_AT`, `ETGO_EMAIL_SEND_LOG_ID`, then emits
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
| `POST /renew` | Token in `Authorization`; renew an expired link |
| `GET /documents`, `GET /documents/{kind}/{id}`, `GET /documents/{kind}/{id}/pdf` | Part B |
| `GET /logo` | Unchanged (`PortalServlet.java:250-271`), scope from the link |

The MVP `/invoices` routes are removed (no consumers but `PortalPage`).

### `GET /me` states

| State | When | HTTP + body |
|---|---|---|
| **invalid** | unknown hash, pending (`SENT_AT` null), `ISACTIVE='N'`, malformed, absent | **401 `{"error":"This link is no longer valid"}` — byte-identical to today** (`PortalServlet.java:151`, `:497-499`) |
| **valid** | `SENT_AT` set and `now < EXPIRES_AT` | 200 `{state:"valid", businessPartnerName, tenantName, hasLogo, entryDocument:{kind,id}}` |
| **expired** | `SENT_AT` set and `now >= EXPIRES_AT` | 200 `{state:"expired", tenantName, hasLogo}` — no BP name, no document |

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
  `POST /renew` (own instance each).

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
| `portal.link.renewed` | `POST /renew` | tenant | `ROOT_LINK_ID` | doc kind | `renew` / ok, or error with `BLOCKED_CUSTOMER`, `INACTIVE`, `PLAN_EXPIRED`, `COOLDOWN`, `DAILY_LIMIT`, `SEND_FAILED` | `expiredLinkId, newLinkId?, bpartnerId` |
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
6. Rate limit on `GET /me` and `POST /renew` — extended.
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
  accounts with `bp-portal-link`), with new wording mentioning documents and validity.
- Every link expires 48 h after its send; older links keep working until their own expiry.
- Opening an expired link mails a new one to the original To/CC and says so on screen; blocked,
  inactive or expired-plan tenants get a "cannot send, contact {company}" message.
- New email "portal-link-renewal" (ES/EN); it appears in the document's Emails card (if D-3 confirmed).
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
| `GET /documents?type=&status=&dateFrom=&dateTo=&limit=&offset=` | `{documents:[{kind, isCreditNote, id, documentNo, date, currency, grandTotalAmount, documentStatus, …invoice payment fields}], totalCount, offset, limit, balances}` |
| `GET /documents/{kind}/{id}` | header detail + `links[]` + `hasPdf` |
| `GET /documents/{kind}/{id}/pdf` | the PDF stream |

- One `PortalDocumentQuery` (replaces `PortalInvoiceQuery`): native SQL `UNION ALL` over the three
  tables, each arm carrying the full scope + allow-list of §B.1, all values bound, `ORDER BY date
  DESC, documentNo DESC` (deterministic paging, as `PortalInvoiceQuery.java:68-71`), `LIMIT/OFFSET`,
  page clamp kept (`PortalServlet.java:121-132`).
- `type` ∈ `quotation|order|shipment|invoice|creditNote`; `status` ⊆ the visible set of the selected
  type(s) (others ignored, never an error); dates `yyyy-MM-dd` calendar days.
- `balances` (outstanding per currency over all visible invoices, not the page) kept from
  `PortalServlet.java:300-336`.
- `{id}` outside scope, wrong kind, or hidden status ⇒ 404.

## B.4 List

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

Two consequences the user should know:
- **A document never emailed or printed has no main attachment** (the SPA caches it before sending,
  `DefaultDocumentSendEmailContract.java:254-257`) ⇒ `hasPdf:false` and "PDF not available".
  Rendering server-side for those is out of scope here (would be a seventh producer of the printable).
- **Risk to verify in QA**: the emails skill records that the email download link answers 500 for
  documents in a real organization, because `AttachImplementationManager.download` checks readable
  orgs in a session-less request. The portal streams through the same call
  (`NeoAttachmentsDownloader.java:103`). If the MVP invoice download already works in a real org,
  fine; if not, this story inherits the bug for all five types.

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
| D-2 | "Last month" default range | **Rolling**: today − 1 month … today |
| D-3 | Renewal email visible in the document's Emails card | **Yes** |
| D-4 | Renewal limits | **Decided by the PO (2026-11-11): 15 min per link, no daily cap.** Both remain configurable (`cooldownMinutes`, `maxPerDay`, `0` = unlimited, the default) |
| D-5 | KPI headline unit | **Per send** (`ROOT_LINK_ID`) |
| D-6 | Portal paragraph wording (ES/EN) | **The §A.2 draft**, with the validity stated in hours |

## Part A — implementation notes (2026-11-11)

Where the code differs from the text above, and why:

- **`/invoices` and `/invoices/{id}/pdf` are kept** for this round (§A.4 said they go). Part B
  replaces them with `/documents`; until then the portal page keeps listing invoices.
- **Loose references.** `PARENT_LINK_ID`, `ROOT_LINK_ID` and `ETGO_EMAIL_SEND_LOG_ID` are plain
  `VARCHAR(32)` with no DB foreign key (§A.1 said FK). A self-reference needs an `AD_REF_TABLE`
  record to be modelled in the AD, and the send-log id is best effort anyway. The origin column is
  `LINK_ORIGIN` (not `ORIGIN`).
- **DAL access by entity name.** `PortalLinkDal` uses `DynamicOBObject` on `ETGO_Portal_Link`, as
  `DalEmailSendLogStore` does, so the code compiles without `generate.entities`. Property names are
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
- **D-1 on the data endpoints.** `/invoices`, `/invoices/{id}/pdf` answer the generic 401 for an
  expired or unavailable link; `/logo` answers for any sent link (the expired page shows the
  company's branding).
- **The portal token travels in `X-Portal-Token`, not `Authorization`** (live-test fix). The
  SPA's request helper decides `Authorization` from the app's session credential scheme; with an
  Etendo GO session in the browser the scheme resolves to `cookie` and an explicit token is dropped,
  so the portal got no token and answered "invalid" to a valid link (incognito worked). With no GO
  session the scheme resolves to `bearer` (`auto` + no CSRF proof), which is why it only failed for
  signed-in browsers — but production is one domain for every tenant, so any customer who also uses
  Etendo GO would have hit it. `PortalServlet#resolveToken` reads `X-Portal-Token` first, then the
  `/me/{token}` path, then `Authorization: Bearer` (legacy), so a GO session's own credential is
  never what opens the portal. This supersedes MVP §5.4's "sent as an `Authorization` header".
- **Known debt carried over from the MVP (review W6, not fixed):** `PortalRateLimiter` keys on
  `HttpServletRequest#getRemoteAddr`. Behind a load balancer or proxy that is the balancer's
  address, so every visitor shares one 30 req/min bucket per node — a busy tenant could see
  legitimate 429s, and the limiter protects nothing per caller. Fixing it needs a trusted
  `X-Forwarded-For` policy for the deployment; out of scope for ETP-6209.
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

**Scope decided with the user where the design and the ticket differ.**
- **In:** home (pending-payment card with outstanding and overdue amount per currency, one tile
  per kind with its count and highlight, recent documents — all server-side aggregates); a sidebar
  with one list per kind (Presupuestos, Pedidos, Albaranes, Facturas — credit notes inside
  Facturas, marked "Factura rectificativa"); mobile bottom navigation; per-list status tabs (the
  kind's visible statuses), date range (default: rolling last month, D-2) and search by number or
  reference; detail with summary, read-only lines, taxes, invoice payment block, navigable related
  documents and "Ver PDF / Descargar PDF" (or "PDF no disponible"); greeting with the customer's
  name; ES/EN switch; tenant logo and name on every view.
- **Out, though the design shows them:** "Albaranes de devolución"; checkboxes and "Descargar
  seleccionados"; the advanced "Filtros" button; Comentarios; Aceptar / Rechazar (Part C); the
  account / user menu (the portal has no login).
- **Also not built (design only, not in the ticket):** the home's "Facturado por mes" chart, the
  "Pagado este año" figure and the header's global search; the "Creado con etendo.ai" footer.
- **Orders tile has no highlight.** The design's "En curso" has no honest single figure in the data
  (a completed order may already be delivered and invoiced), so the tile shows its total count.
  Quotations highlight "Por responder" (`UE`), invoices "Vencidas" (an instalment past due with money
  owed), shipments "Este mes" (movement date in the current month).
- **The document sheet replaces the design's PDF canvas.** The left panel renders the document
  from data (header, customer, lines, totals); "Ver PDF" opens the real printable in a dialog and
  "Descargar PDF" saves it, both the main attachment the email's link serves (§B.7).

**Backend (`com.etendoerp.go`).** `GET /sws/portal/home`, `GET /sws/portal/documents`,
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
  Over the ceiling the answer is `429`. The W6 debt (keyed on `getRemoteAddr()`, wrong behind a
  load balancer) applies to all three.
