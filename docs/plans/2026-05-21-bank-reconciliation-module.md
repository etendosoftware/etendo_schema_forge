# Bank Reconciliation Module — Implementation Plan

**Source document:** `~/Downloads/Definicion_Funcional_Conciliacion_Bancaria.docx.pdf` (24 pp., v1.0 Borrador, Mayo 2026)
**Status:** 🟡 Draft — awaiting Jira ID and prioritization
**Owner:** TBD
**Started:** 2026-05-21
**Branch:** TBD (`feature/ETP-XXXX-bank-reconciliation`)
**Module name (proposed):** `com.etendoerp.bankreconciliation` (sibling of `com.etendoerp.go`)
**Schema Forge artifacts (proposed):** `financial-account`, `bank-reconciliation` (rebuild), `match-rule`

> ⚠️ **Touches real banking flows.** PSD2 credentials, double-posting and reconciliation reversal are involved. Every phase must close with explicit functional sign-off; nothing ships without integration tests on a real Etendo instance.

---

## Table of Contents

1. [Problem Statement & Scope](#1-problem-statement--scope)
2. [What Already Exists](#2-what-already-exists)
3. [Gap Analysis (Functional Doc vs. Today)](#3-gap-analysis-functional-doc-vs-today)
4. [Target Architecture](#4-target-architecture)
5. [Data Model — New & Extended Tables](#5-data-model--new--extended-tables)
6. [Backend — Endpoints, Handlers, Processes](#6-backend--endpoints-handlers-processes)
7. [Frontend — Screens & Components](#7-frontend--screens--components)
8. [PSD2 / Salt Edge Integration](#8-psd2--salt-edge-integration)
9. [Matching Algorithms](#9-matching-algorithms)
10. [Deferred Accounting Flow](#10-deferred-accounting-flow)
11. [State Machine](#11-state-machine)
12. [Implementation Phases](#12-implementation-phases)
13. [Testing Strategy](#13-testing-strategy)
14. [i18n Keys](#14-i18n-keys)
15. [Known Risks & Open Questions](#15-known-risks--open-questions)
16. [Out of Scope](#16-out-of-scope)
17. [File Inventory](#17-file-inventory)
18. [Task Breakdown by Flow](#18-task-breakdown-by-flow)

---

## 1. Problem Statement & Scope

The functional document defines a **Bank Reconciliation module** layered on top of standard Etendo reconciliation, with three sets of new behavior:

| Block | Inherited from Etendo | New in this module |
|-------|----------------------|--------------------|
| **Importación de extractos** | Manual (.txt/.390) | Automatic via PSD2 (Salt Edge) |
| **Matching automático** | Standard algorithm (amount + date tolerance + reference) | NEW "Reglas de matcheo" engine for transactions without invoice (commissions, transfers, taxes, recurring payments) |
| **UI** | Etendo classic forms | SPA matching the Figma mockups in "PASANDO EN LIMPIO": Cuentas list + 1:N suggestion popup + 50/50 split reconciliation panel + Movimientos canónica |
| **Contabilización** | Posted at multiple stages | **Deferred**: only after `Conciliado` status. Manual button + scheduled batch |
| **Reversión** | DocAction `RC` + manual unpost | Reuse `Reactivar Conciliación` from Payment Removal (atomic un-post + un-reconcile) |

**Goal:** ship the new UI/UX (per the Figma mockups in "PASANDO EN LIMPIO") and the rules engine WITHOUT modifying the standard Etendo reconciliation business logic. The new module wraps Etendo, never replaces it.

**Non-goals:**
- Replacing `FIN_AddPayment`, `FIN_BankStatementHandler`, or any standard reconciliation Java service.
- Implementing card statements processing from PSD2 (5h estimate noted in the doc, will be a follow-up).
- Building an "advanced" matching algorithm — explicitly out of scope.

---

## 2. What Already Exists

### 2.1 Schema Forge artifact `bank-reconciliation/` (synthetic placeholder, NOT a Classic migration)
- `artifacts/bank-reconciliation/contract.json` — header/lines contract scaffolded with **synthetic fields**. References the legacy `C_BankAccount` table for `bankAccount` and invents fields like `difference` and `status` that do not map to any single AD table. No `decisions.json` (pre-v2 format) and no `schema-raw.json` / `raw-query-results/` exists, confirming the artifact was **never extracted from a real Etendo Classic window** — it was seeded during early Etendo Go scaffolding.
- `artifacts/bank-reconciliation/generated/web/bank-reconciliation/` — generated ListView + DetailView, master-child, no custom components.
- Declares an `autoMatch` process endpoint **but it is NOT wired in the UI** (`processes: []`).
- Registered in `tools/app-shell/src/menu.json` (Finance group) and `tools/app-shell/src/windows/registry.js`.
- **This artifact will be retired from the menu** and replaced by the new `financial-account` entry point (see §2.5). The directory may stay in the repo as legacy for one release cycle before deletion.

### 2.2 Etendo standard data model (preserved)
- `FIN_Financial_Account` — the financial account (= "Cuenta" in the new UI).
- `FIN_FinAcc_Transaction` — system transactions (Cobros, Pagos, Transferencias, Comisiones, etc.).
- `FIN_Bank_Statement` + `FIN_Bank_Statement_Line` — imported statement and its lines.
- `FIN_Reconciliation` + `FIN_Reconciliation_Line` — reconciliation header + line linking statement lines to financial transactions.
- `FIN_Payment`, `FIN_Payment_Schedule_Detail`, `C_Invoice` — payments and invoices used as the system-side targets.
- `C_BankAccount` — IBAN/BIC for cuentas tipo Banco.

### 2.3 Frontend infrastructure already available
- `layoutType: "custom"` (see `docs/window-templates.md`) — for windows that don't fit ListView/DetailView. Required for the 3-tab Vista de cuenta financiera and the new Cuentas page.
- `customComponents.bottomSection`, `customComponents.sidePanel`, `customComponents.topbarRight` — slots used by `payment-in`, `sales-invoice`, `goods-shipment`.
- Standalone pages pattern: `tools/app-shell/src/pages/*.jsx` (e.g., `AccountingPage`, `DashboardPage`). The Cuentas landing page belongs here, NOT under `artifacts/`.

### 2.4 NEO Headless extensibility (preserved)
- `NeoHandler` CDI pattern (`docs/neo-headless-extensibility.md`) — one bean per entity, switch by `endpointType`.
- ETGO_SF_SPEC / ETGO_SF_ENTITY / ETGO_SF_FIELD configuration tables.

### 2.5 Mapping with Etendo Classic

There is **no standalone "Bank Reconciliation" window in Etendo Classic** (verified via `menu-cache search "reconcil"` → 0 results). In Classic the flow is:

```
Application Dictionary → Financial Management → Receivables and Payables
└─ Financial Account            ← parent window (table FIN_Financial_Account)
   ├─ Tab "Bank Account"        (banking data on the financial account)
   ├─ Tab "Transactions"        (FIN_FinAcc_Transaction)
   ├─ Tab "Bank Statement"      (FIN_Bank_Statement + lines)
   └─ Tab "Reconciliation"      (FIN_Reconciliation + lines)
       └─ Process "Match Statement"   ← popup that runs the matching algorithm
```

The user always enters from **Financial Account**. Reconciliation lives as an inner tab + the "Match Statement" process popup. There is no separate window. The match popup is launched from a button inside Financial Account.

This plan **mirrors Classic exactly**, renaming the menu entry to **"Cuentas"** (which lists `FIN_Financial_Account` records) and rebuilding the UX from the Figma mockups in the "PASANDO EN LIMPIO" section of the functional document:

```
Menu Finance
└─ "Cuentas"                     ← new entry (replaces legacy bank-reconciliation)
                                   = list of FIN_Financial_Account
   └─ click a cuenta → Financial Account detail view (3 tabs):
      ├─ Tab "Movimientos"       (FIN_FinAcc_Transaction, customized)
      ├─ Tab "Conciliación"      (FIN_Reconciliation + 50/50 split panel)
      │   └─ Popup "Conciliación automática sugerida"   ← Classic's "Match Statement", redesigned
      └─ Tab "Extractos importados" (FIN_Bank_Statement, read-mostly)
```

**Key consequences:**

- The primary entity of the new window is **`financialAccount`** (`FIN_Financial_Account`), not `bankReconciliation`.
- The new Schema Forge artifact is **`artifacts/financial-account/`** (rebuild), not a rebuild of `artifacts/bank-reconciliation/`.
- "Cuenta" in the new UI ≡ `FIN_Financial_Account` row. Banks, cash accounts and cards are all rows of the same table, distinguished by `FIN_FinancialAccount.Type`.
- `FIN_Reconciliation` and `FIN_Bank_Statement` remain in use as **internal datasources** of the Conciliación and Extractos tabs respectively — they no longer appear as standalone menu entries.

---

## 3. Gap Analysis (Functional Doc vs. Today)

| Functional requirement | Today | Gap |
|------------------------|-------|-----|
| Cuentas list (entry point, sidebar with balances + pendientes widget) | ❌ — only `payment-in/out` lists. The existing `bank-reconciliation` entry is a synthetic placeholder, not a real Classic-equivalent window (see §2.1, §2.5) | New page `FinancialAccountsPage.jsx` + retire legacy `bank-reconciliation` from the menu |
| "+ Nueva cuenta" wizard (Banco/Caja/Tarjeta) | ❌ | New modal flow with Salt Edge widget |
| Editar cuenta modal (PSD2 conexión integrada) | ❌ | New custom component |
| Reglas de matcheo CRUD + Nueva Regla modal | ❌ | New artifact `match-rule` (generated) + custom rule editor |
| Conciliación automática sugerida 1:N popup | ❌ — `autoMatch` declared but unwired | New `AutoMatchSuggestionModal.jsx` + endpoint |
| Vista cuenta financiera 3-tab page (Movimientos / Conciliación / Extractos) | ❌ | New `windows/custom/financial-account/index.jsx` |
| Movimientos tab (canonical transaction list + Estado column) | ❌ | New custom component reusing list infra |
| Conciliación tab — 50/50 split panel (per Figma "PASANDO EN LIMPIO") | ❌ | New shared component `ReconciliationSplitPanel.jsx` |
| Right-panel filter by transaction type (F. Venta, Tickets, Cobros…) | ❌ | New combobox + filter logic |
| PSD2 import via Salt Edge | ❌ | New endpoints + Salt Edge widget integration |
| Matching rules engine (text condition + auto-create transaction) | ❌ | New backend process + table `ETBR_MatchRule` |
| Deferred accounting (manual + scheduled) | Standard Etendo posts immediately | New "Contabilizar" process limited to `Status=Conciliado` |
| "Reactivar Conciliación" reusing Payment Removal | Partial in Etendo | Surface in new UI from Conciliación tab |
| Transaction states: Pendiente / Con sugerencia / Conciliado / Con diferencia / Borrador / Completado / Contabilizado / Desconciliado | Partial | Extended state machine + derived UI states |
| Dimensiones contables en reglas (3 dropdowns demo) | ❌ | New `ETBR_MatchRule_Dim` table |
| "Archivar cuenta" = desactivar (legacy archive removed) | Etendo: archive | Flip to soft-delete via `Active=N` |
| Sacar columna "Sin contabilizar" del header de Movimientos | Etendo shows it | UI customization |
| Sacar columna "Tercero/Conciliación" — añadir Contacto + Descripción + Estado | Etendo shows combined col | UI customization |

---

## 4. Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  SCHEMA FORGE (this repo) — design-time                                  │
│  ├─ artifacts/financial-account/        ← Cuenta entity contract        │
│  ├─ artifacts/bank-reconciliation/      ← REBUILD: rules-driven contract│
│  ├─ artifacts/match-rule/               ← Rule catalog window           │
│  └─ tools/app-shell/                                                     │
│      ├─ pages/FinancialAccountsPage.jsx          ← Cuentas landing      │
│      ├─ windows/custom/financial-account/        ← 3-tab account view   │
│      │   ├─ index.jsx                            (layoutType: custom)   │
│      │   ├─ MovimientosTab.jsx                                          │
│      │   ├─ ReconciliacionTab.jsx                                       │
│      │   ├─ ExtractosImportadosTab.jsx                                  │
│      │   ├─ EditAccountModal.jsx                                        │
│      │   └─ NewAccountWizard.jsx                                        │
│      └─ components/contract-ui/                                          │
│          ├─ ReconciliationSplitPanel.jsx         ← shared 50/50 panel   │
│          ├─ AutoMatchSuggestionModal.jsx         ← 1:N grouped popup    │
│          └─ SaltEdgeConnectWidget.jsx            ← PSD2 SDK wrapper     │
└─────────────────────────────────────────────────────────────────────────┘
                                  │ webhooks (push-to-neo)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  com.etendoerp.bankreconciliation — runtime module (NEW)                │
│  ├─ data/  ETBR_MatchRule, ETBR_MatchRule_Dim,                          │
│           ETBR_PSD2_Connection, ETBR_Match_Suggestion                   │
│  ├─ src/com/etendoerp/bankreconciliation/                               │
│  │   ├─ handlers/                                                       │
│  │   │   ├─ FinancialAccountHandler.java                                │
│  │   │   ├─ ReconciliationHandler.java                                  │
│  │   │   ├─ MatchRuleHandler.java                                       │
│  │   │   └─ MatchSuggestionHandler.java                                 │
│  │   ├─ process/                                                        │
│  │   │   ├─ AutoMatchProcess.java         ← runs std + rules engine     │
│  │   │   ├─ ApplyMatchRulesProcess.java   ← rules engine only           │
│  │   │   ├─ PostReconciledProcess.java    ← deferred accounting batch   │
│  │   │   └─ ReactivateReconciliationProcess.java   (reuses Payment Removal)│
│  │   ├─ psd2/                                                           │
│  │   │   ├─ SaltEdgeClient.java                                         │
│  │   │   ├─ SaltEdgeSyncProcess.java      ← scheduled sync              │
│  │   │   └─ SaltEdgeWebhookServlet.java   ← receives push notifications │
│  │   └─ webhooks/                                                       │
│  │       ├─ BRSyncNow.java                                              │
│  │       ├─ BRDisconnectPSD2.java                                       │
│  │       └─ BRReactivateReconciliation.java                             │
│  └─ src-db/database/model/                                              │
│      ETBR_MatchRule.xml, ETBR_PSD2_Connection.xml, ...                  │
└─────────────────────────────────────────────────────────────────────────┘
                                  │ HTTP
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Salt Edge PSD2 platform (external SaaS)                                │
│  - Authorization widget (Santander, BBVA, Caixabank, Sabadell, ING…)    │
│  - Account & transactions push API                                       │
│  - Re-authorization expiry handling                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key principle (re-stated):** the new module composes on top of Etendo. `FIN_AddPayment.java`, `FIN_BankStatementHandler.java`, `FIN_Reconciliation_Process` are **called, never modified**.

---

## 5. Data Model — New & Extended Tables

### 5.1 New tables (in `com.etendoerp.bankreconciliation`)

#### `ETBR_MatchRule` — matching rules catalog
| Column | Type | Notes |
|--------|------|-------|
| `ETBR_MatchRule_ID` | VARCHAR(32) PK | UUID (use `make uuid`) |
| `AD_Client_ID`, `AD_Org_ID`, `IsActive`, `Created`, `Updated`, … | std | Etendo audit columns |
| `Name` | VARCHAR(60) | "Comisiones Bancarias", etc. |
| `Priority` | NUMERIC | Lower = higher priority. Ties broken by `Created` |
| `TextCondition` | CHAR(1) | `C` contains, `S` starts-with, `R` regex |
| `TextPattern` | VARCHAR(255) | The pattern to match against `FIN_Bank_Statement_Line.BPartnerName` ∪ `Description` ∪ `Reference` |
| `TransactionType` | CHAR(1) | `B` bank fee, `T` transfer, `H` tax/retention, `R` recurring payment, `O` other |
| `C_GLItem_ID` / `C_ValidCombination_ID` | FK | Default GL account for auto-created tx |
| `C_BPartner_ID` | FK nullable | Default third party |
| `AmountTolerancePct` | NUMERIC | 0 = exact |
| `FIN_FinancialAccount_ID` | FK nullable | If null, rule applies to all accounts |
| `CreateTransaction` | CHAR(1) `Y`/`N` | If Y, materializes the FIN_FinAcc_Transaction immediately |
| `ETBR_MatchCount` | NUMERIC | Cached match count for display column |

#### `ETBR_MatchRule_Dim` — accounting dimensions per rule (1:N)
| Column | Type | Notes |
|--------|------|-------|
| `ETBR_MatchRule_Dim_ID` | VARCHAR(32) PK | |
| `ETBR_MatchRule_ID` | FK | Cascade delete |
| `DimensionType` | VARCHAR(30) | `Project`, `CostCenter`, `User1`, `User2`, `Campaign`, … |
| `ReferenceValue` | VARCHAR(32) | FK ID matching DimensionType |

#### `ETBR_PSD2_Connection` — Salt Edge connection metadata (1:1 with FinancialAccount)
| Column | Type | Notes |
|--------|------|-------|
| `ETBR_PSD2_Connection_ID` | VARCHAR(32) PK | |
| `FIN_FinancialAccount_ID` | FK UNIQUE | One connection per account |
| `SaltEdgeCustomerID` | VARCHAR(64) | Salt Edge customer reference |
| `SaltEdgeConnectionID` | VARCHAR(64) | Salt Edge connection reference |
| `SaltEdgeAccountID` | VARCHAR(64) | Account reference inside the connection |
| `Status` | CHAR(1) | `C` connected, `D` disconnected, `E` expired, `P` pending |
| `LastSync` | TIMESTAMP | When last successful sync ran |
| `NextSync` | TIMESTAMP | For scheduler ordering |
| `Periodicity` | VARCHAR(10) | `1H`, `4H`, `12H`, `24H` |
| `AuthExpiresAt` | TIMESTAMP | Re-authorization deadline (PSD2 ≤90 days) |
| `AutoReconcileMode` | CHAR(1) | `S` solo sugerir, `A` auto-conciliar matches exactos |

#### `ETBR_Match_Suggestion` — persisted auto-match suggestions (audit + retry)
| Column | Type | Notes |
|--------|------|-------|
| `ETBR_Match_Suggestion_ID` | VARCHAR(32) PK | |
| `FIN_BankStatementLine_ID` | FK | Extract line |
| `FIN_FinaccTransaction_ID` | FK nullable | Target system transaction (null when rule will create one) |
| `ETBR_MatchRule_ID` | FK nullable | Set when origin = rule |
| `Origin` | CHAR(1) | `S` standard algorithm, `R` rules engine |
| `Confidence` | NUMERIC | 0–100 (used for ordering in popup) |
| `Status` | CHAR(1) | `P` pending, `A` accepted, `R` rejected, `S` superseded |
| `GroupKey` | VARCHAR(32) | Groups 1:N suggestions so popup can render quadrants |

### 5.2 Extensions to existing Etendo tables

| Table | Column | Purpose |
|-------|--------|---------|
| `FIN_Reconciliation_Line` | `ETBR_PostStatus` CHAR(1) | `P` pending, `D` done, `F` failed |
| `FIN_Reconciliation_Line` | `ETBR_MatchRule_ID` FK | When the line came from a rule |
| `FIN_FinAcc_Transaction` | `ETBR_AutoCreated_From_Rule` FK | Audit: which rule created this tx |
| `FIN_FinAcc_Transaction` | `ETBR_ReconcileStatus` CHAR(1) | Mirror of doc-level state for fast filtering |
| `FIN_Financial_Account` | `ETBR_AccountType` CHAR(1) | `B` Banco, `C` Caja, `T` Tarjeta |

> All FK ids are VARCHAR per Etendo convention. Generate UUIDs with `make uuid` only — never invent them.

---

## 6. Backend — Endpoints, Handlers, Processes

### 6.1 NEO Headless specs (configured via Schema Forge `push-to-neo`)

| Spec name | Type | Purpose |
|-----------|------|---------|
| `financial-account` | W | CRUD + Custom actions (sync-now, disconnect, archive) |
| `bank-reconciliation` | W | CRUD reconciliations (header + lines) — **rebuild** |
| `match-rule` | W | CRUD matching rules |
| `bank-statement` | W | Imported statements (read-mostly) — for Extractos tab |
| `psd2-connection` | W | Editable from Editar cuenta modal |

### 6.2 NeoHandlers

#### `FinancialAccountHandler` (`@Named("financialAccount")`)
- **POST `/financial-account/{spec}/financialAccount/{id}/action/syncNow`** → trigger `SaltEdgeSyncProcess` for that account
- **POST `…/action/disconnectPSD2`** → calls Salt Edge `DELETE /connections/{id}`, sets `ETBR_PSD2_Connection.Status='D'`
- **POST `…/action/archive`** → `IsActive='N'` (no hard delete)
- **GET `…/defaults`** → fills `C_Currency_ID = @#C_Currency_ID@`, `ETBR_AccountType` from query param

#### `ReconciliationHandler` (`@Named("bankReconciliation")`)
- **POST `…/action/autoMatch`** → runs standard algorithm + rules engine, persists suggestions, returns grouped 1:N response
- **POST `…/action/applySuggestions`** → accepts `{groupIds: []}`, materializes accepted suggestions
- **POST `…/action/reconcileGroup`** → manual reconcile (selected extract line + selected operations from split panel)
- **POST `…/action/reactivate`** → calls Payment Removal's `Reactivar Conciliación` flow
- **POST `…/action/postReconciled`** → posts all `Status=Conciliado` lines to accounting (manual button)

#### `MatchRuleHandler` (`@Named("matchRule")`)
- **POST/PUT** → validate regex compiles, validate priority unique within scope, refresh `ETBR_MatchCount` cache
- **GET `…/defaults`** → next priority = max+10

#### `MatchSuggestionHandler` (`@Named("matchSuggestion")`)
- Read-only entity for audit panel; no business logic beyond filtering by status.

### 6.3 Background processes (Etendo `AD_Process`)

| Process | Trigger | Logic |
|---------|---------|-------|
| `SaltEdgeSyncProcess` | Scheduler (per-account `Periodicity`) + manual `syncNow` action | Pulls new statement lines from Salt Edge, inserts `FIN_Bank_Statement_Line`, triggers `AutoMatchProcess` |
| `AutoMatchProcess` | After import + on Conciliación tab open | 1) Calls standard Etendo matching. 2) Runs rules engine on the remainder. 3) Writes `ETBR_Match_Suggestion` rows |
| `ApplyMatchRulesProcess` | Sub-process of AutoMatch | Iterates active rules by `Priority`, applies `TextCondition`/`TextPattern` + amount tolerance, optionally creates `FIN_FinAcc_Transaction` |
| `PostReconciledProcess` | Scheduler (configurable) + manual button | Selects `FIN_Reconciliation_Line` with `Status=Conciliado` and `ETBR_PostStatus=P`, posts to accounting using std Etendo posting (DAL `AcctServer`), flips to `D`. All-or-nothing per reconciliation header (OBDal transaction) |
| `ReactivateReconciliationProcess` | Manual from Conciliación tab | Delegates to existing Payment Removal `Reactivar Conciliación` (do not reimplement). Wrapped in webhook `BRReactivateReconciliation` |

### 6.4 Salt Edge webhook receiver

`SaltEdgeWebhookServlet` (mapped at `/sws/etbr/saltedge/callback`) — receives push notifications when Salt Edge has new data; verifies signature, schedules `SaltEdgeSyncProcess` for the affected account, returns 200. Replays must be idempotent (de-dupe by `SaltEdgeConnectionID + payload hash`).

---

## 7. Frontend — Screens & Components

### 7.1 Surface inventory

| Surface | Type | File | Notes |
|---------|------|------|-------|
| Cuentas (landing) | Standalone page | `tools/app-shell/src/pages/FinancialAccountsPage.jsx` | Not under `artifacts/` — pure custom page |
| New account wizard | Modal | `windows/custom/financial-account/NewAccountWizard.jsx` | 3 steps: pick type → connect/skip PSD2 → confirm |
| Edit account modal | Modal | `windows/custom/financial-account/EditAccountModal.jsx` | Combines data + PSD2 connection panel |
| Conciliación automática sugerida popup | Modal | `components/contract-ui/AutoMatchSuggestionModal.jsx` | Shared, can be triggered from any account row |
| Vista cuenta financiera | Custom window | `windows/custom/financial-account/index.jsx` | `layoutType: "custom"` |
| Movimientos tab | Component | `windows/custom/financial-account/MovimientosTab.jsx` | Reuses `DataTable` + custom filters |
| Conciliación tab | Component | `windows/custom/financial-account/ReconciliacionTab.jsx` | Embeds `ReconciliationSplitPanel` |
| Reconciliation split panel (50/50) | Shared component | `components/contract-ui/ReconciliationSplitPanel.jsx` | Generic; reusable for any "match A vs B" UX |
| Extractos importados tab | Component | `windows/custom/financial-account/ExtractosImportadosTab.jsx` | Reuses existing `bank-statement` listing |
| Reglas de matcheo | Generated window | `artifacts/match-rule/` | Standard ListView+DetailView with `customComponents.headerTable` for the priority drag-handle |
| Nueva Regla de Conciliación modal | Component | `windows/custom/match-rule/NewRuleModal.jsx` | Per the doc's screenshot |

### 7.2 Cuentas page (FinancialAccountsPage.jsx)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Cuentas (n)  [⋮]                          🔍   ⚙ Reglas matcheo  + Nueva│
│  ┌──────────────┬─────────────────────────────────────────────────────┐  │
│  │ Saldo        │ Cuenta              Tipo      Saldo      Por concil.│  │
│  │ 211.695,42€  │ ─────────────────────────────────────────────────── │  │
│  │              │ 🔴 Santander        Banco     211.841,01€  Conciliar(12)│
│  │ Por divisa   │ 🟢 Galicia          Tarjeta    -95,59 €      —      │  │
│  │  EUR 211k    │ 🔵 Sabadell  unconn Banco      62.198,04€  Conectar  │  │
│  │  USD 0       │ ⬛ Efectivo Dólar   Caja        0,00 $        —     │  │
│  │              │                                                      │  │
│  │ Pendientes   │                                                      │  │
│  │  ● 2 cuentas │                                                      │  │
│  │  ● Sugerenc. │                                                      │  │
│  │  ● Por regla │                                                      │  │
│  └──────────────┴─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

- "Todas las cuentas" dropdown filters by `ETBR_AccountType` (Banco / Caja / Tarjeta / Todas).
- Per-row kebab: Abrir cuenta → navigate to `/financial-account/{id}`; Editar cuenta → modal; Editar conexión PSD2 → modal; Sincronizar ahora → POST `…/action/syncNow`; Importar extracto manual → existing manual import flow; Desconectar PSD2 → confirm + POST `…/action/disconnectPSD2`; Archivar cuenta → confirm + POST `…/action/archive`.
- "Conciliar (N)" pill → opens `AutoMatchSuggestionModal`.
- Sidebar "Pendientes por conciliar" widget — counts via `GET /financial-account/summary` (new aggregate endpoint).

### 7.3 Vista cuenta financiera (3 tabs)

`windows/custom/financial-account/index.jsx` registers `layoutType: "custom"` in its `decisions.json`, then renders a custom shell with internal tabs. Each tab is a sibling component. The Tabs strip is rendered locally — we do **not** use the AD-tab system here because tab logic is heavily UI-driven.

**Movimientos tab** — canonical list of `FIN_FinAcc_Transaction` for the selected account.
- Top KPIs: `SALDO ACTUAL`, `ENTRADAS`, `SALIDAS`. (Remove "SIN CONTABILIZAR" count per doc.)
- Filter row: `Todos los estados | Últimos 30 días | Cualquier tipo | Cualquier importe | search | Exportar | + Nuevo movimiento`.
- Columns: `Fecha | Documento | Contacto | Descripción | Estado | Tipo | Importe | Saldo | ⋮`.
- `Estado` column derived: Borrador (FIN_Payment.Processed=N) | Completado (Processed=Y, no reconciliation line) | Conciliado (reconciled, ETBR_PostStatus=P) | Contabilizado (ETBR_PostStatus=D).
- Right-click / kebab: ver detalle / desconciliar (=Reactivar) / contabilizar.

**Conciliación tab** — `ReconciliationSplitPanel`:
- Left panel pre-filtered `Pendientes | Últimos 12 meses` over all bank statement lines for the account.
- Right panel filter dropdown: `F. Venta | Tickets de venta | Compras rectificativas | Remesas | Cobros | F. Compras | Tickets de compra | Nóminas | Ventas rectificativas | Pagos` (= `FIN_Payment.SO_TRX` × `C_Invoice.IsSOTrx` × etc.).
- Click extract line on left → right panel auto-highlights candidates by std algorithm + suggested rule matches.
- Top of right panel shows selected extract line metadata (date, description, amount in red/green).
- Bottom action bar: `Documentos seleccionados: +X,XX € | Restante por conciliar: -X,XX € | [Transferir] [Nuevo documento] [Conciliar (N)]`.
- When user selects already-reconciled lines, `Conciliar` becomes `Reactivar` and triggers the reactivate process.
- "Automatch" button in top-right triggers the same flow as Cuentas-row "Conciliar (N)" pill.

**Extractos importados tab** — informational view of `FIN_Bank_Statement` for this account, with action "Reimport" allowed only on draft statements.

### 7.4 AutoMatchSuggestionModal (1:N grouped popup)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ✦ Conciliación automática sugerida                              [×]    │
│  Santander · 12 movimientos pendientes · 6 grupos · 10 ops a vincular   │
│                                                                          │
│  ☑ 5 de 6 grupos                  Desmarcá cualquier grupo para excluir.│
│  ┌──── LÍNEA DEL EXTRACTO ────────┬──── OPERACIONES DEL SISTEMA ─────┐  │
│  │ ☑ EXTRACTO 06/05/2026          │ NCA Group Spain SA                │  │
│  │   Transf. recibida — RAMÍREZ   │ F2660006 · F. Venta · -500,00 €  │  │
│  │   −500,00 €                    │                                   │  │
│  ├─────────────────────────────────┼───────────────────────────────────┤  │
│  │ ☑ EXTRACTO 06/05/2026          │ Maria Lopez   -3120,00 €          │  │
│  │   TRANSF. EMITIDA — NÓMINAS    │ Juan Pérez    -2890,00 €          │  │
│  │   −18.420,00 €                  │ Andrea García -3450,00 €          │  │
│  │                                 │ + 5 nóminas más  -8960,00 €      │  │
│  ├─────────────────────────────────┼───────────────────────────────────┤  │
│  │ ☑ EXTRACTO 06/05/2026          │ AEAT — Hacienda  [Nueva]          │  │
│  │   IMPUESTO IRPF — MOD. 111     │ NEW · Crear pago · -894,20 €     │  │
│  │   Por regla "Impuestos"        │                                   │  │
│  └─────────────────────────────────┴───────────────────────────────────┘  │
│  Se conciliarán 8 ops, se creará 1 nueva                                │
│                          [Cancelar] [Abrir conciliación] [✓ Conciliar 5]│
└─────────────────────────────────────────────────────────────────────────┘
```

- Backend feeds `groups: [{groupKey, extractLine, candidates: [...], origin: 'standard'|'rule', confidence}]`.
- Visual quadrants do the 1:N grouping — no row numbering needed.
- "Nueva" badge = rule with `CreateTransaction=Y` will materialize the operation.
- "Por regla X" annotation visible on rule-origin groups.
- "Abrir conciliación" navigates to the Conciliación tab with the same account preselected.

### 7.5 Nueva Regla de Conciliación modal

Fields per doc screenshot:
- Nombre (required)
- Condición sobre el concepto: `condición` (= contiene / empieza por / regex) — secondary `Patrón a buscar`
- Tipo de transacción (dropdown — types from `ETBR_MatchRule.TransactionType`)
- Cuenta contable (selector on `C_ValidCombination`)
- Tercero por defecto (optional, selector on `C_BPartner`)
- Tolerancia de importe (% combobox or free input)
- Prioridad (number, smaller=higher)
- Afecta a (Todas las cuentas | specific `FIN_Financial_Account`)
- Dimensiones — 3 stacked combobox rows backed by `ETBR_MatchRule_Dim`
- Toggle: Crear transacción automáticamente

### 7.6 Decisions.json patterns

`artifacts/financial-account/decisions.json` (`layoutType: "custom"` for the detail view):
```jsonc
{
  "$schema": "decisions-v2",
  "version": 2,
  "window": {
    "name": "Financial Account",
    "category": "finance",
    "layoutType": "custom",                // entire detail is hand-built
    "listKpiCards": { "customComponent": "FinancialAccountKpiCards" },
    "menuActions": [
      { "key": "syncNow",    "label": "Sincronizar ahora", "columnName": "etbrSyncNow" },
      { "key": "disconnect", "label": "Desconectar PSD2", "columnName": "etbrDisconnect", "destructive": true },
      { "key": "archive",    "label": "Archivar cuenta",  "columnName": "etbrArchive",    "destructive": true }
    ]
  },
  "entities": { "header": { /* FIN_FinancialAccount fields */ } }
}
```

`artifacts/match-rule/decisions.json` (`layoutType: "default"` — standard CRUD):
```jsonc
{
  "$schema": "decisions-v2",
  "version": 2,
  "window": {
    "name": "Match Rule",
    "category": "finance",
    "customComponents": { "headerTable": "MatchRuleTable" }   // drag-handle + Activa toggle
  },
  "entities": { "header": { /* ETBR_MatchRule */ }, "dimensions": { /* ETBR_MatchRule_Dim */ } }
}
```

---

## 8. PSD2 / Salt Edge Integration

### 8.1 Setup
- Tenant-level Salt Edge `App ID` + `Secret` stored in `AD_System` config (encrypted).
- Per-customer signup: create Salt Edge `Customer` on first connection; persist `SaltEdgeCustomerID` in `ETBR_PSD2_Connection`.

### 8.2 Connect flow (from `NewAccountWizard` "Con conexión" tab)
1. Frontend calls `POST /financial-account` to create the placeholder account.
2. Frontend calls `POST /psd2-connection/action/connect` → backend asks Salt Edge for a `connect_url`.
3. Frontend opens the Salt Edge widget (iframe or new tab) with that URL.
4. User completes bank login on Salt Edge.
5. Salt Edge calls back via webhook (`/sws/etbr/saltedge/callback`).
6. Backend stores `SaltEdgeConnectionID`, `SaltEdgeAccountID`, `AuthExpiresAt`. Flips `Status=C`.
7. First sync runs immediately via `SaltEdgeSyncProcess`.

### 8.3 Sync flow
- Scheduler picks accounts where `NextSync <= NOW()` ordered by `LastSync ASC`.
- Per account: fetch `transactions?from=LastSync` from Salt Edge.
- Insert into `FIN_Bank_Statement_Line` under an auto-created `FIN_Bank_Statement` for the date range.
- Run `AutoMatchProcess`.
- Update `LastSync`, schedule `NextSync = LastSync + Periodicity`.

### 8.4 Re-authorization
- 7 days before `AuthExpiresAt`, the Editar cuenta modal displays a warning banner with `[Re-autorizar]` link → opens Salt Edge widget in `reconnect` mode.
- After `AuthExpiresAt`, `Status=E`. Sync skipped; user is forced to re-auth on next interaction.

### 8.5 Disconnect / Archive
- Disconnect: call Salt Edge `DELETE /connections/{id}`, set `ETBR_PSD2_Connection.Status='D'`. The financial account itself stays.
- Archive: `FIN_Financial_Account.IsActive='N'` + cascade disconnect.

### 8.6 Security
- Never log credentials, tokens, or Salt Edge secrets.
- Webhook signature verification with HMAC-SHA256.
- IP allowlist for the webhook endpoint (Salt Edge publishes their IP range).
- All Salt Edge calls go through `SaltEdgeClient` (single point of audit).

---

## 9. Matching Algorithms

### 9.1 Standard algorithm (Etendo, unchanged)
Inherited from `FIN_BankStatementHandler`. Criteria:
1. Exact amount match.
2. Date within configured tolerance (`ETBR_DateToleranceDays`, default 3).
3. Reference / document number match (substring or exact).

**Output:** `ETBR_Match_Suggestion` rows with `Origin='S'`, `Confidence=100` (when all 3 match) or proportionally lower.

### 9.2 Rules engine (NEW, only for non-invoice lines)
For each unmatched extract line, iterate active `ETBR_MatchRule` ordered by `Priority` (ascending):
1. Eval `TextCondition` against extract description.
2. If matched and `AmountTolerancePct` satisfied (when target tx exists), produce a suggestion.
3. If `CreateTransaction=Y` and no target tx exists, materialize a new `FIN_FinAcc_Transaction` (Type from rule, GL account from rule, BPartner from rule, dimensions from `ETBR_MatchRule_Dim`).
4. Write `ETBR_Match_Suggestion` with `Origin='R'`, `ETBR_MatchRule_ID` set, `Confidence` computed.
5. **First matching rule wins.** Other rules listed as alternatives in popup metadata.

**Explicit constraints from doc:**
- Rules do NOT apply to lines whose system counterpart is a `C_Invoice` (purchase/sale). Standard algorithm handles those.
- Suggestions are NEVER auto-confirmed without user click — they always appear in the suggestion popup or right panel.
- Activate flag (`IsActive`) gates evaluation cheaply.

### 9.3 Tie-breaking & conflicts
- Same priority + same matching pattern is configuration error → validator in `MatchRuleHandler.handle()` rejects with 409.
- Multiple rules of different priorities matching same line → highest priority becomes primary, lower-priority ones returned as `alternatives[]` in the popup payload.

---

## 10. Deferred Accounting Flow

**Principle (from doc §7.1):** no transaction is posted to accounting until it reaches state `Conciliado`. This differs from standard Etendo (which can post earlier).

### 10.1 State changes
| Event | New status |
|-------|-----------|
| User accepts suggestion / manual conciliate | `FIN_Reconciliation_Line.IsActive=Y` + `Status=Conciliado` + `ETBR_PostStatus=P` |
| `PostReconciledProcess` runs successfully | `ETBR_PostStatus=D` (Contabilizado) |
| `PostReconciledProcess` fails | `ETBR_PostStatus=F`, log row in `AD_Process_Log` |
| User undoes match (only when `ETBR_PostStatus='P'`) | `Status=Desconciliado` (transitional) → row deleted |
| User reactivates from posted state | Calls `ReactivateReconciliationProcess` (un-post + un-reconcile atomically) |

### 10.2 PostReconciledProcess details
- Selects rows `FIN_Reconciliation_Line` where `ETBR_PostStatus='P'`.
- Groups by `FIN_Reconciliation_ID` (one OBDal transaction per header).
- For each line: calls existing Etendo accounting (`AcctServer.post()` for the underlying `FIN_FinAcc_Transaction`).
- Updates `ETBR_PostStatus` per row.
- On error: rollback that header, mark all its lines as `F`, log error, continue with next header (do not abort batch).

### 10.3 Manual button vs scheduler
- Manual button "Contabilizar" lives in the Reglas de matcheo / Configuración del módulo screen and on Conciliación tab as a kebab option.
- Scheduler interval = `ETBR_PostFrequency` system preference (default "Cada Hora").

---

## 11. State Machine

```
                   ┌─────────────┐
        crea tx →  │  Pendiente  │ ← std Etendo doc draft
                   └──────┬──────┘
                          │ usuario completa documento (Procesar)
                          ▼
                   ┌─────────────┐
                   │  Completado │      ← Doc Status = CO, no reconciliation
                   └──────┬──────┘
                          │ usuario / automatch / regla concilia
                          ▼
                   ┌─────────────┐
                   │  Conciliado │ ── ETBR_PostStatus = P
                   └──┬──────┬───┘
                      │      │
   user undo (only P) │      │ PostReconciledProcess
                      ▼      ▼
              ┌─────────────┐ ┌────────────────┐
              │Desconciliado│ │ Contabilizado  │  ← ETBR_PostStatus = D
              └─────────────┘ └────────┬───────┘
                                       │ user "Reactivar"
                                       ▼
                              ┌────────────────┐
                              │  Conciliado    │  (cycle)
                              └────────────────┘
```

**Invariants:**
- `Contabilizado` cannot be directly desconciliated. Must go through Reactivar (un-post first).
- Reactivar is reused from Payment Removal — do not reimplement.
- Once `Contabilizado`, mutation of the underlying `FIN_FinAcc_Transaction` (amount, date, etc.) is blocked at backend.

---

## 12. Implementation Phases

### Phase 0 — Foundation (preparatory)
- [ ] Create Jira epic + child stories (ATLAS / ORION).
- [ ] Create `com.etendoerp.bankreconciliation` module skeleton with `make uuid`-generated AD_Module record.
- [ ] Add module to `etendo-go-architecture` radar.
- [ ] Decide Salt Edge account tier and provision sandbox keys (functional/PM).
- [ ] Account type scope is locked to **Banco, Caja, Tarjeta**.

### Phase 1 — Data model + Etendo extensions (backend-only)
- [ ] AD_Table + AD_Column XML for `ETBR_MatchRule`, `ETBR_MatchRule_Dim`, `ETBR_PSD2_Connection`, `ETBR_Match_Suggestion`.
- [ ] Column additions on `FIN_Reconciliation_Line` + `FIN_FinAcc_Transaction` + `FIN_Financial_Account`.
- [ ] AD_Windows + tabs + fields via `/etendo:alter-db` webhook automation.
- [ ] `export.database` + commit XML.
- [ ] JUnit tests: DAL CRUD on new tables, FK cascades, IsActive defaults.

### Phase 2 — Matching rules engine
- [ ] `MatchRuleHandler` (NeoHandler) — CRUD + validation.
- [ ] `ApplyMatchRulesProcess` — pure rules engine over an extract line + ETBR_MatchRule list.
- [ ] Unit tests: pattern compilation, priority ordering, tie-breaking, dimension propagation, idempotency.
- [ ] Schema Forge artifact `match-rule/` with `decisions.json` v2.
- [ ] Frontend: NewRuleModal + generated list with priority column.

### Phase 3 — Auto-match + suggestion model
- [ ] `AutoMatchProcess` — orchestrates standard + rules engine, persists `ETBR_Match_Suggestion`.
- [ ] `ReconciliationHandler` action endpoints (`autoMatch`, `applySuggestions`).
- [ ] Backend grouped-1:N response shape.
- [ ] Frontend: `AutoMatchSuggestionModal` (shared component).
- [ ] Wire popup from `bank-reconciliation` artifact (intermediate goal — works before Cuentas page exists).
- [ ] Unit + integration tests.

### Phase 4 — Salt Edge / PSD2 integration
- [ ] `SaltEdgeClient` (Java HTTP client + signing).
- [ ] `SaltEdgeWebhookServlet` + signature verification.
- [ ] `SaltEdgeSyncProcess` (scheduler-driven).
- [ ] `FinancialAccountHandler` actions (`syncNow`, `disconnectPSD2`, `archive`).
- [ ] AD_Preference for App ID/Secret, encrypted.
- [ ] Re-authorization expiry handling.
- [ ] Frontend: `SaltEdgeConnectWidget.jsx` + `NewAccountWizard.jsx` + `EditAccountModal.jsx`.
- [ ] Sandbox end-to-end test with Salt Edge demo bank.

### Phase 5 — Deferred accounting
- [ ] `PostReconciledProcess` (manual + scheduled).
- [ ] State machine enforcement in `ReconciliationHandler`.
- [ ] `ReactivateReconciliationProcess` (delegate to Payment Removal).
- [ ] UI: "Contabilizar" button on configuration screen + scheduler config.
- [ ] Integration tests: post → reactivate → re-post cycle.

### Phase 6 — Cuentas page + Vista cuenta financiera
- [ ] `FinancialAccountsPage.jsx` (standalone page) + sidebar widgets + per-row kebab.
- [ ] `windows/custom/financial-account/index.jsx` with 3 tabs.
- [ ] `MovimientosTab.jsx` (custom column set + Estado derivation).
- [ ] `ReconciliacionTab.jsx` + `ReconciliationSplitPanel.jsx` (shared component).
- [ ] `ExtractosImportadosTab.jsx`.
- [ ] Update `menu.json` + `registry.js` + retire old `bank-reconciliation` generated view (or keep as legacy).

### Phase 7 — Polish
- [ ] `data-testid` selectors per `docs/e2e-testing-guide.md`.
- [ ] Playwright mocked spec (`e2e/tests/flows/bank-reconciliation.mocked.spec.js`).
- [ ] i18n complete (en_US.json + es_ES.json).
- [ ] Performance: Conciliación tab pagination on accounts with >10k transactions.
- [ ] Update `docs/generated-custom-windows/bank-reconciliation.md` (or replace it with `financial-account.md` if that becomes the new entry point).
- [ ] Cross-system checklist (`docs/cross-system-checklist.md`).

### Phase 8 — Cutover & rollout
- [ ] Migration script: for existing tenants, no data migration required (new tables are additive). For old `bank-reconciliation` users, ensure menu redirects.
- [ ] Feature flag `ETBR_EnableNewUI` (default off) for safe rollout.
- [ ] User documentation in customer-facing wiki.
- [ ] Sandbox demo to product / stakeholders before GA.

---

## 13. Testing Strategy

| Layer | Tool | Cases (min) |
|-------|------|-------------|
| Java unit | JUnit | Rule pattern matching (literal/start/regex) × tolerance permutations; priority ordering; conflict detection; state machine guards; PSD2 signature verification; idempotent webhook replay |
| Java integration | OBBaseTest | AutoMatchProcess against synthetic statement; PostReconciledProcess all-or-nothing rollback; ReactivateReconciliationProcess round-trip |
| Frontend unit | Vitest | Movimientos Estado derivation; split-panel selection state; rule editor validation; SaltEdge widget mock |
| Contract tests | Node test runner (`make test`) | Field presence + visibility + searchable filters for all new entities |
| E2E | Playwright (mocked) | Cuentas landing → click "Conciliar (N)" → accept all groups → assert states; Reglas CRUD; manual reconcile from split panel; Reactivar from Contabilizado |

Per CLAUDE.md: every kept rule must have a behavioral test; every process must declare ≥3 edge cases.

---

## 14. i18n Keys

Every string user-facing — must land in BOTH `en_US.json` and `es_ES.json`. Indicative list (final list emerges during build):

```
finance.accounts.title                            "Cuentas" / "Accounts"
finance.accounts.new                              "+ Nueva cuenta" / "+ New account"
finance.accounts.rules                            "Reglas de matcheo" / "Matching rules"
finance.accounts.balance.total                    "Saldo" / "Balance"
finance.accounts.pending.title                    "Pendientes por conciliar" / "Pending to reconcile"
finance.accounts.action.reconcileN                "Conciliar ({count})" / "Reconcile ({count})"
finance.accounts.action.openAccount               "Abrir cuenta" / "Open account"
finance.accounts.action.editAccount               "Editar cuenta" / "Edit account"
finance.accounts.action.editConnection            "Editar conexión PSD2" / "Edit PSD2 connection"
finance.accounts.action.syncNow                   "Sincronizar ahora" / "Sync now"
finance.accounts.action.disconnectPSD2            "Desconectar PSD2" / "Disconnect PSD2"
finance.accounts.action.archive                   "Archivar cuenta" / "Archive account"
finance.accounts.type.bank                        "Banco" / "Bank"
finance.accounts.type.card                        "Tarjeta" / "Card"
finance.accounts.type.cash                        "Caja" / "Cash"
finance.reconcile.status.pending                  "Pendiente" / "Pending"
finance.reconcile.status.suggested                "Con sugerencia" / "Suggested"
finance.reconcile.status.reconciled               "Conciliado" / "Reconciled"
finance.reconcile.status.posted                   "Contabilizado" / "Posted"
finance.reconcile.status.differenced              "Con diferencia" / "With difference"
finance.reconcile.action.conciliar                "Conciliar" / "Reconcile"
finance.reconcile.action.reactivar                "Reactivar" / "Reactivate"
finance.reconcile.action.transferir               "Transferir" / "Transfer"
finance.reconcile.action.nuevoDocumento           "Nuevo documento" / "New document"
finance.reconcile.suggested.title                 "Conciliación automática sugerida" / "Suggested automatic reconciliation"
finance.reconcile.suggested.cta                   "Conciliar {count} grupos" / "Reconcile {count} groups"
finance.rules.new                                 "Nueva Regla de Conciliación" / "New Reconciliation Rule"
finance.rules.field.condition                     "Condición sobre el concepto" / "Concept condition"
finance.rules.field.pattern                       "Patrón a buscar" / "Pattern to match"
finance.rules.field.priority                      "Prioridad" / "Priority"
finance.rules.field.affectsTo                     "Afecta a" / "Applies to"
finance.rules.field.tolerance                     "Tolerancia de importe" / "Amount tolerance"
finance.rules.field.autoCreate                    "Crear transacción automáticamente" / "Create transaction automatically"
finance.rules.field.dimension                     "Dimensión" / "Dimension"
finance.account.tab.movimientos                   "Movimientos" / "Movements"
finance.account.tab.conciliacion                  "Conciliación" / "Reconciliation"
finance.account.tab.extractos                     "Extractos importados" / "Imported statements"
finance.account.kpi.saldoActual                   "Saldo actual" / "Current balance"
finance.account.kpi.entradas                      "Entradas" / "Inflows"
finance.account.kpi.salidas                       "Salidas" / "Outflows"
finance.psd2.connect.title                        "Vincula tu banco" / "Link your bank"
finance.psd2.reAuth.warning                       "La autorización PSD2 expira en {days} días. Re-autoriza antes para no interrumpir la sincronización." / "..."
```

---

## 15. Known Risks & Open Questions

### Risks
- **Real banking flow**: any data loss or duplicate posting is unacceptable. Mitigation: feature flag, dry-run mode, comprehensive integration tests, full audit log on `ETBR_Match_Suggestion`.
- **PSD2 credentials**: rotation, expiry, and webhook security must be airtight. Mitigation: never persist credentials locally; rely on Salt Edge's vault.
- **State machine ambiguity**: Etendo's own `FIN_Reconciliation.Status` semantics overlap with our new states. Mitigation: keep ours in `ETBR_PostStatus` to avoid clashing with Etendo's existing `Status` field.
- **Posting batch performance**: tenants with thousands of pending lines must not block the scheduler. Mitigation: per-header transaction, chunked processing, time budget.
- **Concurrent reconciliation**: two users on the same account opening the same suggestion popup. Mitigation: optimistic locking on `ETBR_Match_Suggestion.Status` (CAS update).
- **Rule explosion**: pathological regex patterns can DoS the matcher. Mitigation: cap regex compile time, validate at save with timeout.

### Open Questions (need stakeholder input)
1. **Salt Edge or Tink?** Doc shows "Salt Edge" and "Tink" both — confirm vendor.
2. **Card statements from PSD2** — doc estimates 5h Etendo Classic dev; in which phase do we tackle it?
3. **Multi-organization** — can a single PSD2 connection map to multiple `AD_Org_ID`s, or strictly 1:1?
4. **Currency handling** — multi-currency reconciliation (extract in EUR, payment in USD) tolerance rules?
5. **Reverse posting accounting period** — when reactivating from Contabilizado, do we post the reversal in current period or the original period? (Standard Etendo defaults to current; confirm.)
6. **"Reglas que afectan a Todas las cuentas"** — apply during sync of every account, or lazily when opening the account screen?
7. **Audit trail visibility** — does the user need to see "esta regla matcheó esta línea" history? Where in the UI?

---

## 16. Out of Scope (this iteration)

- Advanced matching algorithm (explicitly disallowed by doc §6.1).
- Card statement processing from PSD2 — 5h Classic dev, follow-up ticket.
- Multi-currency reconciliation (single-currency MVP).
- Bulk rule import/export.
- Drag-and-drop priority reordering with persistence (priority is integer-only for MVP; drag UI is future).
- Mobile / responsive layouts.
- ML-based rule suggestions.
- Audit panel / changelog for reconciliations beyond `AD_AuditTrail` defaults.

---

## 17. File Inventory (anticipated)

### `com.etendoerp.bankreconciliation` (runtime module)
```
modules/com.etendoerp.bankreconciliation/
  src-db/database/model/
    ETBR_MatchRule.xml
    ETBR_MatchRule_Dim.xml
    ETBR_PSD2_Connection.xml
    ETBR_Match_Suggestion.xml
    modifiedTables/
      FIN_Reconciliation_Line.xml     (adds ETBR_PostStatus, ETBR_MatchRule_ID)
      FIN_FinAcc_Transaction.xml      (adds ETBR_AutoCreated_From_Rule, ETBR_ReconcileStatus)
      FIN_Financial_Account.xml       (adds ETBR_AccountType)
  src/com/etendoerp/bankreconciliation/
    handlers/
      FinancialAccountHandler.java
      ReconciliationHandler.java
      MatchRuleHandler.java
      MatchSuggestionHandler.java
    process/
      AutoMatchProcess.java
      ApplyMatchRulesProcess.java
      PostReconciledProcess.java
      ReactivateReconciliationProcess.java
    psd2/
      SaltEdgeClient.java
      SaltEdgeSyncProcess.java
      SaltEdgeWebhookServlet.java
    webhooks/
      BRSyncNow.java
      BRDisconnectPSD2.java
      BRReactivateReconciliation.java
    state/
      ReconcileStateMachine.java
  src-test/com/etendoerp/bankreconciliation/
    process/AutoMatchProcessTest.java
    process/PostReconciledProcessTest.java
    process/ApplyMatchRulesProcessTest.java
    psd2/SaltEdgeClientTest.java
```

### `schema_forge` (this repo)
```
artifacts/
  financial-account/
    decisions.json
    schema-raw.json
    contract.json
    generated/web/financial-account/  (regen only — Custom layout has minimal generated)
  bank-reconciliation/                 (REBUILD)
    decisions.json
    schema-raw.json
    contract.json
    generated/...
  match-rule/
    decisions.json
    schema-raw.json
    contract.json
    generated/...
tools/app-shell/src/
  pages/
    FinancialAccountsPage.jsx          NEW
    FinancialAccountsPage.test.jsx     NEW
  windows/custom/
    financial-account/
      index.jsx                        NEW (layoutType: custom)
      MovimientosTab.jsx               NEW
      ReconciliacionTab.jsx            NEW
      ExtractosImportadosTab.jsx       NEW
      EditAccountModal.jsx             NEW
      NewAccountWizard.jsx             NEW
      FinancialAccountKpiCards.jsx     NEW (sidebar widget)
      __tests__/...                    NEW
    match-rule/
      NewRuleModal.jsx                 NEW
      MatchRuleTable.jsx               NEW (priority column + Active toggle)
  components/contract-ui/
    ReconciliationSplitPanel.jsx       NEW shared
    AutoMatchSuggestionModal.jsx       NEW shared
    SaltEdgeConnectWidget.jsx          NEW shared
    __tests__/...                      NEW
  locales/
    en_US.json                         AUGMENT
    es_ES.json                         AUGMENT
  menu.json                            UPDATE (replace bank-reconciliation entry with financial-account)
  windows/registry.js                  UPDATE
docs/
  generated-custom-windows/
    financial-account.md               NEW (replaces bank-reconciliation.md as canonical entry)
  plans/
    2026-05-21-bank-reconciliation-module.md   (this file)
e2e/tests/flows/
  bank-reconciliation.mocked.spec.js   NEW
```

---

## 18. Task Breakdown by Flow

> **Convención Etendo (Git Police):** cada tarea, cuando se cree en Jira, debería llevar un ID `ETP-XXXX`. Hasta entonces, los IDs `T1…T12` son placeholders. Cada tarea respeta:
>
> - **Branch:** `feature/ETP-XXXX` (cuando exista el Jira) o `feature/br-tNN-<slug>` para prototipos sin Jira.
> - **Commit:** `Feature ETP-XXXX: <descripción>` (máx 70 chars la primera línea).
> - **PR title:** `Feature ETP-XXXX: <descripción>`.
> - **PR target:** `develop`.
> - **Sin `Co-Authored-By`** (Git Police lo rechaza).
>
> Las tareas se agrupan en 5 flujos. Cada flujo entrega algo demostrable de punta a punta. Las dependencias se anotan al inicio de cada tarea — todo lo que no sea dependencia explícita se puede paralelizar.

### Flujo 1 — Lista de Cuentas (entry point)

Objetivo: la página "Cuentas" (mockup `1 · Lista de cuentas`) trayendo las cuentas reales de Etendo y dejando navegable el alta, edición y archivado.

#### **T1 — Cuentas: página + lectura de FIN_Financial_Account**
- **Dependencias:** ninguna.
- **Branch sugerida:** `feature/br-t01-accounts-list`
- **Scope:**
  - Nueva página standalone `tools/app-shell/src/pages/FinancialAccountsPage.jsx` (NO va bajo `artifacts/` porque no es una ventana AD).
  - Entrada en `menu.json` (puede convivir con el viejo `bank-reconciliation` hasta el cutover).
  - Sidebar izquierdo: saldo total + breakdown por divisa + widget "Pendientes por conciliar" (counters: cuentas con pendientes, sugerencias listas, por regla) — los counters pueden quedar en `0` o mocked en este ticket.
  - Tabla central con columnas: cuenta (logo + nombre + IBAN/IBAN masked), tipo, saldo, "Por conciliar" (pill `Conciliar (N)` o `Conectar PSD2` o `—`), kebab.
  - Filtro "Todas las cuentas" → dropdown con `Banco / Caja / Tarjeta / Todas`.
  - Botones top-right: `+ Nueva cuenta` y `Reglas de matcheo` **visibles pero no funcionales** (los activan T2/T6).
  - Kebab visible, todas las acciones desactivadas/disabled excepto `Abrir cuenta` que ya debe poder navegar a `/financial-account/{id}` (placeholder routing por ahora — T4 lo materializa).
  - Lectura: NEO Headless spec `financial-account` (crear si no existe) consumiendo `FIN_Financial_Account` con campos `Name`, `Type`, `IBAN`, `CurrentBalance`, `C_Currency_ID`, `IsActive`.
- **Criterios de aceptación (testable):**
  - [ ] Al abrir `/finance/accounts` se ven las cuentas activas reales del cliente Etendo logueado.
  - [ ] Saldo total y breakdown por divisa cuadran con la suma de las cuentas listadas.
  - [ ] Filtro de tipo restringe la tabla correctamente.
  - [ ] Click en una fila navega a `/financial-account/{id}` (página puede mostrar placeholder).
  - [ ] La página queda accesible desde el menú Finance.
  - [ ] Vitest cubre: render con N cuentas, filtros, sidebar agregados.
- **Out of scope (este ticket):** acciones del kebab funcionales, alta nueva, edición, PSD2.

#### **T2 — Nueva cuenta (modal alta sin conexión)**
- **Dependencias:** T1 (botón `+ Nueva cuenta` ya existe pero deshabilitado).
- **Branch sugerida:** `feature/br-t02-new-account-offline`
- **Scope:**
  - Modal `NewAccountWizard.jsx` con paso 1 = picker de tipo (Banco / Caja / Tarjeta).
  - Para Banco/Caja en pestaña "Sin conexión": formulario con `Nombre de la cuenta`, `IBAN` (opcional para Caja), `BIC/SWIFT` (opcional), `Moneda` (default desde sesión). Validación de IBAN con regex estándar.
  - Submit → `POST` al endpoint NEO Headless de `FIN_Financial_Account` con los campos correctos (`Type=B` o `C`, `IsActive=Y`, `C_Currency_ID`).
  - Refresco automático de la tabla de Cuentas tras la creación (mostrar toast de éxito).
  - Botón `+ Nueva cuenta` queda activo.
- **Criterios de aceptación:**
  - [ ] Crear cuenta Banco sin conexión → aparece en la tabla con saldo 0.
  - [ ] Crear cuenta Caja → aparece con tipo correcto.
  - [ ] IBAN inválido → error inline antes de submit.
  - [ ] Cancelar el modal no crea nada.
  - [ ] Vitest cubre: validación, submit feliz, submit con error backend.
- **Out of scope:** pestaña "Con conexión" (Salt Edge) — T12. Tarjeta completa con flujo PSD2 — T12.

#### **T3 — Editar cuenta + Archivar**
- **Dependencias:** T2 (ya hay cuentas creables; reutiliza modal infra).
- **Branch sugerida:** `feature/br-t03-edit-archive-account`
- **Scope:**
  - Modal `EditAccountModal.jsx` con secciones: `Datos de la cuenta` (Nombre interno, Tipo, IBAN, Moneda, Cuenta contable, Organización).
  - Sección "Conexión bancaria PSD2" visible pero **deshabilitada** con mensaje "Disponible próximamente" (la activa T12).
  - Botón `Archivar cuenta` (destructivo, rojo) → confirmación → flip `IsActive=N` vía webhook nuevo `BRArchiveAccount` o action endpoint en `FinancialAccountHandler`.
  - Kebab de la fila: activar acciones `Editar cuenta`, `Archivar cuenta`. Las restantes (`Editar conexión PSD2`, `Sincronizar ahora`, `Importar extracto manual`, `Desconectar PSD2`) quedan disabled hasta T12.
  - Cuenta archivada desaparece del listado por defecto (filtro implícito `IsActive=Y`). Opcional: toggle "Mostrar archivadas".
- **Criterios de aceptación:**
  - [ ] Editar nombre/cuenta contable/moneda persiste cambios.
  - [ ] Archivar pide confirmación y luego la cuenta sale del listado.
  - [ ] No se puede archivar una cuenta con reconciliaciones abiertas (validación backend con error 409 claro).
  - [ ] JUnit cubre el handler de archivado + validación.

### Flujo 2 — Vista de cuenta financiera

Objetivo: al hacer click en una fila de Cuentas, abrir el detalle con 3 tabs según los mockups de Figma de "PASANDO EN LIMPIO".

#### **T4 — Vista cuenta financiera (tabs Movimientos + Extractos importados)**
- **Dependencias:** T1 (navegación desde Cuentas).
- **Branch sugerida:** `feature/br-t04-account-detail-view`
- **Scope:**
  - Schema Forge artifact `financial-account/` con `decisions.json` v2 y `layoutType: "custom"`.
  - `windows/custom/financial-account/index.jsx` renderiza header con nombre/IBAN/saldo + tabs locales: `Movimientos` (default), `Conciliación` (placeholder), `Extractos importados`.
  - **Tab Movimientos:**
    - KPIs top: `Saldo Actual`, `Entradas` (suma últimos 30d), `Salidas`. **Quitar** "Sin contabilizar" (per doc).
    - Filtros: `Todos los estados | Últimos 30 días | Cualquier tipo | Cualquier importe | search | Exportar | + Nuevo movimiento`.
    - Columnas: `Fecha | Documento | Contacto | Descripción | Estado | Tipo | Importe | Saldo | ⋮`. **Quitar** la vieja `Tercero/Conciliación` combinada (per doc).
    - Estado derivado: Borrador / Completado / Conciliado / Contabilizado (lógica documentada en §11).
    - Datasource: `FIN_FinAcc_Transaction` filtrado por `FIN_FinancialAccount_ID`.
    - Kebab por fila: `Ver detalle`, `Desconciliar` (disabled — T11), `Contabilizar` (disabled — T10).
  - **Tab Extractos importados:**
    - Listado read-mostly de `FIN_Bank_Statement` con `Name`, `StatementDate`, `BeginningBalance`, `EndingBalance`, `DocStatus`, `Posted`.
    - Sin acciones de edición; click puede navegar a la ventana clásica.
  - **Tab Conciliación:** placeholder con mensaje "Pendiente de implementación — T7".
- **Criterios de aceptación:**
  - [ ] Click cuenta → abre vista detalle con tabs.
  - [ ] Movimientos muestra todas las tx del FIN_Financial_Account elegido con la columna Estado correcta.
  - [ ] KPIs cuadran con los movimientos visibles (suma respecta filtros activos).
  - [ ] Extractos importados muestra los `FIN_Bank_Statement` reales del cliente.
  - [ ] Vitest + contract tests sobre el artifact.
- **Out of scope:** tab Conciliación, `+ Nuevo movimiento`, kebab funcional.

### Flujo 3 — Reglas de matcheo

Objetivo: poder dar de alta y mantener reglas sin que aún se ejecuten (el motor entra en T9).

#### **T5 — Backend reglas: módulo, tabla, AD window, handler**
- **Dependencias:** ninguna (paralelizable con T1–T4).
- **Branch sugerida:** `feature/br-t05-match-rule-backend`
- **Scope:**
  - Crear módulo `com.etendoerp.bankreconciliation` (estructura ETF: `AD_Module.xml`, `gradle`, etc.) usando `/etendo:module`.
  - Tablas `ETBR_MatchRule` + `ETBR_MatchRule_Dim` (definir vía XML — `make uuid` para PKs).
  - `AD_Window` + `AD_Tab` + `AD_Field` con `/etendo:alter-db` webhooks.
  - `MatchRuleHandler implements NeoHandler` (`@Named("matchRule")`) con: validación regex compila, prioridad única por scope, refresco de `ETBR_MatchCount`.
  - Schema Forge artifact `match-rule/` (`decisions.json` v2, `push-to-neo` para registrar la spec).
  - JUnit para validador.
- **Criterios de aceptación:**
  - [ ] `./gradlew update.database` instala la tabla sin errores.
  - [ ] `make uuid` se usa para todos los IDs nuevos (no UUIDs inventados).
  - [ ] POST a `/match-rule` con regex inválida devuelve 400 con mensaje claro.
  - [ ] POST con prioridad duplicada devuelve 409.
  - [ ] JUnit cubre los 3 modos de `TextCondition` (`C`/`S`/`R`).
  - [ ] Validador `validate-pipeline.js` queda en 0 violations.
- **Out of scope:** ejecución del motor (T9), UI custom (T6).

#### **T6 — Frontend reglas: lista + modal Nueva regla**
- **Dependencias:** T5 (endpoint disponible), T1 (botón `Reglas de matcheo` ya existe).
- **Branch sugerida:** `feature/br-t06-match-rule-ui`
- **Scope:**
  - Activar el botón `Reglas de matcheo` en Cuentas → navega a `/match-rule`.
  - `windows/custom/match-rule/MatchRuleTable.jsx`: columnas Prio (input editable inline o drag-handle), Nombre, Cuenta financiera afectada, Tolerancia, Conciliaciones (count read-only), Activa (toggle).
  - `windows/custom/match-rule/NewRuleModal.jsx` con todos los campos del screenshot (§7.5).
  - Toggle Activa hace PATCH inline.
  - Banner `Las reglas se evalúan en orden de prioridad`.
  - Submodal `Dimensiones` con 3 dropdowns combobox preconfigurados.
- **Criterios de aceptación:**
  - [ ] Crear / editar / inactivar regla persiste.
  - [ ] Reglas ordenadas por prioridad ascendente.
  - [ ] `Crear transacción automáticamente` se persiste correctamente.
  - [ ] Dimensiones (1..3) persisten en `ETBR_MatchRule_Dim`.
  - [ ] Vitest cubre el modal y validaciones de cliente.
- **Out of scope:** ejecución de reglas (T9).

### Flujo 4 — Conciliación

Objetivo: la pieza central — conciliación manual primero, automática después.

#### **T7 — Conciliación manual (tab Conciliación + split panel 50/50)**
- **Dependencias:** T4 (tab placeholder existe).
- **Branch sugerida:** `feature/br-t07-manual-reconciliation`
- **Scope:**
  - Nuevo componente compartido `components/contract-ui/ReconciliationSplitPanel.jsx`:
    - Layout 50/50 ajustable.
    - Panel izquierdo: `FIN_Bank_Statement_Line` no conciliadas, prefiltradas `Pendientes / Últimos 12 meses`, con filtros por estado/fecha/importe/búsqueda.
    - Panel derecho: `FIN_FinAcc_Transaction` + `C_Invoice` + `FIN_Payment` no conciliadas, filtrable por tipo (`F. Venta`, `Tickets de venta`, `Compras rectificativas`, `Remesas`, `Cobros`, `F. Compra`, `Tickets de compra`, `Nóminas`, `Ventas rectificativas`, `Pagos`).
    - Click en línea izquierda → header del panel derecho muestra resumen del extracto (fecha, descripción, importe en rojo/verde).
    - Bottom action bar: `Documentos seleccionados: +X,XX €`, `Restante por conciliar: -X,XX €`, botones `Transferir`, `Nuevo documento`, `Conciliar` (deshabilitado si totales no cuadran o no hay selección).
  - Estado visual de filas: Pendiente (gris), Conciliado (verde), Con sugerencia (azul), Por regla (amarillo), Con diferencia (rojo).
  - `Conciliar` → POST `/reconciliation/action/reconcileGroup` que llama al `FIN_AddPayment` / `FIN_BankStatementHandler` estándar de Etendo.
  - `ReconciliationHandler` (`@Named("bankReconciliation")`) con la action `reconcileGroup`.
  - El boton `Conciliar` se renombra `Reactivar` si la(s) líneas seleccionadas están conciliadas (delegación a T11).
  - Botón `Automatch` top-right (deshabilitado — T8 lo activa).
  - `+ Nuevo documento` y `Transferir` reutilizan los flujos existentes de Etendo (crear pago / crear transferencia).
- **Criterios de aceptación:**
  - [ ] Importar manualmente un extracto (.txt) y conciliar 1 línea contra 1 cobro → ambos quedan en estado Conciliado.
  - [ ] Conciliar 1 línea de extracto contra N operaciones (suma = importe extracto) funciona.
  - [ ] Si suma operaciones ≠ importe extracto el botón Conciliar queda disabled o pide diferencia.
  - [ ] Filtros del panel derecho restringen por tipo correctamente.
  - [ ] JUnit + integration test (OBBaseTest) que valide creación correcta del `FIN_Reconciliation_Line`.
  - [ ] Vitest sobre `ReconciliationSplitPanel`.
- **Out of scope:** Automatch automático (T8), reglas (T9), contabilización (T10).

#### **T8 — Conciliación automática sugerida (popup, algoritmo estándar)**
- **Dependencias:** T7 (UI base + handler), T1 (pill `Conciliar (N)`).
- **Branch sugerida:** `feature/br-t08-auto-match-suggested`
- **Scope:**
  - `AutoMatchProcess.java` que envuelve el algoritmo estándar de Etendo (`FIN_BankStatementHandler` para la coincidencia exacta + tolerancia fecha + referencia).
  - Persistencia de sugerencias en `ETBR_Match_Suggestion` agrupadas con `GroupKey` (1 línea de extracto + N candidatos).
  - Action endpoint `POST /reconciliation/action/autoMatch?financialAccountId=...` devuelve `{groups: [...]}`.
  - Action `POST /reconciliation/action/applySuggestions` con `{groupIds: []}`.
  - Componente compartido `components/contract-ui/AutoMatchSuggestionModal.jsx` con quadrants 1:N, checkbox por grupo, contador "Se conciliarán X ops".
  - Trigger desde pill `Conciliar (N)` en Cuentas + botón `Automatch` en tab Conciliación.
  - "Abrir conciliación" navega al tab Conciliación con la cuenta preseleccionada.
- **Criterios de aceptación:**
  - [ ] Importar extracto con 10 líneas y 10 pagos coincidentes → popup muestra 10 grupos sugeridos.
  - [ ] Desmarcar un grupo lo excluye del bulk.
  - [ ] Conciliar 8 grupos resulta en 8 reconciliations creadas y la pill baja de `Conciliar (10)` a `Conciliar (2)`.
  - [ ] Misma línea de extracto no puede tener dos suggestion activas simultáneas.
  - [ ] JUnit con ≥3 edge cases: tolerancia fecha exacta, importes con redondeo, sin matches.
  - [ ] Playwright mocked spec cubre el flujo completo.
- **Out of scope:** reglas (T9 las añade como segundo pass).

#### **T9 — Motor de reglas integrado al automatch**
- **Dependencias:** T5/T6 (reglas existen) + T8 (popup base).
- **Branch sugerida:** `feature/br-t09-match-rules-engine`
- **Scope:**
  - `ApplyMatchRulesProcess.java` ejecutándose como segundo pass dentro de `AutoMatchProcess`, solo para líneas que el algoritmo estándar no resolvió Y que no apuntan a una factura.
  - Eval por prioridad ascendente; primera regla matching gana, las demás se devuelven como `alternatives[]`.
  - Si `CreateTransaction=Y` y no hay tx target, materializa `FIN_FinAcc_Transaction` con `ETBR_AutoCreated_From_Rule` apuntando a la regla.
  - Suggestion resultante: `Origin='R'`, `ETBR_MatchRule_ID` set.
  - Frontend: badges `Por regla "{name}"` y `Nueva` (cuando creates tx) en `AutoMatchSuggestionModal`.
  - Counter `ETBR_MatchCount` de la regla se incrementa al aceptar la sugerencia.
- **Criterios de aceptación:**
  - [ ] Crear regla "Comisiones" condición contiene "COMISION" + CreateTransaction=Y → importar extracto con línea "COMISION MTTO MAYO" → popup muestra grupo "Por regla Comisiones / Nueva".
  - [ ] Aceptar el grupo crea `FIN_FinAcc_Transaction` con cuenta contable de la regla.
  - [ ] Regla con regex inválida no rompe el proceso (validación previa de T5).
  - [ ] Reglas inactivas (IsActive=N) no se evalúan.
  - [ ] Línea con factura asociada NO pasa por reglas (verificado por test).
  - [ ] JUnit con ≥5 edge cases (prioridades empate, tolerancia, multi-rule, alternatives, no-match).
- **Out of scope:** contabilización diferida (T10).

#### **T10 — Contabilización diferida (manual + scheduler)**
- **Dependencias:** T7 (reconciliations existen).
- **Branch sugerida:** `feature/br-t10-deferred-accounting`
- **Scope:**
  - Columna nueva `FIN_Reconciliation_Line.ETBR_PostStatus` (`P` pending, `D` done, `F` failed) — añadir vía XML.
  - `PostReconciledProcess.java`: selecciona `ETBR_PostStatus='P'`, agrupa por header, una OBDal transaction por header, llama a `AcctServer.post()` del std Etendo.
  - Scheduler con frecuencia configurable (AD_Preference `ETBR_PostFrequency`, default "Cada Hora").
  - Botón `Contabilizar` en una pantalla de configuración del módulo (puede vivir en `pages/SettingsPage.jsx` bajo sección Finance, o en kebab del tab Conciliación).
  - State machine enforcement en `ReconciliationHandler`: rechaza PUT/DELETE sobre `FIN_FinAcc_Transaction` cuyo `ETBR_PostStatus='D'`.
  - Estado UI Movimientos: `Conciliado` (P) vs `Contabilizado` (D) ahora son visualmente distintos.
- **Criterios de aceptación:**
  - [ ] Conciliar una línea → estado Conciliado + ETBR_PostStatus=P.
  - [ ] Pulsar Contabilizar → estado pasa a Contabilizado + asiento creado.
  - [ ] Scheduler corre cada hora y procesa lo pendiente automáticamente.
  - [ ] Error en una reconciliation NO aborta el batch (la marca F, sigue con el resto).
  - [ ] Editar amount/date sobre tx Contabilizada devuelve 409.
  - [ ] OBBaseTest cubre: feliz, rollback parcial, idempotencia (re-correr no duplica).
- **Out of scope:** Reactivar (T11).

#### **T11 — Reactivar Conciliación**
- **Dependencias:** T10 (existen líneas contabilizadas).
- **Branch sugerida:** `feature/br-t11-reactivate-reconciliation`
- **Scope:**
  - Wrapper `ReactivateReconciliationProcess.java` que delega al "Reactivar Conciliación" existente del módulo Payment Removal (NO reimplementar).
  - Webhook `BRReactivateReconciliation` para dispararlo.
  - Frontend: en tab Conciliación, si el usuario selecciona líneas conciliadas/contabilizadas, el botón `Conciliar` se vuelve `Reactivar` (label dinámico).
  - En tab Movimientos: kebab → `Desconciliar` (sobre P) o `Reactivar` (sobre D) — ambos llaman al mismo wrapper, el handler decide qué hacer según `ETBR_PostStatus`.
  - Confirmación modal "Esta acción desconciliará y descontabilizará la(s) línea(s). ¿Continuar?".
- **Criterios de aceptación:**
  - [ ] Reactivar línea contabilizada deshace asiento + deja la operación en Completado (no Pendiente).
  - [ ] Reactivar línea solo conciliada (no contabilizada) la deja en Completado.
  - [ ] No se puede reactivar si el período contable está cerrado (mensaje claro).
  - [ ] Integration test que verifique atomicidad (un-post + un-reconcile en la misma tx).
- **Out of scope:** PSD2 (Flujo 5).

### Flujo 5 — PSD2 / Salt Edge (track paralelo, puede shipear al final)

Objetivo: importación automática vía PSD2. Este flujo es independiente del resto y puede correr en paralelo desde T2/T3.

#### **T12 — PSD2 / Salt Edge: connect, sync y panel PSD2 en Editar cuenta**
- **Dependencias:** T3 (modal Editar cuenta con sección PSD2 placeholder).
- **Branch sugerida:** `feature/br-t12-saltedge-psd2`
- **Scope:**
  - Tabla `ETBR_PSD2_Connection` + XML.
  - `SaltEdgeClient.java` (HTTP signed con `App ID`/`Secret` desde `AD_Preference` cifrado).
  - `SaltEdgeWebhookServlet` mapeado en `/sws/etbr/saltedge/callback` con HMAC-SHA256 + de-dup por `SaltEdgeConnectionID + payload hash`.
  - `SaltEdgeSyncProcess` (scheduler driven, por `Periodicity` por cuenta) → llama Salt Edge `GET /transactions?from=LastSync` → inserta en `FIN_Bank_Statement_Line` → dispara `AutoMatchProcess`.
  - `FinancialAccountHandler` actions: `syncNow`, `disconnectPSD2`, `archive`.
  - Frontend:
    - Activar pestaña "Con conexión" en `NewAccountWizard`.
    - Componente `SaltEdgeConnectWidget.jsx` (iframe/new tab al `connect_url` que devuelva el backend).
    - Activar sección PSD2 en `EditAccountModal` con: status, periodicidad, modo auto-conciliación (`solo sugerir` / `auto exactos`), botón `Re-autorizar`, alerta cuando `AuthExpiresAt - hoy < 7 días`.
    - Activar acciones del kebab de Cuentas: `Editar conexión PSD2`, `Sincronizar ahora`, `Desconectar PSD2`, `Importar extracto manual` (este último ya existe en Etendo, solo enlazar).
- **Criterios de aceptación:**
  - [ ] Conectar sandbox bank de Salt Edge desde Nueva cuenta → estado `Connected`.
  - [ ] Sync inicial trae las transacciones esperadas a `FIN_Bank_Statement_Line`.
  - [ ] Webhook con firma inválida devuelve 401.
  - [ ] Webhook repetido (mismo payload) no duplica datos (idempotencia).
  - [ ] Desconectar PSD2 hace DELETE en Salt Edge + Status=D + la cuenta sigue accesible.
  - [ ] `AuthExpiresAt < 7d` muestra banner amarillo en Editar cuenta.
  - [ ] Nada de credenciales en logs.
  - [ ] JUnit con ≥3 edge cases para la firma; OBBaseTest para el flujo de sync.
- **Out of scope:** extractos de tarjeta de crédito (follow-up de 5h en Classic, separado).

### Resumen tabular de tareas

| ID  | Título corto                                       | Flujo | Front | Back | Depende de        | Demuestra                                       |
|-----|----------------------------------------------------|-------|-------|------|-------------------|-------------------------------------------------|
| T1  | Página Cuentas — lectura                           | 1     | ✅    | -    | —                 | Lista de cuentas real                            |
| T2  | Nueva cuenta sin conexión                          | 1     | ✅    | ◐    | T1                | Alta manual de Banco/Caja                        |
| T3  | Editar cuenta + Archivar                           | 1     | ✅    | ◐    | T2                | Edición + soft delete                            |
| T4  | Vista cuenta — tabs Movimientos + Extractos        | 2     | ✅    | ◐    | T1                | Drill-down a movimientos y extractos             |
| T5  | Reglas backend (módulo + tabla + handler)          | 3     | -     | ✅   | —                 | Endpoint reglas funcional                        |
| T6  | Reglas frontend (lista + Nueva regla modal)        | 3     | ✅    | -    | T5, T1            | CRUD UI alineada con Figma                       |
| T7  | Conciliación manual (split panel)                  | 4     | ✅    | ✅   | T4                | Conciliar línea ↔ operación manualmente          |
| T8  | Conciliación automática (popup, algoritmo std)     | 4     | ✅    | ✅   | T7                | Automatch desde pill `Conciliar (N)`             |
| T9  | Motor de reglas integrado                          | 4     | ◐     | ✅   | T5, T6, T8        | "Por regla X / Nueva" en popup                   |
| T10 | Contabilización diferida                           | 4     | ◐     | ✅   | T7                | Contabilizar manual + scheduler                  |
| T11 | Reactivar Conciliación                             | 4     | ◐     | ✅   | T10               | Desconciliar y descontabilizar atómico           |
| T12 | PSD2 / Salt Edge connect + sync                    | 5     | ✅    | ✅   | T3                | Importación automática desde bank sandbox        |

`✅` = trabajo principal del ticket. `◐` = ajuste menor (column add, prop wiring). `-` = no aplica.

### Cuello de botella / camino crítico

```
T1 → T2 → T3 → T12 (PSD2)
 │     │
 │     └→ T4 → T7 → T8 → T9
 │                  │     │
 │                  ├→ T10 → T11
 │                  │
 └→ T5 → T6 ────────┘
```

- **Camino crítico mínimo** para demo "conciliación manual de punta a punta": **T1 → T4 → T7** (3 tareas).
- **Camino para demo "automatch con reglas"**: T1 → T4 → T5 → T6 → T7 → T8 → T9 (7 tareas).
- **Demo completa end-to-end (alineada con los mockups de Figma)**: T1–T11 (11 tareas, sin PSD2).
- **Demo completa con PSD2**: T1–T12 (12 tareas).

### Convenciones de PR por tarea

Cada PR de cualquier T# debe cumplir:

- **Title:** `Feature ETP-XXXX: <descripción ≤80 chars>` (placeholder hasta tener Jira: `Feature br-tNN: ...`).
- **Target branch:** `develop`.
- **Description sections (mandatorias):**
  - `## Summary` (1–3 bullets, qué cambia y por qué)
  - `## Test plan` (checklist de QA)
  - `## Functional spec reference` (link al doc `~/Downloads/Definicion_Funcional_Conciliacion_Bancaria.docx.pdf` + sección relevante)
  - `## Out of scope` (qué queda intencionalmente para tickets posteriores)
- **Mandatory pre-merge:**
  - Crisol (code review) APPROVED
  - Unitas (unit tests) PASSED
  - Vigia (security review) PASSED — extra-critical en T7–T12 por tocar dinero
  - Argos (E2E) PASSED en tickets con cambios user-facing (T1, T2, T6, T7, T8, T9, T11, T12)
  - Validador `make validate-pipeline` en 0 violations para tickets que tocan artifacts.
- **i18n:** todo string nuevo en `en_US.json` + `es_ES.json` antes del review.
- **Docs:** `docs/generated-custom-windows/financial-account.md` y/o `match-rule.md` actualizados en el mismo PR si el ticket toca la ventana.

---

## Appendix A — Quick reference to the functional doc

| Doc section | Topic | Key constraint |
|-------------|-------|----------------|
| §2 Alcance | Module covers import, UI, std + suggested matching, deferred accounting | The new UI (per Figma mockups in "PASANDO EN LIMPIO") replaces ONLY the interactive reconciliation step |
| §3 Conceptos | Glossary | "Match" = vinculación entre línea de extracto y 1..N líneas de operación |
| §4 Flujo | 5-step pipeline | Importación → Std match → Sugerido por reglas → Revisión manual → Contabilización |
| §5 Interfaz | 2-panel layout, status colors, actions | Filtros + búsqueda en ambos paneles; "Crear transacción" se mantiene igual que en Etendo, con opción de generar pago |
| §6 Algoritmo | Std (unchanged) + suggested rules | Rules NOT for invoice-backed lines |
| §6.2 Estructura regla | Nombre / Condición / Tipo tx / Cuenta / Tercero / Tolerancia / Cuenta financiera / Activa | Rules evaluated by priority |
| §7 Contabilización | Deferred — only after Conciliado | Two modes: scheduler + manual button |
| §7.4 Estados | Pendiente / Conciliado / Contabilizado / Desconciliado | Contabilizado no puede desconciliarse — reactivar |
| §8 Configuración | Tolerancia fecha (3d) / Tolerancia % (0) / Frecuencia post (1h) / Crear tx auto (Y) | All configurable per admin |
| Notas | Descontabilización manual no necesaria | Reusar "Reactivar Conciliación" del módulo Payment Removal |
| Mockups | Lista de cuentas + Popups + Vista cuenta financiera (3 tabs) | Visual reference for Phase 6 |
