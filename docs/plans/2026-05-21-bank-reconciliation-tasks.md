# Bank Reconciliation — Jira Tasks (Stories under ETP-3504)

**Parent epic:** [ETP-3504](https://etendo.atlassian.net/browse/ETP-3504) (Etendo Go)
**Parent plan:** [`2026-05-21-bank-reconciliation-module.md`](./2026-05-21-bank-reconciliation-module.md)
**Source spec:** `~/Downloads/Definicion_Funcional_Conciliacion_Bancaria.docx.pdf` (v1.0 Borrador, May 2026)
**Total tasks:** 11
**Conventions:** Etendo Git Police — `feature/ETP-XXXX` branches, `Feature ETP-XXXX: …` commits (≤80 chars first line), no `Co-Authored-By`.

> 🇪🇸 Cuando se creen las stories en Jira, cada una recibe su `ETP-XXXX` real bajo el epic **ETP-3504**. Los IDs `T1…T8` debajo son placeholders. PSD2 / Salt Edge ya está implementado en su propio módulo — la integración (T3) es solo cableado de UI. **T2 entrega el flujo sin conexión primero; T3 añade PSD2 después** para que el equipo de PSD2 pueda avanzar en paralelo.

## Architectural framing (mirrors Etendo Classic)

Etendo Classic has **no standalone Bank Reconciliation window** — reconciliation lives as an inner tab + a "Match Statement" process popup launched from the **Financial Account** window. The existing `bank-reconciliation` entry in Etendo Go is a synthetic placeholder (no `schema-raw.json`, invented fields) that does not correspond to any real Classic window.

These 8 tasks **retire that placeholder** and add a new menu entry **"Cuentas"** in Finance, backed by `FIN_Financial_Account` (same entity as Classic's "Financial Account") with reconciliation / matching / imported statements as internal tabs and popups. The result is structurally identical to Classic, with the redesigned UX defined by the Figma mockups in the **"PASANDO EN LIMPIO"** section of the functional document. See §2.5 of the parent plan for the full mapping.

---

## Task index

| ID | Title | Depends on | Front | Back | Est. |
|----|-------|-----------|-------|------|------|
| T1 | Build Accounts list page reading existing financial accounts | — | ✅ | ◐ | ~1 w |
| T2 | Implement offline account creation, edit and archive | T1 | ✅ | ◐ | ~1 w |
| T3 | Wire PSD2 connection panel and Salt Edge integration into the Accounts UI | T2, existing PSD2 module | ✅ | - | ~0.5 w |
| T4 | Build financial account detail view (Movements tab + placeholders) | T1 | ✅ | ✅ | ~1.5 w |
| T5 | Deliver matching rules backend, AD window and Figma-aligned UI | T1 | ✅ | ✅ | ~1.5 w |
| T6 | Implement manual reconciliation split panel and reconcile handler | T4 | ✅ | ✅ | ~2 w |
| T7 | Implement suggested automatic reconciliation popup with rules engine | T5, T6 | ✅ | ✅ | ~2 w |
| T8 | Add deferred accounting and reactivate reconciliation flow | T6 | ◐ | ✅ | ~1.5 w |
| T9 | Build Imported Bank Statements view with file import flow | T4 | ✅ | ✅ | ~1.5 w |
| T10 | Make financial accounts agentic via a NEO Headless write spec | T2 | ✅ | ✅ | ~1 w |
| T11 | Transfer funds between financial accounts | T1, T4 | ✅ | ✅ | ~1 w |

---

## Task 1 — Build Accounts list page reading existing financial accounts

**Title (Jira):** Build Accounts list page reading existing financial accounts
**Type:** Story
**Parent epic:** ETP-3504
**Branch:** `feature/ETP-XXXX`
**Commit prefix:** `Feature ETP-XXXX:`

### Issue Description

* Build a new standalone Accounts landing page at `/finance/accounts` that replaces the current Bank Reconciliation entry point, matching the Figma mockups in the "PASANDO EN LIMPIO" section of the functional document.
* The page lists every active `FIN_Financial_Account` for the logged-in client / organization, including bank accounts, cash accounts, cards and payment-gateway accounts.
* A left sidebar shows: total balance, balance breakdown per currency, and a "Pending to reconcile" widget with three counters — accounts with pending lines, suggestions ready, and rule-based matches.
* The central table shows one row per account with: account logo + name, type, masked IBAN, current balance, and a "To reconcile" pill — either `Reconcile (N)`, `Connect PSD2`, or `—`.
* Each row exposes a kebab menu with the seven actions documented in section 5.1 (Open account, Edit account, Edit PSD2 connection, Sync now, Manual statement import, Disconnect PSD2, Archive account). In this ticket, only Open account is wired; the rest stay visible but disabled — they get activated in T2 / T5.
* A header bar exposes: a type filter dropdown (`All accounts / Bank / Cash / Card`) plus the `+ New account` and `Matching rules` buttons, both visible but disabled until T2 and T5 respectively.
* Clicking a row navigates to `/financial-account/{id}` (placeholder route is acceptable in this ticket — T4 materializes the detail view).

### Solution Design

**Frontend (Schema Forge):**

* New standalone page `tools/app-shell/src/pages/FinancialAccountsPage.jsx` (not under `artifacts/` since it is not an AD window — it is an aggregator view).
* Register the route in the app-shell router and add an entry to `tools/app-shell/src/menu.json` under the Finance group. The new entry coexists with the legacy `bank-reconciliation` entry until cutover.
* Sidebar component reads aggregates from a new endpoint `GET /financial-account/summary` returning `{ totalBalance, byCurrency: [{ currency, total }], pending: { accountsWithPending, suggestionsReady, byRule } }`.
* Central table reads from the NEO Headless `financial-account` spec. Configure the spec via Schema Forge artifact `artifacts/financial-account/` with `decisions.json` v2 and run `push-to-neo`. Columns mapped from `FIN_Financial_Account`: `Name`, `Type`, `IBAN`, `CurrentBalance`, `C_Currency_ID`, `IsActive`.
* Type filter applies a client-side filter on the cached dataset (server-side filter optional for large datasets).
* Row kebab is rendered via a `<DropdownMenu>` from `components/contract-ui/` — actions are declared in a static array with a `disabled` flag for non-Open entries.
* New i18n keys under `finance.accounts.*` added to both `en_US.json` and `es_ES.json`.

**Backend (com.etendoerp.go):**

* Extend `FinancialAccountHandler` (`@Named("financialAccount")` NeoHandler) with the new action endpoint:
  * `GET /financial-account/summary` → aggregates over the user's accessible orgs. SQL groups balances by `C_Currency_ID`. Pending counters call existing `FIN_Reconciliation` data.
* No new tables in this ticket.

**Out of scope:** functional kebab actions (T2), account creation/edit (T2), Matching rules navigation (T5), account detail view (T4), PSD2 wiring (T2).

### Test Cases

**Given** I am logged in as a user with multiple active financial accounts in different currencies
**When** I open `/finance/accounts`
**Then** the page lists every active account of my client / organizations with the correct name, type, masked IBAN and current balance.

**Given** my client has three EUR accounts and one USD account
**When** I open the Accounts page
**Then** the sidebar shows a total balance in EUR (sum of the EUR accounts) and a separate row for USD with its own total.

**Given** the type filter shows the dropdown options
**When** I select "Bank"
**Then** only accounts whose `Type` is Bank are rendered and the sidebar totals are recomputed for that subset.

**Given** an account row is visible in the list
**When** I click on the row (outside the kebab area)
**Then** the application navigates to `/financial-account/{id}`.

**Given** an account has 12 unreconciled bank statement lines
**When** the row is rendered
**Then** the "To reconcile" cell shows `Reconcile (12)` as a pill (button stays inert until T7 wires its action).

**Given** the header shows `+ New account` and `Matching rules` buttons
**When** I hover them
**Then** both remain disabled with a tooltip indicating they are part of a follow-up ticket.

---

## Task 2 — Implement offline account creation, edit and archive

**Title (Jira):** Implement offline account creation, edit and archive
**Type:** Story
**Parent epic:** ETP-3504
**Depends on:** T1
**Branch:** `feature/ETP-XXXX`
**Commit prefix:** `Feature ETP-XXXX:`

### Issue Description

* Deliver the **offline** account management flows accessible from the Accounts page: create accounts manually (no PSD2 connection), edit their general data, and archive them. The PSD2 wiring is deferred to T3 so this story stays small and PSD2 can be developed in parallel by the PSD2 module team.
* Enable the `+ New account` button on the Accounts page. Clicking it opens the New Account modal with a type picker limited to **Bank / Cash / Card**.
* Only the **"Sin conexión" (Without connection) tab is active** in this ticket; the "Con conexión" tab is visible but disabled, with a small badge that reads "Available in next iteration".
* Bank / Cash "Without connection" form: creates a `FIN_Financial_Account` manually (Name, IBAN, BIC/SWIFT, Currency, Accounting account). IBAN is validated client-side with the standard mod-97 algorithm.
* Enable the Edit account action in the row kebab: opens a modal with **general data only** (Internal name, Type, IBAN, Currency, Accounting account, Organization). A "Bank connection" section is rendered inside the modal but the entire section is disabled and shows a small "Available in next iteration" notice. The "Save changes" button submits only the general-data fields.
* Enable the Archive account action: soft-deletes the account (`IsActive='N'`) after confirmation. Archived accounts are hidden from the default Accounts list.
* Activate kebab actions: **Open account**, **Edit account**, **Archive account**. The PSD2-related entries (Edit PSD2 connection, Sync now, Manual statement import, Disconnect PSD2) stay disabled with tooltips pointing to T3.

### Solution Design

**Frontend (Schema Forge):**

* New `tools/app-shell/src/windows/custom/financial-account/NewAccountWizard.jsx` — modal with two steps: type picker (Bank / Cash / Card only) → form. For Bank, the form has two tabs: "Sin conexión" (active) and "Con conexión" (disabled placeholder with "Available in next iteration"). The Card type renders a minimal placeholder pointing to T3.
* New `tools/app-shell/src/windows/custom/financial-account/EditAccountModal.jsx` — modal with two sections: "Datos de la cuenta" (active) and "Conexión bancaria" (disabled placeholder). The header layout already matches the final Figma mockup so T3 can drop the live PSD2 panel in without re-layout.
* IBAN client-side validation via mod-97 checksum. Currency defaults to the user session currency. Accounting account uses the existing `C_ValidCombination` selector.
* Kebab actions wired through a shared hook `useAccountActions(account)` returning the bound handlers. Only `open`, `edit`, `archive` are exported in this ticket; `syncNow`, `manualImport`, `disconnect`, `editPsd2` are declared as stubs that throw a "Not implemented (T3)" error if called — they are not wired to any UI element here.
* Archive action shows a confirmation dialog before the POST.
* Vitest covers: form validation, happy submit, backend error surfacing, type picker behavior, archive confirmation dialog. "Con conexión" tab and PSD2 section are verified as disabled.

**Backend (com.etendoerp.go):**

* Extend `FinancialAccountHandler` (NeoHandler) with two action endpoints if not already present:
  * `POST /financial-account/{id}/action/archive` → set `IsActive='N'`. Reject with HTTP 409 if there are any open `FIN_Reconciliation` records for that account.
  * `GET /financial-account/{id}/defaults` → returns sensible defaults for the New Account form (`C_Currency_ID = @#C_Currency_ID@`, organization from session).
* Validation rule: account name unique per organization (returns HTTP 409 with the duplicate field surfaced inline).
* JUnit covers: archive rejection when reconciliations are open, duplicate-name validation, defaults endpoint.

**i18n:** new keys `finance.accounts.action.{open,edit,archive}`, `finance.accounts.new.*`, `finance.accounts.edit.*`. PSD2-specific labels are drafted but only activated in T3.

**Out of scope:** PSD2 / Salt Edge wiring (T3), credit-card PSD2 association (Jorge's separate work in the PSD2 module), detail view (T4).

### Test Cases

**Given** I am on the Accounts page and click `+ New account`
**When** I pick Bank and stay on the "Sin conexión" tab
**Then** the form shows fields Name, IBAN, BIC/SWIFT, Currency, Accounting account; submitting valid data creates the account and refreshes the list to include it with balance 0.

**Given** I am in the New Account modal with Bank selected
**When** I click the "Con conexión" tab
**Then** the tab stays inactive (cursor not-allowed) and surfaces a small "Available in next iteration" indicator — no PSD2 form is rendered.

**Given** I enter an invalid IBAN in the "Sin conexión" Bank form
**When** I press Save
**Then** the form shows an inline IBAN error and does not call the backend.

**Given** an organization already has an account named "Santander Operativa"
**When** I attempt to create another account with the same name in the same organization
**Then** the backend returns HTTP 409 and the modal surfaces the duplicate-name error inline.

**Given** I open the Edit Account modal for any account
**When** the modal renders
**Then** the "Datos de la cuenta" section is editable and "Conexión bancaria" is rendered as a disabled section with a small notice, no live PSD2 data is requested from the network.

**Given** I edit the Internal name and Accounting account of an existing account
**When** I press Save changes
**Then** the backend persists the new values and the row in the Accounts list reflects them immediately.

**Given** I click `Archive account` on an account with no open reconciliations
**When** I confirm the dialog
**Then** the account flips `IsActive='N'` and disappears from the default Accounts list.

**Given** I click `Archive account` on an account that has at least one open `FIN_Reconciliation`
**When** I confirm the dialog
**Then** the backend responds with HTTP 409, the UI surfaces a clear error message, and the account remains active.

**Given** I open the kebab on an account row
**When** I look at the PSD2-related entries (Edit PSD2 connection, Sync now, Manual statement import, Disconnect PSD2)
**Then** they are visible but disabled, with a tooltip indicating they are wired in T3.

---

## Task 3 — Wire PSD2 connection panel and Salt Edge integration into the Accounts UI

**Title (Jira):** Wire PSD2 connection panel and Salt Edge integration into the Accounts UI
**Type:** Story
**Parent epic:** ETP-3504
**Depends on:** T2, existing PSD2 module
**Branch:** `feature/ETP-XXXX`
**Commit prefix:** `Feature ETP-XXXX:`

### Issue Description

* Activate the PSD2 / Salt Edge flows in the Accounts UI built by T2. The PSD2 backend logic and the Salt Edge widget already exist in the dedicated PSD2 module — this story is **only frontend wiring**, no new backend code.
* Activate the **"Con conexión" tab** in the New Account modal for the Bank type. The tab embeds the existing PSD2 module's widget; on successful connect, the new `FIN_Financial_Account` is linked to the PSD2 connection automatically by that module.
* Activate the **"Conexión bancaria" section** inside the Edit Account modal (the disabled placeholder from T2). The live section shows: connection status, periodicity, auto-reconciliation mode, plus action buttons Re-authorize, Disconnect, Sync now — all consumed from the existing PSD2 module's APIs.
* Activate the remaining row-kebab actions on the Accounts page: **Edit PSD2 connection**, **Sync now**, **Manual statement import**, **Disconnect PSD2**. Each delegates to the corresponding endpoint of the PSD2 module.
* Render the **re-authorization warning** in the Edit Account modal when `AuthExpiresAt - now < 7 days` (a yellow banner with a "Re-autorizar" link that re-launches the widget in reconnect mode).
* Activate the Card flow in the New Account wizard once Jorge ships the credit-card PSD2 integration in the PSD2 module. If that work is not ready by the time T3 ships, the Card tile stays as a placeholder pointing to Jorge's ticket.

### Solution Design

**Frontend (Schema Forge):**

* In `NewAccountWizard.jsx` (from T2): replace the disabled "Con conexión" placeholder with the embedded PSD2 widget exported by the PSD2 module. The exact import path is resolved with the PSD2 module's maintainer; the wrapper receives `FIN_FinancialAccount_ID` (or null on creation) as the main prop and the resolved `customerId` from session.
* In `EditAccountModal.jsx` (from T2): replace the disabled "Conexión bancaria" placeholder with the live panel. The panel reads status / periodicity / `AuthExpiresAt` from the PSD2 module's GET endpoint and binds the action buttons to its POST endpoints.
* In `useAccountActions(account)` (from T2): replace the stubbed handlers (`syncNow`, `manualImport`, `disconnect`, `editPsd2`) with real implementations that call the PSD2 module's endpoints. Each handler shows a non-blocking toast on success and surfaces backend errors inline.
* The kebab entries that were disabled in T2 are now enabled and gated by `account.psd2.status` (e.g., `Disconnect PSD2` only enabled when status is `Connected` or `Expired`).
* Re-authorization banner: a small yellow strip rendered inside the Edit Account modal when the PSD2 module reports `daysUntilAuthExpires < 7`. Click on the link re-launches the widget in reconnect mode.
* Vitest covers: widget mounting with correct account id; each kebab action invoking the right PSD2 endpoint; re-auth warning rendering at the right threshold; status-driven enable/disable of each action.

**Backend:** none. This is a pure frontend integration story.

**i18n:** activate the PSD2-related keys drafted in T2 — `finance.psd2.*`, `finance.accounts.action.{syncNow,disconnectPSD2,editPSD2,manualImport}`.

**Out of scope:** new PSD2 backend logic, credit-card PSD2 association (Jorge's separate work), account detail view (T4).

### Test Cases

**Given** the PSD2 module is installed and configured with sandbox keys
**When** I open the New Account modal, choose Bank, and switch to the "Con conexión" tab
**Then** the existing PSD2 widget is mounted inside the tab and follows its own sandbox flow up to successful connect.

**Given** I complete the PSD2 connect flow successfully
**When** the widget closes
**Then** a new `FIN_Financial_Account` linked to the PSD2 connection appears in the Accounts list with status "Connected".

**Given** I open the Edit Account modal for an account whose PSD2 connection is active
**When** the modal renders
**Then** the "Conexión bancaria" section shows the current status, periodicity, and the Re-autorizar / Desconectar / Sincronizar buttons are all enabled.

**Given** I open the Edit Account modal for an account whose `AuthExpiresAt` is within 7 days
**When** the modal renders
**Then** a yellow re-authorization banner is visible with a "Re-autorizar" link that, when clicked, opens the PSD2 widget in reconnect mode.

**Given** I open the kebab on an account row with an active PSD2 connection
**When** I select `Sincronizar ahora`
**Then** the PSD2 module's sync endpoint is invoked, a non-blocking toast surfaces the sync status, and the Accounts list refreshes any balance changes.

**Given** I open the kebab on an account row with an active PSD2 connection
**When** I select `Desconectar PSD2` and confirm the dialog
**Then** the PSD2 module's disconnect endpoint is invoked, the connection status flips to `Disconnected`, and the account itself stays in the list (`IsActive='Y'`).

**Given** I open the kebab on an account row whose PSD2 connection is `Disconnected`
**When** I look at the PSD2-related entries
**Then** `Sincronizar ahora` and `Desconectar PSD2` are disabled, while `Editar conexión PSD2` is enabled and re-opens the connection widget.

**Given** the PSD2 endpoint returns an error (e.g., expired authorization)
**When** I click `Sincronizar ahora`
**Then** the UI surfaces a clear error message inline and the account row stays unchanged.

---

## Task 4 — Build financial account detail view (Movements tab + placeholders)

**Title (Jira):** Build financial account detail view with Movements tab and placeholders
**Type:** Story
**Parent epic:** ETP-3504
**Depends on:** T1
**Branch:** `feature/ETP-XXXX`
**Commit prefix:** `Feature ETP-XXXX:`

### Issue Description

* Build the per-account detail view rendered at `/financial-account/{id}` with three tabs: Movements (default, fully functional), Reconciliation (placeholder, materialized in T6), Imported statements (placeholder, materialized in T9).
* Movements is the canonical list of `FIN_FinAcc_Transaction` for the selected account, redesigned per section 3 of the functional document: drop the legacy combined "Third party / Reconciliation" column in favor of separate Contact, Description, Status columns; remove the "Uncategorized" counter from the header.
* Account summary strip below the toolbar: IBAN (chunked in groups of 4, copy-to-clipboard), Total balance, Inflows (last 30 days), Outflows (last 30 days). The "Uncategorized" counter present in classic Etendo must NOT be shown.
* Toolbar filters (all functional, client-side over the loaded movements): status (8 backend search keys), date range (presets + custom range using the same picker as the grid views), type (BPD = Cobro / BPW = Pago), amount (manual min/max + inflows/outflows presets + clear), free-text search, `+ Nuevo movimiento` (visible + enabled, fires "coming soon" toast). Export button at the right of the tab strip.
* Status column uses the **8 real backend search keys** of `FIN_Payment.Status` (RPAP, RPAE, RPVOID, RPR, PPM, PWNC, RDNC, RPPC) mapped to 5 visual families (pending / voided / cleared / inTransit / executed). This supersedes the original Draft/Completed/Reconciled/Posted derivation — the derived helper is dropped in favor of the real values.
* Per-row kebab in Movements (visible on hover): `View detail` (active, toast), `Unreconcile` (disabled until T8), `Post` (disabled until T8).
* Imported Statements tab: placeholder ("Coming soon") in this ticket — the real listing of `FIN_Bank_Statement` + the file import flow is delivered by T9.
* Reconciliation tab: placeholder ("Coming in T6") — materialized by T6.

### Solution Design

**Schema Forge:**

* New artifact `artifacts/financial-account/` with `decisions.json` v2 declaring `layoutType: "custom"`. Whitelisted as `CUSTOM_ONLY` in `cli/src/validate-pipeline.js` (no contract pipeline).
* New custom window `tools/app-shell/src/windows/custom/financial-account/index.jsx` rendering a local Tabs strip (UI-driven, not AD tabs), registered in `tools/app-shell/src/windows/registry.js`.
* Tab components under `tools/app-shell/src/windows/custom/financial-account/`:
  * `MovimientosTab.jsx` — orchestrates filters + `AccountSummaryStrip` + `MovementsTable`; runs `applyFilters` client-side over the movement list returned by the hook.
  * `MovementsTable.jsx` — header + rows / skeleton / empty-state via a `renderBody` helper, hover with elevation shadow, locale-aware date column, signed-amount colors.
  * `AccountSummaryStrip.jsx` — IBAN chunked with copy button + 3 KPI sections (flex-1 each).
  * `MovementStatusBadge.jsx` + `movementStatusConfig.js` — 8 status chips mapped to 5 color families.
  * `PostingStatusDot.jsx` — provisional posted/not-posted dot derived from `paymentStatus === 'RPPC'`.
  * `MovementRowKebab.jsx` — on-hover kebab with the 3 actions.
  * `MovementsToolbar/` — back arrow + 4 filters + search + new-movement button.
  * `ReconciliacionTab.jsx`, `ExtractosImportadosTab.jsx` — placeholders.
* New reusable primitives introduced (used by this window but generic):
  * `components/ui/tabs.jsx` — manual Tabs primitive (no Radix react-tabs); context value memoised.
  * `components/ui/money-amount.jsx` — `Intl.NumberFormat` + sign prefix + tone colors.
  * `components/ui/date-range-popover.jsx` — split into `DateRangePopover` (wrapper with default trigger) and `DateRangePopoverContent` (reusable inner panel). `ListFilterBar` from `contract-ui` is refactored to consume the same content.
  * `components/ui/distinct-values-filter.jsx` — Popover-wrapped `DistinctValuesList` for in-memory fixed code lists; consumed by Status and Type filters.
* New hooks:
  * `hooks/useNeoResource.js` — generic NEO fetch with auth + abort + timeout. Returns `{ data, loading, error, reload }`.
  * `hooks/useFinancialAccount.js` — thin wrapper over `useNeoResource`. Uses `/sws/neo/financial-accounts-page` + client-side filter by id (shortcut; a dedicated by-id endpoint is a follow-up).
  * `hooks/useAccountMovements.js` — thin wrapper over `useNeoResource`. Hits `/sws/neo/financial-account-transactions?FIN_Financial_Account_ID={id}`.

**Backend:**

* New NEO handler `FinancialAccountTransactionsHandler.java` (CDI `@Named("financial-account-transactions")`) under `com.etendoerp.go`. Queries `FIN_Finacc_Transaction` joined with `FIN_Financial_Account`, `C_Currency`, `FIN_Payment`, `C_BPartner` (resolved from the transaction or its parent payment). Computes a per-row running balance anchored to `FIN_Financial_Account.currentbalance` (window function). Returns `transactions` array + `totals` object with current balance, 30-day inflows, 30-day outflows, currency. The 30-day cutoff is computed in Java via `Instant.now().minus(30, ChronoUnit.DAYS)` and bound as a `Timestamp` parameter so the query stays portable across PostgreSQL and Oracle.
* Spec + entity records registered in `src-db/database/sourcedata/ETGO_SF_SPEC.xml` and `ETGO_SF_ENTITY.xml` so they survive `update.database`.
* The dedicated by-id endpoint for `FIN_Financial_Account` is **not** in scope of this ticket; the front-end uses the existing list endpoint and filters by id. Promoting that to a dedicated endpoint is a follow-up.

**i18n:** new keys prefixed `financeAccountDetail*` and `financeAccountMovements*` in both `en_US.json` and `es_ES.json` (tabs, KPIs, filters, status labels, column headers, kebab actions, IBAN-copy toast, empty state, aria labels).

**Out of scope:**

* Reconciliation tab body — delivered by **T6**.
* Imported Statements tab body and the file import flow — delivered by **T9**.
* `+ Nuevo movimiento` real action — delivered by **T8**.
* Functional `Unreconcile` / `Post` kebab actions — delivered by **T8**.
* Real bank logos (uses generic `AccountLogoAvatar`).
* Server-side filtering for movements (filters are applied client-side over the loaded list).

### Test Cases

**Given** I click an account row on the Accounts page
**When** the detail view loads
**Then** the topbar shows the account name as title and `Finanzas / Cuentas / {accountName}` as breadcrumb; tabs Movements / Reconciliation / Imported statements are visible; Movements is selected by default.

**Given** the Movements tab is active for an account with 50 transactions
**When** the page finishes loading
**Then** the summary strip shows IBAN (chunked) + Total balance + Inflows (30d) + Outflows (30d), and the table lists the 50 transactions with columns Date / Document / Contact / Description / Status / Type / Amount / Balance / kebab — without an "Uncategorized" counter and without a combined "Third party / Reconciliation" column.

**Given** I open the Status filter dropdown
**When** I type "Conciliado" in the search box and pick the only matching option
**Then** the table only renders movements whose `paymentStatus` matches the chosen search key; the trigger button label updates to the selected status.

**Given** I open the Type filter and pick "Cobro"
**When** the filter is applied
**Then** only movements with `trxType === 'BPD'` are rendered.

**Given** I open the Amount filter and fill `Mín = 0` with `Máx` empty
**When** I click Apply
**Then** only movements with `amount >= 0` are rendered (signed comparison — inflows only).

**Given** I type `1000016` in the search box
**When** the input debounces
**Then** the table renders only the movement whose `documentNo`, `contact` or `description` contains the substring.

**Given** I click the IBAN copy button in the summary strip
**When** the clipboard write resolves
**Then** the IBAN (without spaces) is copied and a green "IBAN copied" toast appears.

**Given** I hover a row in the Movements table
**When** the kebab opens
**Then** "View detail" is active (toast on click), and "Unreconcile" / "Post" are disabled with their tooltips referencing T8.

**Given** I switch to the Reconciliation or the Imported statements tab
**When** the tab loads
**Then** an empty state is rendered referencing the pending implementation (T6 / T9 respectively).

**Given** I click the back arrow in the Movements toolbar
**When** the navigation completes
**Then** the URL returns to `/finance/accounts`.

---

## Task 5 — Deliver matching rules backend, AD window and Figma-aligned UI

**Title (Jira):** Deliver matching rules backend, AD window and Figma-aligned UI
**Type:** Story
**Parent epic:** ETP-3504
**Depends on:** T1
**Branch:** `feature/ETP-XXXX`
**Commit prefix:** `Feature ETP-XXXX:`

### Issue Description

* Deliver the Matching Rules catalog as a complete vertical slice: backend tables, AD window, NeoHandler, Schema Forge artifact, and the UI matching the Figma mockups in "PASANDO EN LIMPIO" (list + "New rule" modal).
* The engine that actually executes rules is part of T7. Rules persisted in this ticket are not yet evaluated — they are stored and listed so that T7 can pick them up.
* Enable the `Matching rules` button on the Accounts page so it navigates to the new rules screen at `/match-rule`.
* The list shows columns: Priority, Name, Affected account, Tolerance, Reconciliations (cached match count, read-only), Active (inline toggle). A banner reminds the user that rules are evaluated in ascending priority order.
* The "New rule" modal mirrors the screenshot in section 6.2 of the functional document: Name, Text condition (Contains / Starts with / Regex) + Pattern, Transaction type, Accounting account, Default third party (optional), Amount tolerance, Priority, Applies to (specific account / all), Dimensions (up to 3 stackable dropdowns), Create transaction automatically toggle.
* Inline editing on the list: Active toggle and Priority field perform a PATCH and re-sort the table.

### Solution Design

**Database (new module `com.etendoerp.bankreconciliation`):**

* Create the new runtime module `com.etendoerp.bankreconciliation` (sibling of `com.etendoerp.go`) using `/etendo:module`. AD_Module record generated with `make uuid`.
* New tables: `ETBR_MatchRule`, `ETBR_MatchRule_Dim`. Schemas documented in section 5.1 of the implementation plan. Every UUID generated with `make uuid`.
* Add a new AD_Window with its tabs and fields via the `/etendo:alter-db` webhooks.
* Run `./gradlew update.database` and commit the generated XML.

**Backend (NEO Headless):**

* Schema Forge artifact `artifacts/match-rule/` with `decisions.json` v2; spec registered via `push-to-neo`.
* New `MatchRuleHandler implements NeoHandler` (`@Named("matchRule")`) responsible for:
  * Validating `TextPattern`: when `TextCondition='R'`, compile the pattern with a timeout cap of 200 ms to reject pathological regexes. Reject on compile error (HTTP 400).
  * Validating `Priority` uniqueness within scope (per `FIN_FinancialAccount_ID` or "all accounts"). Reject duplicates with HTTP 409.
  * Returning `Priority = (current max + 10)` on `GET /match-rule/defaults`.
  * The `ETBR_MatchCount` field is read-only and exposed for display; T7 increments it when suggestions are accepted.
* JUnit covering text condition modes (`C` Contains, `S` Starts with, `R` Regex), priority validation, dimension persistence (1..3 rows), regex timeout enforcement.

**Frontend (Schema Forge):**

* Enable the navigation from the Accounts page's `Matching rules` button.
* Custom `tools/app-shell/src/windows/custom/match-rule/MatchRuleTable.jsx` with the inline Priority cell and Active toggle. Toggle calls `PATCH /match-rule/{id}` with `{ IsActive: 'Y' | 'N' }`. Inline Priority edit triggers an optimistic re-sort and a PATCH.
* Custom `tools/app-shell/src/windows/custom/match-rule/NewRuleModal.jsx` matching the screenshot in the functional document, mounted as the create flow on the list page.
* Dimensions section renders up to 3 dropdown rows; data persists via the sub-collection POST `/match-rule/{id}/dimensions`.
* Vitest covers the modal validations, full payload submission, inline edit behavior, and Active toggle.

**i18n:** new keys `finance.rules.*` in English and Spanish.

**Out of scope:** rule evaluation against bank statement lines (T7); automatic creation of `FIN_FinAcc_Transaction` from a rule (T7); cross-account rule conflict resolution UX beyond a basic 409 error.

### Test Cases

**Given** I navigate to the Matching Rules screen for the first time
**When** the page loads
**Then** the list is empty, a banner explains the ascending-priority evaluation order, and a `+ New rule` button is visible.

**Given** I open the New Rule modal and fill in a valid rule (Name = "Bank fees", condition Contains "COMMISSION", type Bank fee, accounting account, tolerance 0%, priority 10, applies to "All accounts", create transaction automatically = Y)
**When** I save
**Then** the rule is persisted in `ETBR_MatchRule`, the list refreshes and the new row appears sorted by ascending priority.

**Given** a rule with priority 10 already exists for "All accounts"
**When** I attempt to create another rule with priority 10 in the same scope
**Then** the backend returns HTTP 409 and the modal surfaces the duplicate-priority error inline.

**Given** I open the New Rule modal, set Text condition = Regex, and enter the pattern `[unclosed`
**When** I save
**Then** the backend rejects with HTTP 400 mentioning the regex compilation failure; the modal stays open with the error visible.

**Given** I select Text condition = Regex with a pathologically catastrophic pattern (e.g., `(a+)+b` against a long input)
**When** the validator runs
**Then** the compilation timeout fires and the rule is rejected with a clear error.

**Given** I add three dimension rows in the modal (Project A, Cost center 1, Campaign Q1) and save
**When** the rule is re-opened
**Then** the dimensions persist and re-render in the same order from `ETBR_MatchRule_Dim`.

**Given** an active rule is listed
**When** I toggle the Active switch off
**Then** `PATCH /match-rule/{id}` is called with `IsActive='N'` and the row is visually muted but stays in the list.

**Given** rules exist with priorities 5, 10 and 20
**When** I edit the Priority cell of the priority-20 rule to 1
**Then** the row jumps to the top and the list re-sorts in ascending priority order.

---

## Task 6 — Implement manual reconciliation split panel and reconcile handler

**Title (Jira):** Implement manual reconciliation split panel and reconcile handler
**Type:** Story
**Parent epic:** ETP-3504
**Depends on:** T4
**Branch:** `feature/ETP-XXXX`
**Commit prefix:** `Feature ETP-XXXX:`

### Issue Description

* Materialize the Reconciliation tab on the financial account detail view with the 50/50 split panel as described in section 5 and the "PASANDO EN LIMPIO" Figma mockups of the functional document. This is the most sensitive ticket in the module — it must wrap the standard Etendo reconciliation flow without reimplementing it.
* Left panel: unreconciled `FIN_Bank_Statement_Line` records for the current account, pre-filtered "Pending / Last 12 months", filterable by status, date, amount, and free-text search.
* Right panel: unreconciled system candidates (`FIN_FinAcc_Transaction`, `C_Invoice`, `FIN_Payment`), filterable by document type via a dropdown with options Sale invoice, Sale ticket, Sale credit notes, Bank deposit, Customer collections, Purchase invoice, Purchase ticket, Payroll, Purchase credit notes, Outgoing payments.
* Clicking a left-panel row highlights candidate matches on the right (suggested via the standard Etendo algorithm) and shows the selected extract metadata in a header above the right panel.
* Bottom action bar: Documents selected total, Remaining to reconcile, buttons Transfer, New document, Reconcile.
* The Reconcile button persists the match by calling the standard Etendo reconciliation flow (`FIN_BankStatementHandler.processStatementLine` and friends). The new module never reimplements that logic — it composes on top.
* When the user selects already-reconciled lines, the Reconcile button label and behavior switch to "Reactivate". The handler for Reactivate is wired in T8; this ticket only handles the label/state machine.
* The Automatch button at the top right of the panel stays disabled in this ticket; T7 enables it.

### Solution Design

**Frontend (shared component):**

* New shared component `tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx`. Generic enough to back any "match A vs B" UX in the future; the financial account window passes the dataset configuration.
* Resizable 50/50 layout (min 30% each side). Two `DataTable` instances side-by-side, each with its own filter row.
* Status colors per row: Pending (gray), Reconciled (green), Suggested (blue), By rule (yellow, T7), With difference (red).
* Bottom action bar reads selection state from both panels; computes `Documents selected` and `Remaining to reconcile`.
* Reconcile button disabled when `selectedExtract.amount !== sum(selectedOperations.amount)` and no difference handling is allowed by configuration. Difference rules documented in section 11 of the implementation plan.
* `ReconciliacionTab.jsx` placeholder (introduced in T4) is replaced by the real implementation here.
* `+ New document` reuses the existing Etendo "Create payment" flow for the selected extract amount. `Transfer` opens the existing internal-transfer process. No new business logic.
* Vitest unit-covers the component (selection, totals, disabled states).

**Backend (com.etendoerp.go):**

* Extend `ReconciliationHandler` (`@Named("bankReconciliation")` NeoHandler) with a new action endpoint:
  * `POST /reconciliation/action/reconcileGroup` accepting `{ financialAccountId, statementLineId, operationIds: [...] }`.
  * The handler builds the `FIN_Reconciliation` / `FIN_Reconciliation_Line` rows by calling existing standard Etendo services (`FIN_BankStatementHandler`, `FIN_AddPayment`). No business logic is reimplemented.
  * Validation: all operations must belong to the same financial account; sum must match the extract amount within the configured tolerance.
  * Returns the new `FIN_Reconciliation_Line` ids and the updated balances.
* JUnit + OBBaseTest coverage for: 1:1 happy path, 1:N exact sum, 1:N with rounding tolerance, mismatched accounts (reject), already-reconciled lines (reject), period closed (reject).

**i18n:** new keys `finance.reconcile.*` in English and Spanish.

**Security:** Vigia security review mandatory — this is the first ticket to mutate money-related entities through the new UI surface.

**Out of scope:** Automatch popup (T7), rule-based suggestions (T7), deferred posting (T8), Reactivate execution (T8).

### Test Cases

**Given** an account has five unreconciled bank statement lines from the last 12 months
**When** I open the Reconciliation tab
**Then** the left panel shows the five lines pre-filtered "Pending / Last 12 months" and the right panel shows the unreconciled system operations with the type filter set to "Any".

**Given** I click an extract line of `-500,00 €`
**When** the click registers
**Then** the right-panel header shows that extract's date, description and amount in red; candidate matches are highlighted.

**Given** I select one extract line of `-500,00 €` and one system payment of `-500,00 €`
**When** the selection updates
**Then** the bottom bar shows `Documents selected: -500,00 €`, `Remaining to reconcile: 0,00 €`, and the Reconcile button is enabled.

**Given** I select one extract line of `-500,00 €` and two payments summing `-400,00 €`
**When** the selection updates
**Then** the bottom bar shows `Remaining to reconcile: -100,00 €` and the Reconcile button is disabled (until difference handling is offered).

**Given** the right panel type dropdown is set to "Sale invoice"
**When** the filter applies
**Then** only candidates of that document type are listed.

**Given** I press Reconcile on a valid 1:N match
**When** the request completes
**Then** the backend persists the `FIN_Reconciliation_Line` rows via the standard Etendo flow, both selected items disappear from the unreconciled lists, and a success toast confirms the operation.

**Given** I attempt to reconcile operations from two different financial accounts (possible only via API tampering)
**When** the request reaches the handler
**Then** the backend rejects with HTTP 400 and a clear error message.

**Given** I select already-reconciled lines
**When** the selection updates
**Then** the Reconcile button label switches to Reactivate and stays disabled (its handler is wired in T8).

---

## Task 7 — Implement suggested automatic reconciliation popup with rules engine

**Title (Jira):** Implement suggested automatic reconciliation popup with rules engine
**Type:** Story
**Parent epic:** ETP-3504
**Depends on:** T5, T6
**Branch:** `feature/ETP-XXXX`
**Commit prefix:** `Feature ETP-XXXX:`

### Issue Description

* Implement the "Suggested automatic reconciliation" popup triggered from the `Reconcile (N)` pill on the Accounts page and from the `Automatch` button inside the Reconciliation tab. The popup shows grouped 1:N suggestions and lets the user accept them in bulk.
* The automatch process wraps the standard Etendo matching algorithm and runs the new Match Rules engine as a second pass on lines the standard algorithm did not resolve (and that are not invoice-backed). Per section 6 of the functional document, rules never apply to invoice-backed lines.
* The popup body lists groups visually as quadrants — each group is one bank statement line + N candidate operations. Each group has a checkbox so the user can include / exclude it from the bulk reconcile.
* Rule-origin groups carry a `By rule {name}` badge and, when the rule has Create transaction automatically = Y, a `New` badge on the candidate (indicating the system will materialize the missing `FIN_FinAcc_Transaction`).
* Action buttons: Cancel, Open reconciliation (navigates to the Reconciliation tab with the same account preselected), Reconcile X groups (applies accepted groups).
* When a rule-origin group is accepted, the rule's `ETBR_MatchCount` counter is incremented so the Matching Rules list reflects accurate usage stats.
* The Automatch button in the Reconciliation tab (disabled in T6) is enabled here.

### Solution Design

**Backend (com.etendoerp.bankreconciliation):**

* New process `AutoMatchProcess.java`:
  * Step 1: invoke the standard Etendo matching algorithm on all unreconciled `FIN_Bank_Statement_Line` rows for the account.
  * Step 2: for unresolved lines that do NOT reference an invoice, invoke `ApplyMatchRulesProcess`.
  * Step 3: persist every produced candidate as an `ETBR_Match_Suggestion` row with `Origin` (`S` standard / `R` rule), `Confidence`, and a `GroupKey` linking the bank statement line to its candidates.
* New process `ApplyMatchRulesProcess.java`:
  * Iterate active `ETBR_MatchRule` rows in ascending priority.
  * Evaluate `TextCondition` / `TextPattern` against the bank statement line description, reference and counterparty fields.
  * If the rule's amount tolerance is satisfied (or no target transaction exists yet), produce a suggestion. First matching rule wins; later matches are returned as `alternatives[]` metadata.
  * If `CreateTransaction = Y` and no target transaction exists, materialize a `FIN_FinAcc_Transaction` using the rule's accounting account, third party, type and dimensions from `ETBR_MatchRule_Dim`. Tag it with `ETBR_AutoCreated_From_Rule = rule.id`.
* Two new action endpoints on `ReconciliationHandler`:
  * `POST /reconciliation/action/autoMatch?financialAccountId=...` runs the process and returns `{ groups: [{ groupKey, extractLine, candidates: [...], origin, confidence, ruleName?, isNew? }] }`.
  * `POST /reconciliation/action/applySuggestions` accepts `{ groupIds: [] }` and materializes the accepted groups, delegating to the same `reconcileGroup` path introduced in T6.
* JUnit covers at minimum: standard-only matches, mixed standard + rule, conflict between two rules with the same priority, rule with regex, rule with `CreateTransaction = Y`, invoice-backed line (must not be evaluated by rules), inactive rule (must be skipped), idempotent re-run on the same dataset.

**Frontend (shared component):**

* New shared component `tools/app-shell/src/components/contract-ui/AutoMatchSuggestionModal.jsx`. Renders the 1:N quadrants from the backend response.
* Per-group checkbox, top counter ("X of Y groups"), banner "Uncheck any group to exclude it".
* Badges per group: `By rule {name}` when origin = `R`; `New` badge on candidates that will be created.
* Bottom CTA: `Reconcile X groups`. On click → `POST /reconciliation/action/applySuggestions`. On success, the pill `Reconcile (N)` on the Accounts page decrements accordingly.
* Wired from two trigger points: Accounts page row pill, and the Automatch button on the Reconciliation tab (enabled in this ticket).
* Vitest + Playwright mocked spec (`e2e/tests/flows/bank-reconciliation-automatch.mocked.spec.js`) covering the happy flow.

**i18n:** new keys `finance.reconcile.suggested.*`.

**Security:** Vigia security review mandatory — second money-mutating surface.

**Out of scope:** deferred accounting (T8), Reactivate (T8), credit card support.

### Test Cases

**Given** an account has 10 unreconciled bank statement lines, all matching system payments by amount / date / reference
**When** I click `Reconcile (10)` on the Accounts page
**Then** the popup opens with 10 suggested groups, all checked by default, with origin = Standard.

**Given** the popup is open with 6 groups
**When** I uncheck two of them and click `Reconcile 4 groups`
**Then** only the 4 selected groups are persisted; the pill on the Accounts page now reads `Reconcile (6)`.

**Given** an active rule "Bank fees" with condition Contains "COMMISSION" + Create transaction automatically = Y exists
**When** I import an extract line "COMMISSION MAINT MAY" of `-3,50 €` and open the popup
**Then** the line appears as a separate group with the badge `By rule "Bank fees"` and a `New` candidate of `-3,50 €` pointing to the rule's accounting account.

**Given** a rule's `CreateTransaction = Y` group is accepted
**When** the apply request completes
**Then** a new `FIN_FinAcc_Transaction` is created with `ETBR_AutoCreated_From_Rule` set to the rule id, and the rule's `ETBR_MatchCount` is incremented by 1.

**Given** a bank statement line references an invoice (its reference matches a `C_Invoice` document number)
**When** the automatch process runs
**Then** that line is handled by the standard algorithm only; no rule is evaluated against it (verified by test).

**Given** a rule has `IsActive='N'`
**When** the automatch process runs
**Then** the inactive rule is skipped and no suggestion with its id is produced.

**Given** two rules with priorities 10 and 20 both match the same line
**When** the engine evaluates them
**Then** the priority-10 rule becomes the primary suggestion and the priority-20 rule is returned as an alternative in the group metadata.

**Given** the popup is open
**When** I click `Open reconciliation`
**Then** the application navigates to the Reconciliation tab of the financial account detail view, with the current account preselected and the same suggestions reflected in the right panel.

**Given** I run automatch twice in a row on the same dataset
**When** the second run completes
**Then** no duplicate `ETBR_Match_Suggestion` rows are created and accepted suggestions are not re-proposed.

---

## Task 8 — Add deferred accounting and reactivate reconciliation flow

**Title (Jira):** Add deferred accounting and reactivate reconciliation flow
**Type:** Story
**Parent epic:** ETP-3504
**Depends on:** T6
**Branch:** `feature/ETP-XXXX`
**Commit prefix:** `Feature ETP-XXXX:`

### Issue Description

* Implement the deferred accounting flow described in section 7 of the functional document: no transaction is posted until it reaches the Reconciled state, and posting happens either via a scheduled batch or via a manual button. Posted reconciliations cannot be unposted directly — they must go through Reactivate.
* Add the `ETBR_PostStatus` column to `FIN_Reconciliation_Line` (`P` Pending, `D` Done, `F` Failed) and enforce the state machine in the handler.
* Implement `PostReconciledProcess`: a batch that selects `Status=Reconciled` + `ETBR_PostStatus='P'` lines, groups them by reconciliation header, posts each header in its own OBDal transaction using the existing Etendo `AcctServer.post()`. All-or-nothing per header; errors mark the lines as `F` and the batch continues with the next header.
* Configure the scheduler with a configurable frequency (system preference `ETBR_PostFrequency`, default "Every hour"). Expose a manual `Post` button on the module configuration screen and in the Reconciliation tab kebab.
* Implement `ReactivateReconciliationProcess` as a thin wrapper that delegates to the existing "Reactivate Reconciliation" flow shipped by the Payment Removal module — never reimplement that logic.
* Wire Reactivate from two surfaces: the Reconciliation tab (T6 already prepared the `Reactivate` label) and the Movements tab kebab (`Unreconcile` on `P`, `Reactivate` on `D`).
* Enforce that Posted (`D`) lines cannot be mutated: updates to amount / date on the underlying `FIN_FinAcc_Transaction` must be rejected with HTTP 409.

### Solution Design

**Database (com.etendoerp.bankreconciliation):**

* Add `ETBR_PostStatus CHAR(1)` to `FIN_Reconciliation_Line` via the standard `modifiedTables/` XML mechanism. Default `P` for rows created by a reconcile action.
* New AD_Preference `ETBR_PostFrequency` (default `"Every hour"`), referenced by the scheduler.

**Backend processes:**

* `PostReconciledProcess.java`:
  * Select `FIN_Reconciliation_Line` where `ETBR_PostStatus='P'` and the parent header is `Reconciled`.
  * Group by `FIN_Reconciliation_ID` (one OBDal transaction per header).
  * For each line, call existing Etendo `AcctServer.post()` on the underlying `FIN_FinAcc_Transaction` / `FIN_Payment`.
  * On success → set `ETBR_PostStatus='D'`.
  * On error → roll back that header, mark its lines `F`, log the cause to `AD_Process_Log`, continue with the next header.
  * Scheduled by AD_Process_Schedule using `ETBR_PostFrequency`. Manual invocation calls the same process via an action endpoint.
* `ReactivateReconciliationProcess.java`:
  * Wraps the existing Payment Removal "Reactivate Reconciliation" flow. Behavior: un-post first when `D`, then un-reconcile, in a single OBDal transaction.
  * Refuse the operation when the accounting period is closed; surface a clear error.
* Extend `ReconciliationHandler` with action endpoints:
  * `POST /reconciliation/action/postReconciled` → runs PostReconciledProcess for the current account (or globally).
  * `POST /reconciliation/action/reactivate` → runs ReactivateReconciliationProcess for the supplied reconciliation line ids.
* State-machine enforcement also in `ReconciliationHandler.afterHandle()` for CRUD endpoints:
  * Reject `PUT/DELETE` on a `FIN_FinAcc_Transaction` whose corresponding `FIN_Reconciliation_Line.ETBR_PostStatus='D'` with HTTP 409.

**Frontend (Schema Forge):**

* Add a `Post` button on the module configuration screen (likely under `pages/SettingsPage.jsx` Finance section) and as a kebab option in the Reconciliation tab.
* Movements tab status derivation extended to differentiate `Reconciled` (`P`) vs `Posted` (`D`) visually (different chip color and label).
* Reconciliation tab: wire the `Reactivate` label (prepared in T6) to `POST /reconciliation/action/reactivate`. Confirmation modal warns about un-posting + un-reconciling.
* Movements tab kebab: `Unreconcile` (for `P` lines) and `Reactivate` (for `D` lines) both call the same endpoint; the handler resolves the action based on `ETBR_PostStatus`.
* Vitest + JUnit + OBBaseTest covering the cycle reconcile → post → reactivate → re-post.

**i18n:** new keys `finance.reconcile.action.post`, `finance.reconcile.action.reactivate`, `finance.reconcile.confirm.reactivate`.

**Security:** Vigia security review mandatory — closes the loop on money-mutating operations.

**Out of scope:** complex multi-currency posting; advanced period-close rules beyond the existing Etendo behavior; manual unposting outside of Reactivate (intentionally disallowed by design).

### Test Cases

**Given** I reconcile a bank statement line against a payment in the Reconciliation tab
**When** the operation completes
**Then** the resulting `FIN_Reconciliation_Line` has `Status=Reconciled` and `ETBR_PostStatus='P'`, and the Movements tab shows the related transaction as "Reconciled" (not Posted).

**Given** at least one `FIN_Reconciliation_Line` is in `ETBR_PostStatus='P'`
**When** I click the manual `Post` button
**Then** `PostReconciledProcess` runs, the line is posted via standard Etendo accounting, `ETBR_PostStatus` flips to `D`, and the Movements tab shows "Posted".

**Given** the AD_Preference `ETBR_PostFrequency` is set to "Every hour"
**When** the scheduler tick fires
**Then** all pending lines for all accounts are processed automatically without user interaction.

**Given** a posting fails for one reconciliation header (e.g., missing accounting configuration)
**When** the batch runs
**Then** that header's lines are marked `F`, an error entry is written to `AD_Process_Log`, and the next header is processed normally — the batch does not abort.

**Given** a posted (`D`) reconciliation line exists
**When** a `PUT` is attempted on its underlying `FIN_FinAcc_Transaction` to change the amount
**Then** the backend returns HTTP 409 with a clear "Posted transactions are immutable" message.

**Given** a posted (`D`) reconciliation line exists
**When** I select it in the Reconciliation tab and click `Reactivate`
**Then** a confirmation modal appears; on confirm, the entry is unposted then unreconciled atomically, the underlying transaction returns to Completed, and the line disappears from the reconciliation.

**Given** the accounting period of a posted line is closed
**When** I attempt to Reactivate it
**Then** the backend rejects the operation with a clear error referencing the closed period; the line stays posted.

**Given** a reconciled-only (`P`) line exists
**When** I open its kebab in the Movements tab and click `Unreconcile`
**Then** the same reactivate flow is invoked; the line returns to Completed and disappears from any active reconciliation.

**Given** I reactivate a posted line and then re-reconcile + re-post it
**When** the cycle completes
**Then** the resulting accounting entries are identical to the originals (idempotency confirmed) and no duplicates exist.

---

## Task 9 — Build Imported Bank Statements view with file import flow

**Title (Jira):** Build Imported Bank Statements view with file import flow
**Type:** Story
**Parent epic:** ETP-3504
**Depends on:** T4
**Branch:** `feature/ETP-XXXX`
**Commit prefix:** `Feature ETP-XXXX:`

### Issue Description

* Replace the "Coming soon" placeholder in the `/financial-account/{id}` Imported Statements tab with a read-only listing of `FIN_Bank_Statement` filtered to the current account.
* Add an `Importar extracto` action that triggers a file upload flow for bank statement files (`.mt940`, `.ofx`, `.csv`), showing parser progress and per-line outcome.
* Display per-statement progress (matched lines vs total lines) as a circular indicator, plus a status badge (`Completado` / `Con incidencias` / `En curso`) derived from `processed` + `posted` + the presence of unmatched `fin_bankstatementline` rows.
* Columns (per-account scope): Archivo, Datos, Periodo, Líneas, Progreso, Estado, Importado. The cross-account variant of the view (under `/finance/accounts` with a `Cuenta` column) stays out of scope and would be a separate story.

### Solution Design

**Schema Forge:**

* New hook `useBankStatements(accountId)` consuming the shared `useNeoResource` hook (same pattern as `useAccountMovements`).
* Replace `tools/app-shell/src/windows/custom/financial-account/ExtractosImportadosTab.jsx` placeholder with a real component: toolbar (date range reusing `DateRangePopover` + status filter reusing `DistinctValuesFilter` + search + `Importar extracto` button) plus a new `StatementsTable.jsx` mirroring the `MovementsTable` skeleton/empty/renderBody pattern.
* New reusable primitive `components/ui/progress-ring.jsx` — SVG circular indicator with `value` (0–100) and `size` props. No equivalent exists in the repo.
* New `StatementStatusBadge.jsx` in the financial-account window (analogous to `MovementStatusBadge` but with the imported-statements palette: green / orange / yellow).
* New `UploadStatementDialog.jsx` modal — drag-and-drop + native file input + per-upload progress + success / error toasts.
* Update `index.jsx` to call `useBankStatements(recordId)` and pass `statements.length` to `DetailTabs` as `statementsCount` (replacing the hardcoded `0`).

**Backend:**

* New `BankStatementsListHandler.java` (CDI `@Named("bank-statements-by-account")`) following the `FinancialAccountTransactionsHandler` pattern. Query against `fin_bankstatement` joined with a subquery counting `fin_bankstatementline` (total + matched) for each statement. Filter by `fin_financial_account_id` and `isactive='Y'`. Order by `importdate DESC`.
* Register the spec + entity records in `src-db/database/sourcedata/ETGO_SF_SPEC.xml` and `ETGO_SF_ENTITY.xml` (`spec_type='R'`, `java_qualifier='bank-statements-by-account'`). Generate UUIDs with `make uuid`.
* New upload endpoint (separate handler): accepts multipart POST with file payload, delegates parsing to an existing Etendo Classic process if available, otherwise to a new parser. Returns the new `fin_bankstatement` id + parser summary.

**i18n:** new keys prefixed `financeAccountDetailStatements*` in both `en_US.json` and `es_ES.json` for column headers, status badges, upload dialog and the empty state.

**Discovery items to resolve before implementation:**

1. **Status mapping**: `FIN_Bank_Statement` exposes `processed` (Y/N) and `posted` (Y/N) but no `docstatus`. Confirm with product the exact rule for `Completado` / `Con incidencias` / `En curso`.
2. **"Datos" column**: confirm with Figma / product what value this column shows (IBAN of origin? statement reference number?).
3. **"Progreso" semantics**: confirm whether the % is "lines matched to transactions" or "lines reconciled".
4. **Upload formats**: confirm accepted extensions and whether parsing reuses existing Classic processes or a new Java parser.

**Out of scope:** cross-account variant of the view; editing / deleting imported statements; re-running the import process on an existing statement; drill-down into a statement's `fin_bankstatementline` rows.

### Test Cases

**Given** I am on `/financial-account/{id}` for an account with imported statements
**When** I click the `Extractos importados` tab
**Then** the table renders with columns Archivo / Datos / Periodo / Líneas / Progreso / Estado / Importado, populated with the rows for that account ordered by `importdate` descending.

**Given** a statement has 10 lines, 7 matched and 3 unmatched
**When** the row renders
**Then** the Progreso column shows a circular ring at 70% with the "70%" label.

**Given** a statement has `processed=Y AND posted=Y`
**When** the row renders
**Then** the Estado badge shows `Completado` with green tone.

**Given** a statement has `processed=N`
**When** the row renders
**Then** the Estado badge shows `En curso` with yellow tone.

**Given** a statement has `processed=Y` but unmatched lines
**When** the row renders
**Then** the Estado badge shows `Con incidencias` with orange tone.

**Given** I click `Importar extracto`
**When** the dialog opens
**Then** I see a dropzone, I can drag an `.mt940` file and clicking `Importar` posts it to the backend; on success a toast confirms and the new statement appears at the top of the table.

**Given** I upload a file with an unsupported extension
**When** I trigger the import
**Then** an error toast describes the issue and the dialog stays open so I can retry with another file.

---

## Task 10 — Make financial accounts agentic via a NEO Headless write spec

**Title (Jira):** Make financial accounts agentic via a NEO Headless write spec
**Type:** Story
**Parent epic:** ETP-3504
**Jira:** ETP-4239
**Depends on:** T2
**Branch:** `feature/ETP-4239`
**Commit prefix:** `Feature ETP-4239:`
**Labels:** `cross-domain-approved` (touches schema_forge + com.etendoerp.go)

### Issue Description

* An MCP agent **cannot create or list financial accounts** (`FIN_Financial_Account`) today: an agenticity evaluator scored it 0/5. The create capability **already exists** (`FinancialAccountHandler`, ETP-4096, used by the SPA wizard), but the `financial-account` spec is **type R (report/handler-backed)**, and NEO Headless only exposes the generic CRUD tools (`neo_list / neo_create / neo_schema / neo_defaults / neo_selectors`) for **type W** specs. Type R specs only get a `generate_<spec>` tool, which itself fails ("Report spec has no linked AD_Process").
* Convert the `financial-account` spec **in place from R to W** (one spec per table), following the pattern already validated with `match-rule`: **generic CRUD + a `NeoHandler` hook** that validates and derives business fields.
* Outcome: an agent can **discover, list and create** financial accounts of the three types (Bank `B` / Cash `C` / Card `CA`) through the standard MCP tools, without losing the existing business logic (default matching algorithm, IBAN-derived country, name uniqueness, open-reconciliation guard on archive).
* The accounts SPA is **rewritten to standard CRUD** (no `?action=`), like `match-rule`, keeping the create wizard, edit and archive flows intact.

### Solution Design

**AD layer (com.etendoerp.go):**

* Create an **ETGO-owned AD window + tab** (`WINDOWTYPE=M`, no menu entry — "managed via the SPA") that **reference the existing core AD_TABLE** for `FIN_Financial_Account` (do NOT create a new table). Via `/etendo:window` + `export.database`.

**decisions / push pipeline (Schema Forge):**

* `artifacts/financial-account/decisions.json`: point extraction at the new ETGO window (single entity with `javaQualifier: "financial-account"`); classify `name/type/currency/iBAN/swiftCode` as editable and **`country` + `matchingAlgorithm` as readOnly (included)** so they survive `NeoFieldFilter`; add a `defaultExpr` for currency.
* Regenerate `schema-raw.json` + `contract.json` and run `push-to-neo` → the spec becomes `SPEC_TYPE=W` with an `ETGO_SF_ENTITY` (ISGET/ISPOST/ISDELETE) + one `ETGO_SF_FIELD` per column. Keep the artifact in `CUSTOM_ONLY_ARTIFACTS` (the hand-written workspace is not regenerated).

**Java hook (com.etendoerp.go):**

* Refactor `FinancialAccountHandler` (`@Named("financial-account")`) from an `?action=` router into a **pre/post hook** modeled on `MatchRuleHandler`:
  * **POST**: validate name (required / ≤60 / unique → 409) and currency; **mutate the request body** to inject `matchingAlgorithm` and `country` (IBAN-derived) **before** the insert (required by trigger `FIN_FINANCIAL_ACCOUNT_TRG2`); return `null` to continue to generic CRUD.
  * **PUT/PATCH**: name uniqueness + IBAN→country sync.
  * **DELETE**: open-reconciliation guard → 409; otherwise **soft-archive** (`IsActive='N'`).

**SPA (Schema Forge `tools/app-shell`):**

* Rewrite `hooks/useAccountMutations.js` to standard W CRUD: create `POST /sws/neo/financial-account/<entity>`, update `PUT …/{id}`, archive `DELETE …/{id}`; replace `fetchDefaults()` with `neo_selectors` (currencies) + `neo_defaults`.
* Update `NewAccountWizard / EditAccountModal / ArchiveAccountDialog / AccountFormStep` to the new field names (`currency`, `iBAN`) and response shape.

**Out of scope:** deferred accounting configuration of the account (`FIN_Financial_Account_Acct`), PSD2 connection, and the reconciliation rules engine (T7). The SPA aggregate list keeps using `financial-accounts-page` (unchanged).

### Test Cases

**Given** the `financial-account` spec was migrated to W
**When** an agent calls `neo_discover`
**Then** it appears as `specType=W` with one entity and GET/POST methods.

**Given** the entity is exposed
**When** the agent calls `neo_schema`
**Then** it returns the fields name/currency/type (with values B/C/CA)/iBAN/swiftCode, and `neo_selectors` lists currencies.

**Given** the agent wants to create a bank account with an IBAN
**When** it calls `neo_create` with name + currency + type=B + iBAN
**Then** the account is created (201), with the country auto-derived from the IBAN and the default matching algorithm (the trigger does not reject it).

**Given** the agent creates accounts of type C and CA
**When** it calls `neo_create` for each type
**Then** both are created correctly.

**Given** accounts already exist
**When** the agent calls `neo_list`
**Then** it returns them (included fields only).

**Given** an account with a given name already exists
**When** the agent tries to create another with the same name in the same org
**Then** it receives a 409 error.

**Given** an account with an open reconciliation
**When** a `DELETE` is issued against it
**Then** it is rejected with 409; an account with no open reconciliations is archived (`IsActive='N'`) and disappears from the active list.

**Given** the SPA was migrated to standard CRUD
**When** the user creates (incl. a bank account with IBAN), edits and archives an account from the UI
**Then** everything works via the new URLs and the workspace (Movements/Reconciliation/Statements) + the accounts list keep loading with no regression.

---

## Task 11 — Transfer funds between financial accounts

**Title (Jira):** Transfer funds between financial accounts
**Type:** Story
**Parent epic:** ETP-3504
**Jira:** ETP-4272
**Depends on:** T1, T4
**Branch:** `feature/ETP-4272`
**Commit prefix:** `Feature ETP-4272:`
**Labels:** `cross-domain-approved` (touches schema_forge + com.etendoerp.go)

### Issue Description

* Add a **"Transfer funds"** action that moves money between two financial accounts of the organization, reachable from two entry points: the **row kebab (⋮)** of each account in the Accounts list, and a **button in the action bar** of the account detail. In both cases the **source account is pre-filled (read-only)** with the account the action started from. This action takes the place of the (currently hidden) "New movement" button.
* **Form fields:** Source account (pre-filled, read-only); Destination account / *Deposit To* (required — other financial accounts of the org); GL Item (optional — charge the transfer to a chart-of-accounts item); Amount / *Deposit Amount* (required); Currency From (read-only, from the source account); Currency To (visible only when it differs — multi-currency transfers); Bank Fee (checkbox → enables a fee-amount field); Description (default "Funds Transfer Transaction").
* On confirm the system creates **two simultaneous, atomic transactions**: a withdrawal in the source account and a deposit in the destination account for the same amount. If Bank Fee is set, an additional expense transaction in the source account for the fee. Both transactions stay **Pending** until reconciled.
* **Guards:** cannot transfer to the same source account; cannot transfer an amount greater than the source account's available balance.

### Solution Design

**Backend (com.etendoerp.go):**
* Add a `transfer` action (POST) to `FinancialAccountTransactionsHandler` (`@Named("financial-account-transactions")`). It validates inputs (source ≠ destination, amount > 0, destination within the source's org tree, amount ≤ available balance) and **delegates to the Classic `FundsTransferActionHandler.createTransfer(...)`** (`modules_core/org.openbravo.advpaymentmngt`) — reuses the existing flow (source `BPW` + optional `BF` + target `BPD`, conversion-rate docs, processing → `PWNC`/`RDNC`, post-hooks) instead of reimplementing it. Multi-currency via `manualConversionRate` (system rate when not provided); GL Item optional (`null`); single bank fee → `bankFeeFrom`.

**Frontend (Schema Forge):**
* New single-step modal `FundsTransferModal.jsx` (reuses `@/components/ui/dialog` + `@/components/forms/fields`) and hook `useFundsTransfer.js` (POST `?action=transfer`).
* Entry points: add the action to `components/financial-accounts/AccountRowMenu.jsx` (list kebab) and replace the hidden New-Movement button in `windows/custom/financial-account/MovementsToolbar/index.jsx` (detail action bar).

**i18n:** new `financeAccountTransfer*` keys in both `en_US.json` and `es_ES.json`.

**Out of scope:** posting/accounting of the transfer beyond what Classic already does; bulk / multi-line transfers; a standalone transfers list.

### Test Cases

**Given** a financial account in the Accounts list
**When** the user opens its ⋮ menu
**Then** a "Transfer funds" option is present and opens the modal with that account pre-filled as the source (read-only).

**Given** the account detail
**When** the user looks at the action bar
**Then** a "Transfer funds" button is present.

**Given** the transfer modal
**When** the destination account has a different currency than the source
**Then** the Currency To field becomes visible (multi-currency); otherwise it stays hidden.

**Given** the Bank Fee checkbox
**When** it is checked
**Then** a fee-amount field appears and the fee is recorded as an extra expense transaction in the source account.

**Given** a valid transfer
**When** the user confirms
**Then** two transactions are created (withdrawal in source, deposit in destination) for the same amount, both Pending until reconciled.

**Given** the same account is chosen as source and destination
**When** the user tries to confirm
**Then** the transfer is rejected.

**Given** an amount greater than the source available balance
**When** the user tries to confirm
**Then** the transfer is rejected.

---

## PR conventions for every task (recap)

Each PR produced for any of T1–T11 must comply with the Etendo Git Police and the project policy:

* **Branch:** `feature/ETP-XXXX` (one branch per task, off `develop`).
* **Commit prefix:** `Feature ETP-XXXX: <description>` — first line ≤80 chars, English, imperative.
* **PR title:** `Feature ETP-XXXX: <description>` — no surrounding quotes.
* **PR target:** `develop`.
* **No `Co-Authored-By`** — Git Police rejects it.
* **PR description sections (mandatory):**
  * `## Summary` — 1–3 bullets of what changes and why.
  * `## Test plan` — checklist of QA steps.
  * `## Functional spec reference` — link to `Definicion_Funcional_Conciliacion_Bancaria.docx.pdf` plus the relevant section.
  * `## Out of scope` — what is intentionally left for follow-up tickets.
* **Pre-merge mandatory checks:**
  * Crisol (code review): APPROVED.
  * Unitas (unit tests): PASSED.
  * Vigia (security review): PASSED — critical on T2 (account creation), T3 (PSD2 credentials), T6, T7, T8 (money-mutating surfaces).
  * Argos (E2E): PASSED on user-facing tickets (T1, T2, T3, T4, T5, T6, T7, T8, T9, T11 — i.e. every user-facing ticket in this plan).
  * `make validate-pipeline` reports 0 violations for any ticket touching `artifacts/`.
* **i18n:** every new user-facing string must land in both `en_US.json` and `es_ES.json` before review.
* **Documentation:** `docs/generated-custom-windows/financial-account.md` and/or `match-rule.md` updated within the same PR when the ticket touches the corresponding window.
