# ETP-4272 — Funds Transfer between Financial Accounts

> Plan doc (active). Branch **`feature/ETP-4272`** (created from `feature/ETP-4102` in both repos).

## Context

New story (not in the original ETP-3504 task list). It adds the ability to transfer funds
between two financial accounts of the organization, reachable from two entry points, and
replacing the (currently hidden) "New Movement" button.

Key finding: **this flow already exists in Etendo Classic** as
`FundsTransferActionHandler.createTransfer(...)` — a `public static`, HTTP-decoupled method in
`modules_core/org.openbravo.advpaymentmngt`. It atomically creates the source withdrawal (BPW) +
optional bank fee (BF) + target deposit (BPD) (+ optional target BF), conversion-rate docs,
processes them (BPW→PWNC, BPD→RDNC = "Pendiente hasta conciliación"), and runs post-hooks.
**We reuse it** instead of reimplementing.

Decisions confirmed with the user:
- **Backend:** thin wrapper that validates then delegates to Classic `createTransfer(...)`.
- **Destination list:** all active accounts of the same org (org tree) except the source.
- **Multi-currency:** included (show Currency To + manual rate when currencies differ; else system rate).
- **GL Item:** optional (pass `null` when not chosen — verify `doTransactionProcess` accepts a null
  GL item; if it hard-requires one, fall back to the account's default GL item and note it).

Two repos share the branch: backend in `com.etendoerp.go`, frontend in `schema_forge`.

---

## Part 0 — Sync the two task docs (do FIRST, both mirrored)

The two planning docs are out of sync: EN has T1–T10 (total 10), ES has T1–T9 (total 9, missing the
agentic T10). Make them identical (T1–T11):

- **EN** `schema_forge/docs/plans/2026-05-21-bank-reconciliation-tasks.md`: add **T11** index row +
  full task section; bump `Total tasks:` 10 → 11.
- **ES** `Tareas_Conciliacion_Bancaria_ES.md`: backfill the missing **T10** (translate the EN "Make
  financial accounts agentic…" task — index row + body) AND add **T11** (Funds Transfer); bump
  `Total de tareas:` 9 → 11.

New task index rows (mirror existing pipe-table format with Front/Back/Est columns):
- EN: `| T11 | Transfer funds between financial accounts | T1, T4 | ✅ | ✅ | ~1 w |`
- ES: `| T11 | Transferir fondos entre cuentas financieras | T1, T4 | ✅ | ✅ | ~1 sem |`

New task body follows the existing per-task template (Title (Jira) / Type / Epic / Depends on /
Branch `feature/ETP-4272` / Commit prefix `Feature ETP-4272:` + Issue Description + Solution Design
[Frontend / Backend / i18n / Out of scope] + Test Cases in Given/When/Then). Content mirrors the Jira
description (two entry points, prefilled read-only source, the form-field table, atomic BPW+BPD,
optional bank fee, same-account guard, balance guard, multi-currency, default description "Funds
Transfer Transaction"), with the backend note: "reuses Classic
`FundsTransferActionHandler.createTransfer`". Both language versions carry the same content.

---

## Part 1 — Backend (`com.etendoerp.go`)

Add a new `transfer` action to the existing handler **`FinancialAccountTransactionsHandler`**
(`@Named("financial-account-transactions")`) — it already owns transaction creation, so no new
`ETGO_SF_ENTITY` / `Java_Qualifier` wiring is needed. File:
`modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/FinancialAccountTransactionsHandler.java`.

Routing: in `handle()`, add `POST` + `action=transfer` → `handleTransfer(context)`.

`handleTransfer(NeoContext)` (mirror the try / `OBContext.setAdminMode` / catch-`OBException`→400 /
`Exception`→500-`rollbackAndClose` / finally pattern from `ReconciliationHandler.handleReactivate`):
Body `{ sourceAccountId, destinationAccountId, amount, glItemId?, transferDate?, conversionRate?,
bankFee?(bool), bankFeeFrom?, bankFeeTo?, currencyToId?, description? }`.
1. Validate: source/dest present; `amount > 0`; `sourceAccountId != destinationAccountId`
   (→ "Source and destination must differ"); load both accounts (404 if missing); destination
   belongs to source's org tree.
2. **Balance guard:** compute source available balance (reuse the balance logic in
   `FinancialAccountsPageHandler`; extract a shared helper or replicate its SQL/HQL) and reject
   `amount > available` (→ 400).
3. Period guard: `createTransfer` / `doTransactionProcess` already enforce open period; surface its
   `OBException` as 400.
4. Resolve `GLItem` (nullable), `manualConversionRate` (null when same currency → core uses 1; else
   provided rate, or fall back to system rate), `bankFeeFrom`/`bankFeeTo` = the source/destination
   fees when `bankFee` is checked (else 0),
   `bankFeeTo = 0`, `description` default `"Funds Transfer Transaction"`.
5. Delegate: `FundsTransferActionHandler.createTransfer(date, from, to, glItem, amount,
   manualConversionRate, bankFeeFrom, bankFeeTo, description)` (the **9-arg** overload — the 8-arg one
   self-recurses in Classic; avoid it).
6. Return `NeoResponse.createdWithData({ transferred:true, ... })`. Let the servlet commit (same as
   the reconcile flow).

Reuse, do not reimplement: `FundsTransferActionHandler`
(`modules_core/org.openbravo.advpaymentmngt/.../actionHandler/FundsTransferActionHandler.java`)
handles BPW/BPD/BF creation, line numbers, conversion-rate docs, processing, hooks. Seams to add for
tests: `loadAccount(id)`, `availableBalance(account)`, and a package-private `doTransfer(...)`
wrapping the static call.

Tests: `modules/com.etendoerp.go/src-test/.../FinancialAccountTransactionsHandlerTest.java`
(JUnit4 + Mockito spy; `mockStatic(FundsTransferActionHandler)` + `mockStatic(OBDal)`): happy path
delegates with correct args; 400 same-account; 400 amount ≤ 0; 400 amount > balance; 404 missing
account; multi-currency passes `manualConversionRate`; bank fee maps to `bankFeeFrom`; error →
`rollbackAndClose`. Do NOT run the tests (the user runs them).

---

## Part 2 — Frontend (`schema_forge`, `tools/app-shell`)

These are custom-layout windows; components are hand-written under `tools/app-shell` and are **not**
regenerated by the pipeline, so no `decisions.json` / `make regen` change is required (verify no
generated artifact references the New-Movement button).

1. **Modal** `tools/app-shell/src/windows/custom/financial-account/FundsTransferModal.jsx` (reuse
   shared Dialog primitives + `LookupPicker.jsx` for account / GL-item selectors, like
   `EditAccountModal` / `NewMovementWizard`):
   - Source account: prefilled + read-only.
   - Destination (Deposit To): selector of org accounts except source.
   - GL Item: optional selector.
   - Amount: required; client guard amount ≤ available balance.
   - Currency From: read-only, from source.
   - Currency To: shown only when destination currency ≠ source; multi-currency rate field when applicable.
   - Bank Fee: checkbox → reveals source + destination fee fields (mirrors Classic).
   - Description: default "Funds Transfer Transaction".
   - On confirm → POST `?action=transfer`; success → toast + refresh; error → inline.
2. **Hook** `tools/app-shell/src/hooks/useFundsTransfer.js` (analogous to `useReconciliation`'s
   `useNeoPost`): `{ transfer, loading, error }` posting to the `financial-account-transactions` spec
   with `action=transfer`.
3. **Entry point A — list kebab:** `tools/app-shell/src/components/financial-accounts/AccountRowMenu.jsx`
   → add "Transferir fondos" item that opens the modal with that row's account as source. Wire
   open-state in `pages/FinancialAccountsPage.jsx`.
4. **Entry point B — detail action bar:**
   `tools/app-shell/src/windows/custom/financial-account/MovementsToolbar/index.jsx` → replace the
   `SHOW_NEW_MOVEMENT`-gated "New movement" button with a "Transferir fondos" button (source =
   current account). Leave the `NewMovementWizard` files dormant; repurpose the button slot.
5. **i18n** `packages/app-shell-core/src/locales/{en_US,es_ES}.json` (both, same keys) — follow
   `financeAccount*` convention: `financeAccountTransferAction`, `…Title`, `…Source`, `…Destination`,
   `…GlItem`, `…Amount`, `…CurrencyFrom`, `…CurrencyTo`, `…Rate`, `…BankFee`, `…BankFeeAmount`,
   `…Description`, `…DescriptionDefault` ("Funds Transfer Transaction" / "Transferencia de fondos"),
   `…Confirm`, `…Success`, `…ErrorSameAccount`, `…ErrorBalance`. Restart `make dev` (locales have no HMR).

Tests (vitest, co-located `__tests__`): `FundsTransferModal.vitest.jsx` (fields, source readonly,
currency-to visibility, bank-fee toggle, same-account disabled, over-balance disabled, confirm posts
correct payload), `AccountRowMenu` adds the item, `MovementsToolbar` renders the transfer button,
`useFundsTransfer` posts. Delegate test writing to Tester per repo policy; the user runs them.

---

## Part 3 — Docs & cross-domain plan

- Update `schema_forge/docs/generated-custom-windows/financial-account.md` (and the accounts-list /
  `financial-accounts-page` doc if present): document the new "Transferir fondos" action in the list
  kebab and detail action bar, the form, and the backend `action=transfer` endpoint
  (self-documentation policy: code + doc in the same change).
- **Cross-domain pre-push:** this touches platform/app-shell-core (locales) + `window:financial-account`
  + backend. Add `schema_forge/docs/plans/ETP-4272-cross-domain.md` (Summary / Domains touched /
  Tests / Rollback) so the `.githooks/pre-push` domain-boundary gate passes; add the
  `cross-domain-approved` label on the schema_forge PR. NEVER `--no-verify`.

## Critical files
- Backend:
  `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/FinancialAccountTransactionsHandler.java`
  (+ test); reuse `…/advpaymentmngt/actionHandler/FundsTransferActionHandler.java` (`createTransfer`
  9-arg) and `FinancialAccountsPageHandler.java` (balance).
- Frontend: `FundsTransferModal.jsx` (new), `hooks/useFundsTransfer.js` (new),
  `components/financial-accounts/AccountRowMenu.jsx`, `pages/FinancialAccountsPage.jsx`,
  `windows/custom/financial-account/MovementsToolbar/index.jsx`, locales `{en_US,es_ES}.json`.
- Docs: `Tareas_Conciliacion_Bancaria_ES.md`, `docs/plans/2026-05-21-bank-reconciliation-tasks.md`,
  `docs/generated-custom-windows/financial-account.md`, `docs/plans/ETP-4272-cross-domain.md` (new).

## Verification
- Backend: `./gradlew test --tests "*FinancialAccountTransactionsHandlerTest"` (user runs).
- Frontend: `npx vitest run` on the new/changed specs (user runs).
- Manual smoke (`make dev`, localhost:3100): (1) list ⋮ → "Transferir fondos" opens modal with source
  prefilled/readonly; (2) detail action bar shows the button; (3) destination selector lists org
  accounts except source; (4) Currency To appears only when destination currency differs; (5) Bank
  Fee checkbox reveals fee amount → extra BF expense in source; (6) same source/dest blocked;
  (7) amount > balance blocked; (8) confirm → two transactions created in **Pendiente** (source PWNC /
  dest RDNC) until reconciled; (9) multi-currency uses the rate.
- Commits on `feature/ETP-4272`, prefix `Feature ETP-4272:` (≤70 chars first line), no
  `Co-Authored-By`. Verify period/GL-item edge: confirm `doTransactionProcess` accepts a null GL item;
  if not, default to the account's GL item and document it.
