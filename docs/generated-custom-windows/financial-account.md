# Financial Account — Account Management (ETP-4096)

> This section covers the **create / edit / archive** flows introduced in ETP-4096. The detail view (movements, reconciliation, statements) is documented below.

## What ETP-4096 adds

- `+ Nueva cuenta` button in the Cuentas list opens a **multi-step wizard** (`NewAccountWizard.jsx`) for offline account creation.
- Each row kebab gains **Edit account** (opens `EditAccountModal.jsx`) and **Archive account** (opens `ArchiveAccountDialog.jsx`).
- ETP-4871 adds a real **Delete account** action (opens `DeleteAccountDialog.jsx`), shown only when the row's `deletable` flag is true — independent of Archive/Unarchive, so both can be offered on the same account.
- A new backend spec `financial-account` (`FinancialAccountHandler`) powers create / update / archive / delete / defaults over a single report-style endpoint.

## New Account Wizard — step flow

```
TYPE          → 3 cards: Bank / Cash / Card
  Bank        → CONNECTION (toggle Connected[disabled] / Without connection)
                  Without connection → BANK      (flag-area search + popular grid + skip link)
                                        → INSTITUTION (bank display field + institution list)
                                           → FORM-BANK (Name* / IBAN / BIC-SWIFT / Currency)
  Cash        → FORM-CASH (Name* / Currency)
  Card        → CONNECTION (toggle Connected[disabled, future bank connection] / Without connection)
                  Without connection → BANK → INSTITUTION → FORM-CARD (Name* / Currency)
```

The **Card** type comes from the **PSD2 module**, which adds the `AD_Ref_List` value `VALUE=CA` ("Card")
to the core "Financial account type" reference (`A6BDFA712FF948CE903C4C463E832FC1`). Schema Forge reuses it
(it does NOT define its own). `FinancialAccountHandler.normalizeType` keeps `C`/`CA` and coerces everything
else to `B`; the frontend `ACCOUNT_TYPE.CARD` is `'CA'`.

- State is kept in a single `{ step, accountType, connection, selectedBank, selectedInstitution, query }` object inside `NewAccountWizard.jsx`. No external store.
- The back `←` button reverts one step. For the form step the target depends on `selectedBank`: if the user skipped bank selection (`null`), back goes to BANK; if they chose one, it goes to INSTITUTION.
- The `+` button in `AccountsToolbar.jsx` opens the wizard; on success the Cuentas list reloads via `useFinancialAccounts().reload`.

### Bank picker (BANK step)

- Flag-area input field: left side shows `<Landmark>` + `<ChevronDown>` in a 60 px border-right box; right side is a plain `<input>` that filters `bankCatalog.js`.
- Popular grid: 3-column, `gap-5` (20 px). Each card is 104 px tall: 40 px icon button + bank name. No bank logo yet — uses `<Landmark>` placeholder.
- "Continue without selecting a bank" link skips BANK → INSTITUTION and sets `selectedBank = null`.

### Institution step (INSTITUTION step)

- Top section displays the selected bank's name in the same flag-area input used in BANK (read-only `<span>` instead of `<input>`).
- Institution list: `gap-4` (16 px) rows; each row has a 24 px circular avatar, institution name, and `<ChevronRight>`. Clicking any row advances to the form.
- There is **no** "Añadir · Sin conexión" row — the user is already in the offline flow.

### Account form (FORM-BANK / FORM-CASH)

- Bank mode fields: Name (required), Country (required, ETP-4896, see below), IBAN (optional, validated with `validateIban` + country-aware `validateIbanForCountry`), BIC/SWIFT (optional), Currency (required, populated from `fetchDefaults()` — restricted server-side to EUR/USD/GBP, see "Currencies" below). The currency field is `CreatableSearchSelect` (`@/components/contract-ui/CreatableSearchSelect`) with `staticOptions`, the same chip-style FK picker used across the app (Contacto, Tarifa, Dirección) and already used by `EditAccountModal.jsx`'s `statementGrouping` field: searchable text input while unselected, a removable `SelectorChip` (ISO code + ×) once a currency is chosen, click the chip to search again. Country uses the same `CreatableSearchSelect` component but in `serverSearch` mode over the live `C_Country_ID` selector (239 active countries, unlike the fixed ~3-currency list) — pre-filled with the organization's country, one-shot guarded (`countryDefaultedRef`) so it never snaps back after the user clears it.
- Cash and Card mode fields: Name (required), Country (required, ETP-4896), Currency (required, same chip picker). No IBAN / BIC.
- **Bank picker → Country (ETP-4896, Flujo A)**: the country the user filters Salt Edge providers by in the `BankPicker` step (the flag dropdown, `NewAccountWizard.jsx`) is lifted up and seeds the form's Country field once it lands on `FORM-BANK`/`FORM-CARD` — e.g. picking a German bank pre-fills Country=Germany instead of the organization's default. A `BANK_COUNTRIES` code with no matching active `C_Country` row falls back silently to the organization default.
- This chip picker is scoped to **account creation** (`AccountFormStep.jsx`, used only by `NewAccountWizard.jsx`). `EditAccountModal.jsx` keeps its own separate, unrelated currency `<Select>` (line ~523) — out of scope for this fix.
- Form layout: `gap-5` (20 px) between fields; `gap-2` (8 px) between label and input; card-surface inputs with a semantic foreground shadow.
- Submit button: pill-shaped (`rounded-full`) and uses the active theme primary/foreground/control roles, including its disabled state.

### Theme roles

The account-management window does not own a palette. Its modals, tables,
forms, movement indicators and import flow consume the app-shell semantic
theme: structural roles for surfaces and controls, and success, warning,
information, neutral and destructive roles for business state. This keeps the
window consistent when the active theme changes.
- Submit calls `createAccount(payload)` from `useAccountMutations`. On 409 the duplicate-name error shows as an inline validation message (not a toast).

## Edit Account Modal (unified, ETP-4097 / T3; tabs added ETP-4530)

`EditAccountModal.jsx` — rendered from the row kebab "Edit account" action, the row-hover pencil,
**and now also the account detail view's own "Editar" button** (`financial-account-edit`, top of
`index.jsx`, ETP-4530). T3 merged the former separate "Edit bank connection" modal into this one
(both surfaced the same account data), so there is a single edit entry point everywhere.

The top of the form (Name | Country, IBAN | BIC/SWIFT, Type | Currency) sits **outside** both tabs, followed
by two tabs built with the shared `Tabs`/`TabsList`/`TabsTrigger` primitives
(`components/ui/tabs.jsx` — the same primitives `DetailTabs.jsx` uses for the
Movements/Reconciliation/Statements strip). **Country (ETP-4896) is always in this grid and always
editable** — it is the one field in this section that never migrates to the read-only
`AccountStatusInfo` header strip the way Type/Currency do once the account has transactions or a
bank link, since it is descriptive metadata rather than something that rewrites past balances.
Unlike Currency's Radix `<Select>`, Country uses `CreatableSearchSelect` over the live
`C_Country_ID` selector (239 options, no local dropdown fits that) — same widget and same
`countryIbanRules`-backed IBAN cross-check as the New Account form.

**BIC/SWIFT** (ETP-4896 QA follow-up) is also in this grid, right after IBAN. It was previously
only on the New Account form, so the field could not be maintained from here at all. Gated on the
account being type Bank (`isBankType`) rather than on `!isCash`, to honour the contract's own
`displayLogic: "@Type@='B'"` — a card account has no BIC. Optional, no format validation (see the
SWIFT note under "Known gaps"), and sent only when dirty, so an untouched field never overwrites
the stored value. Its dirty check compares the *normalized* value (trimmed + upper-cased, the same
normalization `AccountFormStep` applies), so merely re-typing a stored BIC in a different case is
not a change.

- **General** (`financeAccountsEditTabGeneral`): bank connection configuration, then reconciliation
  configuration, then the difference settings, in that order.
  - The first two blocks are **skipped for cash accounts** (no bank connection, and no per-account
    matching tolerances for a manual cash drawer). See `useAccountFields`'s `isCash` flag
    (`account?.type === ACCOUNT_TYPE.CASH`, i.e. `'C'` — Bank `'B'` and Card `'CA'` both get them,
    since Card accounts support bank connections too).
  - **Since ETP-4795 the tab itself always renders**, for every account type, because the third
    block applies to all of them. Before ETP-4795 the whole tab was hidden for Caja accounts (it
    had nothing to show them, and a manual-QA regression had found the trigger rendering with
    blank content). A cash account still **defaults** to Contabilidad on open (`initialEditTab`);
    General is simply one click away instead of absent.
  - **Reconciliation configuration** (`ReconciliationSettingsSection`, non-cash only): **Tolerancia
    de fecha (días)** (`EM_ETGO_Date_Tolerance`, default 3) and **Tolerancia de importe (%)**
    (`EM_ETGO_Amount_Tolerance`, default 0). Both feed the automatch engine only —
    `ReconciliationHandler.loadTolerances()` reads them via raw JDBC and
    `AutoMatchSupport.computeAmountTolerance()` / `withinDateWindow()` apply them. They are
    unrelated to the `0.01` epsilon that gates the `Conciliar` button.
  - **Difference settings** (`GlItemDifferenceSection`, ETP-4795, **all account types**):
    **Cuenta contable** — a `ChipSelect` over `useGLItemLookup`, persisting
    `FIN_Financial_Account.EM_Aprm_Glitem_Diff` (DAL `aprmGlitemDiff`, an OBUISEL selector on
    `C_GLItem`). **This is the accounting account the residual amount is posted against when a cash
    close or a reconciliation does not balance**; it is the same column Classic's manual
    reconciliation popup uses. That sentence used to render under the field as help text
    (`financeAccountsGlItemDifferenceHint`); it was dropped from the modal — the section heading
    ("Configuración de diferencias") already frames what the field is for, and the explanation
    belongs here rather than in the dialog. The field label was shortened to just "Cuenta
    contable" for the same reason: the heading supplies the "de diferencias". Read back through the list payload as
    `glItemDifferenceId` / `glItemDifferenceName` (`FinancialAccountsPageHandler`), written through
    `useAccountMutations.toDalBody()` as `aprmGlitemDiff`.
- **Contabilidad** (`financeAccountsEditTabAccounting`, ETP-4530; full field set ETP-4872): the
  accounting accounts used when generating transaction journal entries — 9 fields for Banco
  accounts (3 sub-sections), 6 for Caja/Tarjeta (2 sub-sections), none required. Replaces the
  original ETP-4530 pair (`fINAssetAcct`/`fINTransitoryAcct`, now retired). See "Accounting
  configuration" below. If the selectors show no options at all, check the account's organization
  has a **General
  Ledger** configured (`AD_Org.C_Acctschema_ID`, Classic: Organization window → General Ledger
  field) — with no ledger the handler soft-degrades (`ledgerConfigured: false`) and the tab shows
  an explanatory message instead of empty selects; this is a data/config gap, not a bug (confirmed
  in local dev data: e.g. the "F&B US, Inc." and "Spain" organizations have no ledger configured,
  so their bank accounts — including the highest-traffic demo account, "Bank - Account 1" — cannot
  populate this tab until an admin sets one).
- **Capability-gated Accounting tab (ETP-4520, UI label "Contabilidad"):** the tab is only reachable for a role granted
  the `showAccountingFields` capability. The tab lives in the hand-written DETAIL half, so — unlike the
  invoice windows' `posted` field/status pill, which declares `"visibleWhenCapability":
  "showAccountingFields"` in `decisions.json` and is resolved generically by `isCapabilityVisible()`
  inside `DataTable.jsx`/`DetailView.jsx` (see `sales-invoice.md`/`purchase-invoice.md`, "Reactive
  behavior and dependencies") — there is no generated contract to declare the gate in.
  `EditAccountModal.jsx` instead calls `useHasCapability('showAccountingFields')`
  (`@/auth/AuthContext.jsx`) directly and holds the result in `canSeeAccounting`. Both the
  `TabsTrigger value={EDIT_TAB_ACCOUNTING}` and its `TabsContent` are wrapped in
  `canSeeAccounting ? (...) : null` — omitted from the DOM entirely (not disabled, not
  CSS-hidden) when the capability resolves false, the same "omit, don't disable" contract as the
  invoice windows, just enforced by the component itself rather than the shared helper. A
  dedicated effect (kept separate from the open/account-id tab-reset effect so it doesn't also
  force non-cash accounts back to General on every unrelated render) watches `canSeeAccounting`
  and resets `editTab` to General the moment it turns false while Accounting is the active tab —
  covering a role switch mid-session that revokes the capability while the modal stays open. For
  a cash account with the capability denied, the modal falls back to the General tab, which since
  ETP-4795 always exists and carries the difference settings (before ETP-4795 this combination
  left the modal with no visible trigger at all).
  Automated evidence: `tools/app-shell/src/windows/custom/financial-account/__tests__/EditAccountModal.vitest.jsx`,
  describe block `"showAccountingFields capability gate (ETP-4530)"` (test source predates the
  ETP-4520/ETP-4530 scope split — the gate itself is ETP-4520) — covers tab+panel shown when
  granted, both entirely absent when denied, the fallback to General on a mid-session capability
  revoke, and the cash-account-with-no-capability edge case.

Field editability in the top section:

- **Name** is always editable. **Type** is always read-only. Cash accounts have no IBAN.
- **IBAN** is always editable for non-cash accounts, **including while bank-connected** (ETP-4896
  follow-up — reverses the original T3 stance of "owned by the bank once linked"). Locking it made
  an inconsistent stored `(IBAN, country)` pair on an already-linked account unfixable from this
  modal, since Country became always-editable in ETP-4896: the user could change the country
  freely but never the IBAN it must pair with. A hand-edited IBAN here is metadata on the record —
  it does not reach into Salt Edge and rewrite what the live connection itself syncs against, so it
  cannot desync the sync feed the way changing Currency could. The copy-to-clipboard button is kept
  alongside the input for a bank-linked account so that convenience isn't lost.
- The `(IBAN, country)` pair is re-validated (`@/lib/countryIban.js`'s `validateIbanForCountry`,
  same catalog and codes as the New Account form) on **every** Bank-type account regardless of
  bank-link state; clearing Country while a real IBAN remains is its own distinct error
  (`financeAccountsNewCountryRequiredForIban`), gated so it never fires for a legacy account whose
  country was already empty and simply never touched during this edit.
- **Currency** is editable only while the account is **both** not bank-connected **and** has no
  registered transactions yet (ETP-4530). `hasTransactions` is a server-computed flag (not a real
  AD column) injected into every account row by `FinancialAccountsPageHandler` (the handler behind
  `/sws/neo/financial-accounts-page`, which both the Cuentas list and the detail view's
  `useFinancialAccount`/`useFinancialAccounts` hooks read) and, for completeness, also by
  `FinancialAccountHandler.afterHandle` on the generic `/sws/neo/financial-account/account` GET
  path (MCP `neo_list`/generic CRUD consumers). This is a **different, stricter** condition than
  `bankConnected`: an offline (never-connected) account can still accumulate real movements
  (manual statements, funds transfers), and the currency must lock the moment that history exists
  so past balances and journal entries stay consistent. `useAccountFields` exposes this as
  `fields.currencyEditable`.
- **Connection block** (General tab, non-cash only): connected → live bank connection panel (provider, Sync
  now, Import from/to dates, Statement grouping, re-authorization banner) + a Disconnect footer
  button; not connected → a single "Connect bank" button.
- **Save** persists every changed field across both tabs in one call: account fields via
  `updateAccount(id, payload)`, bank import settings via the bridge `import-settings` action, and
  (ETP-4530, extended ETP-4872) the accounting configuration via `saveAccountingConfiguration`.
  Enabled purely on `dirty && !saving && fields.name.trim() !== '' && !fields.ibanInvalid &&
  !recon.amountToleranceInvalid` — **no accounting field can block Save** (ETP-4872 dropped the
  old `fINAssetAcct`-required check). The former `accounting.assetAcctMissing` state, the
  field-level error inside `AccountingConfigurationSection`, and the cross-tab summary line
  (`edit-account-accounting-error-summary`, QA BUG-1) were all removed with it — see "Accounting
  configuration" below. The `financeAccountsAccountingBankAssetRequiredSummary` i18n key is left
  in both locale files, deliberately unused, pending QA confirmation that "no field required" is
  final.
- The consent-expiry date in the re-auth banner is formatted with the active locale (dd/MM/yyyy in
  Spanish).

#### Reconciliation tolerances — two spellings, one field pair (ETP-4764 follow-up)

**Tolerancia de fecha (días)** / **Tolerancia de importe (%)** map to the custom AD columns
`EM_ETGO_Date_Tolerance` / `EM_ETGO_Amount_Tolerance` on `FIN_Financial_Account`. Etendo drops the
`EM_` module prefix when deriving the DAL property, so the canonical names are **`eTGODateTolerance`
/ `eTGOAmountTolerance`** (see the generated `FIN_FinancialAccount` entity) — *not* `eMETGO…`.
Both are declared `editable` in `decisions.json` and reach `ETGO_SF_FIELD` with those names as their
`java_qualifier`.

The modal has to tolerate **two different key spellings** for the same pair, because the record it
edits arrives from two different endpoints:

| Opened from | Record source | Key names |
|---|---|---|
| Cuentas **list** (row kebab / pencil) | generic W spec `/sws/neo/financial-account/account` | `eTGODateTolerance` / `eTGOAmountTolerance` |
| Account **detail** ("Editar" button) | legacy R spec `/sws/neo/financial-accounts-page` (`FinancialAccountsPageHandler` hand-builds the JSON) | `dateTolerance` / `amountTolerance` |

**Every field the modal binds must exist in BOTH shapes** — this split is the recurring source of
bugs here. The W spec projects whatever the contract declares, so a newly-exposed AD column appears
there for free; the R spec hand-builds its JSON, so the same column has to be added to
`ACCOUNTS_SQL` + `AccountRow` + `buildAccountsArray` by hand. ETP-4896 hit this twice: first with
`country`, then with `swiftCode` (the QA follow-up) — in both cases the field rendered correctly
from the list and **empty from the detail view** until the R spec caught up. New SQL columns are
appended **last** on purpose: `loadAccounts` and `FinancialAccountsPageHandlerTest` both read the
`ResultSet` by position, so inserting mid-list silently shifts every existing index.

`readTolerances()` in `EditAccountModal.jsx` reads the contract key first and falls back to the flat
one. Two distinct bugs came out of ignoring this split, and both presented identically as *"no se
persiste"*:

1. **Write side** — `useAccountMutations.toDalBody()` sent `eMETGODateTolerance`/`eMETGOAmountTolerance`
   (prefix folded in rather than dropped). The generic W spec ignores unrecognized body keys instead
   of returning 400, so the `PUT` answered `200 OK` while silently discarding both values.
2. **Read side** — the modal seeded its state from the flat names only, so a list-opened modal always
   fell back to the 3/0 defaults instead of the stored values. Worse than a display bug: the dirty
   check compares against that same wrong snapshot, so re-entering the actually-stored value counted
   as "not dirty" and was never sent at all, while any other value did save but still redisplayed as
   3/0 on reopen.

Both inputs hold the **raw typed string**, not a number, so the box can be emptied mid-edit.
Holding `Number(e.target.value)` made them impossible to clear: `Number('')` is `0`, so deleting the
last character immediately re-rendered a `0` that the caret then sat behind, and every entry came
out as `"0123"`. `toleranceValue()` recovers the number at exactly two points — the dirty check and
the save payload (`dateToleranceValue` / `amountToleranceValue`, never the raw strings) — treating
an empty box, and a half-typed `-`/`.`, as `0`. So an empty field still persists as 0 without that
0 ever being forced back into the UI while typing. The dirty check compares numerically, so
re-typing the stored value in another shape (`"03"`, `"3.0"`) correctly reads as unchanged.

Regression cover: `useAccountMutations.vitest.jsx` pins the DAL property names on the write side;
`EditAccountModal.vitest.jsx` pins seeding from either spelling, the 3/0 fallback, that a value
edited away from a W-spec-seeded one still reaches `updateAccount`, that both boxes can be emptied,
that typing over a cleared box does not append behind a forced `0`, and that an emptied box saves
as `0`.

### Accounting configuration (Tab Contabilidad, ETP-4530; full field set ETP-4872)

Backed by the `accountingConfiguration` entity of the `financial-account` spec, which maps to the
core AD tab **"Accounting Configuration"** (`FIN_Financial_Account_Acct`, one row per
account × active `AcctSchema`/ledger). ETP-4872 replaced the original two-field pair
(`fINAssetAcct`/`fINTransitoryAcct`, "Bank Asset Account"/"Bank Transitory Account") with the full,
account-type-dependent set of **9 properties** — the old pair is fully retired: back to
`visibility: discarded` in `decisions.json`, no longer read or written by the handler, no longer
rendered anywhere in the modal. `receivePaymentAccount`, `makePaymentAccount`, `creditAccount`,
`debitAccount` and `enablebankstatement` stay `discarded` — explicitly out of scope.

**Field set** (grouped exactly as the "Contabilidad" tab renders them — see `ACCOUNTING_FIELD_GROUPS`
in `EditAccountModal.jsx`):

| Group | DAL property | Label (`en_US.json`) | Applies to |
|---|---|---|---|
| General | `fINBankrevaluationgainAcct` | Bank revaluation gain account | Banco only |
| General | `fINBankrevaluationlossAcct` | Bank revaluation loss account | Banco only |
| General | `fINBankfeeAcct` | Bank fee account | Banco only |
| Payment IN | `inTransitPaymentAccountIN` | In transit payment IN account | Banco, Caja, Tarjeta |
| Payment IN | `depositAccount` | Deposit account | Banco, Caja, Tarjeta |
| Payment IN | `clearedPaymentAccount` | Cleared payment account (IN) | Banco, Caja, Tarjeta |
| Payment OUT | `fINOutIntransitAcct` | In transit payment OUT account | Banco, Caja, Tarjeta |
| Payment OUT | `withdrawalAccount` | Withdrawal account | Banco, Caja, Tarjeta |
| Payment OUT | `clearedPaymentAccountOUT` | Cleared payment account (OUT) | Banco, Caja, Tarjeta |

**Layout is type-conditional, the backend is not:** `AccountingConfigurationSection`
(`EditAccountModal.jsx`) renders **3 sub-sections** — General / Payment IN / Payment OUT (labels
`financeAccountsEditTabGeneral` — reused from the General tab, not a new key —
`financeAccountsAccountingSectionPaymentIn`/`...PaymentOut`), **9 fields total**, for a Banco
account (`ACCOUNT_TYPE.BANK`); and **2 sub-sections** — Payment IN / Payment OUT only, **6 fields
total** — for Caja and Tarjeta. The General sub-section is **omitted entirely** for Caja/Tarjeta
(not merely hidden), matching the repo's "omit, don't disable" convention. `FinancialAccountAccountingHandler`
has no notion of account type at all — GET/POST always reads/writes exactly whatever subset of the
9 keys the request body contains; the type-conditional grouping is a pure frontend concern.

The entity is **fully intercepted** by `FinancialAccountAccountingHandler`
(`@Named("financialAccountAccountingHandler")`, `com.etendoerp.go.schemaforge`) — the generic CRUD
never runs for it:

```
GET  /sws/neo/financial-account/accountingConfiguration?financialAccountId={id}
  → { id, financialAccountId,
      fINBankrevaluationgainAcct, fINBankrevaluationgainAcct$_identifier,
      fINBankrevaluationlossAcct, fINBankrevaluationlossAcct$_identifier,
      fINBankfeeAcct, fINBankfeeAcct$_identifier,
      inTransitPaymentAccountIN, inTransitPaymentAccountIN$_identifier,
      depositAccount, depositAccount$_identifier,
      clearedPaymentAccount, clearedPaymentAccount$_identifier,
      fINOutIntransitAcct, fINOutIntransitAcct$_identifier,
      withdrawalAccount, withdrawalAccount$_identifier,
      clearedPaymentAccountOUT, clearedPaymentAccountOUT$_identifier,
      ledgerConfigured, catalogs: { accounts: [{ id, code, name }, ...] } }

POST/PUT /sws/neo/financial-account/accountingConfiguration
  body: { financialAccountId, <any subset of the 9 fields above> }
  → same shape, reflecting the persisted row. A field key OMITTED from the body leaves the
    stored value untouched (PATCH-like semantics — `applyCombination` in the handler); a field
    present with a null/blank value explicitly clears it. In practice `EditAccountModal.jsx`
    always sends all 9 keys on every save regardless of the active account type — the whole tab
    is one form (`persistAccountEdits` builds the payload from `ACCOUNTING_FIELDS`) — so the
    omitted-key path only matters for other API/MCP consumers of this entity. (Some of those 9
    values may be forced to `null` in the payload rather than read from state — see the
    Type-switch note right below.)
