# Business Partner self-service portal (MVP)

Status: **approved for MVP, ready for DEV** · Created 2026-09-10 ·
Jira: **[ETP-5267](https://etendoproject.atlassian.net/browse/ETP-5267)** (epic ETP-3504 Etendo Next) ·
Flag: **`bp-portal-link`** (backend-only, targeted per sending `ETGO_ACCOUNT` email, see §2.5)

## 0. Goal

Replicate the scope of Holded's native "Portal del cliente" inside Etendo Go, for the MVP only:
a Business Partner (our tenant's own customer) can open a link and see their invoice history and
outstanding balance, read-only, with no account to register or password to manage.

## 1. Scope decisions (closed during brainstorming, 2026-09-10)

| Decision | Choice | Why |
|---|---|---|
| Data/actions exposed | **Read-only**: invoice list + PDF + outstanding balance | Smallest slice that satisfies "acceso a sus datos básicos". Quotations, online payment, catalog, orders are explicitly out of scope (see §8). |
| Auth model | **Magic link, no password** | No password reset/recovery flow to build or support. |
| Multi-tenant scope | **Portal per tenant** | A BP that buys from two Etendo Go tenants gets two independent links. No cross-tenant identity matching. |
| Link trigger | **Embedded in the `sales-invoice-send` email** | Reuses the existing document-email pipeline (`SalesInvoiceSendEmailContract.java`, `DalInvoiceEmailDocumentResolver.java`); the BP never has to request access. |
| Link lifetime | **Stable and reusable (bookmarkable)**, revocable | Matches Holded's UX; security relies on entropy + revocation, not expiry. |
| Revocation | **Manual only** (action from the Business Partner window), for MVP | Minimum viable kill-switch for a leaked link. Automatic revocation triggers (BP deactivated, email changed, etc.) deferred. |
| Feature flag | **`bp-portal-link`, targeted at the sending account.** Gates only the link injection into the email; the portal surface and its endpoints are unconditional | See §2.5 — one gate, default false, enabled by naming an `ETGO_ACCOUNT` email. Backend-only. |

## 2. Architecture

**Backend — new bounded context in `com.etendoerp.go`, isolated from NEO Headless.**

A dedicated servlet under `/sws/portal/*` (never `/sws/neo/*` — must never be reachable through, or
confused with, the generic `NeoServlet`/`DataSourceServlet` CRUD engine every tenant/window shares).
Three read-only endpoints:

- `GET /sws/portal/me` — validates the token, returns BP display name + tenant name.
- `GET /sws/portal/invoices` — invoice list + outstanding balance.
- `GET /sws/portal/invoices/{id}/pdf` — streams the PDF via the existing invoice PDF pipeline
  (the same one `document-printables` uses) — not reimplemented.

**Frontend — reuses the existing app-shell, no new app/domain.** `runtime-routes.jsx` already
supports public (unauthenticated) routes (used today for login/register). Add
`{ path: 'portal', public: true, element: <PortalPage/> }`. This lands inside the tenant's own
already-deployed shell — which is what gives us "portal per tenant" for free — and reuses
`formatCurrency`, `parseCalendarDate`, i18n, and `useApiFetch` (passed the portal token instead of a
NEO session token, per the existing `token` option documented in `docs/request-policy.md`).

## 2.5 Gating — one feature flag, targeted at the account sending the invoice

**Nothing gates the portal itself.** The `/portal/:token` route, the three `/sws/portal/*`
endpoints, the `etgo_portal_access` table and the revoke action all ship unconditionally. What
protects the portal's data is the opaque token in the URL, validated server-side on every request
(§5) — never the flag, and never route registration. A frontend flag would be visual gating, not
authorization (`docs/feature-flags.md` rule 3).

**One gate, and only one.** Exactly one condition decides whether `sales-invoice-send` **carries the
link**: is the `bp-portal-link` flag on for the account sending this invoice. Default **false** — no
link goes out until an account is named.

| Question it answers | Mechanism | Granularity |
|---|---|---|
| Is the portal link switched on for *this sending account*? | `bp-portal-link` feature flag, per-account allowlist (below) | one `ETGO_ACCOUNT`, or everyone via the bare boolean |

This is the answer to "depende del usuario logueado" (decided 2026-09-10). There is deliberately **no
second condition** — no environment master switch on top of it, and no `AD_Preference`. Two earlier
shapes were tried and rejected the same day: an environment flag ANDed with a per-sender
preference (nothing worked until two unrelated things were configured), and the preference alone
(the user wants the flag to be the mechanism). One gate, one place to configure it.

### How the per-account allowlist works

The capability is generic and lives in `PropertiesFeatureProvider`, not in portal code — the user
asked for per-account targeting as a platform capability ("nos sirve para otras funcionalidades"),
so any future flag gets it for free.

```
etendo.go.flags.bp-portal-link.emails = someone@example.com, other@example.com
```

- A targeting key listed there resolves **true** (reason `TARGETING_MATCH`); anything else falls
  through to the flag's own boolean value; nothing configured ⇒ **false**.
- **The allowlist and the boolean are an OR, not an AND** — naming an account is sufficient on its
  own. Setting the bare `etendo.go.flags.bp-portal-link=true` still enables it for *everyone*, which
  is the pre-existing environment-wide switch and unchanged.
- **No wildcard**, and an empty allowlist never means "everyone": a blank entry cannot match,
  because the targeting key is non-blank by the time it is compared.
- A flag with no `.emails` property behaves exactly as before the capability existed, which is what
  leaves every other flag unaffected.

Full reference, including the config precedence: `com.etendoerp.go/docs/feature-flags-and-tenant-upgrade.md`
→ *Per-account targeting*.

### The identity is the ETGO_ACCOUNT email — not `AD_User.email`

This is not interchangeable, and getting it wrong fails silently. **Onboarding never writes
`AD_User.email`** — `InitialSetupUtility.insertUser` only writes `username`, as
`EtendoGoJwtDalHelper.findAccountForEnvironmentUser` already documents — so targeting on the AD
user's email would read `null` for essentially every Etendo Go user and the flag would match nobody.

`PortalLinkPolicy` therefore resolves the account from the AD username through `GoAccountResolver`,
which is also what handles the `<accountEmail>+<clientName>` username a second environment gets.
Same resolution `NeoSessionService` uses to put account identity on a session. **No account, no
email on it, or any failure resolving it ⇒ no link** — never a fallback to "allow".

### Backend-only, and it must stay that way

The decision point is entirely server-side: the link is injected while building the email in Java.
No key exists in `flag-keys.js`, nothing in the browser reads this flag, and **none must be added.**
Per ETP-4966, a flag whose two ends resolve from different control planes has no single truth, and
an unset key on one end is indistinguishable from a disabled feature. With a single evaluator there
is no second end to disagree.

This does *not* reopen the `targeting-key-divergence` precondition on `paid-second-tenant`: that
divergence is the frontend sending the ERP username while the backend targets the account email.
This flag targets the account email and has no frontend end at all.

Route registration follows the pattern `docs/feature-flags.md` already documents as correct for
`/upgrade` — registered **unconditionally**, because hiding a route would imply something was
protecting it, which nothing here is.

### Changing it needs a restart, and revocation is the fast lever

`bp-portal-link` and its allowlist are both resolved by the config-backed provider, so changing
either is a deploy/restart rather than a toggle. For a link that is **already out**, the lever is
per-BP revocation (§1) — which deliberately sits outside the gate and works whatever the flag says.
Do not plan an incident response around flipping the flag.

### Why "always live" is not an exposure

Token minting happens inside the link-injection block (§4 step 2), i.e. behind the gate. So until
someone is actually sending links, **no `etgo_portal_access` row is ever created** — the always-live
endpoints have nothing to validate against and answer the same generic "link no longer valid" to
everything. There is no reachable data and no token to guess (256-bit, §3). The endpoints are live;
the surface is empty.

This is what makes the unconditional deployment safe, and it is a claim the tests must assert
(§7) rather than a claim this document merely makes.

## 3. Data model

New table `etgo_portal_access`:

```
etgo_portal_access_id   PK (new UUID via `make uuid`)
ad_client_id            FK — tenant
c_bpartner_id           FK — the Business Partner
token_hash              SHA-256 of the opaque token, unique, indexed
created
last_used               updated on every successful validation
revoked_at              null = active
```

Token = 256-bit CSPRNG-generated opaque value (not JWT). Only its SHA-256 hash is ever persisted.
At most one **active** row per `(ad_client_id, c_bpartner_id)` — enforced at the application level
(look up the active row before inserting), not a DB unique constraint, because revoking + reissuing
must be able to create a new row while the old one stays around (revoked) for audit.

**Find-or-create on first send:** the first time `sales-invoice-send` fires for a given
`(ad_client_id, c_bpartner_id)` with no active row, mint one. Every subsequent invoice to the same BP
reuses the same link — never rotates on its own.

## 4. Data flow

1. Internal user sends a Sales Invoice (existing "Send" action / kebab).
2. `SalesInvoiceSendEmailContract` / `DalInvoiceEmailDocumentResolver` is extended, **behind the
   gate of §2.5** (`bp-portal-link`, evaluated for the sending account): find-or-create the active
   `etgo_portal_access` row for `(ad_client_id, c_bpartner_id)`, add the portal URL
   (`https://<tenant-domain>/portal/<token>`) to the email template context. Gate closed ⇒ the
   whole block is skipped, so no row is minted and the email is byte-identical to today's.
3. BP opens the link → lands on `PortalPage` (public route in their tenant's app-shell).
4. `PortalPage` calls `GET /sws/portal/me` with the token (path segment on first load; header on
   every call after) to validate and greet.
5. Calls `GET /sws/portal/invoices` → renders list + balance. "Download" calls
   `GET /sws/portal/invoices/{id}/pdf`.
6. Bookmarking the URL works because the token itself is the credential — no separate session.

## 5. Security invariants (non-negotiable)

1. Every endpoint resolves `ad_client_id` / `c_bpartner_id` **only** from the validated token row.
   No endpoint accepts either as a client-supplied parameter — zero IDOR surface by construction.
2. Unknown or revoked token → identical generic response ("this link is no longer valid"). Same
   anti-enumeration principle already used by password-reset (`docs/plans/2026-09-02-account-authentication-methods.md`).
3. Every invoice/PDF query filters explicitly by `ad_client_id` + `c_bpartner_id` +
   `docstatus = 'CO'` — completed documents only, never drafts.
4. Token never appears in access logs: only the very first page load carries it in the URL;
   subsequent XHR calls send it as an `Authorization` header, not a query string.
5. `/sws/portal/*` responses are `no-store` / cache keyed by token — prevents CloudFront or any
   shared cache from serving one BP's data to another by caching on path alone.
6. Basic rate limiting on `GET /sws/portal/me` as defense in depth (token entropy already makes
   brute force computationally infeasible).
7. Manual revocation (§1) must ship in the MVP — it is the only kill switch for a leaked link.

## 6. Error handling

- Invalid/unknown/revoked token → generic "link no longer valid" page, no distinction exposed.
- BP with zero invoices → empty state, not an error.
- Any attempt to fetch a PDF/invoice outside the token's own `(client, bpartner)` scope → `404`,
  never `403` (never confirm the record exists).

## 7. Testing (delegate authoring to Tester per CLAUDE.md)

- **Critical:** cross-BP isolation test — two BPs, two token sets, assert neither can see or fetch
  the other's invoices/PDF under any endpoint.
- Token lifecycle: find-or-create is idempotent (same BP, second invoice send reuses the same row);
  revoke then re-send mints a new row/token; revoked token is rejected identically to an unknown one.
- `sales-invoice-send` email contains exactly one portal link, stable across sends to the same BP.
- **The gate, both cases** (§2.5) — with one gate there are two, not four. The link appears when the
  sending account is allowlisted. When it is not, assert the email is byte-identical to today's
  **and that no `etgo_portal_access` row was minted** — check the row count, not just the email
  body, because minting on a gated-off send is the failure mode that leaks the feature early.
- **Allowlist matching** (unit, on the provider — generic, not portal-specific): a listed email
  resolves true; matching is trimmed and case-insensitive; an unlisted email, a null targeting key,
  a blank entry and an unset `.emails` property all resolve to the flag's boolean value; **a flag
  with no `.emails` behaves exactly as before**, which is the backward-compatibility guarantee.
- **Account resolution:** a sender whose `ETGO_ACCOUNT` email is allowlisted gets the link even
  though `AD_User.email` is empty (the normal Etendo Go case, since onboarding only writes
  `username`); a sender with no resolvable account gets **no link** rather than an error.
- **The endpoints never read the gate** — same token, same answer, flag on or off. Assert it
  explicitly: it is the claim that makes deploying the surface unconditionally safe.
- Frontend: RTL by `data-testid` per project convention — invalid token, empty list, PDF download.
- E2E (Playwright, mocked): full portal journey per `docs/e2e-testing-guide.md`.

## 8. Out of scope (explicitly deferred, not forgotten)

- Online invoice payment, quotations/acceptance, product catalog, placing orders.
- Cross-tenant unified identity for a BP that buys from multiple Etendo Go tenants.
- Automatic revocation triggers (BP deactivated, email changed).
- Per-tenant portal branding/customization.
- Any password/persistent-credential access mode (Holded's second option).

## 9. Repos/areas touched

`com.etendoerp.go` is a **separate git repo** living at `etendo_core/modules/com.etendoerp.go` inside
this checkout (verified 2026-09-10) — it gets its own branch and its own PR.

- `com.etendoerp.go`: new table, new servlet package (`portal/`), `SalesInvoiceSendEmailContract`
  edit, the `GoFeatureFlags` flag constant, and — reusable beyond this feature — per-account
  targeting in `PropertiesFeatureProvider`.
- `etendo_schema_forge` (this repo): new public route + `PortalPage` and subcomponents in
  `tools/app-shell/src`; `flags-registry.json` entry.
- Docs: this file; `com.etendoerp.go/docs/feature-flags-and-tenant-upgrade.md` (flag table row **and**
  the new *Per-account targeting* section, which corrects the previous claim that the evaluation
  context does not affect the result); `docs/email-inventory.md` for the `sales-invoice-send`
  contract change. No `docs/generated-custom-windows/` guide is needed — this is not a generated
  window.

Jira: **ETP-5267** under epic ETP-3504. Branches `feature/ETP-5267` exist in both repos.
