# Financial Accounts (Cuentas)

> **Story:** ETP-4095 (T1 of the Bank Reconciliation epic ETP-3504).
> Replaces the legacy `bank-reconciliation` placeholder as the entry point for the Tesorería / Cuentas surface.

## Intent

Use this page as the entry point to the reconciliation module. It lists the financial accounts the user can see (banks, cash drawers and cards — active by default, with archived ones available behind the **Inactivas** filter), exposes the per-currency balances aggregated across them and highlights how many lines are still pending reconciliation. From here the user opens a single account to manage its reconciliation workflow (introduced in T4) or triggers a manual match (T6).

## What this page allows in T1

- List `FIN_Financial_Account` records for the current client and accessible organizations — active accounts in the type views, plus archived (inactive) accounts behind a dedicated **Inactivas** filter.
- Show the aggregated sidebar widgets:
  - Total balance across visible accounts.
  - Balance broken down by ISO currency (EUR, USD, …).
  - Pending counters: accounts with unreconciled `FIN_Bank_Statement_Line`s plus placeholders for the matching engine (introduced in T5).
- Filter the table by account type (Banco, Caja, Tarjeta), by **Inactivas** (all archived accounts regardless of type), and search by name / IBAN / currency.
- Click a row to navigate to `/financial-account/:id` (placeholder route in T1; the real detail view ships in T4).
- Click the pending pill (`Conciliar (N)`) on a row to surface a toast pointing at T6 (`ETP-4100`).
- Click "Reglas de matcheo" to surface a toast pointing at T5 (`ETP-4099`).

## What is intentionally out of scope for T1

- "+ Nueva cuenta" button: disabled in T1, modal arrives with ETP-4096 (T2).
- PSD2 wiring (`Sync now`, `Connect`, `Disconnect`): every kebab item except "Abrir cuenta" is disabled; the connection model arrives with ETP-4097 (T3).
- Matching rules drawer and the suggestions engine: ETP-4099 (T5).
- Manual reconciliation split panel and the reconcile handler: ETP-4100 (T6) and ETP-4101 (T7).
- Deferred accounting and reactivate flow: ETP-4102 (T8).

## Account management (create / edit / archive)

> **Story:** ETP-4096. The toolbar's **+ Nueva cuenta** button and two row-kebab
> actions (**Editar cuenta**, **Archivar cuenta**) are now active. All of this is the
> *offline* flow — accounts created without a bank connection. The "Con conexión"
> (PSD2) path is visible but disabled; it ships in a later iteration.

### New account wizard (`NewAccountWizard`)

A multi-step modal launched from **+ Nueva cuenta**:

1. **Tipo** — three cards: Banco, Caja, Tarjeta.
2. **Banco → conexión** — a "Con conexión / Sin conexión" toggle. "Con conexión" is
   disabled (badge "Próximamente"); only "Sin conexión" proceeds.
3. **Banco** — a search box plus a "Populares" grid of banks (static catalog in
   `bankCatalog.js` until a real source is wired).
4. **Institución** — the bank's variants plus an "Añadir &lt;banco&gt; · Sin conexión" row.
5. **Formulario** — Nombre (obligatorio) / IBAN / BIC-SWIFT / Moneda → **Añadir cuenta**.

- **Caja** skips straight to a simplified form (Nombre + Moneda — no IBAN/BIC).
- **Tarjeta** shows a "Próximamente" placeholder (depends on the bank connection).
- IBAN is validated client-side with the ISO 13616 mod-97 checksum
  (`lib/validateIban.js`) before submit; an invalid IBAN blocks the form with an
  inline error. A duplicate account name surfaces inline (backend HTTP 409).

### Edit account (`EditAccountModal`)

Row kebab → **Editar cuenta** opens the shared edit modal. BIC/SWIFT is intentionally
omitted from the top-level form; the backend leaves any field absent from the request
untouched, so editing never wipes a stored BIC.

> This description reflects T2 (ETP-4096) scope only. The modal has since gained a
> live PSD2 connection block (ETP-4097 / T3), a General/Contabilidad tab split with a
> conditional Currency lock (ETP-4530), and a second entry point from the account
> detail view — see `financial-account.md` → "Edit Account Modal" for the current
> behavior.

### Archive account (`ArchiveAccountDialog`)