```

**Type-switch mid-edit — payload scoped to the type actually being saved (ETP-4872 QA fix,
BUG-1).** `accounting.values` (the field-value map inside `useFinancialAccountAccounting`) is keyed
on all 9 fields regardless of the account's current type, and nothing resets or filters it when the
user changes Type on the General tab before Save — a value entered while a since-hidden group was
still on screen is deliberately not thrown away just because the user flips Type back before saving.
The gap this left: `persistAccountEdits` used to build the save payload by reading straight off that
unfiltered map, so a value set for a group that no longer applies to the type being saved (e.g. a
Banco-only "General" field such as `fINBankfeeAcct`, filled in while the account was still Banco)
was still sent — and persisted — after the user switched Type to Caja/Tarjeta and saved, even though
that field is invisible for the new type. The backend has no way to catch this on its own: the
handler's PATCH-like semantics mean "field present in the body" always means "set this value,"
never "infer whether it still applies from the account's type." Fixed in `EditAccountModal.jsx`'s
`accountingFieldsForType()` / `persistAccountEdits`: the save payload is now built against the type
actually being saved (the pending Type selection if `fields.typeDirty`, else the account's persisted
type) — any of the 9 fields that does not belong to that type's rendered layout is explicitly nulled
in the payload instead of being carried over stale. This can only surface while Type is still
editable at all — Type locks once the account has transactions or an active bank connection
(ETP-4581) — so it is a pre-Save-only edge case: switch Type and save, and any field belonging only
to the previous type is gone from that row; switch Type back and forth without saving, and nothing
is lost until Save actually fires.

- **Resolution:** the handler resolves the **account's own organization's** general ledger
  (`org.getGeneralLedger()`, mirroring `GeneralLedgerConfigurationHandler`) — not the caller's
  session org — then finds (GET) or finds-or-creates (save) the single row for that
  (account, ledger) pair. The frontend never has to know whether the row already exists.
- **No ledger configured:** GET degrades softly (`ledgerConfigured: false`, all 9 fields `null`,
  empty catalog) instead of failing the whole edit modal; the tab shows an explanatory message
  (`financeAccountsAccountingNoLedger`) rather than the form.
- **Catalog, no live selector call:** the GET response carries `catalogs.accounts` — every active
  `AccountingCombination` for the resolved ledger, as flat `{id, code, name}` — which the frontend
  filters client-side via `CreatableSearchSelect`'s `staticOptions` (same component already used
  for the bank statement-grouping dropdown). This mirrors
  `GeneralLedgerConfigurationHandler.buildAccountOptions` rather than depending on the generic
  OBUISEL/`Selector` reference selector endpoint's context-param (`inpcAcctschemaId`) resolution,
  which was not something this handler could verify end-to-end in this iteration.
- **Save — no field is required.** ETP-4872 dropped the old `fINAssetAcct`-required validation
  entirely; none of the 9 fields carries a "required" marker in the ticket's own field tables.
  **This is an inference from the ticket's tables, not an explicitly stated product requirement —
  still pending product/PM confirmation** as of this writing (see the implementation plan's Open
  Questions #4); if product later wants one or two fields mandatory again, that is a scope
  amendment, not something this doc should be read as having settled. Save still auto-sets
  `enablebankstatement = true` on every save (unchanged ETP-4530 mechanism — see "Not implemented
  yet" below) so Classic's bank-statement accounting engine reads whichever accounts were set.
- `decisions.json → entities.accountingConfiguration` carries the `javaQualifier` and field
  visibilities (the 9 fields `editable`/`grid: false`, the old pair back to `discarded`);
  `artifacts/financial-account/contract.json`/`contract.mcp.json` reflect the new entity and its
  selector endpoints (`ValidCombination` reference) after `make regen ONLY=financial-account`.

**ETP-4565 review — single-record + non-deletable requirements already satisfied structurally, no change needed.** Investigated as part of ETP-4565 ("Contabilidad tab: single record + non-deletable" across 8 master-data windows). `useFinancialAccountAccounting.js`'s `fetchAccountingConfiguration`/`saveAccountingConfiguration` are both handled entirely by `FinancialAccountAccountingHandler`, which always "resolve[s]/find-or-create[s] the single per-ledger row for the account transparently" — there is no "Add new accounting row" affordance in the UI at all, and no delete affordance either (no Trash icon anywhere in `AccountingConfigurationSection`). Both requirements are therefore inherently met by the current design; no `decisions.json` or code change was made for this ticket.

**Auto-creation (requirement 3) — closed by ETP-4872 Task 3.** The gap ETP-4565 confirmed (find-or-create only fired lazily on first GET, and the created row started with no default account) is now closed: `FinancialAccountAccountingDefaultsSupport.applyDefaultAccountingConfiguration(account)`
(`com.etendoerp.go.schemaforge.handlers`), invoked from `FinancialAccountHandler.afterHandle`'s POST
branch immediately after `FinancialAccountSupport.assignDefaultPaymentMethods(account)`, eagerly
finds-or-creates the `accountingConfiguration` row at account-creation time and pre-populates it
with PGC-España baseline defaults, resolved per account type by account **code** lookup
(`ElementValue.SEARCHKEY`, not a stored combination id) against the account's own ledger:

| Field | Banco | Caja | Tarjeta |
|---|---|---|---|
| `fINBankrevaluationgainAcct` | `76800000` | — | — |
| `fINBankrevaluationlossAcct` | `66800000` | — | — |
| `fINBankfeeAcct` | `62600000` | — | — |
| `inTransitPaymentAccountIN` / `fINOutIntransitAcct` | `55500000` | same | same |
| `depositAccount` / `withdrawalAccount` | `57200000` | `57001000` | `57210000` |
| `clearedPaymentAccount` / `clearedPaymentAccountOUT` | always empty for every type — never set here | | |

Same "never break account creation" contract as its sibling `assignDefaultPaymentMethods`,
soft-degrading on both known failure modes: the account's org has no general ledger → the whole
step no-ops; a default code that does not resolve to an active `AccountingCombination` on this
tenant's ledger (e.g. a non-PGC-España chart) → that one field is simply left `null`, nothing
throws or interrupts creation. Deliberately **duplicates** `findOrCreateRow`'s ~10 lines locally
rather than extracting a helper shared with `FinancialAccountAccountingHandler`, so the two
ETP-4872 tasks (field exposure vs. auto-defaults) stayed independently dispatchable — an
extraction is a candidate follow-up cleanup now that both have merged, not something this pass
did. The Tarjeta `57210000` default depends on the new ledger account described below.

**Generic component fix (ETP-4530):** `CreatableSearchSelect` (`components/contract-ui/`) did not
re-sync its `options` state when a caller passed a `staticOptions` array that started empty and
was populated later by an async fetch (the accounting catalog case) — the old bank-grouping
consumer never hit this because its array is a static module-level constant. Added a
`useEffect` that re-syncs `options` whenever the `staticOptions` reference changes; backward
compatible for every existing consumer.

**New ledger account `57210` — "Tarjetas de crédito, euros" (ETP-4872):** the Tarjeta
`depositAccount`/`withdrawalAccount` default above needs this account on the tenant's chart; it
did not exist before this ticket, as a sibling of the existing `57200` bank account under the
`572` group. Provisioning is split preventive/corrective, same pattern as every other onboarding
gap in this codebase — see `docs/etendo-ad/onboarding-and-datafixes-map.md` for the full
preventive/corrective mapping and `cli/src/data-fixes/sql/README.md` for the data-fix mechanism;
not duplicated here.

- **New tenants (preventive):** provisioned in the GOClient onboarding sampledata
  (`com.etendoerp.go`, `referencedata/sampledata/GOClient/{C_ELEMENTVALUE,C_ELEMENTVALUE_TRL,
  C_VALIDCOMBINATION,AD_TREENODE}.xml`, branch `feat/ledger-account-57210`, merged into
  `feature/ETP-4872`). Two structural facts a future maintainer touching this dataset again needs
  to know: **two parallel `572` element chains** exist in `C_ELEMENTVALUE.xml`, distinguished by
  `C_ELEMENT_ID` — only the one wired to the schema via `C_ACCTSCHEMA_ELEMENT`
  (`BB9B64C5B6534A40A36F7C0F45C2CC0B`) is live; a dangling org-specific duplicate
  (`91D04C02EF8F4975B9E4F5E07543B6EA`) is filtered out at import time by
  `OnboardingDatasetNormalizer.AccountElementTreeFilter` — always confirm `C_ELEMENT_ID` before
  extending this dataset. And **the tree is 3 levels, not 2**: `572` (group) → `5720` (subgroup) →
  `57200000` (leaf), so `57210000` needed a new sibling subgroup (`5721`) as its parent, not a leaf
  hung directly off `572`.
- **Existing tenants (corrective):** `cli/src/data-fixes/sql/20260830T120000Z__R30-financial-account-card-ledger-account.sql`
  (`@gap: A7` — originally filed as `A6`, relabeled after colliding with the pre-existing ETP-4539
  `A6`; see `docs/etendo-ad/onboarding-gaps.md` §A7's label note) mirrors the same shape — inserts
  the `5721` subgroup and the `57210`/`57210000` leaf, deriving the leaf's exact code width
  per-tenant from that tenant's own `57200` sibling rather than assuming one convention fleet-wide
  (confirmed live: real tenants carry both a 5-digit and an 8-digit form). **Validated with a real
  (non-rolled-back) apply run across every real+demo tenant on the shared dev DB backed by
  `go.experimental.etendo.cloud`** (idempotent on re-run) — see `docs/etendo-ad/onboarding-gaps.md`
  §A7 and `docs/etendo-ad/tenant-remediation-knowledge.md` for the full investigation, including two
  self-caught authoring issues (an accent typo in the Spanish name, and a two-`C_Element`-chain
  hazard specific to GOClient) fixed before that run.
  `ONBOARDING_PROVISIONED_THROUGH` was **deliberately left unbumped** pending both this fix and the
  preventive branch above being confirmed merged. As of this writing this doc cannot confirm
  whether R30 has also been run against every tenant in the actual production fleet (as opposed to
  the shared dev/experimental DB it was validated against) — check the data-fix ledger
  (`ETGO_DATA_FIX_HISTORY`) or the data-fixes README before assuming this is closed everywhere.
  **QA follow-up (2026-08-31):** Sentinel filed two further findings against this already-`APPLIED`,
  immutable migration — a multi-chain edge case (a tenant wired to more than one qualifying `AC`
  element chain would only get the lowest-`c_element_id` one fixed) and a doc-accuracy nit (Steps
  C/D/E resolve by plain value equality, not literally via `C_AcctSchema_Element` as the file's own
  Background comment claims). Both were investigated live and confirmed **zero exposure fleet-wide**
  and accepted as known, documented limitations rather than reopened as fixes — the `.sql` itself
  was left untouched (an applied migration is never edited). Full detail, including why each is safe
  in practice: `docs/etendo-ad/onboarding-gaps.md` §A7's 2026-08-31 caveat and
  `docs/etendo-ad/tenant-remediation-knowledge.md`'s "ETP-4872 — R30 QA rejection" entry.

### Editar from the detail view (ETP-4530)

The account detail view (`index.jsx`) gained its own **Editar** button (`financial-account-edit`,
Pencil icon) in the tab-strip row, to the left of the Export/Automatch button — opening the same
`EditAccountModal`. On save it reloads via `useFinancialAccount`'s `reload`. Archive from this
entry point reuses `ArchiveAccountDialog` (same component as the Cuentas list) and, on success,
navigates back to `/finance/accounts` (there is no reason to stay on the detail page of an
account that was just archived). **Delete** (ETP-4871, only offered when the account is
`deletable`) mirrors the same shape through `DeleteAccountDialog` and also navigates back on
success — unconditionally, unlike archive/unarchive, since a delete never leaves a record to
stay on. Connecting a bank from this entry point is **fully wired** too —
`index.jsx` runs its own `useBankConnectionFlow({ onDone: reloadAccount })` and mounts
`BankConnectionFlowUI`, exactly mirroring `FinancialAccountsPage.jsx`'s wiring
(`onConnect={(acc) => { setEditOpen(false); bankConnectionFlow.startConnect(acc); }}`).

## Bank connection (PSD2 / Salt Edge) (ETP-4097 / T3)

Wires the bank connection (PSD2 / Salt Edge) into the Accounts UI through a NEO Headless bridge
(`financial-account-bank-connection` spec, `FinancialAccountBankConnectionHandler`). Account selection and success are
native app-shell UI; only the bank login is an external popup.

- **Connect entry points** (existing account): row kebab "Conectar banco", the inline "Conectar
  banco" CTA under the account name, and the Edit modal's "Connect bank" button — all run
  `useBankConnectionFlow().startConnect(account)`.
- **Connect with creation** (no account yet): the New Account wizard "Con conexión" card →
  `startCreate(type)` (creates the FA from the chosen bank account, then links).
- **Provider memory:** creating an account offline with a real Salt Edge provider selected stores
  that provider on the FA (`psd2Provider` FK, metadata only — the account stays offline). A later
  connect then preselects that bank, so the Salt Edge widget skips the bank picker.
- **Sync statements:** bank-synced accounts run the PSD2 module per-account statement fetch (the
  Classic "Get Bank Statement" equivalent) from the row-hover sync icon, the kebab "Sincronizar
  ahora", the Edit modal "Sincronizar ahora", and — on the Imported Statements tab — a dedicated
  "Sincronizar extractos" button that replaces the manual import/create split-button.
- **Row actions:** account rows show on hover a pencil (Edit account) and, for connected accounts,
  a sync icon, both with tooltips.
- **Sidebar:** the "Pendientes por conciliar" card shows only "Cuentas con pendientes" (the former
  "Sugerencias listas" / "Por regla" indicators were removed).

### Disconnecting: two modes (ETP-4764)

Disconnecting mirrors Etendo Classic's "Permanent deletion" checkbox, as two distinct actions:

| Action | `permanentDeletion` | Effect | Confirmation |
|---|---|---|---|
| **Desconectar** | `false` | Deactivates the connection on Salt Edge and locally. The account keeps its Salt Edge link, so it stays reconnectable and no history is lost. | `ConfirmDialog` with an explanatory body |
| **Borrar conexión** | `true` | Deletes the connection at the provider and unlinks the account. Irreversible. | `BankConnectionDeleteConfirmModal` — the full warning cartel (consequence list + yellow warning box), carrying Classic's irreversibility text |

Both are reachable from the Edit modal footer (a split button: primary "Desconectar" plus a
chevron revealing "Borrar conexión") and from the row kebab.

**Three connection states.** A soft disconnect leaves the account neither connected nor
unconnected, so `bankConnected` alone is no longer enough. The backend also emits
**`bankReconnectable`** — `true` when the account is not connected but still holds its Salt Edge
link (`EM_PSD2_Salt_Edge_Account_ID` survives a soft disconnect; a permanent deletion clears it).
It is a separate flag rather than a tri-state `bankConnected` because several SPA call sites test
`bankConnected === true`.

- connected → sync, import settings, Desconectar / Borrar conexión
- deactivated (`bankReconnectable`) → **Reconectar** + Borrar conexión. Offering a from-scratch
  "Conectar banco" here would create a second connection and orphan the surviving one.
- no link → Conectar banco

The `bankReconnectable` state is also what makes the payment modal refuse a **transfer**: with the
connection switched off there is no channel to execute one, so the modal hides the payment form and
points the user back here to *Reconectar* (**ETP-4891**). It arrives there as a deep link,
`/financial-account/<id>?edit=true`, which opens the Editar Cuenta modal directly — the same param
family as `?tab=`, `?autoMatch=true`, `?txn=` and `?newMovement=true`.

`disconnect` reports what actually happened (`permanent` / `reconnectable`) rather than echoing the
request: a Salt Edge connection shared by several accounts is always unlinked, even when a soft
disconnect was asked for, since deactivating it would break the sibling accounts. Neither path
touches `Automatic Withdrawn` any more (**ETP-4891**): the flag is now an invariant of the
bank-transfer payment method — always off — instead of something connect cleared and a permanent
disconnect restored, which is how a reconnected-then-disconnected account drifted back to `Y`.

**Reconnect is a two-step handshake.** `reconnect` only returns the Salt Edge URL; the popup then
redirects to the SPA callback route, which relays the connection id back to the opener. The SPA
must follow up with **`reconnect-callback`** (`financialAccountId` + `connectionId`) to actually
mark the connection active again and refresh the consent expiry. Classic does not need this — Salt
Edge redirects straight into `AisConnectionCallback`, which does the same work server-side. Without
the follow-up call the connection stays inactive and a deactivated account can never be revived.

Bridge actions: `connect` (optional `financialAccountId` → provider preselect) · `accounts` ·
`providers` · `link` · `createAndLink` · `reconnect` · `reconnect-callback` · `disconnect`
(optional `permanentDeletion`, default `false`) · `sync` · `import-settings` · `status` (returns
`reconnectable`).
Frontend: `hooks/useBankConnectionActions.js`, `hooks/useBankConnectionFlow.js`,
`pages/BankConnectionCallbackPage.jsx`, `windows/custom/financial-account/BankConnectionFlowUI.jsx`,
`windows/custom/financial-account/BankConnectionDeleteConfirmModal.jsx`.

### Bank logo (ETP-4764 follow-up)

The connected provider's logo image is persisted rather than fetched live per row. It lives on
`PSD2_Provider.Logo_Url` (psd2 module — `com.etendoerp.psd2.bank.integration`, a separate
Bitbucket repo), populated from Salt Edge's `logo_url` catalog field by whichever sync path runs
first: the scheduled `SyncBankProviders` job, Classic's `AisConnectionCallback`, or the Go
bridge's own `resolveProvider`/`fetchAndRegisterProvider` when an account connects (so a brand-new
provider gets its logo immediately, without waiting for the next scheduled sync). All three paths
go through `BankIntegrationUtils.upsertProvider(code, name, maxFetchInterval, logoUrl)` — a blank
or missing `logoUrl` leaves a previously stored logo untouched, mirroring how `maxFetchInterval`
already behaves, so a provider lookup that doesn't carry a fresh value never blanks one out.

The list and single-record read expose it as **`providerLogoUrl`** via a `LEFT JOIN` on
`psd2_provider` (`FinancialAccountsPageHandler.ACCOUNTS_SQL`) — no live Salt Edge call, unlike the
connect-flow bank picker (`action=providers`) and account selector (`action=accounts`), which
already showed the logo before this but by hitting Salt Edge on every request. Blank when the
account has no bank provider, or the provider has no logo on record yet.

`AccountLogoAvatar` renders it when present, falling back to the generic per-type icon (unchanged
default) for cash/card accounts and for any bank account without a logo — including a logo URL
that fails to load, caught via the `<img>`'s `onError`, so a dead or 403 URL degrades to the icon
instead of showing a broken image.

## Archive / Unarchive / Delete Dialogs

`ArchiveAccountDialog.jsx` — rendered from the row kebab and from the Edit modal's destructive action.

- Confirmation dialog: title + body copy + Cancel / confirm buttons.
- Archive calls `archiveAccount(id)`, a `PATCH {active: false}` (ETP-4871 — DELETE used to soft-archive; that verb is now a real delete, see below). On 409 (open reconciliations) the backend message surfaces as a toast error — the dialog stays open.
- On success the dialog closes and the list reloads.

**The dialog is bidirectional.** Filtering the list by *Inactivas* used to be a dead end: the only action offered was "Archive account" on an already-archived account, so there was no way back. The component now derives its direction from the record instead of taking it as a prop — `isUnarchiveMode(account)` returns `account.active === false` — and picks its copy, its button label and its mutation from a `MODES` map. The Edit modal's destructive action follows the same helper, so an archived account offers *Desarchivar* in both entry points.

**No backend change was needed for unarchive.** `NeoFieldFilter` hardcodes `active` as both included and writable regardless of the contract, so `unarchiveAccount(id)` is a plain `PATCH {active: true}` through the generic CRUD — the mirror image of what archive now does.

**`DeleteAccountDialog.jsx` (ETP-4871) is a sibling, not a mode, of `ArchiveAccountDialog`** — same
confirmation-dialog shape (title + body + Cancel/confirm), but a distinct component, rendered from
the row kebab (`AccountRowMenu`'s "Eliminar cuenta" item), from `AccountsHeaderTable.jsx`'s edit
modal wiring, and from the detail view's `index.jsx`. It is offered **only when
`account.deletable === true`** (injected server-side — true only when the account has zero
dependent records anywhere: movements, statements, reconciliations, payments, payment proposals,
journal lines, bank-file exceptions, defaulting business partners, or an active bank connection),
and is independent of Archive/Unarchive — a deletable, still-active account can be archived
*instead of* deleted, so both menu items can appear together. Confirm calls `deleteAccount(id)`
(`DELETE`); a 409 (a dependency appeared after the row was loaded) surfaces the backend's
human-readable message verbatim as a toast, same defense-in-depth shape as the archive dialog's
open-reconciliations guard. `EditAccountModal`'s destructive footer slot renders one of three
shapes depending on `isDeleteMode(account)` (exported from `EditAccountModal.jsx`, alongside
`isUnarchiveMode`): **archived** → a plain button, *Desarchivar* (no chevron — nothing to
reveal); **not archived and deletable** → a `FooterSplitButton`, mirroring the bank-connection
"Desconectar banco ▾" pattern in the row below — *Archivar cuenta* stays the always-visible
primary action, with a chevron revealing *Eliminar cuenta* as the one item in its dropdown, so
both actions stay reachable from this single slot instead of one hiding the other; **not
archived and not deletable** → a plain button, *Archivar cuenta* (no chevron, nothing else to
offer). The split-button chevron therefore only appears when the account genuinely has both
options available.

## Backend endpoint — `financial-account` spec (W, generic CRUD + hook)

**ETP-4239 converted the spec from report-style (`SPEC_TYPE=R`, `?action=` routing) to a generic W (window) spec** over the core Financial Account AD window (`94EAA455D2644E04AB25D93BE5157B6D`). The `account` header entity is served by the generic NEO CRUD, with `FinancialAccountHandler` (`@Named("financialAccountHeaderHandler")`, wired via `ETGO_SF_ENTITY.Java_Qualifier`) running as a **pre/post hook** — the same pattern as `SalesInvoiceHeaderHandler`. This also makes the entity **agentic**: MCP agents can `neo_list` / `neo_create` financial accounts of the 3 types (Bank `B` / Cash `C` / Card `CA`).

| Operation | HTTP | URL | Notes |
|-----------|------|-----|-------|
| List | `GET` | `/sws/neo/financial-account/account` | generic list (included fields only); every row now carries `deletable`/`deleteBlockedReason` (ETP-4871) alongside the pre-existing `hasTransactions` |
| Create | `POST` | `/sws/neo/financial-account/account` | body (DAL names): `{ name, currency, type?, iBAN?, swiftCode?, country? }` — `country` is required by the SPA but optional for API/MCP callers (falls back to IBAN-derived, ETP-4896) |
| Update | `PUT` | `/sws/neo/financial-account/account/{id}` | omitting `iBAN`/`swiftCode`/`country` keys preserves stored values |
| Archive | `PATCH` | `/sws/neo/financial-account/account/{id}` `{active: false}` | soft-archive (`IsActive='N'`); 409 if open reconciliations. ETP-4871: this used to be the `DELETE` verb (short-circuited into an archive) — DELETE now does a real delete instead, see below |
| Delete | `DELETE` | `/sws/neo/financial-account/account/{id}` | **ETP-4871 — a real delete**, gated by `deletable`: every FK into `FIN_Financial_Account` is RESTRICT, so the row is only deletable with zero dependent records anywhere (movements, statements, reconciliations, payments, payment proposals, journal lines, bank-file exceptions, defaulting business partners, an active bank connection). 409 (with a human-readable message) if a dependency appeared since the row was loaded — defense-in-depth against the list-load/click race |
| Currencies | `GET` | `/sws/neo/financial-account/account/selectors/C_Currency_ID` | generic FK selector (replaces `?action=defaults` currency list); restricted to EUR/USD/GBP by `CurrencyIsoAllowlistSelectorPolicy` (a `SelectorContextPolicy` keyed on the `Currency` target entity, registered in `NeoSelectorPolicy`) — applies to every Currency TableDir selector, not just this one |
| Defaults | `GET` | `/sws/neo/financial-account/account/defaults` | generic defaults; `defaults.currency` = org currency, `defaults.country` = org country (ETP-4896, omitted entirely when it can't be resolved to a usable value — never the AD-seeded United States); the response also carries a `countryIbanRules` sibling (see below) |

**Hook behavior (`handle()` pre-phase):**
- POST: validates `name` (required, max 60, unique per org → 409), `currency` (required, valid), `iBAN` ≤ 34 / `swiftCode` ≤ 20; normalises `type` (`'C'`/`'CA'` kept, anything else → `'B'`); then validates the `(IBAN, country)` pair (see below) and a default `matchingAlgorithm` (first active) when absent, and returns `null` so the generic CRUD persists.
- PUT/PATCH: name uniqueness (excluding self) + the same `(IBAN, country)` pair validation; a bare `{active}` PATCH (archive/unarchive) passes straight through since it only validates keys the body actually carries.
- DELETE (ETP-4871): re-validates `deletable` server-side and 409s if any dependency exists, otherwise performs the real, permanent delete.
- `matchingAlgorithm` is declared `visibility: "system"` in `decisions.json` so its `ETGO_SF_FIELD` row stays **included** — required for the injected value to survive `NeoFieldFilter`. `country` is `visibility: "editable"` (ETP-4896, see below) — it was `"system"` before. `deletable`/`deleteBlockedReason` are virtual, handler-injected fields, the same shape as `hasTransactions`/`pendingCount`.

### Country field + IBAN↔country validation (ETP-4896)

`C_Country_ID` used to be backend-only: `FinancialAccountHandler` derived it from the IBAN's ISO prefix and silently overwrote whatever was there, so a Cash/Card/IBAN-less-Bank account was always left with no country and no way to set one, and Salt Edge-connected accounts could never disagree with their own IBAN. Country is now a normal, always-editable, always-required field in both `NewAccountWizard`/`AccountFormStep` (all three account types) and `EditAccountModal` — pre-filled with the active organization's country (`defaults.country` above) but never locked, unlike Type/Currency which lock once the account has transactions or a bank link.

- **Precedence**: a country present in the request body always wins. IBAN→country derivation (the old behavior) is kept only as a fallback for callers (API/MCP) that send an IBAN but no country at all.
- **Validation** (`FinancialAccountCountrySupport.validateIbanCountryPair`, Java) runs whenever the body touches `iBAN` or `country` on a Bank account with a non-blank effective IBAN, mirroring trigger `FIN_FINANCIAL_ACCOUNT_TRG2`'s own `IF (:NEW.TYPE='B') ... IF (:NEW.IBAN IS NOT NULL)` guards so Cash/Card accounts and IBAN-less Bank accounts are never rejected. A mismatched pair now returns a **readable 400** instead of the trigger's raw `@20259@`/`@20257@`/`@COUNTRY_IBAN@` message, which `NeoErrorSanitizer` would otherwise flatten into a generic 500. The frontend runs the same checks client-side first (`@/lib/countryIban.js`'s `validateIbanForCountry`, mirrored against the `countryIbanRules` catalog) so the 400 is a safety net, not the primary UX.
- **`countryIbanRules` catalog**: only ~45 of the 243 seeded countries carry IBAN metadata (`IBANCOUNTRY`/`IBANNODIGITS` on `C_Country`); the other ~198 (e.g. Argentina, United States) have none. For those, `validateIbanForCountry`'s prefix/length checks are **skipped, not failed** — only mod-97 applies — because the function receives an already-resolved catalog *row* and cannot tell "no country picked yet" from "picked one with no metadata". But the DB **does** reject an IBAN on such a country (`C_GET_IBAN_DISPLAYED_ACCOUNT` folds the null-metadata case into the same `@20259@` as a mismatch), so the QA follow-up added `countryLacksIbanConfig(countryId, countryIbanRules)`: callers synthesize a `noIbanConfig` error code from it, the same out-of-band pattern already used for `missingCountry`. Its **empty-catalog guard is load-bearing, not defensive noise** — `countryIbanRules` is legitimately `[]` on a non-ok `/defaults`, a network throw, a payload without the key, and on every render before the fetch resolves (both consumers start from `[]`), so an empty catalog means "unknown, defer to the backend" rather than "no country can hold an IBAN". The catalog (`{id, iso, name, ibanPrefix, ibanLength}`) is server-cached 24h and served as a sibling of `accounts`/`summary`/`defaults` from all three read surfaces the SPA uses: the `account/defaults` response, `financial-accounts-page`, and the spec W list GET. It is **not** the country picker's option list — the picker itself is the generic, searchable `C_Country_ID` selector (`CreatableSearchSelect`, `serverSearch`), since 239 active countries don't fit a `staticOptions` dropdown the way the ~20-currency picker does.
- **Changing the country on an account with a stored IBAN is not free**: the (IBAN, country) pair must stay consistent, so changing one may require changing the other — this is the real, pre-existing DB constraint, not a new restriction.
- **Salt Edge / "Conectar banco" is restricted to Spain** (ETP-4896 Test Cases 5–7). The service is contracted for Spain only, so an account whose stored country is not `ES` is never offered the connect action. The rule lives in **one** predicate — `components/financial-accounts/saltEdgeEligibility.js`'s `canConnectToSaltEdge(account)` — consumed by all three surfaces that expose the action, so they cannot drift apart:

  | Surface | Treatment | Why |
  |---|---|---|
  | `EditAccountModal` → `BankConnectionSection` | Button **disabled** + `financeAccountsBankConnectionSpainOnly` hint (`edit-account-connect-country-hint`) | The only surface where the Country field that causes it is on screen, so it is the one that explains the rule |
  | List row → `SyncStatusInline` | Link **hidden** | A bare inline affordance with nowhere to put an explanation |
  | Row kebab → `AccountRowMenu` | Item **hidden** | Matches how every other inapplicable action in that menu behaves (conditional render; the menu has no disabled-item styling) |

  Three deliberate properties: it keys off the **stored** `countryIso`, not a pending form selection — matching the acceptance criteria's "guarda el cambio", and saving closes the modal + reloads the list, so the next render already reflects it. An **unknown** country reads as *not* eligible rather than implicitly Spain, since offering a connection Salt Edge would then reject is worse than withholding it. And the rule gates **connecting only** — an account linked before the restriction existed keeps its live status, its Sincronizar/Desconectar actions and its "Borrar conexión", because nothing about it became invalid.

  Unchanged by this: `SaltEdgeAccountLinkHelper.populateBankIBANField` still reconciles a linked account's country against the IBAN Salt Edge returns and surfaces a mismatch as a **warning toast** (via `data.warning`) rather than blocking — that path now only matters for already-linked accounts, and no change was made to that helper.

Server-side validation and country-derivation logic lives in `FinancialAccountCountrySupport` (`com.etendoerp.go`), extracted out of `FinancialAccountHandler` to keep it under Sonar's method-count ceiling — same rationale as `FinancialAccountDeleteSupport`.

**MCP hook parity (ETP-4239, runtime change):** `McpToolRouter` now resolves the entity's `NeoHandler` by `Java_Qualifier` and runs `handle()` (pre, may mutate the body) / `afterHandle()` (post) around `neo_create` / `neo_update` / `neo_delete` — previously MCP writes bypassed ALL entity hooks (no validation, no derivation). This applies to every W spec, not just financial-account.

The spec + entity + field source-data records live in `src-db/database/sourcedata/ETGO_SF_SPEC.xml`, `ETGO_SF_ENTITY.xml` and `ETGO_SF_FIELD.xml` of `com.etendoerp.go` (regenerated by `push-to-neo financial-account` + `export.database`).

## New components

| File | Role |
|------|------|
| `windows/custom/financial-account/NewAccountWizard.jsx` | Wizard shell — step state, back/forward logic, dialog chrome |
| `windows/custom/financial-account/AccountFormStep.jsx` | Shared form for Bank (Name/IBAN/BIC/Currency) and Cash (Name/Currency) modes |
| `windows/custom/financial-account/EditAccountModal.jsx` | Edit modal — Account data section + read-only Bank connection section |
| `windows/custom/financial-account/ArchiveAccountDialog.jsx` | Confirmation dialog for soft-delete |
| `windows/custom/financial-account/bankCatalog.js` | Static popular-bank list (`{ id, name, country, institutions[] }`); designed for swap to a live endpoint |

## New hooks

| Hook | Operations |
|------|------------|
| `hooks/useAccountMutations.js` | `createAccount(payload)`, `updateAccount(id, payload)`, `archiveAccount(id)` (`PATCH {active: false}`), `unarchiveAccount(id)` (`PATCH {active: true}`), `deleteAccount(id)` (`DELETE`, ETP-4871 — a real delete), `fetchDefaults()` — plain `fetch` with bearer-token auth against the W CRUD endpoints. Callers keep the SPA payload `{ name, type, currencyId, iban, swiftCode, countryId }`; the hook maps it to DAL names (`currency`, `iBAN`, `country`) and parses the W envelope (`response.data[0]`). `fetchDefaults()` returns `{ currencies, defaultCurrencyId, defaultCountryId, countryIbanRules }` (ETP-4896 added the last two) backed by the generic currency selector + `/defaults`. Errors carry `.status` so callers can branch (e.g. 409 → inline message). |
| `hooks/useFinancialAccountAccounting.js` (ETP-4530; 9-field set ETP-4872) | `fetchAccountingConfiguration(accountId)` → GET, `saveAccountingConfiguration(accountId, { fINBankrevaluationgainAcct, fINBankrevaluationlossAcct, fINBankfeeAcct, inTransitPaymentAccountIN, depositAccount, clearedPaymentAccount, fINOutIntransitAcct, withdrawalAccount, clearedPaymentAccountOUT })` → POST, both against `/sws/neo/financial-account/accountingConfiguration`, fully owned by `FinancialAccountAccountingHandler`. The retired `fINAssetAcct`/`fINTransitoryAcct` pair is no longer sent. |

## New utilities

| File | Purpose |
|------|---------|
| `validateIban.js` (root `src/`) | `isValidIban(str)` — strips spaces, uppercases, rearranges, runs mod-97. Returns `true` for valid IBANs. Used by `AccountFormStep` to gate the submit button. |
| `countryIban.js` (root `src/lib/`, ETP-4896) | `validateIbanForCountry(iban, country)` — layers a country-aware prefix/length cross-check on top of `isValidIban`, degrading gracefully (mod-97 only) for the ~198 countries with no IBAN metadata. `ibanPrefixFor`/`expectedIbanLength` read a `countryIbanRules` catalog entry (`{id, iso, name, ibanPrefix, ibanLength}`). Used by both `AccountFormStep` and `EditAccountModal`. |

## i18n keys — account management

All keys added to both `en_US.json` and `es_ES.json`.

| Key group | Covers |
|-----------|--------|
| `financeAccountsNew*` | Wizard steps, type picker, connection toggle, bank picker, institution list, form fields, validation messages, toasts |
| `financeAccountsEdit*` | Edit modal sections, save button, success/error toasts |
| `financeAccountsArchive*` / `financeAccountsUnarchive*` | Confirmation dialog copy, button labels, success/error toasts including the 409 open-reconciliation message |
| `financeAccountsDelete*` (ETP-4871) | Delete dialog copy (`financeAccountsDeleteConfirmTitle`/`...Message`/`...Confirm`), success/error toasts. The backend's 409 message is shown verbatim (no local conflict key) |
| `financeAccountsMenu*` | Row kebab actions (`financeAccountsMenuEdit`, `financeAccountsMenuArchive`, `financeAccountsMenuUnarchive`, `financeAccountsMenuDelete`) |
| `bulkDeleteBlockedTooltip` (generic, ETP-4871, not `financeAccounts*`-scoped) | ListView's disabled-bulk-delete tooltip when the selection includes an undeletable row — entity-agnostic, shared by every window that passes `isRowDeletable` |
| `financeAccountTransfer*` | Funds transfer modal (ETP-4272): action/title, source/destination, amount, currency-from/to, conversion rate, bank fee, description, confirm/cancel, success + validation errors |
| `financeAccountsEditTab*` / `financeAccountsAccounting*` | Edit modal tabs (ETP-4530): tab labels, section titles (`...SectionPaymentIn`/`...SectionPaymentOut`, plus the reused `financeAccountsEditTabGeneral` for Banco's General sub-section), the 9 field labels (`...BankRevaluationGain`/`...Loss`, `...BankFee`, `...InTransitIn`, `...Deposit`, `...ClearedIn`, `...InTransitOut`, `...Withdrawal`, `...ClearedOut`, ETP-4872), empty-ledger message. The retired `fINAssetAcct`/`fINTransitoryAcct` keys (`...BankAsset`, `...Transitory`, `...BankAssetRequired[Summary]`) are left in both locale files, unused, since nothing renders them anymore — pending confirmation the "no field required" behavior (ETP-4872) is final before deleting them |
| `financeAccountsNewFieldCountry` / `financeAccountsBankConnectionFieldCountry` (ETP-4896) | Country field label — New Account form and Edit modal respectively (kept separate from `financeAccountsNewBankCountry`, the unrelated BankPicker flag-dropdown `aria-label`) |
| `financeAccountsNewIbanCountryMismatch` / `financeAccountsNewIbanLengthMismatch` (ETP-4896) | IBAN validation error messages for the two country-aware checks (prefix mismatch, wrong length), shared by both forms alongside the pre-existing `financeAccountsNewIbanInvalid` (mod-97 failure) |
| `financeAccountsNewCountryRequiredForIban` (ETP-4896 follow-up) | EditAccountModal-only: shown when Country is explicitly cleared during the edit while a real IBAN remains — mirrors the backend's "A bank account with an IBAN must have a country." 400 verbatim in translated form, and doubles as the backend-message fallback in `handleSave`'s catch block |
| `financeAccountsBankConnectionSpainOnly` (ETP-4896) | The reason the edit modal's connect button is disabled on a non-Spanish account. The only place the Spain-only rule is spelled out — the list row and row kebab hide their connect affordance instead |

Key reference (English):

```
financeAccountsNewTitle              "New account"
financeAccountsNewTypeBank           "Bank"
financeAccountsNewTypeCash           "Cash"
financeAccountsNewTypeCard           "Card"
financeAccountsNewConnectionOffline  "Without connection"
financeAccountsNewConnectionSoon     "Available in the next iteration"   (bank connection badge)
financeAccountsNewBankTitle          "Choose which bank the account belongs to"
financeAccountsNewBankSkip           "Continue without selecting a bank"
financeAccountsNewBankPopular        "Popular"
financeAccountsNewInstitutions       "Institutions"
financeAccountsNewFieldName          "Account name"
financeAccountsNewFieldIban          "IBAN"
financeAccountsNewFieldBic           "BIC/SWIFT"
financeAccountsNewFieldCurrency      "Currency"
financeAccountsNewFieldCountry       "Country"                              (ETP-4896)
financeAccountsNewIbanInvalid        "The IBAN is not valid"
financeAccountsNewIbanCountryMismatch "The IBAN does not match the selected country"       (ETP-4896)
financeAccountsNewIbanLengthMismatch "The IBAN does not have the expected length for this country" (ETP-4896)
financeAccountsNewCountryRequiredForIban "A bank account with an IBAN must have a country"  (ETP-4896 follow-up)
financeAccountsBankConnectionSpainOnly "The bank connection is only available for accounts whose country is Spain." (ETP-4896)
financeAccountsNewSubmit             "Add account"
financeAccountsNewCreateSuccess      "Account created"
financeAccountsNewNameExists         "An account with this name already exists"
financeAccountsEditTitle             "Edit account"
financeAccountsEditConnectionSoon    "Available in the next iteration"
financeAccountsEditSave              "Save changes"
financeAccountsEditSuccess           "Changes saved"
financeAccountsArchiveConfirmTitle   "Archive account"
financeAccountsArchiveConfirm        "Archive"
financeAccountsArchiveSuccess        "Account archived"
financeAccountsArchiveOpenRecon      "Cannot archive an account with open reconciliations"
financeAccountsMenuEdit              "Edit account"
financeAccountsMenuArchive           "Archive account"
```

## Not implemented yet (follow-up tasks)

- **Bank connection / Connected mode** (T3): connection toggle is visible but both the "Connected" option and the Bank connection section in the edit modal are disabled.
- **Real bank logos**: `bankCatalog.js` uses `<Landmark>` as a placeholder icon for all banks.
- **Card accounts**: the CARD step shows a "Coming soon" placeholder — actual card creation requires a bank connection.
- **Bank catalog from endpoint**: `bankCatalog.js` is a static list; the component is designed so the data source can be swapped to a live endpoint without changing the layout.
- **`enablebankstatement` flag** (ETP-4530): `FinancialAccountAccountingHandler` auto-sets it to `true` on every Contabilidad save (whenever any of the 9 accounting fields, ETP-4872, are saved) — broader than what the tab visually presents, since the flag itself is not exposed as an editable field here. If Classic UI surfaces this checkbox elsewhere, a user could find it pre-checked after using this tab; this is a deliberate scope call (the flag must be `Y` for Classic's bank-statement accounting engine to read the accounts at all), not a bug.
- **Remaining `FIN_Financial_Account_Acct` columns** (ETP-4530/ETP-4872): `receivePaymentAccount`, `makePaymentAccount`, `creditAccount`, `debitAccount` stay `discarded` in `decisions.json` — explicitly out of scope per the ETP-4872 ticket, unlike the deposit/withdrawal/bank-fee/revaluation accounts it moved to `editable`.
- **"No field required" is an inference, not a confirmed product decision** (ETP-4872): the ticket's field tables carry no "required" marker for any of the 9 accounting fields, so the old `fINAssetAcct`-required validation was dropped entirely rather than moved to one of the new fields. This is flagged as pending product/PM confirmation in the implementation plan's Open Questions — do not treat it as permanently settled without checking whether that confirmation has since landed.
- **New-account "Con conexión" path is NOT country-gated** (ETP-4896): the Spain-only restriction applies to *accounts*, which is what Test Cases 5–7 specify ("una cuenta … tiene como país X"). In the New Account wizard's CONNECTION step no account and no country exist yet — the account is created *from* whichever bank account Salt Edge returns — so there is nothing to gate on. Consequence worth knowing: a user can still reach Salt Edge from that step and pick a non-Spanish provider via the BankPicker's country filter (`BANK_COUNTRIES` offers ES/IT/FR/DE/PT/GB/NL/BE/IE/AT). Whether that filter should also be restricted to ES is a **product decision left open**, deliberately not assumed here.
- **Backend error messages are translated in the SPA, not the backend** (ETP-4896 QA follow-up): `NeoResponse.error` carries only `{message, status}` — no machine-readable `code` — so this window routes `err.message` through the shared `lib/backendErrors.js#translateBackendError`, which recognises Etendo's English literals by text (exact-match table plus prefix/suffix matchers for the interpolated ones) and maps them to `backendError.*` locale keys. Both surfaces use it: `EditAccountModal` (which previously had its own ad-hoc one-entry table, now deleted) and `NewAccountWizard` (which previously showed raw English on create). **Consequence: the Java message literals in `FinancialAccountCountrySupport` are a de facto wire contract** — rewording one silently drops the user back to English, so its matcher and locale key must change in the same commit. The frontend pre-checks are meant to catch these before the request fires; this is the safety net for what slips past (a stale/empty `countryIbanRules`, a race with another tab, an API/MCP-shaped body). A stable `error.code` contract would be sturdier — there is precedent (`MISSING_REQUIRED_FIELDS` in `NeoCrudHandler` ↔ `useEntity`) — but it touches the wire format and its MCP/API consumers, so it stays a **follow-up option**, not part of this fix.
- **SWIFT/BIC format validation** (ETP-4896): intentionally untouched. Classic has no SWIFT format validation either — no regex, no length check, no cross-check against country — only a presence check (`FIN_FINACC_SHOWSWIFT_CHK`) when "Using the SWIFT Code" is on, unrelated to this ticket's scope. This is why the ticket's Test Case 9 ("la validación del SWIFT se aplica según el país configurado") is not implementable as written: it asks an *existing* validation to start reading the Country field, and there is no existing rule to feed it into. The **field itself** is editable in both creation and edition (the QA follow-up added it to `EditAccountModal`); only the format rule is absent.

---

# Financial Account Detail

Detail view for a single `FIN_Financial_Account` reached from the Cuentas list page.

## Intent

Display the full detail of a financial account: a summary strip with KPIs, and three tabs for Movements, Reconciliation and Imported Statements. The Movements tab is the primary working surface; the Reconciliation tab hosts the manual bank reconciliation split panel (T6); the Imported Statements tab is a placeholder pending a later iteration.

## What this view does

- Navigate to `/financial-account/:id` from the Cuentas list (row click).
- Topbar shows `{accountName}` as title and `Finanzas / Cuentas / {accountName}` as breadcrumb via `useSetPageMeta` (inlined in `index.jsx` — no per-window header bar).
- Account Summary Strip (single horizontal bar inside the Movements tab body): avatar + IBAN (chunked in groups of 4, with copy-to-clipboard) | Saldo total | Entradas (30D) | Salidas (30D). The three KPI sections use `flex-1` so they spread evenly.
- Three tabs with counts: Movements (live data), Reconciliation (live data — manual reconciliation split panel, T6 + automatch engine, T7), Imported Statements (live data).
- **Editar** button (ETP-4530) sits to the left of the contextual tab-strip action, always visible regardless of the active tab — opens `EditAccountModal` (see below) so editing no longer requires going back to the Cuentas list.
- Right-side tab-strip action is contextual. On **Movements** and **Imported Statements** it shows the Export button and performs a CSV download. On **Reconciliation** it shows the **Automatch** button, which opens the automatch suggestions modal (T7). **All exports go through the generic backend CSV flow** (`?export=csv`, see `neo-headless.md` §4.3) via the shared `useCsvExport` hook, so the server streams the file and large lists never get assembled in the browser:
  - **Movements tab** → exports the filtered movements (`GET /sws/neo/financial-account-transactions?...&export=csv`, `ids` = filtered movement ids). Classic-parity columns (Transaction Type / Status labels, Deposit/Withdrawal split, synthetic "Payment", Processed flag) are **pre-derived server-side** on the transaction rows so the exporter stays generic. Column order/labels live in `MOVEMENT_CSV_COLUMNS` (`index.jsx`).
  - **Imported Statements tab, no statement selected** → exports the filtered statement **headers** (`GET /sws/neo/bank-statements?...&export=csv&ids=<filtered ids>`).
  - **Imported Statements tab, statement(s) selected** → exports the **lines** of the selected statement(s) (`...&action=lines&statementIds=<ids>`), mirroring Classic's line export.
  - Column labels/order and `ids`/`statementIds` are passed as query params; the statements tab exposes the current selection + filtered headers to the window via a ref (`getSelectedStatementIds` / `getFilteredStatements`), the movements tab via `getFilteredMovements`.