Row kebab → **Archivar cuenta** opens a confirmation dialog. Confirming soft-deletes the
account (`IsActive='N'`) and it disappears from the default list (still reachable via the **Inactivas** filter). Accounts with open
reconciliations cannot be archived — the backend rejects with HTTP 409 and the UI shows
a clear message.

## Interaction model

- Route: `/finance/accounts` (registered in `App.jsx`).
- Standalone page (Level 4 in the app-shell taxonomy) — not an AD window. The precedent is `DashboardPage.jsx` / `CrmPage.jsx`.
- Layout: 292 px sidebar + flexible main panel with the accounts table.
- The page uses `useSetPageMeta` to render the breadcrumb `Tesorería / Cuentas` on the topbar.

## Backend contract

Single NEO Headless endpoint:

```
GET /sws/neo/financial-accounts-page
```

Powered by `FinancialAccountsPageHandler` (`com.etendoerp.go.schemaforge.FinancialAccountsPageHandler`, qualifier `financial-accounts-page`).

Response shape (envelope `response.data`):

```json
{
  "accounts": [
    {
      "id": "94EAA455D2644E04AB25D93BE5157B6D",
      "name": "BBVA Principal",
      "type": "B",
      "currentBalance": 12345.67,
      "currencyId": "102",
      "currencyIso": "EUR",
      "iban": "ES12...",
      "isDefault": true,
      "active": true,
      "pendingCount": 4
    }
  ],
  "summary": {
    "totalBalance": 54321.0,
    "byCurrency": [
      { "currencyIso": "EUR", "total": 32000.0 }
    ],
    "pending": {
      "accountsWithPending": 3,
      "suggestionsReady": 0,
      "byRule": 0
    }
  }
}
```

- `accounts` is filtered by `AD_Client_ID = current client` and the accessible organization tree from `OrganizationStructureProvider`. It returns **both active and archived** accounts; each row carries an `active` boolean (`IsActive`). The UI shows active accounts in the type views (Todas / Banco / Caja / Tarjeta) and archived ones only under the dedicated **Inactivas** filter.
- `pendingCount` counts active `FIN_Bank_Statement_Line` rows linked to the account (through `FIN_BankStatement`) whose `fin_finacc_transaction_id IS NULL`.
- `summary.*` is computed over **active accounts only** — archived accounts never skew `totalBalance`, `byCurrency` or `accountsWithPending`. (`summary.totalBalance` is the raw sum of `CurrentBalance`; currency normalisation against the GL schema arrives with later stories.)
- `summary.pending.suggestionsReady` and `summary.pending.byRule` always return `0` in T1 because the `ETBR_Match_Suggestion` table lands with T5.

### Account mutations endpoint (ETP-4096)

```
POST /sws/neo/financial-account                      → create
POST /sws/neo/financial-account?action=update&id=…   → edit general data
POST /sws/neo/financial-account?action=archive&id=…  → soft-delete (IsActive='N')
GET  /sws/neo/financial-account?action=defaults      → session currency + currency list
```

Powered by `FinancialAccountHandler` (qualifier `financial-account`). It is a
report-style spec, so it routes on the HTTP method plus an `action` query param.
Create requires `name` + `currencyId`; `iban`/`swiftCode` (BIC) are optional and only
apply to bank accounts. Update only mutates the fields present in the request body.
Archive is rejected (409) when the account has open `FIN_Reconciliation` records. The
spec + entity records live in `src-db/database/sourcedata/ETGO_SF_SPEC.xml` and
`ETGO_SF_ENTITY.xml` so they survive `update.database`.

## Frontend file map

> **Superseded by ETP-4658.** The list is no longer a hand-written page on a hardcoded
> route: it is the generated window's `ListView` with an `AccountsHeaderTable` slot, and
> its columns come from `decisions.json`. `pages/FinancialAccountsPage.jsx` and the
> hand-rolled `AccountsTable` host (table + header + row) are **deleted**. The canonical
> reference for the current list is **`financial-account.md`**; what stays accurate here
> is the backend of the `financial-accounts-page` spec.