- Movements toolbar: back arrow `←`, type filter (BPD/BPW, search-enabled), date range filter (preset list + dual calendar, same picker as grid views), advanced "by conditions" filter (`AdvancedFilterButton`, applied client-side), search input, and a **split button** (`MovementsSplitButton`, same pattern as the Imported-statements `ImportSplitButton`): the primary action is **`Nuevo movimiento`** (opens the accounting-account modal — see "Nuevo movimiento (accounting account)" below), and the ▾ dropdown holds **`Transferir fondos`** (ETP-4272, opens `FundsTransferModal.jsx`). (The older 2-step `NewMovementWizard` is superseded and no longer wired.)
- Movements table: Expand chevron | Checkbox | Date | Payment | Contact | Description | Status (`MovementStatusBadge` — **two states only**: Conciliado / Sin conciliar) | Type (with `PostingStatusDot` sub-label) | Cuenta contable | Amount | Balance | kebab.
- **Payment column** (`Pago`): when the movement has a related payment, the document number renders as an underlined link (with an `ArrowUpRight` icon) that navigates to `/payment-in/:id` (received payments, `paymentIsReceipt === 'Y'`) or `/payment-out/:id` (made payments). Movements with no payment show plain text.
- **Expandable "more info" panel**: the leading circular chevron (or a click anywhere on the row) toggles an inline panel showing a **fixed set of three accounting dimensions — Proyecto, Centro de costes, Producto** (`DISPLAYED_DIMENSIONS = ['project', 'costcenter', 'product']` in `MovementsTable.jsx`). This is intentionally independent of the chart-of-accounts `enabledDimensions`: Organización and the other dimensions are never shown, and the business partner is excluded (it already has its own Contacto column). Each of the three fields renders read-only as label + value (empty when the transaction has no value), in a responsive grid. The header row and panel form one elevated card (shadow at the bottom only, no seam line — the header row sits at `z-20` over the panel's `z-10` to hide the shadow bleed).
- Locale-aware date format in the Date column (es_ES → `dd/MM/yyyy`, en_US → `M/d/yyyy`).
- Individual row checkbox + select-all (indeterminate when partial).
- Row hover: subtle shadow elevation + kebab appears. The kebab (`MovementRowKebab.jsx`) offers **Contabilizar** (Post, when Processed & not posted) and **Descontabilizar** (Unpost, when posted) — both via the financial-account document-posting action (`.../transaction/{id}/action/post|unpost`) — and, for **manual accounting-account transactions only** (no `paymentId`): **Editar** (not-posted; reopens the movement modal, partial edit once Processed), **Procesar** (Draft → Processed), **Reactivar** (Processed → Draft, via Payment Removal), and **Eliminar** (Draft removed directly; Processed reactivated+removed via Payment Removal). Reactivar/Eliminar show the confirmation cartel (`MovementConfirmModal`) only when there is something to undo (posted and/or reconciled). Payment-linked movements hide the accounting-account actions (managed from the Payments module) but still expose Descontabilizar when posted. No role gating. **Eliminar carries one further exclusion (ETP-5085): it is hidden for a funds-transfer leg** — `isTransferLeg = Boolean(movement.transferTxnId) && movement.trxType !== 'BF'`. The two legs of a transfer reference each other through RESTRICT self-FKs, so the removal could only ever fail, and it failed as an opaque HTTP 500; the backend now rejects it with a 409 and the action is hidden rather than disabled, like every other inapplicable item in this menu. A destination-side **bank fee (`BF`) carries the same `transferTxnId` but nothing references IT, so it stays deletable** — hence the `trxType` half of the predicate.
- **Status column** shows three states derived from the transaction status code (`movementStatusConfig.js`): **Borrador** (grey — `RPAP`/`RPAE`, not yet processed), **Sin conciliar** (processed, not cleared), **Conciliado** (`RPPC`, cleared against a bank statement).
- Back arrow in the toolbar runs `navigate(-1)`.
- The action bar's primary button is **`Nuevo movimiento`** (opens the accounting-account modal), with **`Transferir fondos`** (ETP-4272) inside its ▾ dropdown. The **accounts grid** row kebab (`AccountRowMenu.jsx`) also offers **`Nuevo movimiento`**, which deep-links to that account's Movements tab with the modal auto-opened (`?tab=movements&newMovement=true` → `index.jsx` sets `autoOpenNewMovement` on `MovementsTab`).

### Nuevo movimiento (accounting account)

"Nuevo movimiento" registers a **manual movement linked directly to an accounting account**, in **Draft (Borrador)** — the Etendo Classic "create transaction in financial account" flow, without an invoice or reconciliation. It renders `windows/custom/financial-account/NewTransactionModal.jsx` — a single-view modal (shared `@/components/ui/dialog` + `@/components/forms/fields`). Fields:

- **Fecha** (required, default today) → `transactionDate` (accounting date = same).
- **Tipo** — segmented **Entrada / Salida** (default Salida): Entrada → `BPD` (deposit), Salida → `BPW` (withdrawal).
- **Cuenta contable** (required, searchable via `useGLItemLookup`).
- **Importe** (required, > 0, single unified field) → mapped to `depositAmount` (Entrada) or `paymentAmount` (Salida).
- **Descripción** (optional).
- **Dimensiones contables** (optional): **Contacto** (`bpartnerId`, searchable) is **always shown**; **Centro de coste** / **Proyecto** / **Producto** appear only when enabled in the chart of accounts (the account's `headerDimensions`). Organization / Processed / Payment are intentionally not shown.
- All selector fields (Cuenta contable, Contacto, and each dimension) use the shared **`ChipSelect`** primitive (`components/forms/fields.jsx`) — the same chip-style searchable combobox as the Funds-transfer modal (selected value shown as a removable chip + inline, non-portaled dropdown so it scrolls inside the Dialog). Each holds an `{ id, name }` object. Dimensions search server-side via `useDimensionLookup` (the `dimension-values` action filtered by `q`).

The footer has two actions: **Guardar** saves as **Draft** (Borrador); **Confirmar** saves **and processes** it (Borrador → Procesado) in one atomic backend call. Both go through `useCreateMovement()`/`useUpdateMovement()` → `POST …financial-account-transactions?action=create|update` with a `process` flag (`false` for Guardar, `true` for Confirmar); the backend (`FinancialAccountTransactionsHandler`) inserts/updates the `FIN_Finacc_Transaction` (Draft = status `RPAE`/`RPAP`) and, when `process:true`, runs Classic's `FIN_TransactionProcess.doTransactionProcess("P", trx)`.

**Error surfacing (ETP-5085, applies to every movement action — create / update / process / reactivate / delete / transfer):** `useCreateMovement.postAction` no longer throws `HTTP <status>: <raw response body>`. It reads the backend's own business message with the shared `parseBackendErrorMessage` (`lib/backendErrors.js`) and attaches `error.status`; `MovementRowKebab.runLifecycle` then runs it through `translateBackendError` before the toast, falling back to the per-action i18n key when the response carried no message. Before this, a rejected action showed the user the literal JSON envelope — that is how ETP-5085's 500 reached the screen as `HTTP 500: {"error":{"message":"Could not delete the movement…"}}`. New backend literals therefore need an entry in `BACKEND_ERROR_MAP` plus the `backendError.*` key in all three locale files.

**Edit mode**: opened from the kebab's **Editar**, available for both Draft and Processed-but-not-yet-posted manual G/L movements (`MovementRowKebab.jsx`: `canEdit = isGlTransaction && !isPosted`) — the same modal, seeded from the row (which carries the FK ids + display names + the deposit/withdrawal split), titled "Editar movimiento", saving via `action=update`. On a Draft movement everything is editable; on an already-**Processed** movement (`ETP-4500`) only **amount and direction are locked** (`NewTransactionModal.jsx`: `lockAmountType = isEdit && Boolean(movement.processed)`, Classic parity) — G/L item, dimensions, description and dates stay editable, and the backend (`FinancialAccountTransactionsHandler.applyEditableDimensions`) accepts the update. Once the movement is **posted** (contabilizado), Editar is no longer offered at all — it must be reactivated first (Reactivar, kebab). Delete/Reactivate happen from the kebab, backed by `?action=delete|reactivate` (delegating to the `com.etendoerp.payment.removal` `TransactionRemovalUtil`) — except for a funds-transfer leg, which `action=delete` rejects with a 409 before reaching that module (ETP-5085, see below). Posting (contabilización) stays an independent flag (the kebab's Post action).

**Reactivar (kebab) and the Reconciliación tab's un-reconcile actions overlap in scope but are separate code paths.** A movement matched to a bank statement can be reactivated from either surface — the Reconciliación split panel's Desconciliar/Reactivar (`ReconciliationHandler`, see above), or this Movimientos-tab kebab item (`FinancialAccountTransactionsHandler.handleReactivate` → `TransactionRemovalUtil.reactivate`, which internally un-reconciles via the same `ReconciliationRemovalUtil.removeTransactionFromReconciliation` before running Core's transaction-level `FIN_TransactionProcess` `"R"` action). One gap between them was closed in this task: when the reactivated transaction was matched to a bank-statement line that Core had physically split for a 1:N match, this kebab path only cleared the line's transaction pointer and left the ETGO-tagged split siblings fragmented — the Reconciliación tab already re-collapses them (`ReconciliationHandler.normalizeReactivatedMatchGroup`), this path didn't. `handleReactivate` now captures the linked line before reactivating and calls the same `normalizeReactivatedMatchGroup` (a plain `new ReconciliationHandler()` instantiation — no CDI wiring needed, same composition pattern `ReconciliationHandlerSupport` already uses).

**Investigated but NOT fixed here (documented root cause, no reported repro):** a task originally reported `HTTP 400 {"error":{"message":"Document already Posted.: <docNo>"}}` from this same kebab action when the matched transaction's reconciliation was already posted (`FIN_Reconciliation.Posted='Y'`). Root cause: `ReconciliationRemovalUtil.removeTransactionFromReconciliation` (in `com.etendoerp.payment.removal`) calls `processReconciliation("R", reconciliation)` without first calling `Utilities.unPostReconciliation(reconciliation)` — its sibling `ReconciliationRemovalUtil.reactivate(rec)` does that unpost step; this method doesn't, so `FIN_ReconciliationProcess`'s `"R"` branch rejects with `@PostedDocument@` whenever the reconciliation is posted. Not reproducible in this environment (local reconciliations sit at `posted='D'`, not `'Y'` — no accounting run here), so left undone; the one-line fix (`if ("Y".equals(reconciliation.getPosted())) { Utilities.unPostReconciliation(reconciliation); }` before the `processReconciliation("R", …)` call) is ready to apply the moment it reproduces.

### Funds transfer (T11 · ETP-4272)

"Transfer funds" moves money between two financial accounts of the organization. Two entry points:

- **Accounts list** → the row kebab (⋮) gains a **Transferir fondos** item (`AccountRowMenu.jsx`), opening the modal with that row's account as the (read-only) source.
- **Account detail** → the **Transferir fondos** item inside the Movements toolbar split-button (▾ next to "Nuevo movimiento"), with the current account as source.

Both render `windows/custom/financial-account/FundsTransferModal.jsx` — a single-step modal (shared `@/components/ui/dialog`, with inline searchable dropdowns so wheel/touchpad scrolling works inside the modal). Fields: source account (pre-filled, read-only, with available balance), destination account (searchable; other org accounts), **accounting item / GL (required, searchable)**, amount (currency symbol via the shared `formatCurrency`), currency-conversion block (shown only when the destination currency differs — multi-currency; the "Tasa de conversión" rate field with the source→destination currency badges alongside its label, no separate "Conversión de divisa" heading — plus, inline next to the rate input, a compact read-only "≈ {amount}" box, `data-testid="transfer-receive-amount"`, previewing `amount × rate` in the destination currency via `formatCurrency`; shows "—" until both amount and rate are valid positive numbers), Bank Fee checkbox (reveals two fee fields — source and destination — mirroring Classic), description (default "Funds Transfer Transaction"). Client guards: destination + accounting item required, amount > 0, amount ≤ source balance; the backend re-validates and rejects same-account / over-balance / cross-org transfers. On confirm it calls `useFundsTransfer()` → `POST …financial-account-transactions?action=transfer`; the backend delegates to Etendo Classic's `FundsTransferActionHandler.createTransfer(...)`, creating the paired withdrawal (source) + deposit (destination) — plus optional bank-fee expenses on the source and/or destination — left **Pending** (`PWNC` / `RDNC`) until reconciled.

**A transfer cannot be deleted** (ETP-5085). Its two legs reference each other through RESTRICT self-FKs (`EM_APRM_FINACC_TRANS_ORIGIN` + the `EM_ETGO_FINACC_TRANS_DEST` mirror), so neither leg is removable: the movements kebab hides **Eliminar** for both, and `?action=delete` answers 409 with a translated message. To undo a transfer, register the compensating movement — there is no un-transfer action.

**Layout note:** the modal's body wrapper (`<div className="flex min-w-0 flex-col gap-4 px-6 pb-2 pt-1.5">`, right below the header) carries `min-w-0`. `DialogContent` renders as `display: grid`, and grid items default to `min-width: auto` — without this, an extremely long value anywhere deep inside (e.g. `transfer-receive-amount` computing a huge product) inflates this whole column past the dialog's own `max-w-[600px]`, and only the rightmost sliver gets clipped, cropping every row uniformly instead of just the offending field. Confirmed live via Playwright (`getBoundingClientRect()` before/after) — do not remove this class when touching this wrapper.

### Conditional tabs (ETP-4795)

**The tab set depends on the account type.** `DetailTabs.jsx` no longer hardcodes its triggers: it declares a `TAB_DEFS` array and exports `getVisibleTabs(isCash)`, which `index.jsx` uses for both its content switch and its guard — one list, three consumers, so they cannot drift.

| Tab | Bank / Card | Cash |
|---|---|---|
| Movimientos | ✅ | ✅ |
| Conciliación | ✅ (split panel) | ✅ (cash close) |
| Extractos importados | ✅ | ❌ — a cash drawer has no bank statements |
| Reconciliaciones | ❌ | ✅ — read-only history, see below |

Two details that are load-bearing:

- **`isCash` is three-state.** `true` cash, `false` bank/card, **`undefined` while the account is still loading**. Both type-dependent tabs test for an explicit `true`/`false`, so during the load neither renders — a tab only ever *appears*, it never shows for a frame and then vanishes once the real type arrives.
- **There is now a guard.** Before ETP-4795 nothing validated `activeTab` against the tabs actually rendered, so pointing at a hidden one (a `?tab=statements` deep link on a cash account, or switching the type to Cash in the Edit modal) left the content area **blank with no trigger highlighted** — every `activeTab === …` branch was false and `TabsTrigger` found no match. `index.jsx` now resets to the first visible tab, in its own effect, and deliberately waits for `account` to load so it doesn't discard a legitimate deep link.

Naming note: the new tab's internal key is `reconciliationList`, deliberately **not** `reconciliations`, so it is not one character away from the existing `reconciliation` tab. Only its i18n key uses the plural, because that is the label.

**Badges are passed as one `badges={{ … }}` dictionary**, not as loose props — a tab set that grows per account type would otherwise grow a prop per tab. Movimientos carries its row count, Conciliación the account's `pendingCount`, and Reconciliaciones the number of documents. **Extractos importados deliberately has none**: it never had one, and a tab bar where every trigger shows a number reads as noise.

### Cash close tab (ETP-4795) — cash-type accounts only

**The Reconciliation tab is account-type dependent.** For a cash account (`FIN_Financial_Account.Type = 'C'`) it renders the **cash close** screen instead of the bank split panel described below; `index.jsx` branches on `isCashAccount` (`account?.type === ACCOUNT_TYPE.CASH`). Movements is unchanged. Automatch is bank-only, so for a cash account both its header button and its auto-open modal are suppressed, and `useAutoMatch` is never queried.

A cash drawer is not reconciled against a bank statement: the user ticks the movements physically in the drawer, declares the counted balance, and confirms. This is the same operation Classic offers through its manual Reconciliation popup (`org.openbravo.advpaymentmngt.ad_actionbutton.Reconciliation`) for Caja accounts — same columns, same "Hide transactions after statement date" default, same Beginning/Ending balance semantics.

**Components** (`tools/app-shell/src/windows/custom/financial-account/CashClose/`):

- `index.jsx` — `CashCloseTab`. Owns the only state there is: `marked` (Set of movement ids), `statementDate`, `declaredInput` (a raw string, so the box can be emptied), `hideCleared`, `hideAfter` (**on** by default), `search`. Seeds itself from the server's draft when one exists.
- `cashCloseMath.js` — every derived figure, as pure functions: `summarize()`, `visibleMovements()`, `countAfterStatementDate()`, `parseDeclaredAmount()` (es-ES: `"1.234,56"` → `1234.56`, and a lone `"12.50"` read as 12.5, not 1250), `selectionState()`, `toggleAllVisible()`, `toggleOne()`. Nothing derived is ever stored in state. Unit-tested in `cashCloseMath.test.js` (26 cases).
- `CashCloseMovementsPanel.jsx` — left column. Table columns: *(checkbox)* · Fecha · Contacto · Ref. pago · Descripción · Salidas · Entradas. Toggles `Ocultar marcados` / `Ocultar posteriores a la fecha`, a search box, and a `Marcar todo` tri-state checkbox that only ever acts on the **visible** rows (a row hidden by a filter is never silently unticked). Amber banner when post-dated movements are visible.
- `CashCloseSidePanel.jsx` — right column, fixed `w-[400px]`, scrollable cards + a pinned action footer. "Datos del cierre" (statement date + declared balance, the latter with a `0,00` placeholder) and "Resumen del cierre" (Saldo inicial / Entradas marcadas / Salidas marcadas / Saldo calculado / Saldo declarado / **Diferencia**), plus the pending-for-next-close count. The opening-balance and account chips that used to sit under the date and balance fields were dropped — both figures already appear as rows in the summary right below.
- `CashCloseConfirmDialog.jsx` — shown **only when the close does not balance**; a balanced close confirms directly. States the amount and that an adjustment movement will be posted. With no concept configured on the account, it explains where to set it and disables the confirm button (the backend rejects the same case with a 400 regardless).

**Neither the dialog nor the side panel names the accounting account.** It is configured once per account in Edit account → General, so it is not a choice being made at confirmation time — naming it only added a term to parse next to the amount that actually matters. `glItemDifference` is still required; what changed is the copy, not the guard. The no-account branch is untouched in both places, because that one is a blocker the user has to act on.

**Sign convention**, shared by frontend and backend: `difference = declared − (opening + clearedNet)`. POSITIVE means the drawer holds *more* than the books (a surplus → `BPD` deposit); NEGATIVE means *less* (a shortage → `BPW` withdrawal). Balanced when `|difference| < 0.005` — deliberately tighter than, and unrelated to, the split panel's `0.01` reconcile epsilon.

**Backend** — its own spec, `cash-close` (`SPEC_TYPE=R`), handler `@Named("cashClose")` (`CashCloseHandler` + `CashCloseSupport`), at `/sws/neo/cash-close`. A separate spec rather than more actions on `bankReconciliation`, because Core keeps statement-backed and cash-only reconciliations mutually exclusive per document (Classic's `@APRM_ReconciliationMixed@` guard); the handler re-checks this and returns 409 if the draft already has statement-backed lines. It also hard-rejects non-cash accounts with a 400.

| Action | Behaviour |
|---|---|
| `GET ?action=pending&accountId=` | Opening balance (last **confirmed** close's ending balance, else `initialBalance` — mirroring `Reconciliation.java`), the account's accounting-account difference setting, the current draft with its ticked ids, and every movement still available (`processed='Y'`, unreconciled or belonging to this draft, scoped to client + accessible org tree) |
| `POST ?action=saveDraft` | Creates or reuses the draft (`TransactionsDao.getLastReconciliation(account,"N")`, else `AdvPaymentMngtDao.getNewReconciliation(...)` with a `REC` doctype), syncs the ticked set, stores the declared balance and close date. Does not complete |
| `POST ?action=confirm` | Same, then validates, posts the difference, rewrites post-dated movement dates, settles invoices and completes the document |
| `POST ?action=discardDraft` | `ReconciliationRemovalUtil.reactivateAndRemoveReconciliation(draft)` so the user can start over |

Two deliberate divergences from Classic, both load-bearing:

1. **A transaction is linked directly** — `trx.setReconciliation(draft)` + `trx.setStatus("RPPC")` (+ the payment's status), exactly as Classic's `updateTransactionStatus`. `APRM_MatchingUtility.matchBankStatementLine` is unusable here: it *requires* a `FIN_BankStatementLine`, and a cash account has none. No `FIN_ReconciliationLine` rows are written — that "table" is the view `FIN_RECONCILIATIONLINE_V`, so a cash-reconciled transaction simply shows with a null bank-statement line.
2. **The document is completed in place** — `documentStatus='CO'`, `processed=true`, `APRMProcessReconciliation='R'`. `APRM_MatchingUtility.processReconciliation("P", …)` is deliberately **not** called: it runs `FIN_ReconciliationProcess.updateReconciliation`, which recomputes and **overwrites** `startingbalance`/`endingBalance` — destroying the very number a cash close exists to record, the balance the user counted.

Where we *improve* on Classic: its popup makes the user type the difference amount into a "GL Item Differences" box by hand and refuses to process unless it exactly offsets the residual. Here the residual is computed, shown live, and confirmed in one dialog. The difference transaction itself is built from Etendo GO's own `createTransactionForRule` template rather than Classic's `createTransaction` — the latter leaves the transaction unprocessed, statusless and always on `paymentAmount`, which excludes it from `getManualReconciliationAmount` and from posting.

**On confirm, movements dated after the close date have their `transactionDate` and `dateAcct` pushed forward to the close date** (with the un-post → un-process → mutate → re-process → re-post dance a DB trigger forces, then `TransactionsDao.updateAccountingDate`). This is Classic behaviour, and it is what the amber banner in the left panel warns about.

Other guards, all mirroring Classic: the close date cannot predate the last confirmed close, cannot be past tomorrow, and its accounting period must be open (`Utilities.checkPeriod`) — 409 in each case.

**Two period checks, not one.** `checkPeriod` only covers the *close date*. A movement dated **before** the close keeps its own `dateAcct` (only post-dated ones get pushed forward), so it can sit in an already-closed period even when the close date's period is open — that would pass and then fail at posting time. `CashCloseHandler.findLineInClosedPeriod(draft)` closes that hole, replicating Classic's `linesInNotAvailablePeriod` verbatim: same `FIN_ReconciliationLine_v` view, same `c_chk_open_period(org, transactionDate, 'REC', null) = 0` predicate, same `'REC'` document category. It returns the offending line's identifier, which the 409 message names so the user knows which movement to unmark. Note this is the one piece of `FIN_ReconciliationProcess` we do duplicate — see below for why we cannot simply call that process.

**Java evidence:** `src-test/src/com/etendoerp/go/schemaforge/CashCloseHandlerTest.java` (26 cases: routing, the type gate, the parameter guards, `discardDraft`, both period guards and their ordering, and the pure difference/threshold/date-guard helpers).

#### Why not `APRM_MatchingUtility.processReconciliation`?

Worth stating explicitly, because the bank path in this same codebase *does* use it (`ReconciliationHandler.compose`) and the asymmetry looks arbitrary otherwise.

`APRM_MatchingUtility.processReconciliation("P", rec)` runs `FIN_ReconciliationProcess`, whose `"P"` branch does four things: sets `processNow`, runs the per-line period check, calls `updateReconciliations(rec)`, then completes the document. Three of those four are exactly what we want — but the third is disqualifying:

```java
reconciliation.setStartingbalance(MatchTransactionDao.getStartingBalance(reconciliation));
reconciliation.setEndingBalance(MatchTransactionDao.getEndingBalance(reconciliation));
```

It **overwrites the ending balance with a derived figure** — `initialBalance + BSL amount + Σ reconciled cash transactions up to endingDate` — and does the same to every *subsequent* reconciliation of the account. In a cash close the ending balance is not a derived total: it is **the amount the user physically counted**, the evidence the whole document exists to record. Replacing it would erase the fact that the drawer was counted at 182,61 € when the books said 344,66 €; only the adjustment transaction would survive, not the count that motivated it.

(The arithmetic would often still *agree* — our difference transaction is processed, dated within the window and BSL-less, so `getManualReconciliationAmount` picks it up and the derived figure converges on the declared one. But it converges only when every prior close of that account followed the same rule; an account carrying Classic-made closes, whose difference transactions are left unprocessed, diverges silently. "Usually equal" is not a good enough reason to overwrite the audit value.)

This is the same conclusion Classic itself reached for this exact flow: its manual popup completes the document inline and never calls the process. Etendo GO's **bank** reconciliation has no such conflict — there the ending balance genuinely *is* derived from the statement — so it keeps using `processReconciliation` and is unaffected by any of this.

### Reconciliaciones tab (ETP-4795) — read-only, cash accounts only

The history of the account's `FIN_Reconciliation` documents — i.e. what each confirmed cash close produced. Equivalent to Classic's *Reconciliations* tab plus its *Cleared items* child tab. Expanding a row reveals the movements that close cleared.

**Served entirely by the generic NEO CRUD — there is no handler, no action, and no new Java.** This is the notable part: `push-to-neo` creates an `ETGO_SF_ENTITY` row for **every AD tab of the window** with all verbs enabled (`populateWindowSpec(..., includeAllMethods: true)`), so these two endpoints existed long before this feature:

```
GET /sws/neo/financial-account/reconciliations?parentId={accountId}
GET /sws/neo/financial-account/clearedItems?parentId={reconciliationId}
```

`"exclude": true` in `decisions.json` never disabled them — it only kept the entities out of `contract.json`. The side effect was that `ETGO_SF_FIELD` exposed an arbitrary ~10/15-column subset (whatever collided by column name with another entity) **and all of it writable**. Un-excluding is what gives them a deliberate, fully read-only field set.

Parent filtering is `?parentId=`, resolved server-side from the AD tab hierarchy (`NeoTypeCoercionHelper.buildParentWhereClause`) rather than from a column name the client passes: `e.account.id` for the header, `e.reconciliation.id` for the children. ⚠️ `clearedItems` must therefore be given the **reconciliation** id — passing the account id silently returns nothing.

**Field configuration** (`artifacts/financial-account/decisions.json`):

- **Grid columns, `reconciliations`:** `documentNo`, `transactionDate` (labelled *Fecha cierre*), `startingbalance`, `endingBalance`, `documentStatus`, `posted`. `endingDate` is **not** a column: on a cash close it always equals `transactionDate`, so two adjacent identical dates only cost width.
- **Grid columns, `clearedItems`:** `transactionDate` (*Fecha*), `description`, `financialAccountTransaction`, `payment`, `currency`, `transactionType`, `gLItem`. Narrower than Classic's `grid_seqno` on purpose: `accountingDate` duplicates the transaction date, and `depositAmount`/`paymentAmount` are collapsed into one signed **Importe** tail column (green `+` in, red `−` out), matching the Movements grid. That tail is not a contract column — a net is derived — so it is a fixed track, the same way `StatementsTable` carries its computed aggregates.
- **`financialAccountTransaction` and `payment` are links, not text.** A movement has no short identifier of its own (date, amount, description and payment are already columns), so it renders as an arrow button that deep-links to `?tab=movements&txn=…`, with the full identifier as the tooltip. `payment` shows only the document number — the first segment of NEO's `payment$_identifier` — linking to `payment-in`/`payment-out`, with the direction derived from `transactionType` (`BPD` in, `BPW` out, else fall back to the amounts) because the underlying view has no `isreceipt`.
- **The 8 "Details" aggregates are `discarded`** (`aPRMReconciledItemNo/Amount`, `aPRMUnReconciled*`, `aPRMOutstanding*`). They are not physical columns: they are `ad_column.sqllogic` correlated subqueries, and four of them scan `fin_bankstatementline × fin_bankstatement × fin_reconciliation`. In a list they would be evaluated once per row.
- **All 7 process/print buttons are `discarded`**, otherwise the contract emits action endpoints for them on a read-only tab.
- `bankStatementLine` is `grid: false` — always NULL on a cash reconciliation, so it would only ever be an empty column here.

Verified after the push: `reconciliations` → 15 fields `ISINCLUDED=Y`/`ISREADONLY=Y` + 16 `ISINCLUDED=N`; `clearedItems` → 19 fields, all included and read-only. **Zero writable fields on either.**

**Accounting status comes from `Posted`, not from `EM_Etblkp_Accountingstatus`.** That second column is a mirror maintained by the trigger `etblkp_fin_recon_status_trg`, which **only fires on UPDATE, never on INSERT** — freshly inserted rows keep the `'l'` ("Pending Refresh") default and go stale. Confirmed in local data: documents 1000032 and 1000033 have `posted='Y'` with `em_etblkp_accountingstatus='l'`. The mirror is therefore `discarded` and the badge is derived from `posted`.

**Components** (`tools/app-shell/src/windows/custom/financial-account/ReconciliationList/`): `index.jsx` (tab shell) → `ReconciliationListTable.jsx` (accordion, CSS grid rather than `<table>` so the expanded row can span every column) → `ClearedItemsInline.jsx` (child grid, **fetches its own data only while its row is open**, so the query is lazy per row instead of N+1 up front). Same triplet shape as `ImportedStatementsTab` → `StatementsTable` → `StatementLinesInline`. Columns on both levels come from `getContractGridColumns()`, so reordering or dropping one is a `decisions.json` change, not a JSX change.

Hooks: `tools/app-shell/src/hooks/useReconciliationList.js` — `useReconciliations(accountId)` and `useClearedItems(reconciliationId)`. Both pass `_endRow` explicitly (200 / 500): the generic CRUD defaults it to 100 and would silently truncate a long history.

**`useReconciliations` is called by `index.jsx`, not by the tab**, and the rows are handed down as a prop. The window needs the count for the tab badge whether or not the tab is mounted, and fetching in both places would issue the same request twice. It is parked with a `null` id on non-cash accounts, where the tab does not exist. Filtering (date range, search, advanced conditions) stays inside the tab — that is view state, not data.

The toolbar mirrors the Movements tab: back arrow, date range defaulting to **last 30 days**, the advanced condition filter, and a search box; no summary strip, because those KPIs belong to the account and Movements already shows them.

**Entity-level write access.** `ETGO_SF_ENTITY` still has no `ISREADONLY`, but the six HTTP method flags (`ISGET`/`ISGETBYID`/`ISPOST`/`ISPUT`/`ISPATCH`/`ISDELETE`) *are* declarable from `decisions.json` since ETP-4254 — `entities.<key>.readOnly: true` resolves to `GET` + `GETBYID` only (see `lib/entity-methods.js` in `schema_forge_core`).

- **`clearedItems` is now declared `"readOnly": true`.** It is a DB view (`FIN_ReconciliationLine_v`), so an INSERT was never possible; before, the contract advertised `POST`/`PUT`/`PATCH`/`DELETE` with zero writable fields behind them, and a write died on a raw DAL error instead of a clean `405`. The contract now carries `apiPrediction.crud.clearedItems.methods = ["GET","GETBYID"]`. Reads are unaffected.
- **`reconciliations` is deliberately left open.** It is a physical table (`FIN_Reconciliation`) whose rows are created by a process rather than by a plain INSERT, and every field being read-only may be over-curation rather than a genuine read-only entity. Closing it is a pending human decision, not an oversight.

Until the next `make regen ONLY=financial-account PUSH_TO_NEO=1` + `./gradlew export.database`, the declaration lives only in `decisions.json`/`contract.json` — the live `ETGO_SF_ENTITY` row still grants the write verbs.

### Reconciliation tab (T6) — bank and card accounts

The Reconciliation tab renders `ReconciliationSplitPanel` (`tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx`), a 50/50 split panel that composes the backend at `/sws/neo/bank-reconciliation` (handler `@Named("bankReconciliation")`). It never reimplements Etendo's reconciliation logic — the POST hands the grouped ids over to the Classic flow.

- **Left panel — pending statement lines** (`usePendingStatementLines(accountId, filters)`): a movements-style toolbar with **back arrow** + status dropdown + date-range picker + search. The current T6 backend only exposes pending lines, so the status dropdown is wired but currently contains `Pendiente (N)` only. Below it, a table with **radio single-select** rows (Fecha · Descripción + status badge · Importe with sign tone) and a `Total: X,XX €` footer.
- **Right panel — candidate operations** (`useCandidateOperations(accountId, lineId, docType)` — does NOT fetch while no line is selected): an empty state (`Selecciona un movimiento` / hint) until a line is picked, then a `SelectedLineHeader` (line metadata + amount in red/green), a real docType/date/search toolbar, and a table with **checkbox multi-select** rows (Fecha · Información = documentNo + partnerName + badge · Saldo pendiente · Importe). Backend-suggested candidates carry a blue **"Con sugerencia"** badge (ETP-4923, shared label with the left panel's status filter chip); the rest "Pendiente".
- **Action bar**: `Documentos seleccionados: ±X,XX €` · `Restante por conciliar: ±X,XX €` · `[Cancelar selección] [Transferir] [Nuevo documento] [Conciliar (N)]`. `Conciliar` is enabled only when `|line.amount − sum(selected ops)| ≤ 0.01`. On click → `useReconcileGroup().reconcile({ financialAccountId, statementLineId, operationIds })` → success toast (`sonner`) + `onReconcileSuccess()` (reloads the account so the tab badge `pendingCount` decrements, and reloads movements) + clears the selection.
- When a **reconciled** line is selected, the `Conciliar` button label switches to `Reactivar`. On success, the backend undoes the reconciliation as a unit and, for ETGO-created 1:N groups, collapses the split sub-lines back into a single physical pending bank-statement line before reloading the panel.
- The right-side header action is the `Automatch` button while the Reconciliation tab is active (T7 — see below). `Transferir` / `Nuevo documento` render but fire a "próximamente" toast (follow-up).

#### Match with a difference — detection and automatic posting (ETP-4965)

A 1:1 match whose deviation falls inside the account's configured tolerances is now detected as
**"Con diferencia"**, proposed by the Automatch, and — on reconciling — has its amount deviation
posted to the account's **GL Item Difference**, leaving the line **Conciliada** instead of split and
stuck on "Pendiente".

**What was broken.** Nothing in the codebase applied the amount tolerance to a 1:1 match. Core's
`StandardMatchingAlgorithm` searches by EXACT amount and EXACT date, and Etendo GO's date tolerance
(`withinDateWindow` inside `AutoMatchSupport.standardMatch`) is only a post-filter over what Core
already found, so it can never widen the search. The one tolerance-aware path,
`AutoMatchSupport.findSignalGroup`, discards any partition with fewer than two transactions
(`matchByKey`), so a lone 26,62 € movement against a 27,00 € line was unreachable. The line
classified `pending`, the Automatch proposed nothing, and reconciling by hand produced a Core partial
split whose 0,38 € remainder had no way to close.

**Classification matrix.** Both account tolerances take part — `EM_ETGO_Amount_Tolerance` (%) and
`EM_ETGO_Date_Tolerance` (days, default 3, so there is always a minimum date slack):

| Amount deviation | Date deviation | State |
|---|---|---|
| 0 | 0 | Con sugerencia |
| 0 | > 0, within date tolerance | Con diferencia |
| > 0, within amount tolerance | 0 | Con diferencia |
| > 0, within amount tolerance | > 0, within date tolerance | Con diferencia |
| beyond amount tolerance | any | Pendiente |
| any | beyond date tolerance | Pendiente |

A **date-only** deviation posts nothing: the amount balances, so the reconciliation is the ordinary
one and no GL item is needed. The accounting account only comes into play for an amount deviation.

**Detection** — `AutoMatchSupport.findNearMatch` searches the `loadUnreconciledSameSign` pool
directly (the only code that widens by date) for a single same-sign unreconciled transaction within
the date window whose amount deviates by no more than the tolerance, best deviation first and date
distance as the tie-break. The exact-exact case is excluded on purpose — that is a plain suggestion.
It honours the shared `usedTxnIds` / `excludedTxns` accumulator (see ETP-4971 below) and records its
winner in both, so the left panel can never count more differences than an Automatch run could apply.

**Two tolerances, one column, two meanings.** `EM_ETGO_Amount_Tolerance` is read by two helpers with
deliberately opposite conventions, and they are named apart so the two are never confused:
`AutoMatchSupport.signalGroupTolerance` (formerly `computeAmountTolerance`) is rounding slack for a
1:N SUM, where 0 still yields a one-cent floor because nothing is posted on that path;
`AutoMatchSupport.differenceTolerance` returns `null` for 0, because it authorises an automatic
accounting entry and an unconfigured account must never get one by default.

**The two tolerances govern INDEPENDENT dimensions — the amount one is not a master switch.**
`EM_ETGO_Amount_Tolerance` bounds how far the AMOUNT may deviate, and is therefore the only thing
that can authorise an accounting entry. At **0%** no amount deviation is admitted at all:
`differenceTolerance` returns `null` and `findNearMatch` accepts only **exact-amount** candidates, so
nothing is ever posted without a configured percentage. But `null` does **not** disable the search
and is emphatically not "unlimited" — `EM_ETGO_Date_Tolerance` stays in force, defaults to 3 days,
and a date-only deviation posts nothing, so 0%'s safety rationale does not apply to it. A 100,00 €
line dated 28/08 against a 100,00 € movement dated 26/08, on an account at 0% amount / 3 days, is
detected as **"Con diferencia"** and reconciles with no GL-item movement created.

**Scope note:** because every account ships with date tolerance = 3, this detection is live on
**every** account in the instance, not only those that configured a percentage. What it produces
there is proposals and classification — never an automatic accounting entry.

**WEAK is now a suggestion, not a difference.** Core's STRONG/WEAK distinction is about documentary
evidence (does the reference or partner corroborate the hit), never about amount or date — both are
exact either way. Mapping WEAK to `difference` made that filter mean two unrelated things. It now
classifies as `suggested`. **This changes existing behaviour**: anyone who used the "Diferencias"
filter to find weak-evidence matches will no longer see them there.

**The difference movement's description.** `createTransactionForRule` falls back to the statement
line's description, and an imported line very often has none — which left a bare `0,38 €` row in the
Movements list with nothing to identify it by. `defaultDifferenceDescription` resolves the text from
the message dictionary (`ETGO_ReconciliationDifference`) so it arrives in the user's language, and
degrades to the accounting account's own name when that message is not installed. An explicitly
supplied description (the manual ETP-4796 flow, where the user types one) always wins.

> **OPEN DECISION — the difference movement's date.** It currently inherits the STATEMENT LINE's
> date, the same as every other movement `createTransactionForRule` builds. On a match with a date
> deviation this reads oddly: a line of 30/08 matched to a movement of 31/08 produces a difference
> movement dated 30/08, so the reconciliation holds two movements on different days. Three candidates
> were weighed — the statement line's date (today's behaviour; zero cross-month risk, since it
> matches the sub-line the movement is attached to, and the statement is the authority on when the
> money moved), the matched movement's date (the two movements agree; risk bounded by the account's
> date tolerance), and the reconciliation date (unbounded risk — an August line reconciled in
> September puts its difference in September while the sub-line stays in August, i.e. a different
> accounting period). **Pending a decision from the functional analyst; behaviour unchanged until
> then.**

**Posting** — `ReconciliationDifferenceSupport.applyInlineDifference` runs on both the manual
(`reconcileGroup`) and the Automatch (`ReconciliationFlowSupport.prepareGroup`) paths, before the
match is composed. It computes `gap = line − Σ operations` and, when the gap is within
`differenceTolerance`, creates the compensating GL-item movement via `createTransactionForRule` and
adds it to the operation set so the sum matches the line EXACTLY. Core still splits the line, but now
both halves end matched: the group's pending amount reaches zero, `mergeSubLineIntoHead` reports
RECONCILED, and the user sees one closed line. The movement carries `EM_ETGO_Auto_Created`, so
Desconciliar / Reactivar delete it with no extra code. A negligible gap (< 0,005), an over-coverage
gap, a disabled tolerance or a gap beyond tolerance all leave the previous behaviour untouched.

**No accounting account configured.** Manual: the backend answers `400` with
`code: "GL_ITEM_REQUIRED"` and the difference amount, and the panel reopens `DifferenceModal` to ask
for an accounting account, then resubmits with `glItemId`. Automatch: a mass run cannot pick one line by
line, so the group is rejected — its error travels back inside `applySuggestions`' `results[]`, the
suggestion modal counts it as failed and surfaces a direct **Editar cuenta** link. Detection and the
proposal are NOT suppressed; only applying fails.

**Why one path rolls back and the other must not.** A returned `NeoResponse.error` commits — only an
escaping exception rolls back (see `ReconciliationDifferenceSupport`'s header javadoc). On the manual
invoice path `ReconciliationWriteoffSupport.payInvoices` has already written payments by the time the
gap is knowable, so the rejection rolls back explicitly (`rollbackOnReject`). The Automatch batch
passes `false`: there the rejection is per group, sibling groups are already prepared, and a rollback
would discard their work and close the session the rest of the loop still needs.

**Frontend.** `financeReconcileFilterStatusDifference` and `financeReconcileBadgeDifference` now read
**"Con diferencia"** (parallel to "Con sugerencia") instead of "Diferencias" / "Diferencia". Candidate
rows the backend flags with `nearMatch` carry the red difference badge — `badgeKindFor` ranks
`nearMatch` above `suggested`, since the backend sets both. The action bar no longer paints a
within-tolerance shortfall in destructive red; it shows the neutral notice
`financeReconcileBarDifferenceNotice` naming the concept it will be posted to (or
`…NoConcept` when the account has none). `useNeoPost` now hangs the parsed error body off the thrown
Error (`err.body`, `err.code`), which is what makes both `GL_ITEM_REQUIRED` and the 409's
`remainderLineId` reachable at all — previously only `message` and `status` survived.

#### Why an un-reconcile failed now reaches the user (ETP-4965 follow-up)

Un-reconciling is deliberately non-atomic: Core's removal utilities commit mid-flow, so
`ReconciliationHandlerSupport.removeSelectedFromReconciliations` attempts every unit regardless of an
earlier one's outcome, and `removeOperation` / `reactivateSelected` then re-check each transaction's
ACTUAL post-state rather than trusting that no exception was thrown. That part works — a failed undo
is correctly reported as `failedTransactionIds`, never as a false success.

What was missing was the CAUSE. The helpers swallowed their exception into the server log, so the
response could say *which* transactions were still reconciled but never *why*, and the panel fell
back to a generic toast. In practice the commonest cause is an accounting period closed for
unposting (`@PeriodClosedForUnPosting@`, raised by Core's `ResetAccounting` when a `Fact_Acct` row
for the document sits in a period whose `C_PeriodControl` is not open for that document base type) —
exactly the failure a user can resolve, and exactly the one they could not see.

- The removal helpers now record the translated reason per transaction id, and both endpoints emit
  the first reason that belongs to a genuinely failed id as `failureReason` on the 200 response.
- **Only the translatable part is kept.** Core wraps each cause in untranslated English prose and
  concatenates the chain without separators, so the raw message arrives as
  `Error when removing the transaction from reconciliation.Error when reactivating
  reconciliation@PeriodClosedForUnPosting@`. Translating that whole string leaves English fragments
  glued in front of the Spanish sentence — unacceptable in a product used in Spanish by real
  clients. `userFacingReason` resolves the LAST `@KEY@` placeholder (the innermost, most specific
  cause) through the message dictionary and returns just that; a message with no placeholder is
  translated whole, as before. The user sees `Periodo Cerrado. No se puede descontabilizar un
  documento en un periodo cerrado` and nothing else.
- `ReconciliationSplitPanel.confirmRemove` shows it as the toast description, and no longer reuses
  `financeReconcileToastError` — whose copy reads "Error al conciliar", the wrong action for an
  un-reconcile. The un-reconcile and reactivate paths have their own keys
  (`financeReconcileToastOperationRemoveError` / `…ReactivateError`).

**One path still reports nothing: the whole-line `reactivate`.** It calls `detachSelected` directly
and discards the accumulator, because unlike `removeOperation` / `reactivateSelected` it never
re-checks the post-state and always answers `{reactivated: true}`. Giving it a reason would mean also
giving it the `failedTransactionIds` contract it does not have — a product change, not a compile fix,
so it was left as it was. Its OTHER branch (`undoReconciliation`, when the selection covers the whole
document) does let the exception propagate, and `runPostAction` turns that into an error response, so
only the partial-detach branch is silent. Pre-existing; worth its own ticket.

**The "period closed" error was a lie, and is now worked around from this side.** Un-reconciling a
posted reconciliation failed with `@PeriodClosedForUnPosting@` on an environment whose periods were
all open — verified exhaustively: the client has a single organization, it is its own
period-control organization, and all 43 document base types are `O` for the period in question.

The real cause is a date mismatch. `com.etendoerp.payment.removal`'s
`Utilities.unPostReconciliation` resets accounting passing the RECONCILIATION's own date as both
ends of the range, but Core dates a reconciliation's `Fact_Acct` rows with the TRANSACTION's
accounting date. On the live case the reconciliation was dated 29/08 and its entries 28/08, so the
range matched nothing, zero entries were deleted, and `ResetAccounting` fell into the catch-all
`throw` at the end of its `delete` — a branch that performs no period check at all and whose only
wording is `@PeriodClosedForUnPosting@`. Any reconciliation whose statement line is older than the
day it was reconciled hits this, which is the normal case.

`ReconciliationHandlerSupport.unpostBeforeUndo` resets the accounting first with an OPEN range —
what Classic's own unpost button does, and what `DocumentPostingService.unpost` already does in this
module — from both the whole-document undo and the per-transaction detach. The document then has no
entries, so the narrow-range reset downstream becomes a no-op that returns cleanly. `recordId`
already scopes the deletion, so the open range removes nothing extra, and a genuinely closed period
still fails — accurately this time.

This compensates for the other module's defect rather than fixing it there, deliberately: that
module is outside this ticket's repos. Its `unPostPayment` carries the same date-narrowing and is
presumably latent-broken the same way. Worth its own ticket against that module.

**`guardOpenPeriods` was deliberately left alone.** It runs `Utilities.checkPeriod` on the
reconciliation's own date and table, which is NOT the rule Core enforces when unposting, so it does
not pre-empt this failure. Making it do so would mean duplicating
`ResetAccounting.validateNoFactsInClosedPeriods` — a private Core method that queries `Fact_Acct`
against `C_PeriodControl` — in a codebase whose rule is never to reimplement Core's logic. The copy
would drift on the first Core change. Failing inside Core and reporting its message costs one
harmless round trip (nothing is written) and stays correct by construction.

#### Posting the unreconciled remainder to an accounting account (ETP-4796)

When a statement line is only PARTIALLY reconciled — statement of 12,50 € matched against a 12,00 €
transaction — the leftover 0,50 € used to have no resolution path: the line stayed pending forever.
It can now be closed by posting the remainder to an accounting account, the same primitive
the cash close uses (ETP-4795), applied to a statement line. Classic does the same thing at
`Reconciliation.java:290-300`.

- **Where it appears.** An amber banner at the top of the RIGHT panel (design option 1B — the offer
  sits where the problem is, not in the bottom action bar, whose `Conciliar` button stays
  independent). `DifferenceBanner` / `DifferenceModal` live in
  `components/contract-ui/ReconciliationDifference.jsx`; the decision logic is a separate pure module,
  `components/contract-ui/reconciliationDifferenceMath.js` (a plain `.js` so the `node:test` runner
  can import it — the same split as `writeoffMath.js` and `CashClose/cashCloseMath.js`).
- **`Dejar pendiente`** hides the banner for that line for the current session only and changes no
  data; reselecting the line brings it back. **`Llevar a cuenta contable`** opens the confirmation
  modal (breakdown + accounting-account picker + optional description).
- **The amount is NOT editable.** The backend recomputes the remainder from the statement line and
  ignores any amount in the body, so the modal shows the figure in its "Diferencia a ajustar"
  breakdown row rather than offering a field that would promise control the server does not grant.
  (The design prototype had an editable amount; it was dropped for this reason.)
- **A missing account default is not a dead end.** The account's `Cuenta contable` only
  *preselects* the modal's picker; the banner's action is always enabled and the user can choose any
  account there. This mirrors the backend, which accepts whatever `glItemId` the modal sends and only
  falls back to the account default when none is given. The real guard is the modal's own confirm,
  disabled until an account is picked — an adjustment is never posted without a destination account.
  (An earlier iteration disabled the banner and told the user to go configure the account; that was
  wrong, since the account is choosable right there in the modal.)
- **The remainder is its own physical row.** A partially reconciled *logical* line is several
  `FIN_BankStatementLine` rows sharing a match-group id, and the pending one is exposed as
  `remainderLineId`. Both the panel (`candidateLineId`) and this action target that row, never the
  merged head — sending the head gets a 409 whose body carries the correct `remainderLineId` so the
  client can retarget. `EM_ETGO_Pending_Amount` is deliberately NOT used for the amount: it is
  `abs()`-valued (it would post a deposit for an outflow difference) and observer-maintained, so
  older rows may have none. The signed `cramount - dramount` of the remainder row is authoritative.

**Tolerance — the gate, and a divergence worth knowing.** The action is offered only when
`|remainder| <= |original line amount| * EM_ETGO_Amount_Tolerance / 100`. Two things follow:

1. **The denominator is the match-group total, not the remainder row's own amount.** Since the
   remainder is its own row, taking a percentage of it would compare a number against itself: always
   false below 100 %, and — worse — always TRUE at 100 %, which would authorise posting an entire
   line of any size through an endpoint meant to move cents.
2. **`EM_ETGO_Amount_Tolerance` defaults to 0, and is 0 in every account of the local instance, so
   the banner does not appear until an administrator raises it.** This is configuration, not a
   defect, but note that the SAME column is read with the OPPOSITE convention by
   `AutoMatchSupport.computeAmountTolerance`, where 0 means "one cent of slack, never zero". One field
   with two meanings is a support trap ("why does the panel suggest this match but refuse to close
   it?"), so the server's 400 spells out the configured percentage and the resulting limit.

**Backend.** New POST action `reconcileDifference` (`?action=`, like every other one — the dispatcher
is the `ROUTES` map, now `Map.ofEntries` because `Map.of` caps at 10 pairs and it had reached 9).
Payload `{ financialAccountId, statementLineId, glItemId?, description? }` — no amount.

The logic lives in **`ReconciliationDifferenceSupport`**, not on `ReconciliationHandler`: that class
sits at 34 methods against Sonar S1448's threshold of 35, which is why
`ReconciliationWriteoffSupport`, `ReactivationSupport`, `ReconciliationHandlerSupport` and
`ReconciliationSupport` all exist. It is the one dispatch `case` that calls a support class instead
of the handler.

**Order of operations is the safety mechanism, not a style choice.** A returned
`NeoResponse.error(...)` does NOT roll back — it commits: `DalThreadHandler.doFinal` only takes the
rollback branch when an exception escapes the filter chain, and `runPostAction` catches everything
and *returns*. So every validation (account, line, belongs-to-account, already-reconciled, is-partial,
one-pending-row, non-negligible remainder, tolerance, GL item) runs BEFORE the single write. Two
consequences worth keeping in mind when editing this code:

- The negligible-remainder guard is load-bearing: `createTransactionForRule` treats a zero spec
  amount as "not supplied" and substitutes the WHOLE line amount.
- Success delegates to `reconcileGroup` with a synthesized single-operation body, reusing its guards,
  match-group tagging and 201 envelope. A defensive `doRollbackAndClose()` runs if that delegate ever
  returns an error, because the invariant that it cannot is a property of today's `reconcileGroup`.

**Concurrency.** The action takes a `SELECT … FOR UPDATE NOWAIT` row lock on the statement line as
its first DB statement. Core does not reject a re-match — `APRM_MatchingUtility` silently
`unmatch()`es the previous one — so without the lock a double click would leave two processed
adjustments and an orphaned match. The second request now exits with a 409 having written nothing.

**Un-reconciling removes the adjustment, with no new code.** `createTransactionForRule` already calls
`ReactivationSupport.markAutoCreated`, and the payment-less branch of
`ReconciliationHandlerSupport.reverseMatchedTransaction` deletes such transactions via
`TransactionRemovalUtil.reactivateAndRemove`. The remainder row returns to unmatched keeping its
match-group tag, so the group goes back to PARTIAL.

**Account configuration (previously undocumented anywhere).** Both reconciliation tolerances and the
difference account are edited in **Editar cuenta → General**: `Tolerancia de fecha (días)`
(`EM_ETGO_Date_Tolerance`, default 3) and `Tolerancia de importe (%)`
(`EM_ETGO_Amount_Tolerance`, default 0) under "Configuración de conciliación", and `Cuenta contable`
(`EM_Aprm_Glitem_Diff`) under "Configuración de diferencias". Until ETP-4796 the amount tolerance fed
only the automatch engine. They reach the modal under two different key spellings depending on where
it was opened from — see `EditAccountModal.readTolerances`; `ReconciliationTab` does the same dual
read (`eTGOAmountTolerance ?? amountTolerance ?? 0`) when threading the value to the panel.

#### Multi-currency reconciliation (ETP-4502)

When a statement line (in the account currency) is reconciled against one or more invoices, possibly
in **different currencies from each other and from the account**, the flow settles each invoice in
its own currency while booking the bank transaction(s) in the account currency:

- **Invoice selector badge:** each invoice candidate carries its `currency` (ISO), emitted by
  `INVOICE_CANDIDATES_SQL`. When it differs from the account currency the row shows an amber
  `CurrencyBadge`, its amounts render in the **invoice** currency, and a smaller secondary line
  (`data-testid="recon-cand-amount-base"`) shows the account-currency (e.g. EUR) equivalent —
  `amountBase`, emitted by `ReconciliationHandler.appendAccountEquivalent` using the same rate the
  reconciliation itself would use. Same-currency candidates look unchanged.
- **Scope:** one statement line can match **any mix of invoices in any currencies**, not just one —
  `ReconciliationFlowSupport.createInvoicePayments` greedily allocates the line (in account currency)
  across the selected invoices **in the order they're listed** (oldest invoice date first — the same
  order `INVOICE_CANDIDATES_SQL`'s `ORDER BY inv.dateinvoiced ASC, inv.documentno ASC` returns, NOT
  the order the user clicked checkboxes, NOT sorted by amount), converting each invoice's outstanding
  via its own rate first. The first invoice in that order is always settled in full if the line
  covers it; whatever remains flows to the next one, and so on, until the line is exhausted — the
  same greedy "first-come, first-served" allocation the same-currency flow always used, generalized.
  The panel's multi-select is no longer restricted to one foreign invoice; `selectedSum`/`remaining`
  in the action bar sum each candidate's account-currency equivalent (`candidateBaseAmount`), so the
  same bar now doubles as the EUR-style total.
- **Partial line coverage (under-selection):** the selected invoices no longer have to fully cover
  the line — e.g. a 100 line matched to a single 60 invoice pays that invoice in full and leaves the
  line **split**: 60 reconciled, plus a new pending sub-line for the remaining 40 (for a future
  match), exactly the same mechanism already used when matching a line against an EXISTING
  transaction smaller than it (Core's own `matchBankStatementLine`/`splitBankStatementLine`, composed
  via `ReconciliationHandler.compose`/`validateOperations` — no invoice-specific plumbing needed).
  Over-covering the line remains impossible by construction (each invoice only ever absorbs
  `remaining.min(outstandingBase)`). The ONE case still rejected is selecting invoice(s) that settle
  **nothing at all** (e.g. all already have zero outstanding) — that still returns the "do not cover"
  400, since it's a selection that accomplishes nothing, not a legitimate partial match. Conversely,
  a line of 100 matched to a single 120 invoice already worked before this change: it uses the full
  line against the invoice, leaving the invoice itself partially paid (100 of 120, 20 still
  outstanding on its own schedule) — unaffected by this iteration.
  - **Display (iteration 4, fixing a real regression):** the split above always produced TWO
    physical `FIN_BankStatementLine` rows — a reconciled portion and a pending remainder — but
    `ReconciliationHandler.compose` only tagged them with the shared `EM_ETGO_Match_Group_ID`
    (needed for `mergeMatchGroups` to re-collapse them into one display row) when `operationIds.size()
    > 1`. A single partial invoice/transaction (exactly the case above, e.g. 100 line / 53.24
    invoice) produces only ONE operation id, so it was never tagged, and the pending remainder
    surfaced as a brand-new, seemingly-unrelated statement line in "Extractos importados" (a real
    bug, reported live: a 100 line matched to a 53.24 invoice showed a second "loose" 46.76 line
    instead of "100, 46.76 pending"). Fixed by replacing the `operationIds.size() > 1` gate with
    `ReconciliationHandler.willSplitLine` — true for 2+ operations (always splits at least once
    while Core chains through them) OR a single operation whose amount doesn't exactly equal the
    line (the missed case). The two physical rows now always share a match group whenever a split
    actually happens, so they collapse back into one row regardless of how many operations caused
    the split. See "Partial-match display" below for how that collapsed row renders.
- **Rate source:** the conversion rate comes from the **invoice's own exchange rate**
  (`PaymentCurrencyConverter.resolveInvoiceRate`: the invoice's `ConversionRateDoc` document rate,
  falling back to the general `C_Conversion_Rate` for the invoice date), not from the statement line.
  The `FIN_Payment` is created for `invoice amount` (invoice currency); the `FIN_Finacc_Transaction`
  is booked for `invoice amount × rate` (account currency). If that doesn't exactly match what the
  bank sent, the difference is **not** posted as an exchange difference — it simply stays unreconciled
  on the statement line (the existing "partial match, remainder reported" behavior).
- **Payment method modal:** invoices are no longer filtered by payment method — every unpaid invoice
  is a valid candidate. Instead, clicking "Conciliar" with invoices selected opens `PaymentMethodModal`
  — a `ChipSelect` picker (`@/components/forms/fields`, the same chip-style selector used for
  "Cuenta contable" in the New Movement modal) over the account's methods configured for the line's
  direction, defaulting to the account's default method — before submitting; the chosen id travels as
  top-level `paymentMethodId` in the `reconcileGroup` payload and applies to **every invoice payment
  this action creates** — an already-selected existing transaction (`operationIds`) keeps its own
  payment/method untouched. Method auto-resolution (`PaymentRegistrationService.resolvePaymentMethod`,
  used when the modal is skipped — no methods configured for the direction) mirrors Classic's
  `TransactionAddPaymentDefaultValues` account-level fallback (prioritize the account's own
  `isDefault`-flagged method, tie-broken by name for a deterministic pick) but deliberately does NOT
  copy Classic's business-partner step, which validates the BP's method against the **BP's own**
  linked account instead of the account being reconciled — reproduced live in Classic as a real bug
  (BP method not configured on the reconciliation account still gets defaulted, then payment creation
  fails with "Selected payment method doesn't exist"). Our version validates the invoice/BP method
  against the account actually being reconciled instead. If the account has no methods configured for
  the direction, the modal is skipped and the backend auto-resolves a default, same as before this
  iteration. A cross-currency settlement additionally requires the resolved/chosen method to be
  multi-currency enabled (`payin/payout_ismulticurrency`), and is rejected with a clear error instead
  of a cryptic Core failure when it is not. **Since ETP-5084 a PSD2 bank-transfer method no longer
  trips this**: connecting an account to its bank used to clear those two flags on the transfer link
  (ETP-4503), on the premise that a transfer could only ever settle an invoice in the account's own
  currency. A PIS transfer now converts the amount to the account currency before instructing the
  bank, so that premise is gone — the disabling was removed and data-fix R29 re-enabled the flags on
  already-connected accounts. The guard now only fires on a link an administrator deliberately
  configured as single-currency.
- **Same currency:** unchanged — rate ONE, standard flow.

#### Write off the invoice difference (ETP-4797)

When the statement line settles an invoice for **less** than its outstanding amount — a 12,50 €
invoice paid by a 12,00 € line — the invoice is normally left dragging 0,50 €. The payment-method
modal now offers to write that shortfall off so the invoice is settled in full. **Opt-in and off by
default**: leaving it alone reproduces the previous behaviour exactly.

The modal grows two blocks below the method picker, rendered only when there is a gap: a three-row
breakdown (`Importe del extracto` · `Factura {docNo} · {BP}` · `Diferencia`) and the
`Ajustar diferencia de X €` toggle. Both come from
`components/contract-ui/WriteoffAdjustment.jsx`, shared with `NewPaymentEntryModal` so the two
entry points cannot drift; the decision logic is the pure `writeoffMath.js` beside it.

Four things are non-obvious:

- **It is Etendo's native write-off, NOT a separately-picked accounting account.** The difference is stored as `writeoffAmount`
  on the `FIN_PaymentScheduleDetail` and its `FIN_PaymentDetail`, and posts against the business
  partner group's write-off account (`C_BP_GROUP_ACCT.WRITEOFF_ACCT`, falling back to
  `C_ACCTSCHEMA_DEFAULT.WRITEOFF_ACCT`; resolved in Core's `DocFINPayment`). No accounting account
  is chosen here, so there is no selector — the toggle's "on" copy names the destination generically
  ("se llevará a una cuenta contable") without implying a pick, which is accurate: the amount does
  land in a real GL account, just one resolved from configuration rather than chosen here.
- **Only offered for a single selected invoice.** `createInvoicePayments` allocates the line
  greedily (`remaining.min(outstandingBase)` per invoice, stopping when it runs out), so with
  several invoices only the boundary one is settled partially and the invoices past the cut receive
  no payment at all. The "Σ invoices − line" figure would therefore overstate what actually gets
  written off, so the blocks stay hidden and the modal behaves as before.
- **Core does the work.** The whole backend change is threading a boolean into
  `PaymentRegistrationService.linkPSDsToPayment`, which had the flag hardcoded to `false`; it reaches
  `FIN_AddPayment.updatePaymentDetail`, whose create path either duplicates the schedule detail for
  the difference (off) or stores it as `writeoffAmount` (on). The flag rides the `reconcileGroup`
  payload as top-level `writeoffDifference`.
- **The limit diverges from Classic on purpose.** `FIN_Financial_Account.Writeofflimit` (now
  editable, surfaced in Edit account → reconciliation settings) caps the write-off, enforced both in
  the UI and server-side in `ReconciliationHandler.assertWithinWriteoffLimit`. Classic only applies
  it when the `WriteOffLimitPreference` preference is `'Y'`, and its comparison treats an unset or
  zero limit as "block everything". The column has no default, is not mandatory, and the preference
  does not exist in this instance — copying that literally would disable the feature on every
  unconfigured account. Here **null or 0 means no limit**, and only a configured positive value can
  reject.

#### Partial-match display (ETP-4502 iteration 4)

A statement line matched against less than its full amount (a single partial invoice, per above, or
a single existing transaction smaller than the line) now shows as **one row carrying the original
total, a "Parcial" status tag, and a "{pending amount} por conciliar" caption** — instead of the
group's reconciled portion and pending remainder appearing as two unrelated-looking lines (the bug
this iteration fixes; mirrors how Holded shows "X pending" on a partially-matched movement). Applies
in both places that render statement lines from the same backend contract:

- `windows/custom/financial-account/StatementLinesInline.jsx` — the "mini" table inside each
  statement's accordion row in "Extractos importados".
- `windows/custom/financial-account/StatementLinesTable.jsx` — the full-page "Abrir extracto
  completo" table (`StatementLinesView.jsx`).

Backend contract (`BankStatementsSupport.mapLineRow` / `mergeMatchGroups`): every line row now
carries `reconcileStatus` (`"RECONCILED" | "PARTIAL" | "PENDING"`, superseding the plain `matched`
boolean as the source of truth for display — `matched` is kept, now derived as `reconcileStatus ===
"RECONCILED"`, for any other consumer) and a signed `pendingAmount` (the portion of the line/group
still uncovered; `0` unless `reconcileStatus === "PARTIAL"`). For a merged 1:N/split group,
`mergeSubLineIntoHead` sums `pendingAmount` across the group's physical sub-lines and recomputes the
group's own `reconcileStatus` from that sum — so a group is `PARTIAL` whenever *some* but not *all*
of it is matched, `RECONCILED` when fully covered, `PENDING` when nothing in it is matched yet
(e.g. right after a reactivate, before the group is normalized/merged back).

Both components map `reconcileStatus` → a `StatusTag` tone/label (`RECONCILED` → success, `PARTIAL`
→ warning + the pending caption, `PENDING`/absent → warning, "Sin conciliar"), falling back to the
old `matched` boolean when `reconcileStatus` is missing (defensive, not expected once this ships).

**Known scope boundary**: the parent statement's own "Parcial N/M" fraction (`StatementsTable.jsx`'s
`StatusPill`) still counts *physical* rows (`em_etgo_line_count`/`em_etgo_matched_count` from
`BankStatementAggregates`), not the collapsed/logical line count — so after a split the denominator
can grow by one even though the visible (collapsed) row count doesn't change. Pre-existing, not
introduced by this iteration; not in scope here since the user's ask was specifically the
line-level display inside a statement, not the parent list's fraction.

#### Reconciliation tab: partial lines & per-item un-reconcile (ETP-4502 iteration 5)

Brings the same partial model to the **Conciliación tab** (`ReconciliationSplitPanel`), per the
"Opción A2" design handoff. A statement line stays **PENDING while less than 100 % of its amount is
used** and only becomes **CONCILIADA at 100 %**; partial lines keep showing in the pending list.

- **Left panel — "Progreso" column** (`ProgressCell`): a thin 4px bar = `reconciled / total`, shown
  only when the line has something reconciled; hovering shows a tooltip "X € por conciliar" (the
  remaining amount). No "% chip" on the row. Column order: Fecha · Descripción · Progreso · Importe.
  The "something reconciled" test is `reconciledAmount != 0`, computed backend-side — see the
  sign note below.
  A PARTIAL line also shows a second **"Parcial"** status badge next to "Pendiente" (`line.partial`
  → `StatusBadge kind="partial"`, same warning tone as "Factura"/"Por regla") — otherwise a partial
  line was indistinguishable from a fully-untouched pending one in that column.
- **Right panel — "conciliado" block** (`ReconciledOperationsSection`, above the filters) renders
  **only for a PARTIAL line**: a collapsible header (`% conciliado` + a short 90px bar + the
  reconciled amount + chevron), starting **collapsed**, that expands to one row per matched document
  (nº, contact, "Factura" tag, amount, per-row **"−"** unlink). Expanding **freezes the candidate
  list below** (Holded parity). Below it, the candidate picker reconciles the **remaining** balance
  (a PARTIAL line is NOT read-only; the picker fetches candidates for the pending remainder sub-line
  — `remainderLineId` — and "Restante por conciliar" is computed on the pending amount). A FULLY
  reconciled line does NOT show this block (the % header would be redundant).
- **Un-reconcile — selection-based** (`removeOperation` action + `useRemoveOperation`), always behind
  a confirm dialog (warns the invoice returns to unpaid for auto-created payments):
  - **Fully-reconciled line ("Conciliado")**: its linked documents ARE the **bottom candidate list**
    (`buildLinkedTransactions`, each candidate `id` = the finacc-transaction id), each row with a
    **checkbox (all checked by default)** and a per-row **"−"**. The bottom action bar shows
    **"Desconciliar (N)"** over the checked set. All checked → whole undo via `undoReconciliation` +
    `normalizeReactivatedMatchGroup` (payment removal); a subset → loop
    `ReconciliationRemovalUtil.removeTransactionFromReconciliation` + `PaymentRemovalUtil` per checked
    txn (the rest stay reconciled). The old global **"Reactivar" button was removed**.
  - **PARTIAL line ("Pendiente")**: un-link only **one at a time** via the per-row **"−"** in the
    top block (no checkboxes/bulk). The bottom bar stays "Conciliar" for the remainder.
  - `removeOperation` accepts `transactionIds[]` and branches on whether the selection covers the
    whole reconciliation.
  - **"Reactivar" — the lightweight alternative** (action `reactivateSelected`): the "Desconciliar
    (N)" button is a **split button** (chevron → `recon-action-reactivate`, `RotateCcw` icon, same
    checked selection).
    - **Reimplemented (this task) as plain detach + reprocess — no more DRAFT-persisting state.**
      ETP-4502 iteration 6 originally left the `FIN_Reconciliation` in `DR` so the line came back
      pending with its own transactions pre-selected, editable before re-confirming. That relied on
      Core creating **one reconciliation per statement-line group**; once a single automatch batch
      started sharing ONE reconciliation across many lines (see "Cardinality" under "Automatch
      engine" above), leaving that shared header in draft would have pushed **every other line in the
      batch** back to pending too. So `reactivateSelected` now runs the exact same mechanics as
      `removeOperation` (`ReconciliationHandlerSupport.removeSelectedFromReconciliations` — reactivate
      the reconciliation, detach just the selected transactions, re-confirm it) instead of leaving
      anything in draft. The freed transactions simply return to the normal candidate pool — no
      special pre-selection any more.
    - **Confirmed by live test (2026-08-27, account ETP-4951): re-matching a freed transaction
      creates a brand-new `FIN_Reconciliation` document, it never reopens the one it was detached
      from.** Sequence observed: one reconciliation `1000058` with 2 cleared items → reactivate the
      26/08 one via GO → `1000058` stays `Completed` with only the 27/08 item left → reconcile the
      freed 26/08 line again → a NEW `1000059` is created holding just that one transaction, `1000058`
      is untouched. **Product decision: this is intentional, not a gap to close.** There is no single
      well-defined "origin document" to return to once a header can hold transactions from several
      lines (a shared automatch-batch header has no one line that owns it), so a new document per
      manual re-match is the simplest, safest behavior — the alternative (track the prior
      reconciliation id, reopen+reprocess it if still unposted) would reintroduce exactly the
      "reopen a shared header to touch one line" risk this task removed.
    - The three-way distinction this used to require — `ReconciliationHandler.draftReconciliationOf`,
      `reprocessDraftIfAlreadyMatched`, `reactivateToDraft`, the `PENDING_LINES_SQL`
      `COALESCE(rec.processed,'N')='N'` branch / `draftReconciliationId`, `CANDIDATES_SQL`'s
      `OR ft.fin_reconciliation_id = ?` branch, and the three widened "already reconciled" guards on
      `reconcileGroup`/`applyGroup`/`ReconciliationFlowSupport.validateOperations` — is gone: a linked
      transaction now always means genuinely (processed) reconciled, so those guards reverted to their
      original plain form (`line.getFinancialAccountTransaction() != null` / `trx.getReconciliation()
      != null`, no exemption). `draftReconciliationCount` (`ReactivationSupport.draftCount`) and
      `PENDING_LINES_SQL`'s `draft_reconciliation_id` column are the one piece of that plumbing left
      in place rather than removed — they simply always report zero/empty now, since nothing leaves a
      line matched to an unprocessed reconciliation any more. Known cleanup debt, not a bug.
    - **Auto-created movements are still fully deleted** (same `PaymentRemovalUtil` /
      `TransactionRemovalUtil` as Desconciliar) — a payment that only existed to back this
      reconciliation has nothing worth preserving.
    - **The "confirm a pre-existing other draft to make room" consequence is gone too** — since
      nothing creates a persistent draft on this path any more, `autoConfirmedDrafts` and its (never
      actually wired to a toast) `financeReconcileToastReactivatedOtherConfirmed` key are removed
      from the response and the codebase.
  - **Bulk un-reconcile is NOT atomic at the DB level** — Core's own removal utilities
    (`PaymentRemovalUtil.reactivateAndRemove`) commit mid-flow (`SessionHandler.commitAndStart`), so
    a failure partway through a multi-id batch does not roll back what already persisted. Rather than
    fight that (shared module, other consumers depend on its semantics), every removal loop
    (`detachSelected`, `undoWholeReconciliation`, and `undoReconciliation`'s own per-transaction
    reversal loop via `reverseMatchedTransaction`) now catches-and-logs a per-item failure instead of
    aborting the rest of the batch, and `removeOperation` re-checks the REAL post-state of every
    requested transaction id (`getReconciliation() == null` → actually removed) instead of trusting
    "no exception was thrown". The response carries `transactionIds` (what actually got removed) and
    a new `failedTransactionIds` (what didn't); `removed` is `true` only when nothing failed. The
    frontend (`confirmRemove`) shows a distinct toast for full success, partial
    (`financeReconcileToastOperationPartiallyRemoved`), and total failure, and always reloads the
    lines afterward so the UI never shows a stale "still reconciled" state after a partial success.
- **Backend contract**: `ReconciliationHandler.buildPendingLines` now exposes, per merged line,
  `reconcileStatus` (RECONCILED/PARTIAL/PENDING), `pendingAmount`, `reconciledAmount`,
  `reconciledPct`, `txns[]` and `remainderLineId` — the same shape as `mapLineRow`. `pendingAmount`
  comes from the persisted **`EM_ETGO_Pending_Amount`** column on `FIN_BankStatementLine`, maintained
  by the `BankStatementLinePendingAmountHandler` EventHandler (`(txn==null) ? |cr−dr| : 0`), which is
  the single source of truth shared with the imported-statements view. A PARTIAL line's `state`
  folds into `pending` so it stays under the "Pendiente" filter.
- All new UI uses semantic theme tokens (bar fill `--foreground`, track `--border`, tooltip/primary
  `--text-primary`, "Factura" tag `--status-warning-*`) — no color literals.

### Automatch engine (T7)

The Reconciliation surface gained the automatic matching engine (backend `MatchRuleEngine` + `AutoMatchSupport` inside `ReconciliationHandler`, `@Named("bankReconciliation")`):

- **Automatch modal** (`components/contract-ui/AutoMatchSuggestionModal.jsx`, opened from the `Automatch` header action and from the Cuentas-list `Conciliar (N)` pill): runs the engine in preview (GET `?action=autoMatch`) and shows the suggested groups (statement line + its N operations) with per-group include/exclude checkboxes. Rule-origin groups carry a yellow **"Por regla {nombre}"** badge; candidates that would create a new payment carry a blue **"Nueva"** badge. Applying (POST `?action=applySuggestions`) reconciles only the ticked groups, creating payments for rule matches and incrementing each matched rule's count. On success the panel/list refresh. The 1:N signal matcher first tries the whole same-partner / same-reference block and, if that over-shoots, can now choose an exact subset inside that same signal block (for example two 13,20 receipts balancing a 26,40 statement line).
  - **Cardinality: ONE `FIN_Reconciliation` per apply, not one per line.** Earlier, `applySuggestions` called `compose` per accepted group, so confirming N suggestions created N separate reconciliation documents — noisy (Classic's own "Match Statement" produces one per statement) and quadratic (`processReconciliation`'s `updateReconciliations` recomputes every later reconciliation's balance on each call). `ReconciliationHandler.applySuggestions` now runs two passes: `prepareGroup` validates every group first (an invalid group is reported in `results[]` without touching any reconciliation), then every valid group is matched via `matchInto` into ONE reconciliation obtained from `getOrCreateDraftReconciliation` (reuses the account's open draft — the same lookup Classic's `MatchStatementActionHandler` does — or creates one), which is processed once at the end. Not atomic across groups: Core's matching services commit mid-flow, so a failure on group *k* does not roll back groups `1..k-1` already matched into the shared document — the frontend surfaces this via a partial-success toast (`financeReconcileAutomatchToastPartial`) read off `results[]`, since the old code silently reported full success as long as the batch-level POST returned 2xx regardless of individual failures. The manual **`reconcileGroup`** path (single line, one click) is unaffected — it still creates its own dedicated reconciliation per call.
- **Rule dimensions (ETP-4950)**: a rule-origin group carries the rule's Producto / Proyecto / Centro de costos through `createPayment` (`projectId` / `costcenterId` / `productId`) and `ReconciliationHandler.createTransactionForRule` assigns them to the generated `FIN_FinaccTransaction`, skipping any dimension that is not active at the `FAT` header level for the tenant (`AccountingDimensionsSupport`). Before this they were loaded by the engine and then dropped, so the movement never carried them. The rule's *transaction type* is still not propagated — there is no column for it on the transaction (the movement's type is `TRXTYPE` BPD/BPW, derived from the amount sign); see `match-rule.md` → "Dimension propagation + gating (ETP-4950)".
- **Same-amount lines each get their own suggestion in one run (ETP-4971).** `buildAutoMatch` threads a single growing `excludedTxns` list through every pending line's call into Core's standard algorithm (`AutoMatchSupport.standardMatch`), mirroring Classic's own `runAutoMatchingAlgorithm` accumulator. Before this fix, Core's `FIN_MatchingTransaction.match(line, excluded)` was always called with an empty `excluded` list, so N pending lines of the identical amount all got offered the SAME transaction and only the first one ended up with a suggestion — the rest required a second Automatch run after accepting the first. `ReconciliationHandlerSupport.summarizePendingLines` shares the same accumulator across the left-panel's `suggested` classification, so its per-state counts match what an actual Automatch run produces (a line whose only same-amount candidate was already claimed by an earlier line now counts as `pending`, not `suggested`).
- **Conditional auto-open (ETP-4922).** Entering the Reconciliation tab (tab click, `?tab=reconciliation` deep link, or the Cuentas-list `Conciliar (N)` pill's `?autoMatch=true`) no longer pops the modal unconditionally — it *arms* an `autoMatchArmed` flag in `index.jsx` and queries `useAutoMatch` for as long as that tab stays active. The modal only opens once a fresh response confirms `groups.length > 0`; an empty result never opens it (previously it always opened, showing an empty state). The **manual** `Automatch` header button is unaffected — it still calls `setAutoMatchOpen(true)` directly and always opens, empty state included. Leaving the tab disarms the flag, so returning to it re-evaluates from scratch (a stale response from the prior visit is never treated as fresh: `useNeoResource` doesn't clear `data` when its `path` goes back to `null`, so the code tracks readiness with an `autoMatchFetchedRef` ref instead of trusting `loading` alone).
- **No date prefilter on suggestions (ETP-4922).** The automatch GET carries only `accountId` — no `dateFrom`/`dateTo` — and `ReconciliationHandler.loadPendingLines` has no date clause in its HQL, so the modal proposes every pending statement line regardless of age, even ones older than the Reconciliation panel's own `last30` default window (`ReconciliationSplitPanel.jsx`, unrelated component). This is intentional and distinct from the **date tolerance** (`EM_ETGO_Date_Tolerance`, see "Account configuration" above), which still governs whether a same-amount candidate within N days counts as a match — that tolerance was not touched by ETP-4922.
- **1:N (and single-partial) reconciliation** is done by Etendo core (`APRM_MatchingUtility.matchBankStatementLine` splits the line into sub-lines sharing `EM_ETGO_Match_Group_ID`, tagged by `ReconciliationHandler.willSplitLine`). The panel and the imported-statements view **collapse those sub-lines back into a single display line** (`BankStatementsSupport.mergeMatchGroups`), so a split group shows as one entry, not N — see "Partial-match display" below for what that collapsed row looks like when the group isn't fully covered yet.
- **Left-panel state filter**: `pendingLines` returns a fine-grained `state` per line (`pending | suggested | byRule | difference | reconciled`) plus per-state counts. `suggested` covers a Classic strong `1:1` match, a Core WEAK match and an exact `1:N` signal-group match; `difference` means one thing only — a real amount and/or date deviation inside the account's tolerances (ETP-4965) — so the left badge stays aligned with the automatch modal and with the right-panel preselection behavior.
- i18n keys: `financeReconcile*` in `tools/app-shell/src/locales/{en_US,es_ES,es_AR}.json`. `es_AR` was missing 15 of them (the 14 `financeReconcileDiff*` plus `financeReconcileAutomatchToastPartial`), which rendered raw key names for that locale — the resolver does not fall back to English (`useUI.js`: `dictionary?.genericLabels?.[key] ?? key`). Backfilled and covered by a parity test (ETP-4965).
- Hooks: `tools/app-shell/src/hooks/useReconciliation.js` — `usePendingStatementLines`, `useCandidateOperations`, `useReconcileGroup` (all over `useNeoResource` / the shared auth+fetch pattern). The reconcile POST surfaces the backend `{ error: { message } }` text on the thrown Error so it shows in the error toast, and since ETP-4965 also hangs the whole parsed body off it (`err.body`, `err.code`) so callers can act on structured failures such as `GL_ITEM_REQUIRED` or a 409's `remainderLineId`.

### Movement Post / Unpost (ETP-4505)

The Movimientos row kebab (`MovementRowKebab.jsx`) mirrors the existing Post action with an **Unpost** item for already-posted rows, reusing the same `document-posting` `NeoHandler` (`javaQualifier: "document-posting"` on the `transaction` entity, `artifacts/financial-account/decisions.json`) — no backend or decisions.json change was required, just the generic `action/unpost` dispatch already supported by that handler.

- **Post** (`!isPosted`) → `POST …financial-account/transaction/{id}/action/post`.
- **Unpost** (`isPosted`) → `POST …financial-account/transaction/{id}/action/unpost`. Same loading-state / success-toast (`documentUnposted`) / error-toast pattern as Post.
- Not gated on reconciliation state: the `transaction` entity's `reconciliation` field is `visibility: system` with no `apiKey` in `contract.json`, so no reconciled/unreconciled flag reaches the movement row — there is nothing to key a disabled state on. `Unreconcile` remains unconditionally disabled (unrelated to this action).

## i18n keys — movement Post/Unpost

| Key prefix | Where |
|---|---|
| `financeAccountMovementsRowPost*` | Post item label / loading label / error toast |
| `financeAccountMovementsRowUnpost*` | Unpost item label / loading label / error toast |
| `documentPosted` / `documentUnposted` | Shared success toasts (also used elsewhere for document posting) |

## Not implemented yet

- The older 2-step `NewMovementWizard` (Cobro/Pago + pay-vs-GL) is superseded by the single-view `NewTransactionModal` (accounting account only) and is no longer wired.
- `Reactivar` is implemented for reconciled lines created from the ETGO reconciliation flow; it undoes the reconciliation and restores split 1:N groups back to a single pending line. Non-ETGO / Classic-only edge cases still rely on the runtime guards described above.
- `Transferir` / `Nuevo documento` real actions — render but show a "próximamente" toast.
- Unreconcile row action — visible but disabled, with tooltip. (Post/Unpost are implemented — see ETP-4505 below — and the accounting-account lifecycle actions Confirmar / Reactivar / Eliminar are enabled.)
- Real bank logos (Santander, BBVA, etc.) — uses the generic `AccountLogoAvatar` for all accounts.
- Server-side filtering for movements and statements — filters are applied client-side.

## Routing

- URL: `/financial-account/:id` — catch-all route `/:windowName/:recordId` in `App.jsx` → `WindowLoader` → `customLoaders['financial-account']`.
- Entry in `menu.json` under the Finance group (`hidden: true`) so `buildWindowMap()` registers it.
- Entry in `registry.js` `customLoaders`: `'financial-account': () => import('./custom/financial-account/index.jsx')`.

## Component tree

```
index.jsx                          — receives { recordId }, sets page meta, mounts TooltipProvider
  DetailTabs.jsx + Tabs primitives — 3 tabs with icon + label + badge
    Editar button (inline, ETP-4530) — left of the contextual action; opens EditAccountModal
    Header action button (inline)  — right of tab strip; Export for Movements/Statements, disabled Automatch for Reconciliation
    MovimientosTab.jsx             — toolbar + summary strip + table; runs applyFilters client-side
      MovementsToolbar/index.jsx   — back ←, type filter, date range, advanced "by conditions" filter, search, sort popover, refresh button, Transferir fondos button (ETP-4272)
      FundsTransferModal.jsx       — funds transfer modal (ETP-4272): source (RO) → destination, amount, accounting account, multi-currency, bank fee
        TypeFilter.jsx             — wraps DistinctValuesFilter (BPD, BPW)
        DateRangeFilter.jsx        — wraps DateRangePopover
        AdvancedFilterButton       — generic "Filtro por condicionales" (status filter now lives here: 2 options — Conciliado / Sin conciliar)
      AccountSummaryStrip.jsx      — avatar, IBAN (chunked + copy), 3 KPI values
      MovementsTable.jsx           — header + rows / skeleton / empty-state; renderBody helper
        DimensionsPanel (inline)   — expandable read-only grid of the 3 fixed dimensions (Proyecto / Centro de costes / Producto)
        MovementStatusBadge.jsx    — 2 status chips: Conciliado (green) / Sin conciliar (neutral)
        PostingStatusDot.jsx       — derived posting status (RPPC → posted/green, else → orange)
        MovementRowKebab.jsx       — on-hover kebab (Ver detalle · Unreconcile disabled · Post when !posted · Unpost when posted, ETP-4505)
    ReconciliacionTab.jsx          — placeholder (T6)
    ImportedStatementsTab.jsx      — orchestrates list ↔ lines state machine
      StatementsToolbar.jsx        — back ←, date range, status filter, "Filtro por condicionales" (AdvancedFilterBuilder, same as movements), search, sort popover, refresh button, import split-button (▾ → "+ Nuevo extracto")
      StatementsTable.jsx          — columns: docNo, name (falls back to line date range), file name (rendered as a grey badge), notes, import/transaction dates, lines, out (red, −) / in (green, +), status pill (DRAFT/PENDING/PARTIAL/RECONCILED), per-row kebab (when `actions` is passed); expand chevron is a round bordered button rotating 180° (same as movements). Expanding a row keeps the parent row white and renders the lines inside a grey "Desplegado" area (lg drop shadow, raised above the next row via z-index) wrapping the white rounded lines card.
      statementAdvancedFilter.js   — column metadata + applyAdvancedFilter for the statements list (delegates to the shared advancedFilterApply evaluator)
      advancedFilterApply.js       — generic client-side evaluator for the AdvancedFilterBuilder condition tree (OPERATORS + applyConditions), shared by movements and statements
        StatementStatusBadge.jsx   — 3 status chips (COMPLETED / WITH_ISSUES / IN_PROGRESS)
        StatementRowKebab.jsx      — per-row "…" menu: Edit / Process / Delete, enabled ONLY for drafts (processed='N'); disabled with tooltip on processed statements
        ProgressRing              — SVG circular progress indicator (new primitive)
      StatementLinesInline.jsx     — lines table shown in the expanded accordion row (white rounded card): date, description, contact name (free text), contact (BP FK name), Cuenta contable, Nº Referencia, **Estado** (badge: amber "Sin conciliar" / green "Conciliado"), **Transacción** (grey ↗ chip with the reconciled movement's doc no, opening `ReconciledTxnsModal`; a 1:N group shows as a single "N movimientos" chip), then **Salida · Entrada** last (amount headers left-aligned, values right-aligned)
      StatementLinesView.jsx       — sub-view: header with ← + lines table
        StatementLinesTable.jsx    — 7-column lines table (lineNo, date, desc, ref, bpartner, amount, matched)
      ImportStatementModal.jsx     — multi-step import wizard (Subir archivo → Revisar líneas → Importar) with a neutral palette and an animated `ProgressRing` while parsing/importing: dropzone (→ filled file card once a file is picked), review summary widget + lines table, base64 POST. Picking a file goes to the "selected" step (no backend call); Continue parses (analyzing ring) then shows the review; Importar persists and, on success, closes the modal and shows a success toast (there is no in-modal success screen). The format-error case shows a red alert listing the accepted formats; a backend failure carrying `error.code` is mapped to its own message (`NO_VALID_LINES` → "El archivo no contiene líneas válidas para importar") instead of that generic copy. The dialog is capped at `max-h-[90vh]` as a flex column and only the body scrolls, so the footer (and `Importar`) stay reachable; with "Mostrar todas" the line list gets its own `max-h-[46vh]` scroller (`data-testid="import-preview-lines-scroll"`) so the column header and the toggle stay put. When the backend pruned amount-less rows, step 2 shows a warning strip (`data-testid="import-discarded-lines"`) and the success toast switches to the partial variant.
      ManualStatementModal.jsx     — "Nuevo extracto bancario" modal: a summary widget (Líneas / Entradas / Salidas / Saldo) on top, three header fields in one row (name, transaction date, import date) + a Notas textarea — the **file name field is not rendered here**: it is an import-only concept and its presence suggested a file could be attached. `form.fileName` survives as an invisible passthrough so editing a draft that already carries one does not wipe it, and a full-width lines table where **every row is inline-editable cell by cell — no edit/display pencil**. A blank starter row is seeded on open and counts as 0 until filled; amounts show the account currency symbol; Enter commits a cell (no submit), Esc exits it. The footer has only the "Guardar y procesar" split button (X / Esc close, with a discard prompt when there are unsaved changes). Per line the only required fields are **date** and an amount on **one** of out/in; **Reference No is optional** (blank → `**` server-side, same as the CSV import) and so are contact / accounting account. A filled-in line with no amount on either side is a validation error here — the import instead drops such a row, see below. Create POSTs ?action=create; with a `statement` prop it hydrates from the draft and POSTs ?action=update. No file involved.
      StatementConfirmDialog.jsx   — shared confirm dialog for the Process / Delete row actions (destructive tone for delete)
      LookupPicker.jsx             — shared text-input + dropdown lookup (BP / accounting account), used by NewMovementDialog and ManualStatementModal.
```

## Shared primitives introduced or used

| Primitive | Path | Notes |
|-----------|------|-------|
| `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` | `components/ui/tabs.jsx` | Manual implementation (no Radix react-tabs). Underline-style active indicator in `#121217`. Accepts `icon` and `badge` on `TabsTrigger`. Context value memoized via `useMemo`. |
| `MoneyAmount` | `components/ui/money-amount.jsx` | Props: `value`, `currency`, `tone` (`auto`/`positive`/`negative`/`neutral`), `compact`. Locale: `es-ES`. `tone='auto'` colors positive green (`#1E874C`), negative red (`#D50B3E`), zero neutral. Sign prefix `+`/`-` applied automatically. |
| `DateRangePopover` / `DateRangePopoverContent` | `components/ui/date-range-popover.jsx` | Canonical date range picker — same UX as the grid views (Sales Order, etc.). Presets list (Hoy / Ayer / Últimos 7/30 días / Últimos 12 meses / Todo el tiempo / Personalizado) + dual-month calendar with year selector. Value shape: `null \| { presetId } \| { from, to }`. `DateRangePopoverContent` is the inner panel — use it when you need a custom trigger button (as `ListFilterBar.jsx` does). |
| `DistinctValuesFilter` | `components/ui/distinct-values-filter.jsx` | Reusable Popover-wrapped `DistinctValuesList` for in-memory fixed code lists (no backend pagination). Used by `StatusFilter` and `TypeFilter`. |
| `ProgressRing` | `components/ui/progress-ring.jsx` | SVG circular progress ring. Props: `value` (0–100), `size` (default 32), `strokeWidth` (default 3). Track is `#E8EAEF`, fill is `#26A95F`. |

## Hooks

| Hook | Path | Notes |
|------|------|-------|
| `useNeoResource({ path, deps, mapPayload, timeoutMs, label })` | `hooks/useNeoResource.js` | Generic NEO fetch with auth + abort + timeout. Returns `{ data, loading, error, reload }`. Passing `path: null` keeps the hook idle (useful when the path depends on a not-yet-known id). Consumed by `useFinancialAccount` and `useAccountMovements`. |
| `useFinancialAccount(id)` | `hooks/useFinancialAccount.js` | Thin wrapper over `useNeoResource` — hits `/sws/neo/financial-accounts-page` and filters client-side by `id`. Returns `{ account, loading, error, reload }`. Follow-up: replace with dedicated `/sws/neo/financial-account/{id}` endpoint once that spec is live. |
| `useAccountMovements(accountId)` | `hooks/useAccountMovements.js` | Thin wrapper over `useNeoResource` — hits `/sws/neo/financial-account-transactions?FIN_Financial_Account_ID={id}` (powered by `FinancialAccountTransactionsHandler` on the Etendo Go side). Returns `{ movements, totals, enabledDimensions, loading, error, reload }`. Each movement carries `paymentId` / `paymentIsReceipt` (for the Payment link) and a `dimensions` object (per-row dimension values); `enabledDimensions` is the account-level list of dimension keys enabled in the chart of accounts. |
| `useBankStatements(accountId)` | `hooks/useBankStatements.js` | Fetches imported bank statements — hits `GET /sws/neo/bank-statements?FIN_Financial_Account_ID={id}`. Returns `{ statements, loading, error, reload }`. |
| `useBankStatementLines(statementId)` | `hooks/useBankStatementLines.js` | Fetches lines of one statement — hits `GET /sws/neo/bank-statements?action=lines&statementId={id}`. Returns `{ lines, loading, error, reload }`. |
| `useStatementImport()` | `hooks/useStatementImport.js` | Mutation hook for C43 import — posts `{ FIN_Financial_Account_ID, fileName, contentBase64 }` to `POST /sws/neo/bank-statements?action=import`. Returns `{ importStatement, importing, error }`. Both this and `useStatementPreview` are thin wrappers over `useStatementFileRequest(action)` (`hooks/useStatementFileRequest.js`) — same body, same auth, same error shape, only the action and the flag name differ, so the plumbing lives there. A rejected call carries `err.status` and `err.code` (the NEO `error.code`, e.g. `NO_VALID_LINES`). |
| `useCreateStatement()` | `hooks/useCreateStatement.js` | Mutation hook for manual statement creation — posts `{ FIN_Financial_Account_ID, name, transactionDate, importDate, fileName, notes, lines[] }` to `POST /sws/neo/bank-statements?action=create`. Returns `{ createStatement, creating, error }`. |
| `useStatementActions()` | `hooks/useStatementActions.js` | Mutation hook for the draft row actions — `processStatement(id)` (`?action=process`), `updateStatement({ id, ...header, lines })` (`?action=update`), `deleteStatement(id)` (`?action=delete`). All only valid for drafts (backend returns 400 otherwise). Returns `{ processStatement, updateStatement, deleteStatement, busy, error }`. |

## Backend endpoints

### Movements

```
GET  /sws/neo/financial-account-transactions?FIN_Financial_Account_ID={id}
GET  /sws/neo/financial-account-transactions?...&export=csv&columns=...&ids=...  → CSV download (generic, see neo-headless.md §4.3)
POST /sws/neo/financial-account-transactions?action=create                       → create one FIN_Finacc_Transaction
POST /sws/neo/financial-account-transactions?action=create-payment               → register a payment (Classic "Add Payment")
POST /sws/neo/financial-account-transactions?action=transfer                     → funds transfer between accounts (ETP-4272)
POST /sws/neo/financial-account-transactions?action=delete                       → delete one movement (409 on a transfer leg)
```

**`action=transfer`** (ETP-4272) — body `{ sourceAccountId, destinationAccountId, amount, glItemId?, transferDate?, conversionRate?, bankFee?, bankFeeFrom?, bankFeeTo?, description? }`. Validates (source ≠ destination, amount > 0, destination in the source's org tree, amount ≤ source `currentBalance`) and **delegates to Etendo Classic `FundsTransferActionHandler.createTransfer(...)`** (`org.openbravo.advpaymentmngt`) — it never reimplements the transfer. That creates the source withdrawal (`BPW`) + destination deposit (`BPD`), optional bank-fee (`BF`) transactions on the source and/or destination, conversion-rate docs (multi-currency), processes them (→ `PWNC` / `RDNC`, Pending until reconciled) and runs the module's post-hooks. The handler exposes `loadAccount` / `availableBalance` / `sameOrgScope` / `doTransfer` as package-private test seams.

**`action=delete`** (ETP-5085) — body `{ id }`. A Draft is removed directly; a Processed movement is reactivated and
removed through `TransactionRemovalUtil.reactivateAndRemove`. **A leg of a funds transfer is rejected up-front with a
409** and the message `Movements generated by a funds transfer cannot be deleted.` — deleting a transfer is not allowed
by design. The check is `FinancialAccountTransactionsSupport.isTransferCounterpart(trx)`, two `OBCriteria` probes asking
the FK's own question — *does any other transaction point at me?* — over
`FIN_FinaccTransaction.PROPERTY_APRMFINACCTRANSORIGIN` (Classic, destination → source) and
`PROPERTY_ETGOFINACCTRANSDEST` (the mirror half written by `FundsTransferDestinationHook`, source → destination). Both
columns are **RESTRICT**, so before this guard the removal reached `OBDal.flush()` and died there with a
`ConstraintViolationException` — which is not an `OBException`, so it escaped `runMutation`'s business-error branch and
surfaced as an opaque **HTTP 500** (`Could not delete the movement. Please check logs for details.`) with the FK
violation only visible in the Tomcat log.

Two deliberate properties of that predicate: it is shaped like the FK rather than reading the transaction's own outgoing
links, so a destination-side **bank fee (`BF`) stays deletable** (it carries an origin, but nothing references it), and it
also covers transfers created **before the mirror column existed**, where only the Classic half is set. The frontend
hides the kebab's Eliminar for those rows, so this guard is the server-side enforcement for the bulk-delete path, the
REST API and MCP.

**Bulk delete surfaces the reason too.** `MovementsTab.jsx` → `useBatchDeleteDialog` still does **not** pre-filter the
selection — the same deliberate choice already made for payment-linked movements — so a selected transfer leg comes back
as a per-row failure. What changed is that the 3-outcome toast no longer reports bare counters: because `postAction`
rejects with the backend's message and a `status` of 409, `toastBatchDeleteOutcome` names the reason, and for a single
selected row it shows that sentence alone instead of "No se pudo eliminar ninguno de los 1 registros seleccionados". The
generic contract (only a 4xx counts, opaque status-code messages are discarded, several distinct reasons fall back to the
counter) is documented in `docs/ui-customization.md` §9c.

Implemented by `com.etendoerp.go.schemaforge.FinancialAccountTransactionsHandler` (CDI bean registered via `@Named("financial-account-transactions")`). The handler:

- Queries `FIN_Finacc_Transaction` joined with `FIN_Financial_Account`, `C_Currency`, `FIN_Payment`, and `C_BPartner` (resolved from either the transaction or its parent payment).
- Joins the 9 accounting-dimension FK tables (`ad_org`, `c_bpartner`, `c_project`, `c_costcenter`, `c_activity`, `c_campaign`, `c_salesregion`, `user1`, `user2`) to marshal a `dimensions` object per row, and surfaces the related payment (`paymentId` + `paymentIsReceipt`) so the frontend can deep-link to the payment window.
- Computes the account's `enabledDimensions` by reading `C_AcctSchema_Element` (the dimensions enabled in the chart of accounts), returned once at the payload level (not per row).
- `headerDimensions` (the set the New Movement wizard renders) is delegated to `AccountingDimensionsSupport` since ETP-4950. That helper honours `AD_Client.Acctdim_Centrally_Maintained`: for a centrally-maintained tenant `C_AcctSchema_Element.IsActive` is a no-op and the authoritative source is Core's `DimensionDisplayUtility.getAccountingDimensionConfiguration` — reading the element table directly used to give those tenants the wrong header set. `enabledDimensions` keeps its previous, coarser semantics on purpose (it is informational; nothing gates editing on it).
- Computes a per-row running balance anchored to `FIN_Financial_Account.currentbalance` (window function: `currentbalance − SUM(subsequent)` over `statementdate ASC, line ASC`).
- Returns a `totals` object with the current balance, 30-day inflows, 30-day outflows, and the account currency. The 30-day cutoff is **computed in Java** (`Instant.now().minus(30, ChronoUnit.DAYS)`) and bound as a `Timestamp` parameter — no PostgreSQL-specific `NOW() − INTERVAL` syntax, so the query stays portable across PostgreSQL and Oracle.
- Each row also carries **CSV-export fields** consumed by the generic `?export=csv` path so the exporter stays a dumb serializer: `transactionTypeLabel`, `statusLabel` (Classic English labels), `depositAmount`/`withdrawalAmount` (the split, from raw `depositamt`/`paymentamt`), `paymentLabel` (synthetic `docNo - date - bp - |amount|`) and `processed`. These replace the retired client-side `movementsCsvExport.js`.

**Unified accounting date (ETP-4531, redefined 2026-07-17)**: no `decisions.json` change was needed here. `transactionDate` (column `Statementdate`) is `visibility: readOnly` in this window's generic `transaction` entity, so there is no user-facing edit path today. This is not a requirement to keep the two dates independent — ETP-4531's redefined scope is the opposite (a single visible date, with both DB columns kept in sync). `FIN_Finacc_Transaction.Statementdate` carries `AD_Column.AD_Callout_ID = org.openbravo.erpCommon.ad_callouts.SE_StatementDate_Transaction`, which unconditionally copies `inpstatementdate → inpdateacct` — the same native cascade the Invoice/Goods Receipt/Goods Shipment windows now intentionally leave in place elsewhere in ETP-4531. It is dormant here only because `transactionDate` is read-only (no interactive edit path to trigger it). If `transactionDate` is ever made editable, this callout already does the right thing (unify, not diverge) and needs no guard — only an explicit `mirrorAccountingDate`-style server-side mirror (matching the invoice windows' pattern) if a write path exists that could bypass the callout. Separately, `FinancialAccountTransactionsHandler#createTransaction` does `parseDate(body.optString("accountingDate", null), transactionDate)` — a **one-time create-time default** (falls back to `transactionDate` only when the caller omits `accountingDate`), the same acceptable pattern used elsewhere (e.g. Simple G/L Journal's `defaultExpr`), not an ongoing sync; this handler builds the DAL entity directly in Java and does not go through the generic JSON-body callout cascade. `ReconciliationHandler#createTransactionFromLine` always sets `dateAcct = transactionDate` for auto-matched bank-reconciliation transactions — also a one-time value at creation of a brand-new record, not a resync of an existing one. `DateAcct` itself carries no callout (verified against the DB).

Response shape:

```json
{
  "response": {
    "data": {
      "transactions": [
        {
          "id": "...", "date": "2026-05-06T00:00:00Z", "documentNo": "PAY-001",
          "contact": "DHL Technologies SL", "description": "Invoice No.: ...",
          "paymentStatus": "RPPC", "trxType": "BPD",
          "paymentId": "...", "paymentIsReceipt": "Y",
          "amount": 12450.00, "balance": 211841.01,
          "currencyIso": "EUR", "posted": "Y",
          "dimensions": { "organization": "GOOrg", "project": "..." }
        }
      ],
      "totals": {
        "balance": 211841.01, "inflows": 47820.00,
        "outflows": 22398.82, "currency": "EUR"
      },
      "enabledDimensions": ["organization", "bpartner", "project"]
    }
  }
}
```

The spec + entity records that wire this endpoint live in `src-db/database/sourcedata/ETGO_SF_SPEC.xml` and `ETGO_SF_ENTITY.xml` of `com.etendoerp.go` (so the records survive `update.database`).

### Imported statements

Operations routed by HTTP method + `action` query param, all served by `BankStatementsHandler` (`@Named("bank-statements")`):

```
GET  /sws/neo/bank-statements?FIN_Financial_Account_ID={id}          → list
GET  /sws/neo/bank-statements?action=lines&statementId={id}          → lines (one statement)
GET  /sws/neo/bank-statements?action=lines&statementIds={a,b,c}      → lines (several statements, for CSV export)
GET  /sws/neo/bank-statements?...&export=csv&columns=...&ids=...     → CSV download (generic, see neo-headless.md §4.3)
POST /sws/neo/bank-statements?action=preview                         → in-memory parse (no persist)
POST /sws/neo/bank-statements?action=import                          → C43 / CSV import
     body: { FIN_Financial_Account_ID, fileName, contentBase64 }
     201  { id, fileName, lineCount, discardedLines }
     400  { error: { code: "NO_VALID_LINES", message } }  ← no line survived the prune
POST /sws/neo/bank-statements?action=create                          → manual create (header + lines, no file)
     body: { FIN_Financial_Account_ID, name, transactionDate, importDate,
             fileName, notes, process,
             lines: [{ date, reference, bpartnerName, bpartnerId,
                       glItemId, in, out }] }
POST /sws/neo/bank-statements?action=process   body: { id }            → process a draft
POST /sws/neo/bank-statements?action=update    body: { id, ...create }  → edit a draft (replaces all lines)
POST /sws/neo/bank-statements?action=delete    body: { id }            → delete a draft (+ its lines)
```

The manual-create handler builds the `FIN_BankStatement` (name, dates, `fileName`, `notes`), one `FIN_BankStatementLine` per non-blank line (`in`→`cramount`, `out`→`dramount`, `bpartnerName`→`bpartnername`, `bpartnerId`→`businessPartner` FK, `glItemId`→`gLItem` FK, blank `reference` defaults to `**` — Reference No is optional in BOTH flows). A non-blank line whose `in` and `out` are both 0 is rejected with a 400 ("Every line must have an amount in either Deposit or Withdrawal") rather than silently dropped: the manual flow has a user who can fix it. The `process` flag (default `true`) drives the save modal's split button: **Save and process** (`true`) runs the same `processStatement` as import so the lines become reconcilable; **Save as draft** (`false`) just persists the statement with `processed='N'`. Mirrors Classic's manual bank-statement header + line fields.

**Draft row actions** (`process` / `update` / `delete`) are guarded by `requireDraft(id)`, which 400s when the id is missing, the statement does not exist, or it has already been processed (`isProcessed()`). So only drafts can be processed, edited or deleted; processed statements are immutable. `update` re-applies the editable header and **rebuilds only the unmatched lines** (see the reactivation section below), optionally processing afterwards when `process=true`. `delete` removes the lines then the statement.

#### Reactivating a partially reconciled statement (ETP-4921)

Classic lets you reactivate a statement whose lines are only partly reconciled, and then refuses
to save an edit to a **matched line** ("Bank Statement Line is already matched. It can not be
modified nor deleted."). Etendo GO refused the reactivation itself, so a partially reconciled
statement — the exact case users need to fix — was frozen: `No se pudo reactivar el extracto`.

**Why Classic behaves that way.** Core's `FIN_BankStatementProcess` has NO reconciled-lines guard
on Reactivate. The protection is one level down, in the DB:
`APRM_FIN_BNKSTM_LINE_CHECK_TRG` (`org.openbravo.advpaymentmngt`, `FIN_BANKSTATEMENTLINE`, BEFORE
insert/update/delete) raises `@APRM_BSTLine_Matched@` for any insert, update or delete of a line
whose `FIN_FinAcc_Transaction_ID` is set — for **every** caller, and **independently** of the
parent statement's `Processed` flag. So the unit of immutability is the LINE, not the statement.
GO had put the guard on the wrong object.

**What changed:**

| Where | Before | After |
|---|---|---|
| `handleReactivate` | `hasReconciledLines()` → 400 | no line guard; only the `posted` check remains |
| `handleUpdate` | `deleteLines()` — deletes ALL lines, then recreates | `deleteUnmatchedLines()` — matched lines are never touched |
| `handleUpdate` line numbering | always restarts at 10 | starts after `maxExistingLineNo()`, so a rebuild cannot collide with a kept matched line |
| `handleUpdate` empty body | always 400 `At least one line is required` | valid when matched lines remain (a header-only edit of an all-matched statement) |
| `handleDelete` | no line guard | `hasMatchedLines()` → 400 `MSG_HAS_MATCHED_LINES` |

The new `handleDelete` guard is the flip side of relaxing reactivation: a DRAFT statement can now
carry matched lines, and deleting the statement would take those lines with it — which the trigger
never allows. Guarding up front turns that into a clean 400 instead of a raw trigger exception
raised mid-delete. `hasReconciledLines` was renamed `hasMatchedLines` to match the trigger's own
vocabulary and to make its single remaining caller obvious.

**Frontend (`ManualStatementModal`).** A matched line hydrates with `matched: true` (already
returned by `?action=lines` — `BankStatementsSupport.mapLineRow` sets it from
`fin_finacc_transaction_id`; the modal simply used to drop it) and renders through `MatchedRow`
instead of `EditRow`: the same CSS grid tracks, but plain read-only text, a muted background, and
a `Lock` icon in place of the delete button (`financeAccountStatementsManualLineMatchedTooltip`).
Those rows are excluded from the save payload entirely, which is what makes the backend's
"rebuild only the unmatched subset" correct rather than lossy. Offering the inputs would be
offering an edit the database is going to reject.

#### Numeric column headers are right-aligned (ETP-4921)

The generic `DataTable` right-aligns a header whose column type is in `NUMERIC_FIELD_TYPES`
(`renderColumnHeaderCell`), which is why amounts line up with their labels in Sales Invoices and
every other generated list. The hand-rolled grids in this window do not go through `DataTable`,
so they never inherited the rule: their money cells had always been `text-right tabular-nums`
while the header above sat at the opposite edge of the column.

Fixed in the three that still had it, using the convention `MovementsTable` and
`ReconciliationListTable` already followed (`text-right` on the header cell **plus**
`align="right"` on `SortableHeaderLabel`, which flips the sort arrow to the label's left so the
arrow stays on the column's outer edge):

| Grid | Columns |
|---|---|
| `StatementsTable` (Extractos, header row) | Lineas / Salida / Entrada — marked `numeric: true` in `TAIL_SORT` |
| `StatementLinesInline` (the expanded accordion) | Salida / Entrada — the existing `AMOUNT_COLS` set |
| `ReconciliationSplitPanel` (both panels) | Importe / Saldo pendiente — these carried an explicit `text-left` |

Deliberately NOT changed: Estado (a pill), Progreso (a bar, not a figure), and every text column.

#### The expanded row and the header row refresh together (ETP-4921)

A statement's header row and its expanded accordion are fed by **two independent fetches**:
`useBankStatements(accountId)` for the headers (whose `reload()` the tab already called after
every mutation) and, inside `StatementLinesInline`, a separate
`useBankStatementLines(statementId)` keyed on nothing but the id. Nothing invalidated the second
one, so after editing a line in the modal the header showed the recomputed total and status
(`+120,00 €`, `Parcial 2/3`) while the rows underneath still showed the pre-edit amount — and the
toolbar's refresh button looked broken, because it reloaded exactly the half that was already
correct. Only a full window reload fixed it.

`useBankStatementLines(statementId, refreshToken)` now takes a second dependency, threaded
`ImportedStatementsTab` → `StatementsTable` → `renderBody` → `StatementRow` →
`StatementLinesInline`. The tab owns `linesRefreshToken` and bumps it inside `refreshStatements()`,
which replaced every bare `reload()` call site: the bulk-delete outcome, the PSD2 sync, the
process/reactivate/delete confirm, both modals' `onSuccess`, and the toolbar's `onRefresh`. A
FAILED action deliberately does not bump — nothing changed server-side, so re-fetching would be
noise.

The edit modal needs no token: its own `useBankStatementLines` call passes `null` while closed, so
`path` flips `null` → url on every open, which is already a dependency change and already forces a
fresh fetch.

#### Why a fully pending line used to show a full progress bar (ETP-4921)

Reported as "some statement lines have no Progreso column". The question was inverted: the lines
WITHOUT a bar were the correct ones. On an account whose lines were all unreconciled, every
WITHDRAWAL drew a solid black bar under a "Pendiente" badge, and only the two deposits were blank.

`ProgressCell` draws a bar whenever `reconciledAmount != 0`, and `reconciledAmount` came from

```java
BigDecimal reconciled = amount.subtract(pending);   // ReconciliationHandlerSupport
```

where the two operands do not share a sign convention. `amount` is SIGNED (a withdrawal is
negative), while `pendingAmount` is the unsigned `|cramount - dramount|` that
`BankStatementLinePendingAmountHandler` stores — and that `BankStatementsSupport.mergeMatchGroups`
sums across a split group's sub-lines. Verified against the live rows that surfaced it:

| Line | `amount` | stored `pendingAmount` | old `reconciled` | bar |
|---|---|---|---|---|
| deposit | `+10.00` | `10.00` | `0` | none — correct, *by coincidence* |
| withdrawal | `-0.50` | `0.50` | `-1.00` | solid, at 200% clamped to 100% |
| partial withdrawal | `-100` | `46.76` | `-146.76` | solid 100% instead of 53% |

Deposits only ever worked because both signs happened to match. The fix is
`ReconciliationHandlerSupport.signedReconciledAmount(amount, pending)`: subtract MAGNITUDES, then
put the sign of `amount` back, clamped at zero (`pending > |amount|` is a data anomaly, and
"nothing reconciled" is the honest reading of it — the alternative flips the sign and draws a bar
pointing the wrong way). Unit-tested in `ReconciliationSupportTest` with the live values above.

Fixed in the CONSUMER, not the stored column. Making `EM_ETGO_Pending_Amount` signed would also
work arithmetically, but it is a magnitude by contract, three other call sites read it, and
`mergeMatchGroups` sums it — that is a semantics change plus a data migration for an error that
lives in one subtraction. No frontend change: the `reconciledAmount != 0` contract was always
right, it was being fed wrong numbers.

#### A bank-connected account's statements are read-only (ETP-4921)

On a PSD2-connected account the statements come from the bank, so they must not be hand-edited.
Reactivar was the one door still open: Edit and Delete already hide themselves once a statement is
processed (and the sync leaves them processed), but reactivating brings it back to draft and
reopens both.

**The signal is ACCOUNT-level, and that is deliberate.** Nothing on the statement records that it
came from the bank. The PSD2 module writes only a `fileName`, from a translated AD_MESSAGE:

```java
// BankStatementHelper.java:533 (com.etendoerp.psd2.bank.integration)
newBankStatement.setFileName(OBMessageUtils.getI18NMessage("PSD2_BankStatementFileName"));
```

`com.etendoerp.psd2.bank.integration.es_es` ships a Spanish translation of that message, so the
stored text depends on the language the sync ran in — matching against it later would resolve a
different string. There is no link table and no marker column either (`fin_bankstatement` carries
only the `em_etgo_*` aggregates and the bulk-posting columns), and the document type is `BSF` for
manual statements too.

So the gate keys off `account.bankConnected` (Salt Edge status `"CO"`,
`FinancialAccountsPageHandler:310`). That is coherent with a decision this window already made:
`StatementsToolbar:185` replaces the "Importar extracto / Nuevo extracto" split-button with
"Sincronizar extractos" on such an account, so a statement cannot be created by hand there
either. The known consequence, accepted knowingly: a legacy MANUAL statement sitting on a
now-connected account also becomes non-reactivable — it is one that could no longer be created
there in the first place.

Three entry points are closed, all from the same flag threaded
`ImportedStatementsTab` → `StatementsTable` → `renderBody` → `StatementRow`:

| Entry point | Behaviour |
|---|---|
| `StatementRowKebab` Reactivar | disabled, tooltip `financeAccountStatementsRowBankSyncedTooltip` |
| `RowActions` inline Edit + Delete | not rendered at all, even for a draft — same as they already do for a processed statement |
| Bulk-delete trigger | disabled with the same reason, via `resolveBulkDeleteBlock` |

Procesar is deliberately NOT gated: completing a draft is not editing its content.

`resolveBulkDeleteBlock` (exported from `ImportedStatementsTab`, unit-tested directly) states the
precedence between the two block reasons: the connected-account one wins over "the selection
contains a processed statement", because it is unconditional. Reporting "processed statements
cannot be modified" on a connected account would point the user at a state they could try to
change, when nothing in this window unblocks it. That is also why the copy is a new key rather
than a reuse of `financeAccountStatementsRowProcessedTooltip`.

Follow-up worth having: if the PSD2 module ever marks the statements it creates, this gate should
move to that per-statement flag — it would then also leave legacy manual statements editable.

#### Bulk delete cannot attempt a processed statement, and failures explain why (ETP-4921)

The per-row hover trash icon (`StatementsTable`'s `RowActions`) was already hidden for a processed
statement — `isDraftStatement(s)` (now `statementStatus.js`, a plain `.js` module so both
`StatementsTable` and `StatementRowKebab` can import it without a cycle between the two component
files). The gap was the **bulk-delete path**: the row checkboxes have no such gate, because the
same selection also feeds the tab's Export button (exporting a processed statement's lines is
legitimate), so hiding the checkboxes for processed rows would have broken that. A selection
containing a processed statement could still reach the floating "N Seleccionados" bar and fire a
delete the backend was guaranteed to reject — surfacing only the generic
`toastBatchDeleteOutcome` count message ("None of the 1 selected could be deleted"), with no hint
that the reason was the statement being processed.

Fixed at the trigger, not the checkbox: `ImportedStatementsTab` computes
`selectionHasNonDraft` (any selected id whose statement fails `isDraftStatement`) and passes it to
`BulkDeleteSelectionBar` as `disabledReason` — a new, additive prop (`MovementsTab`'s own bulk-bar
usage is unaffected, since it doesn't pass it). The trigger disables itself and its
`title`/`aria-label` become the reason, reusing the exact same
`financeAccountStatementsRowProcessedTooltip` copy `StatementRowKebab` already shows for its own
gated Procesar item — "don't let them touch the trash can", not "let them try and fail". Selecting
even one processed statement blocks the WHOLE batch (not just that item), matching the
per-row hover behavior it mirrors.

The single-row delete confirm (`ImportedStatementsTab.runConfirm`, shared by the Process /
Reactivate / Delete confirm dialog) also stopped discarding the backend's actual rejection reason:
`useStatementActions.post()` now parses the NEO error envelope (`parseBackendErrorMessage`, the
same helper `DetailView.jsx` uses) instead of prefixing the raw response text with `HTTP 400`, and
`runConfirm` runs it through `translateBackendError` before falling back to the flat
per-variant generic toast. Two new `BACKEND_ERROR_MAP` entries in `backendErrors.js` translate
`BankStatementsHandler`'s `requireDraft`/`requireProcessed` guard messages:
`backendError.statementNotDraft` / `backendError.statementNotProcessed`.

**Status derivation** — `EM_ETGO_STATUS` (Etendo Go-only extension column) is a real STORED value, not computed on read: the list reads it straight off the row and only falls back to a live `BankStatementsSupport.deriveStatementStatus(processed, lineCount, matchedCount)` call when the column is blank (legacy rows predating it). The formula itself: not processed → `DRAFT`; otherwise `PENDING` (no matched lines) / `PARTIAL` / `RECONCILED` (all matched). The list also returns `notes`, and `?action=lines` returns each line's `bpartnerId`/`glItemId` (+ joined `bpartnerFkName`/`glItemName`) and separate `in`/`out` so the edit modal can hydrate the FK pickers.

Because it is stored, `EM_ETGO_STATUS` must be kept in sync by SOMETHING every time `Processed` or the match counts change — `BankStatementHeaderStatusHandler` (`FIN_BankStatement` NEW/UPDATE observer, same `event.setCurrentState` technique as `BankStatementLinePendingAmountHandler`) does that unconditionally on every header write, whichever code path caused it (ETP-4891 follow-up). Before this handler existed, a statement imported through the PSD2 bank-connection sync (external `com.etendoerp.psd2` module, never touches this module's own handlers) could get stuck reading "Borrador" forever after being marked processed: its lines get counted correctly by the per-line observer at insert time, but `Processed` is still `false` then, so the status computed at THAT instant is correctly `DRAFT` — and nothing re-derives it once the sync flips `Processed` to `true` on the header alone, since no line event fires for that. The SPA's own "Procesar" action then 400s with "Only draft (unprocessed) statements can be modified" — a correct rejection (the real flag already says processed) that reads as a contradiction next to a "Borrador" label. `R25-bankstatement-stale-status` repairs statements already stuck from before the handler existed.

The import handler:
- Decodes base64 → `ByteArrayInputStream`
- Instantiates the Cuaderno 43 parser (`org.openbravo.module.cuaderno43.es.utility.Cuaderno43`) via reflection (no compile-time dependency on the commercial JAR)
- Calls `init(account)` + `loadFile(stream, statement)` headlessly (no servlet context needed)
- Saves `FIN_BankStatement` + `FIN_BankStatementLine` rows in one transaction
- Runs `BankStatementLinePruner.pruneZeroAmountLines(statement)` (via the `pruneLines` test seam)
- Returns `201 { id, fileName, lineCount, discardedLines }` on success, where `lineCount` is what
  actually got persisted — not what the parser read

#### Zero-amount lines and empty files (alignment with Classic)

`BankStatementLinePruner` ports the sanitising half of Classic's
`org.openbravo.advpaymentmngt.utility.FIN_BankStatementImport#saveFINBankStatementLines`: a parsed
line whose `cramount` **and** `dramount` are both zero carries no financial information, so it is
removed and the survivors are renumbered `(counter + 1) * 10` — **no gap** in `lineno`. Classic
reports the drop through `AD_MESSAGE.APRM_ZeroAmountNotInserted` ("%s row/s inserted … %s row/s not
inserted because credit and debit amount were 0") and still calls the import a success; we return
`discardedLines` and the modal surfaces it the same way.

It runs on the statement's already-persisted lines rather than inside a parser, exactly like in
Classic where the rule lives in core and not in the CSV importer — so it applies to Cuaderno 43 too.

Both `?action=import` and `?action=preview` then reject a statement with **no surviving line**
(`400`, `error.code = NO_VALID_LINES`) and roll back, covering a CSV that only has its header row as
well as one whose every line is amount-less. Classic does the same (`importFile` →
`rollbackAndClose()` when `bankStatementLines` is empty); the previous behaviour was a `201` with
`lineCount: 0` and an empty, already-processed statement left in the DB.

Two deliberate divergences from Classic, both documented in the tests:
- a **blank** amount cell is `0` here, whereas Classic's `Utility.stringToBigDecimal("")` throws and
  aborts the whole file. The resulting zero/zero line is pruned anyway, so the outcome matches
  without failing an otherwise valid import;
- **negative** amounts are kept. Classic's condition is "not both zero", not "positive", so
  rejecting negatives would be a new business rule rather than a consistency fix.

#### Cuaderno 43 lookup requirements (MANDATORY)

The Cuaderno 43 parser does **not** read fields from `c_bank` / `c_bankaccount`. It runs an OBCriteria over `FIN_FinancialAccount` looking for an **exact match** on three fields, scoped to the **current user's client** (organization filter is disabled via `setFilterOnReadableOrganization(false)`):

| Header record 11 position | `FIN_FinancialAccount` property | DB column |
|---------------------------|---------------------------------|-----------|
| Entity (pos 3–6, 4 digits) | `bankCode` | `codebank` |
| Branch (pos 7–10, 4 digits) | `branchCode` | `codebranch` |
| Account (pos 11–20, 10 digits) | `partialAccountNo` | `codeaccount` |

Additionally, after the lookup the parser asserts that the account returned is the **same instance** as `statement.getAccount()` (i.e. the financial account from which the user triggered the import). If either check fails, the import aborts with `Error en la cuenta bancaria. La cuenta bancaria no existe. ({entity}-{branch}-{account})`.

**Therefore, to enable C43 import on a financial account:**
1. The user's session must belong to the same `ad_client_id` as the account.
2. `codebank`, `codebranch`, and `codeaccount` must be populated and match the values encoded in the file header record (type 11).
3. `bank_digitcontrol` + `account_digitcontrol` are used to render the displayed IBAN/CCC but do not participate in the lookup; they must still be consistent with the IBAN if you want the UI to display it correctly.
4. The user must trigger the import from the same financial account whose codes match the file. Importing a file from a different account will fail even if the codes exist somewhere else in the database.

Local dev account that is already configured: **Cuenta de Banco** (client GOClient, id `5521767A6D3C47E1957AF82D1334BFE4`) — `codebank=2100`, `codebranch=0418`, `codeaccount=0200051332`, DC `45`. The C43 fixtures under `e2e/fixtures/bank-statements/` target this account.

Status derivation in list response: `COMPLETED` = processed=Y AND posted=Y; `WITH_ISSUES` = processed=Y AND matchedCount < lineCount; `IN_PROGRESS` = processed=N.

#### Statement status config
`statementStatusConfig.js` — 3 statuses: `COMPLETED` (green `#EEFBF4`), `WITH_ISSUES` (orange `#FFF1D6`), `IN_PROGRESS` (yellow `#FFF7E0`).

## Pipeline / artifact status

`artifacts/financial-account/` is a full pipeline artifact: `decisions.json` (no longer
`layoutType: "custom"`), a generated `contract.json` and a generated `generated/web/financial-account/`
tree whose `AccountPage.jsx` is what the window actually mounts for the LIST — through the
`AccountsHeaderTable` slot declared in `window.customComponents.headerTable`. `make regen ONLY=financial-account`
and `sf-validate-pipeline --scope=financial-account` both apply to it like to any registered window.
The DETAIL half is still hand-written React (PSD2, statement import and the reconciliation engine
have no AD backing) and consumes real NEO endpoints directly.

> **Local-DB translation gap when running `make regen` on this window.** Some local sandbox DBs are missing `AD_Ref_List_Trl` es_ES rows for the `type`/`pSD2StatementFrequency`/`pSD2ConnectionStatus`/`etblkpAccountingstatus` enum fields used by this window's `account`/`transaction`/`importedBankStatements` entities — a `make regen ONLY=financial-account` run against such a DB will silently drop those enum labels from `contract.json` (and the generated forms) with no error, only the "AD cache looks STALE" warning as a hint. See `docs/feedback.md` → "`make regen` Silently Strips es_ES Enum Labels on a DB Missing `AD_Ref_List_Trl` Rows" (added during ETP-4530) for the exact `AD_Reference_ID`s affected and the diff-and-restore workaround. This is a local-environment data gap, not a code bug — do not "fix" it by editing the generator.

## Client-side filtering

`MovimientosTab` runs all filters in a single `useMemo` over the movement array returned by `useAccountMovements`:

| Filter | Value shape | Logic |
|--------|-------------|-------|
| Status (via advanced filter) | derived `statusFamily` = `financeAccountMovementsStatusReconciled` \| `…Unreconciled` | `statusFamily` is `movementStatusLabelKey(paymentStatus)`; RPPC → Reconciled, all others → Unreconciled |
| Date range | `null \| { presetId } \| { from, to }` | `presetBounds()` resolves preset IDs to `{from, to}` Dates; custom range normalised to whole-day bounds (00:00 → 23:59.999) |
| Type | `null \| 'BPD' \| 'BPW'` | `m.trxType === value` |
| Amount (via advanced filter) | `{ min, max }` | signed comparison (`min: 0` ⇒ only inflows; `max: 0` ⇒ only outflows); either bound optional |
| Search | `string` | Case-insensitive substring over `documentNo + contact + description` |

Selection is cleared whenever the filters object reference changes (every dropdown change creates a new filters object).

## Conciliación empty state (ETP-4921)

Both panels' tables share `renderRows`, whose empty state is a circled icon + title + hint,
deliberately mirroring the right panel's own "Selecciona un movimiento". One line of centered
copy in a full-height table read as a rendering failure rather than an intentional state, and
having two visually different empty states on one screen made it worse.

| Key | Copy |
|---|---|
| `financeReconcileEmpty` | "No se han encontrado movimientos" |
| `financeReconcileEmptyHint` | points at the date range / status filter |

The hint names the way out rather than nudging the user to create something: the list in these
panels is always a filter result (status + date range + search), so there is nothing to create.
That is the opposite of the Movimientos tab, whose own empty copy is paired with a
"+ Nuevo movimiento" hint — which is why these two tabs deliberately do not share a key.

## Conciliación column layout (ETP-4921 QA)

> QA: *"la vista de conciliación se ve cortada; si cambio el zoom se ve bien"*.

Both reconciliation panels declare a width on every column **except** the free-text one
(Descripción on the left, Información on the right) and rely on `truncate` to clip it. That never
worked, because the shared `Table` used the browser's default **auto** layout: an auto-layout table
grows to fit its widest cell, so a real statement description — `TRANSFERENCIA INMEDIATA A FAVOR DE
… CONCEPTO Factura Nº : 10001754 1000896` — stretched the table past the panel and pushed
**Progreso** and **Importe** behind a horizontal scrollbar. Zooming out only hid the symptom by
making the same text fit.

Two changes, both in `ReconciliationSplitPanel.jsx`:

1. **`PanelTable` renders the table `table-fixed`.** Under a fixed layout the declared widths win
   and the free column absorbs whatever is left, so Progreso (90px) and Importe (139px) can no
   longer be pushed out of view. This is what makes them "always visible" — a layout fix, not a
   sticky-column workaround, so there is no horizontal scroll left to pin anything against.
   It applies to both panels, which have the same shape and the same latent bug.
2. **The description is rendered through `TruncatedText`** (`components/ui/truncated-text.jsx`,
   new): one line, ellipsised, with the full string in a tooltip on hover.

`TruncatedText` measures before it speaks: Radix asks to open on hover/focus and the component only
honours the request when `scrollWidth > clientWidth + 1`. Repeating a short label the reader can
already see in full is noise, and the 1px slack absorbs the sub-pixel rounding that otherwise
reports an exactly-fitting text as overflowing. It carries its own `TooltipProvider` (same
reasoning as `CopyLinkButton`) so it works outside this window, and its tooltip is portalled —
a hand-rolled absolute one, like `ProgressCell`'s, would be clipped by the very `overflow-hidden`
that produces the ellipsis.

Tests: `components/ui/__tests__/truncated-text.vitest.jsx` (behaviour, with the layout metrics
jsdom cannot produce stubbed in), `truncated-text.test.js` (structure), and the
`column layout — Progreso and Importe stay in view` block in
`contract-ui/__tests__/ReconciliationSplitPanel.vitest.jsx`.

## Column sorting (ETP-4921)

Two different mechanisms, because the LIST and the DETAIL tabs are two different kinds of grid.

### The Cuentas list — server-side

The list is a generic `DataTable` inside the `AccountsHeaderTable` slot, so it sorts the way
every other window does: `ListView` owns the state, `useEntity` turns it into NEO's `_sortBy`
(`resolveBackendSort`, `lib/gridQuery.js`), and the whole dataset is ordered — not just the
loaded page. `DataTable` treats `sortable` as **opt-out** (`col.sortable !== false`), and the
slot now declares `sortable: true` on every data column; only the trailing `_rowActions` column
stays `false`.

This is why "Por conciliar" had to become the `EM_ETGO_Pending_Count` stored computed column
first. A value injected in `afterHandle` can only ever be reordered *inside the page the SQL
already selected* (`BATCH_SIZE = 75` + infinite-scroll `loadMore`), which is not the same as
ordering the dataset — so the column was unsortable by construction.

**Two sort affordances, both present:**

- **Clickable column headers**, cycling none → asc → desc → back to the list's default.
- **The toolbar "Ordenar por" popover** (`components/contract-ui/ListSortPopover.jsx`). Every
  other list gets this from `ListView`'s idle bar, which this window suppresses
  (`hideListBar: true`) in favour of its own toolbar — so the control was silently missing here.
  It was extracted out of `ListView`'s inline JSX rather than copied, and `AccountsToolbar` takes
  it through a `sortControl` node prop so the toolbar stays presentational. `ListView` forwards
  `onSortSelect` / `onClearSort` / `isDefaultSort` in `tableProps` alongside `onSort` for exactly
  this: the popover must NOT reuse the header's cycle, since a menu entry that can silently clear
  the sort reads as a no-op.

**The resting order stays in code.** `sortAccounts` reproduces the retired page's
`ORDER BY fa.isdefault DESC, fa.name ASC`, which `listSortBy` cannot express —
`ListView.parseListSortBy` parses a SINGLE column. So `decisions.json` declares
`window.listSortBy: "name asc"` and the slot applies its two-key sort **only while the sort state
still equals that default** (`RESTING_SORT`). Without that gate the arrows would render and
appear to do nothing, because the local sort used to re-order unconditionally on every render.

Related generic fix: `ListView.handleColumnSort`'s reset arm used to hardcode
`creationDate desc`, so for any window declaring its own `listSortBy` the third click switched to
a *different* order than the one the list opened in — and a slot keying off "is the sort at rest"
could never get back to it. It now resets to `initialSortColumn` / `initialSortDirection`.

### The Tipo column — two sortable segments

The Tipo cell shows **two** values (the account type, and the IBAN under it), so one header could
only ever sort by one of them. `decisions.json` declares a `multiField` decorator on the `type`
field with `parts: [type, iBAN]`, which is the same mechanism the Product list uses for
"Identificador & Nombre" — `DataTable.renderMultiFieldHeaderCell` renders N independently
sortable segments, each issuing `_sortBy` on its own field.

- The **cell body is untouched**: `DataTable`'s `col.render` wins over the multiField cell
  renderer, so `cellType: accountType` still draws `TypeCell` (type label + chunked IBAN).
- Part labels go through a `labelKey` resolved via `ui()`, not the literal `labels` map Product
  declares inline, so no user-visible string is versioned in `decisions.json`.
- Both parts carry `searchable: true`. Validator rule **F18** blocks a sort-enabled part that is
  not queryable, and it reads queryability off `searchableFields` / `supportedFilters` — which
  were empty for this entity. Neither list is consumed by the frontend, so this has no visible
  side effect; it documents that NEO accepts a filter/sort on those columns.
- Generic fix this needed: `renderMultiFieldHeaderCell` built its own `<th>` and **dropped
  `col.headClass`**, which the single-label branch honours. This window pins column widths, so
  its Tipo column collapsed to auto width the moment its header gained segments. No Product test
  caught it because Product declares no `headClass`.

### The Movimientos / Reconciliaciones / Extractos tabs — client-side

These three are **not** `DataTable` grids: Movimientos is a hand-rolled `<table>`, the other two
are CSS-grid `div role="table"` layouts, and each is fed by a single unpaged `useNeoResource`
fetch whose filtering is already a client-side `useMemo`. Two of the three go through bespoke
Java handlers that accept no sort parameter at all, so sorting belongs in the same place the
filtering already does.

| Piece | Where |
|---|---|
| Pure comparator | `lib/clientSort.js` — `compareCellValues`, `sortRows` |
| State + none→asc→desc→none cycle | `hooks/useClientSort.js`, mirroring `ListView.handleColumnSort` |
| The clickable label | `components/financial-accounts/SortableHeaderLabel.jsx` |

`SortableHeaderLabel` renders only the label + arrow, never the cell — one consumer has
`<TableHead>` cells and two have `<span>` cells, so a component owning the cell could not serve
both. Returning to "none" on the third click (rather than to a default column) is what keeps the
backend's own order reachable: movements arrive newest-first, reconciliations `transactionDate
desc`.

**The sort state lives in the TAB, not the table.** Each of the three toolbars also hosts the
same `ListSortPopover` the Cuentas list uses, and a toolbar is the table's *sibling*, not its
child — so the state has to sit above both. Same split as `ListView`/`DataTable`: the container
owns it, the grid receives `sortKey` / `sortDirection` / `onSort`. Each table module exports what
the tab needs to build it, derived from its own renderer registry rather than duplicated:

| Table | Exports |
|---|---|
| `MovementsTable` | `useTrxTypeLabel`, `buildMovementSortCtx`, `buildMovementSortAccessors`, `buildMovementSortColumns` |
| `StatementsTable` | `buildStatementSortAccessors`, `buildStatementSortColumns` |
| `ReconciliationListTable` | `buildReconciliationSortAccessors`, `buildReconciliationSortColumns` |

Each toolbar takes the control as a rendered `sortControl` node rather than sort props, so the
toolbars stay presentational — the same shape `AccountsToolbar` uses.

`useClientSort` therefore returns both cycles: `toggleSort` for the headers
(none → asc → desc → none) and `selectSort` / `clearSort` / `isDefaultSort` for the popover,
mirroring `ListView`'s own split between `handleColumnSort` and
`handleSortSelect` / `handleClearSort`. A menu entry that could silently clear the sort would
read as a no-op.

**Sort values are co-located with the cell renderers**, as an optional `sortValue(row, ctx)` on
each registry entry. That is deliberate: the contract field name and the payload key routinely
differ (`transactionDate` renders from `row.date`, `businessPartner` from `row.contact`), and the
translated pills must sort by what the reader sees, not by the raw code — every non-`RPPC`
payment status collapses into "Sin conciliar" on screen, so sorting by code would scatter them.
Dates sort on the raw ISO string, since `formatDate` yields `dd/mm/yyyy`, which would order by
day-of-month.

**Movimientos → Tipo also has two segments.** That cell stacks the transaction type over the
posting status, so like the Cuentas list's Tipo it splits into "Tipo & Contabilizado". The
`multiField` decorator is not available here — it is a contract decorator consumed by
`DataTable` — so the hand-rolled equivalent is `SortableHeaderSegments`, fed by an optional
`parts` array on the registry entry. `posted` is not a contract grid column of its own; it only
ever appears inside that cell, which is why it contributes an accessor but no column.

**Two deliberate exclusions:**

- **Movimientos → Balance has no sort control at all.** It is a *running* balance, anchored to
  `FIN_Financial_Account.currentbalance` and computed as `currentbalance − SUM(subsequent)` over
  `statementdate ASC, line ASC`. It is order-dependent by construction, so reordering the grid by
  anything else turns that column into a meaningless number. `Amount` sorts fine.
- **Extractos → Lines / Out / In / Status ARE sortable** even though no AD field backs them:
  they are computed aggregates, but they travel *with* the row, so sorting them client-side is
  exactly as correct as sorting a contract column.

`lib/clientSort.js` deliberately does **not** use `parseCalendarDate`. Lexicographic order on
ISO-8601 is chronological, so the comparator only ever orders two instants against each other —
it never reads a local-time getter and never buckets by day, which are the two things that helper
exists to protect. See the date-only section of `CLAUDE.md`, which calls out this exact non-case.

## The refresh button — and why a refresh must not flash

Every generated list gets a refresh icon (circular arrows, between the sort control and the
create button) from `ListView`'s idle bar. This window suppresses that bar entirely
(`hideListBar: true`, see the sort section above) and draws its own toolbars, so the control was
missing from the Cuentas list **and** from all four detail tabs.

`components/contract-ui/RefreshButton.jsx` is the shared icon button — same markup and classes as
`ListView`'s own private one, so the two read identically on screen. It sits in `contract-ui`
rather than `financial-accounts` because it is generic: `ListModalWindow` (Reglas de matcheo) had
no refresh button either and now renders the same one. The `financial-accounts` barrel re-exports
it, since every toolbar in this window consumes it. Each toolbar takes an `onRefresh` handler and
wires it to the reload it already had:

| Where | `onRefresh` |
|---|---|
| `AccountsToolbar` (Cuentas list) | `onDataMutated` → `ListView`'s `hook.refresh` |
| `MovementsToolbar` (Movimientos) | the tab's own `onReload` → `useAccountMovements.reload` |
| `StatementsToolbar` (Extractos importados) | `useBankStatements.reload` |
| `ReconciliationListTab` (Reconciliaciones, cash only) | `useReconciliations.reload`, lifted in `index.jsx` |
| **Detail header**, next to *Editar cuenta* (Conciliación tab only) | `handleReconciliationRefresh` in `index.jsx` |

**Conciliación is the one tab whose refresh lives in the header rather than in a toolbar.** Its
toolbar belongs to `ReconciliationSplitPanel`'s *left column*, so a button there would reload only
the statement lines and leave the candidates, the account and the badges stale — and the cash
variant of the tab (`CashCloseTab`) has no toolbar at all. From the header it reloads everything:
account + movements + automatch (bank) / reconciliations (cash), and bumps
`reconciliationRefreshKey` so whichever screen is mounted remounts and re-runs its matching from
scratch — the same full reload an automatch apply already triggers.

**The skeleton is for the FIRST fetch only.** Every table here used to render a full skeleton
whenever `loading` was true, regardless of whether rows were already on screen. On a refresh that
wiped the grid to grey bars and snapped it back — very visible next to a generated list, which
never does this (`ListView`'s default branch only shows skeletons when
`hook.loading && hook.items.length === 0`). The gate is now the same everywhere:

- skeleton ⟺ `loading && rows.length === 0` (true initial fetch)
- otherwise the rows stay mounted and the table dims via
  `opacity-70 transition-opacity duration-200` — `ListView`'s existing `tableOpacityClass`
  treatment, now matched by the hand-rolled tables.

Applied in `MovementsTable`, `StatementsTable`, `ReconciliationListTable`,
`ReconciliationSplitPanel` (`renderRows` + `PanelTable`) and, generically, in `ListView`'s
`ownScroll` branch — which forwarded `hook.loading` unconditionally and so made the Cuentas grid
the worst offender, since `DataTable` renders `loading` as a full-table skeleton with no row-count
check of its own. That `ListView` fix benefits any window using `tableOwnsScroll`, not just this
one.

**The bar that says it is working.** Dimming alone is a weak signal, so a generated list also
shows a thin indeterminate sliding line above the grid. It lived inline in `ListView`, which is
why Cuentas already had it (it sits *outside* the idle list bar this window suppresses) while none
of the detail tabs did. It is now `components/contract-ui/ListProgressBar.jsx`, rendered by
`ListView` and by each tab under that same `loading && rows.length > 0` condition — Movimientos,
Extractos, Reconciliaciones, the bank split panel (spanning both columns, since the header button
reloads the whole tab), the cash close, and `ListModalWindow`. Each passes its own `testId`.

The pair is the contract: **`RefreshButton` is what the user clicks, `ListProgressBar` is what
tells them it worked.** A toolbar that adds one without the other refreshes silently.

## Payment status mapping (two states)

The movement status was reduced to **two user-facing states**: a payment is either reconciled against a bank statement (`RPPC`) or not. Every other backend `FIN_Payment.Status` code collapses into "Sin conciliar".

| Search key | Family | Label | Visual |
|------------|--------|-------|--------|
| RPPC | cleared | Conciliado | green bg `#EEFBF4` |
| everything else (RPAP, RPAE, RPVOID, RPR, PPM, PWNC, RDNC) | unreconciled | Sin conciliar | neutral gray bg `#F5F7F9` |

Full token palette in `components/financial-accounts/tokens.js` (`MOVEMENT_STATUS_TONE`, families `cleared` + `unreconciled`).
Config (family + i18n key per search_key) in `windows/custom/financial-account/movementStatusConfig.js`. Because the advanced "by conditions" filter de-duplicates by label key, the status filter dropdown shows exactly these two options.

## i18n keys

All keys prefixed `financeAccountDetail*` and `financeAccountMovements*`, added to both `en_US.json` and `es_ES.json`. Run `grep financeAccount tools/app-shell/src/locales/en_US.json` for the full list. Key groups:

- `financeAccountDetailTab*` — tab labels + placeholders.
- `financeAccountDetailKpi*` — summary strip labels.
- `financeAccountDetailIbanCopied` — IBAN-copy success toast.
- `financeAccountMovementsFilter*` — filter labels and search placeholders.
- `financeAccountMovementsStatusReconciled` / `financeAccountMovementsStatusUnreconciled` — the two movement-status labels (Conciliado / Sin conciliar). The older per-code keys (`StatusDraft`/`StatusVoided`/`StatusInTransit`/`StatusCompleted`) remain defined but are no longer mapped by `movementStatusConfig.js`.
- `financeAccountMovementsType{BPD,BPW}` — trxType labels (Cobro / Pago in es).
- `financeAccountMovementsCol*` — table column headers (`ColDocument` now labels the **Payment** / Pago column).
- `financeAccountMovementsRow*` — kebab actions + their disabled tooltips.
- `financeAccountMovementsMoreInfo` — chevron aria-label for the expandable panel.
- `financeAccountMovementsDim{Project,Costcenter,Product}` — labels for the three fixed dimensions shown in the more-info panel (other `Dim*` keys remain defined but are no longer rendered).
- `financeAccountMovementsEmpty` — empty-state message.
- `financeAccountStatements*` — all statements tab keys (search, import, column headers, status labels, dialog, toasts).
- `financeAccountStatementLines*` — all lines sub-view keys; includes the reconciled/unreconciled badge labels (`StatusReconciled` = Conciliado, `StatusUnmatched` = Sin conciliar) and the **Movimiento** column/modal copy (`ColTransaction`, `TxnChipMulti`, `TxnModalTitle`, `TxnFootSum`) — the line's reconciled movement(s).
- `financeAccountMovementsWizard*` — every label, placeholder, section title, choice card, stepper label, footer and toast/error string of the **New Movement wizard** (`NewMovementWizard/`). The wizard was fully internationalized (it previously hardcoded its Spanish copy); `movementWizardData.DIM_META` now carries a `labelKey` resolved via `ui()` instead of a literal `label`.
- `financeAccountAmountPlaceholder` — shared decimal placeholder (`0,00` / `0.00`) used by the wizard amount inputs and the manual-statement line amounts.

> **i18n allowlists.** `ImportedStatementsTab`, `StatementConfirmDialog` and `ImportStatementModal` keep per-variant config objects whose `error`/`title` values are themselves **i18n keys** (resolved later via `ui(cfg.error)`). The Schema Forge quality-gate i18n check flags those string literals as hardcoded, so each file carries an `// i18n-allowlist: [...]` comment listing the keys — they are not user-facing literals.

## Contract-driven grid columns

The window **no longer declares `layoutType: "custom"`**. The LIST is the generated page's
list branch (`ListView` + the `AccountsHeaderTable` slot); only the DETAIL is still
hand-written, reached through a wrapper that branches on `recordId`. Its grids read their
**column set, order, labels and cell renderers from `contract.json`** instead of hardcoded JSX:

- `components/financial-accounts/contractColumns.js` → `getContractGridColumns(entity)` reads `@generated/financial-account/contract.json` and returns the ordered, grid-flagged fields for an entity (`account`, `transaction`, `importedBankStatements`, `bankStatementLines`), forwarding `column`, `gridLabelKey`, `cellType` and `columnType` along with the name/label/type.
- Field-level config lives in `artifacts/financial-account/decisions.json`. Per field: `grid` / `gridOrder` (which columns and in what order), `gridLabelKey` (the header's i18n key) and `cellType` (which renderer draws the cell). Edit decisions → `make regen ONLY=financial-account SKIP_EXTRACT=1` regenerates `contract.json`; the grids pick up the change with no JSX edits.
- **`cellType` for this window resolves through `components/financial-accounts/accountCellTypes.jsx`**, a window-scoped registry (`accountName`, `accountType`, `accountCountry`, `accountBalance`, `reconcilePill`). `accountCountry` (ETP-4896 follow-up) is the **País** column, inserted at `gridOrder: 3` right after Tipo — which bumped `currentBalance` to 4 and `eTGOPendingCount` to 5. It renders `countryName`, falls back to `countryIso`, and shows an em dash for the (common) pre-ETP-4896 rows that carry no country at all; both keys are injected server-side per row by `FinancialAccountHandler.enrichRecord`, so no extra fetch is involved. It is deliberately NOT one of the shared registries: `contract-ui/listModalCells.jsx` is wired only to `ListModalWindow` (`layoutType: "list-modal"`), and `DataTable.cellRenderers.jsx` is keyed by column *type* and generic to every window, whereas these cells are account-specific (bank avatar, PSD2 affordance, chunked IBAN). What `cellType` makes declarative is the **binding** — which column gets which renderer — not the rendering itself; the cell components stay React.
- **"Por conciliar" is `eTGOPendingCount`, a stored computed column** (`EM_ETGO_Pending_Count` on `FIN_FINANCIAL_ACCOUNT`, EPL-1807 engine). It used to be an `entities.account.virtualFields[]` entry that `FinancialAccountHandler.afterHandle` injected per row — the same mechanism `payment-in`, `payment-out`, `return-material-receipt` and `return-to-vendor-shipment` still use.

  **Why it had to stop being virtual:** a value injected in `afterHandle` can only be reordered *within the page the SQL already selected* (`BATCH_SIZE = 75` + infinite-scroll `loadMore`), and NEO's generic `orderby` sorts by DAL properties, which an aggregate over other tables is not. So the column was unsortable by construction. As a physical column maintained by the engine it is a plain column read — indexable, sortable and filterable.

  Configuration: `Computation_Mode = 'S'`, `Computation_Function = etgo_account_pending_count`, `Refresh_Mode = 'S'` (synchronous — recomputed inside the same transaction just before commit, so the badge is exact the moment the user reconciles), `Computation_Sequence_Number = 10`, `AD_Reference` 11 (Integer). Four dependencies: `FIN_BankStatementLine` (walk-back to the account via `fin_bankstatement`), `FIN_BankStatement`, `FIN_Finacc_Transaction`, and a **self-dependency** on `FIN_Financial_Account.Type` — safe because the engine's `my.scd_refreshing` guard hides its own writes from the dependency triggers. Engine reference: `../modules/com.etendoerp.go/docs/STORED-COMPUTED-COLUMNS.md`; in-repo precedent `docs/plans/product-price-stock-stored-computed-columns.md` (ETP-4603).

  Becoming a real field **retired two workarounds** that existed only because `appendVirtualFields` (`resolve-curated.js`, in `schema_forge_core`) copies a closed whitelist excluding `cellType` and `gridLabelKey`: the `VIRTUAL_FIELD_CELL_TYPES` map in `accountCellTypes.jsx` is gone (`resolveCellType` is now a plain `col.cellType` read), and `window.labelOverrides` is gone (the header resolves through the normal `gridLabelKey` → `financeAccountsColPending` path). Keep those two routes in mind for any *other* virtual field, and re-read this note before adding one.

  What did **not** change: its contract `type` is still `"integer"`, and `DataTable` right-aligns header **and** cell for any column whose `type` is in its numeric set — which only ever fights the `reconcilePill` renderer, since the column never displays a raw number. `AccountsHeaderTable`'s `GRID_TYPE_OVERRIDE` still forces this one column's DataTable-facing `type` to `"string"` so it stays left-aligned like every other status cell (ETP-4764 follow-up). That override is presentation-only and does not affect sorting: `gridQuery`'s `inferSortMode` maps both `"string"` and `"integer"` to `'raw'`, so `_sortBy` carries the column key either way and the backend orders by the real integer.

  **It counts two different things, one per account type (ETP-4795), and the SQL function preserves that.** `PENDING_BY_ACCOUNT_SQL` in `FinancialAccountsPageHandler` originally had a single branch: unmatched `fin_bankstatementline` rows. A cash drawer never imports a bank statement, so for every cash account the figure was **structurally zero** — not "nothing pending", but "this query cannot see cash". It blinded three surfaces at once: the list's *Por conciliar* column, the sidebar's *Cuentas con pendientes* filter, and the Conciliación tab badge. A second branch counts unreconciled cash movements (`processed='Y'`, `fin_reconciliation_id IS NULL`, `status <> 'RPPC'`, `fa.type='C'`), so a cash account reports the movements awaiting their next close. `etgo_account_pending_count` **sums both branches** rather than `UNION ALL`-ing them, which reproduces the `Map.merge(..., Integer::sum)` the old read loop needed for an account that is cash-type *and* has imported bank statements.

  One deliberate semantic change: the old query filtered by `ad_client_id` + `ad_org_id = ANY(accessibleOrgs)`, i.e. by the *reader's* scope. A stored value is one number per account and cannot depend on who reads it, so the function has no org filter. In practice an account's statements and transactions live in the account's own org tree, so the same number comes out — verified against real data when the column was introduced.

  Both surfaces read the column, so there is a single source of truth: `AccountRow.pendingCount` comes straight from `ACCOUNTS_SQL` (appended **last** in the SELECT — `loadAccounts()` and the test's `ResultSet` stub both read by position), `buildSummary` counts `account.pendingCount > 0` for the sidebar, and `PENDING_BY_ACCOUNT_SQL` / `loadPendingByAccount` are gone. The R spec `financial-accounts-page` keeps the flat JSON key `pendingCount` (its payload is hand-built, and `useFinancialAccount` / `useFinancialAccounts` read that name); only the W spec's generic CRUD exposes it as `eTGOPendingCount`.
- Adding/removing a grid column, reordering, relabelling or changing a renderer = a `decisions.json` change, **not** a code change (a genuinely new *kind* of cell still needs a renderer added to the registry). Visibility (`editable`/`readOnly`/`system`/`discarded`) and `readOnlyLogic` also come from the contract.
- **Column widths stay in code** (`COLUMN_CHROME` in `AccountsHeaderTable.jsx`) on purpose: `decisions.json` is a semantic contract, not a stylesheet; Tailwind arbitrary values must be static in source, so a runtime `w-[${n}px]` would never compile; and `pl-[84px]` is not a width but a mirror of `NameCell`'s 44px grip + 32px avatar + 8px padding, so it is coupled to that cell body.
- **Two pieces of list chrome are props, not decisions**, because both are generic `ListView`/`DataTable` behaviours the retired page had and every other window may want:
  - `tablePaddingX=""` (passed by the wrapper in `windows/custom/financial-account/index.jsx`) cancels `ListView`'s default `px-2` on the table region. That padding would inset the slot's full-bleed rules — the one under the toolbar and the vertical one between the KPI panel and the rows — from both edges. The slot owns its inner spacing instead.
  - `rowHoverStyle="elevated"` (passed to `DataTable` by `AccountsHeaderTable`) restores the retired `AccountRow`'s hover: an opaque background plus `shadow-lg` and `z-10`, so the row reads as a raised card and its shadow spills over the neighbouring separators. The default `"tint"` is `DataTable`'s pre-existing `hover:bg-muted/50` — no other grid changes. Selection backgrounds always win over the elevated background. In this mode `DataTable` also pads its table wrapper by 24px at the bottom: that wrapper is `overflow-x-auto overflow-y-visible`, which the CSS spec computes as `auto` on **both** axes, so without the padding the last row's downward shadow (`0 10px 15px -3px` ≈ 22px of reach) is clipped away and the last row looks like it has no hover at all.
- **Reveal-on-hover affordances inside cells need the named group variant.** `DataTable` marks each row as `group/row`, not `group`, and Tailwind's `group-hover:` does not match a named group. Dropping the named variant is what made the copy-IBAN button and the drag grip silently vanish when the list moved onto `DataTable` — the exact same trap the row kebab hit. `accountColumns.jsx` and `AccountRowActions.jsx` therefore carry **both** variants (`group-hover:opacity-100 group-hover/row:opacity-100`): the named one is load-bearing, the unnamed one is cheap insurance for any future host that marks rows as a plain `group`, since jsdom can catch neither (it loads no Tailwind and computes no opacity).
- **The hand-rolled `AccountsTable` host is deleted** (ETP-4658): `AccountsTable/{index,AccountsTableHeader,AccountRow}.jsx`, their tests, the `ACCOUNT_CELL_RENDERERS`/`ACCOUNT_COLUMNS` registry and the barrel export. Nothing mounted it once the list became the generated `ListView`, and declaring `pendingCount` in the contract had left it rendering that column twice with an off-by-one `colspan`. What survives in `AccountsTable/accountColumns.jsx` is only the three cell bodies (`NameCell`/`TypeCell`/`BalanceCell`), bound to columns by `accountCellTypes.jsx`. The folder name is now a misnomer; moving the file was left out on purpose to avoid churning imports and the tests that pin its path.
- Nothing validates `gridLabelKey` or `cellType` (no rule in the pipeline validator, no whitelist). A typo'd label key renders **the key itself** on screen, because `useUI` returns the key on a miss; an unknown `cellType` falls back to DataTable's generic type renderer.
- `readOnlyLogic.js` for these fields is produced by `generate-contract.js → convertLogicToJs` (AD expression → JS). The translator handles `@Col@='v'`, `!=`, empty (`!''`/`=''`), `null` and numeric (`>0`) forms; any expression that still contains a raw `@token@` after translation is marked `evaluable:false` (never emits invalid JS). All `readonlylogic-valid` contract tests must stay green after a regen.

### Grid multi-select delete on the Cuentas list (ETP-4656 · restored in ETP-4658)

The list supports **selecting several accounts and deleting them in one action**, per
ETP-4656's scope table (*Contabilidad y Finanzas → Cuentas financieras: F ✅ · GH ✅ ·
GM ✅*, where GM = grid multi-select). It runs entirely on the **standardized generic
path** — no bespoke bulk-delete code in this window:

| Piece | Where it lives |
| --- | --- |
| Row checkboxes | `DataTable`'s own `selectable` column (its default, `true`) |
| Selection state | `ListView` (`selectedRows`, `clearSelectionCounter`, `deselectTrigger`, `deselectRowIds`) — forwarded read-only to the slot as `selectedRows` |
| Selection bar (floating `SelectionToolbar`, ETP-4972) + icon-only delete | `ListView`, portaled to `document.body`, viewport-fixed bottom-center — not part of the `AccountsHeaderTable` slot's own DOM |
| Confirm dialog + batch DELETE + 3-outcome toast | `hooks/useBulkRowDelete.jsx` → `lib/batchDelete.js` |

**How the flow behaves.** Tick one or more row checkboxes → the slot's own
`AccountsToolbar` unmounts (it reads `ListView`'s `selectedRows` prop; see the load-bearing
note below) while `ListView`'s floating `SelectionToolbar` pill appears bottom-center of the
viewport (ETP-4972 — a true `position: fixed` portal, not anchored to any scrolled element,
so it does not occupy the slot's own layout the way the retired in-flow bar did) → the
icon-only red trash button (no "(N)" count in the button itself anymore — the pill's own
counter segment shows it) opens the shared confirm dialog → on confirm one DELETE per row
goes out in parallel, then a single toast reports the outcome:

- **all succeeded** → list refetches, selection clears, toolbar comes back.
- **partial failure** → list refetches (the deleted rows disappear) and only the *failed*
  rows stay checked, so the user can retry exactly those. `ListView` keeps them checked in
  DataTable's internal Set via `deselectTrigger` + `deselectRowIds`.
- **all failed** → no refetch, selection untouched.

**"Delete" here now means a real delete (ETP-4871) — this section used to say "Delete" means
archive; that stopped being true the moment DELETE was split from archive.** The generic path
still issues `DELETE {apiBaseUrl}/{entity}/{id}` = `DELETE /sws/neo/financial-account/account/{id}`
per selected row, and that is still byte-for-byte the same endpoint
`useAccountMutations().deleteAccount(id)` calls — but that endpoint no longer soft-archives.
`FinancialAccountHandler`'s DELETE branch now re-validates `deletable` server-side and performs a
real, permanent delete when it holds, 409ing otherwise; archiving moved to its own
`PATCH {active: false}` (`archiveAccount(id)`), which the generic bulk-delete path does **not**
call. A row with any dependent record (movements, statements, reconciliations, payments, payment
proposals, journal lines, bank-file exceptions, defaulting business partners, an active bank
connection) simply lands in the "failed" bucket of the partial-failure branch above via the 409 —
same mechanics as the old open-reconciliations guard, just a stricter, real-delete gate behind it.
That equivalence with the plain per-row `DELETE` is still *why* no bespoke
`useBatchDeleteDialog` + mutation wiring was added here — unlike the **Movimientos**
and **Extractos importados** detail tabs, which are not `ListView`s and therefore must keep
their own `BulkDeleteSelectionBar` + `useBatchDeleteDialog`. (`BulkDeleteSelectionBar` was
itself migrated onto the shared `SelectionToolbar` shell in ETP-4972 — it used to render as
its own in-flow bar pinned above the tab's toolbar, the one selection bar in this window that
had been missed in the original ETP-4972 floating-pill migration; it is now the same
viewport-fixed floating pill as everywhere else, icon-only delete button, no separate X — see
`docs/ui-customization.md` §9e.)

**`isRowDeletable` (ETP-4871, generic `ListView` prop) gates the button itself for a mixed
selection.** `windows/custom/financial-account/index.jsx` passes
`isRowDeletable={(row) => row.deletable !== false}` to `AccountPage` (forwarded straight through
to `ListView` via its `{...props}` spread). `ListView` computes, on every selection change, how
many of the *currently selected* rows fail that predicate; if any do, the icon-only delete button
disables and its tooltip switches to `bulkDeleteBlockedTooltip` (generic/entity-agnostic) naming how many
are blocked, instead of letting the batch go out and resolving as a confusing partial failure. The
prop is optional and defaults to "every row is deletable" — every other `ListView` window is
unaffected. See `docs/ui-customization.md` for the full generic-prop reference.

**Two things were load-bearing to make this work, and both are easy to re-break:**

1. **`AccountsHeaderTable` must NOT pass `selectable={false}` to `DataTable`.** It did
   (hardcoded *after* the `{...props}` spread, so it won), which is exactly how the feature
   was lost: ETP-4656 built bulk delete on the retired hand-assembled
   `pages/FinancialAccountsPage.jsx`, ETP-4658 replaced that page with this slot on a
   divergent branch, and with no textual conflict the tests outlived the feature. The slot
   now leaves `selectable` at DataTable's default and forwards `{...props}` untouched so
   `onSelectionChange` / `clearSelectionTrigger` / `deselectTrigger` / `deselectRowIds`
   reach the grid. The hover quick-actions overlay stays suppressed **separately** and
   declaratively (`window.rowQuickActions.enabled: false`), since per-row actions belong to
   the trailing `AccountRowActions` column — do not conflate the two.
   The toolbar swap reads `ListView`'s `selectedRows` prop directly and **must not** mirror
   it into slot-local state via `onSelectionChange`: `DataTable` empties its internal
   selection `Set` silently from its `clearSelectionTrigger` / `deselectTrigger` effects
   without calling `onSelectionChange`, so a mirror would still read "selected" after a
   successful bulk delete or a cancel and the toolbar would never reappear.
2. **`listViewOptions.hideListBar` gates only the IDLE list bar, not the selection bar** —
   see `docs/ui-customization.md` §9c. This window sets `hideListBar: true` (its slot draws
   the whole toolbar), and while that flag also suppressed the selection bar there was no
   delete affordance to reach even with checkboxes on.

The wrapper (`windows/custom/financial-account/index.jsx`) also keeps `hidePrint` from
`decisions.json`, which covers the Printer button. The selection bar's "Vista Previa" (eye)
button was removed unconditionally from `ListView.jsx` in ETP-4644 — it no longer exists in
any window, so this wrapper no longer needs a flag for it either. Net result: the icon-only
delete button (title/aria-label "Eliminar", no visible text since ETP-4972) is the only
action in the bar besides its own built-in close button.

**Testids** for anyone writing specs against this: row `row-{id}` (its checkbox is the
`Checkbox__eb5261` inside it — DataTable does not emit a per-row select testid),
`selection-count`, `bulk-delete-selected`, and the dialog's
`DialogContent__bulk-delete` / `bulk-delete-confirm` / `Button__bulk-delete-cancel`.
The toolbar's `cuentas-toolbar` genuinely **leaves the DOM** while a selection is active
(it is unmounted, not hidden), so a `toHaveCount(0)` assertion is correct. Type filter and
search text are held in `AccountsHeaderTable` state, so they survive that unmount.

## Known deviations from the Figma frame

- **Row kebab visible on hover only** — appears via CSS `opacity-0 group-hover:opacity-100`. Figma shows it always-visible.
- **Posting status sub-label** is derived provisionally from `paymentStatus` (RPPC → "Contabilizado" / green dot, else → "Sin contabilizar" / orange dot). Will be replaced by the real `ETBR_PostStatus` field once it exists.
- **Bank logo** is the generic `AccountLogoAvatar` (icon by account type). Real brand logos (Santander/BBVA/etc.) are a future enhancement.

## Accounting dimension visibility per section — ETP-4529

The matrix's `Transacciones Cuentas Financieras` row (no header/lines split — a single
`transaction` entity): Contacto=**Siempre**, Producto=**Nunca**, Proyecto=**Por config**,
Centro de costo=**Por config**.

| Field | State |
| --- | --- |
| `businessPartner` (Contacto) | **Siempre** (revised per REVIEW/user follow-up). Raw AD `displayLogic` is the compound `@ACCT_DIMENSION_DISPLAY@ & @Trxtype@!''`. The initial pass set a blanket `displayLogic: null`, which correctly stripped `@ACCT_DIMENSION_DISPLAY@` (per scope decision #2) but also incidentally dropped the unrelated `@Trxtype@!=''` condition. Fixed: `decisions.json` now sets `displayLogic: "@Trxtype@!''"` + `displayLogicJs: "record['transactionType'] !== ''"` — only the accounting-dimension macro is stripped; the Trxtype condition survives as a plain client-evaluable function. Since it's `evaluable: true` with real `.js`, `generate-frontend.js` emits it as `displayLogic: (record) => record['transactionType'] !== ''` on the generated field — a function-based displayLogic that `EntityForm.jsx` always evaluates client-side, completely independent of the server evaluate-display / accounting-dimension config. Net effect: the field is immune to the global dimension toggle (true "Siempre") but still respects Trxtype. `Trxtype` (Transaction Type — BP Deposit / BP Withdrawal / Bank fee) is a mandatory column with a default value, so in practice this only hides the field for the brief instant before a type is set on a brand-new record. |
| `product` | **Nunca** — already `visibility: "discarded"`, no change needed |
| `project` | **Por config** — already correct: no override, raw `@ACCT_DIMENSION_DISPLAY@ & @Trxtype@!''` passes through as-is |
| `costCenter` | **Por config** — same as `project`, already correct |

`project`/`costCenter` retain the `@Trxtype@!''` condition ANDed with the dimension macro — this
is consistent with "Por config" (still config-gated) and preserves an existing, unrelated
UX-sequencing rule (don't show the field before a transaction type is picked).

**Correction:** `transaction` is not the header-equivalent entity here — the generated
`AccountPage.jsx` wires `DetailView` with `entity="account"` and `detailEntity="transaction"`,
i.e. `transaction` is the **lines/detail** entity relative to `account`. That means the
ETP-4529 follow-up fix that adds a lines-scoped `useDisplayLogic(detailEntity, ...)` call (see
`sales-invoice.md`) is exactly what covers `transaction`, not the header-scoped one. This window
has no `window.linesLayout` override (defaults to classic), so `LinesForm.jsx`'s sidebar should
mount normally and the fix should be fully effective — unlike the inlineEditable windows. This
window also uses `window.layoutType: "custom"`, so verify against a live/dev environment that
the generated `AccountPage.jsx`/`DetailView` flow (rather than a custom wrapper bypassing it) is
actually what renders the transaction detail before relying on the config gating in production.