```
tools/app-shell/src/
├── components/financial-accounts/
│   ├── index.js, tokens.js
│   ├── AccountsToolbar.jsx                    # + Nueva cuenta button
│   ├── AccountsSidebar/index.jsx
│   ├── AccountsTable/accountColumns.jsx       # cell bodies only (NameCell/TypeCell/BalanceCell)
│   ├── accountCellTypes.jsx                   # binds contract `cellType` → renderer
│   ├── contractColumns.js                     # reads the grid columns from contract.json
│   ├── AccountRowActions.jsx                  # pencil / PSD2 sync / kebab, on row hover
│   ├── AccountLogoAvatar.jsx, SyncStatusInline.jsx, ReconcilePill.jsx
│   ├── AccountTypeFilter.jsx
│   └── AccountRowMenu.jsx                     # Abrir / Editar / Archivar + PSD2 (disabled)
├── (the list body itself lives in artifacts/financial-account/custom/AccountsHeaderTable.jsx)
├── windows/custom/financial-account/          # account-management modals (ETP-4096)
│   ├── NewAccountWizard.jsx
│   ├── AccountConnectionToggle.jsx
│   ├── AccountFormStep.jsx
│   ├── EditAccountModal.jsx
│   ├── ArchiveAccountDialog.jsx
│   └── bankCatalog.js
├── hooks/useFinancialAccounts.js, useAccountMutations.js
└── lib/validateIban.js
```

Locale keys use the flat `financeAccounts*` convention (camelCase, not dotted) in both `en_US.json` and `es_ES.json`.

The legacy `bank-reconciliation` placeholder entry in `menu.json` is now hidden (`hidden: true`) — the canonical entry in the Finance menu is `financial-accounts` (label "Cuentas" / "Accounts", path `finance/accounts`). The placeholder will be removed in T8 once the full reconciliation flow is shipped.

## Manual verification

1. Start the dev server with `make dev` and visit `http://localhost:3100/finance/accounts` after logging in.
2. The sidebar should match the Figma frame `3012:25602`:
   - Total balance reflects the sum of every active account.
   - "Por moneda" lists each ISO code with its aggregated total.
   - "Pendientes de conciliar" shows the number of accounts with non-zero `pendingCount`.
3. Toggle the type filter (Banco / Caja / Tarjeta / Todas) and confirm the table updates. Select **Inactivas** and confirm only archived accounts are listed (across all types) and the sidebar totals stay unchanged.
4. Type a partial bank name in the search box and confirm the table narrows down.
5. Click "Reglas de matcheo" and verify the toast "Próximamente en T5 (ETP-4099)" appears.
6. Click "+ Nueva cuenta" → Banco → "Sin conexión" → pick a bank → an institution →
   fill Nombre + a valid IBAN + Moneda → "Añadir cuenta". The new account appears in
   the list with balance 0. Confirm "Con conexión" is disabled, an invalid IBAN blocks
   the form, and a duplicate name shows an inline error.
7. Create a **Caja** (simplified form: Nombre + Moneda) and confirm **Tarjeta** shows a
   "Próximamente" placeholder.
8. Row kebab → **Editar cuenta**: change the name/IBAN, save, and confirm the row updates.
9. Row kebab → **Archivar cuenta**: confirm the dialog, the account leaves the list; for
   an account with open reconciliations confirm the 409 error message.
10. Click a row and confirm the navigation to `/financial-account/{id}`.
11. Click the pending pill of a row with `pendingCount > 0` and confirm the toast points to T6.

## Tests

- Backend: `FinancialAccountsPageHandlerTest` (list page) and `FinancialAccountHandlerTest`
  (create / update / archive / defaults), both JUnit 4 + Mockito in `com.etendoerp.go`.
- Frontend: `*.vitest.jsx` files under `components/financial-accounts/__tests__/` and
  `windows/custom/financial-account/__tests__/` (wizard, form, connection toggle, edit
  modal, archive dialog), plus `hooks/__tests__/` (`useAccountMutations`) and
  `lib/__tests__/` (`validateIban`).

## Deployment notes

The NEO spec for this endpoint is configured through the Schema Forge artifact at `artifacts/financial-accounts-page/report-contract.json`. After deploying the backend the user must run, in the Etendo root:

```bash
node schema_forge/cli/src/push-to-neo.js financial-accounts-page
./gradlew export.database
./gradlew smartbuild
```

These steps are owned by the developer because the Schema Forge toolchain does not have permission to run Gradle.

The account-mutations spec (`financial-account`, ETP-4096) is committed directly to the
`com.etendoerp.go` sourcedata (`ETGO_SF_SPEC.xml` / `ETGO_SF_ENTITY.xml`), so it does not
need `push-to-neo` — it is applied by running, in the Etendo root:

```bash
./gradlew update.database
./gradlew smartbuild
```
