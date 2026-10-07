# Financial Account — Account Management (ETP-4096)

> Split out of `financial-account.md` (ETP-5665) to keep each window guide under the PR
> review size limit. The window's detail view (movements, reconciliation, imported
> statements, cash close) and the unified delete rule stay in
> [financial-account.md](financial-account.md).

> This section covers the **create / edit / archive** flows introduced in ETP-4096. The detail view (movements, reconciliation, statements) is documented in `financial-account.md`.

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

- Flag-area input field: left side shows the country flag (`BANK_COUNTRIES`, Spain only for now) + `<ChevronDown>` in a border-right box; right side is a plain `<input>` that filters the bank list by name.
- Bank source: the live Salt Edge provider catalog for the selected country (`useBankConnectionActions().fetchProviders(country)` → `GET ?action=providers`). While it loads, a skeleton grid is shown; when the call fails or returns nothing (e.g. no PSD2 API key) the picker falls back to the static `bankCatalog.js`.
- Bank grid: 3-column, `gap-5` (20 px), 124 px cards. A Salt Edge provider card shows the provider's `logoUrl` as a 40 px `<img>`; a static-catalog bank (no logo) shows the `<Landmark>` placeholder.
- Picking a Salt Edge provider goes straight to the form (providers have no institution sub-list); picking a static-catalog bank goes to INSTITUTION.
- **The picked provider — including its logo — is stored on submit (ETP-5521), for bank and card accounts alike** (both go through this picker; cash never reaches it). `handleCreate` adds `providerCode`, `providerName` and `providerLogoUrl` (`selectedBank.logoUrl`) to the create payload; `useAccountMutations.toDalBody` forwards `providerLogoUrl` only when it is non-blank. On the backend `FinancialAccountHandler.enrichProvider` upserts the shared `PSD2_PROVIDER` row and links it via the `psd2Provider` FK, so the Cuentas list and the account header render the bank logo (`providerLogoUrl`, `LEFT JOIN` in `FinancialAccountsPageHandler`) instead of the placeholder. The client-sent logo is only trusted to **fill a missing logo**, and only from the Salt Edge logo CDN — it never replaces a logo already stored. See "Provider memory" below for the trust model. Static-catalog banks carry no Salt Edge code, so nothing is sent for them.
- "Continue without selecting a bank" link skips BANK → FORM with `selectedBank = null`; no provider keys are sent.

### Institution step (INSTITUTION step)

- Top section displays the selected bank's name in the same flag-area input used in BANK (read-only `<span>` instead of `<input>`).
- Institution list: `gap-4` (16 px) rows; each row has a 24 px circular avatar, institution name, and `<ChevronRight>`. Clicking any row advances to the form.
- There is **no** "Añadir · Sin conexión" row — the user is already in the offline flow.

### Account form (FORM-BANK / FORM-CASH)

- Bank mode fields: Name (required), Country (required, ETP-4896, see below), IBAN (optional, validated with `validateIban` + country-aware `validateIbanForCountry`), BIC/SWIFT (optional), Currency (required, populated from `fetchDefaults()` — restricted server-side to EUR/USD/GBP, see "Currencies" below). The currency field is `CreatableSearchSelect` (`@/components/contract-ui/CreatableSearchSelect`) with `staticOptions`, the same chip-style FK picker used across the app (Contacto, Tarifa, Dirección) and already used by `EditAccountModal.jsx`'s `statementGrouping` field: searchable text input while unselected, a removable `SelectorChip` (ISO code + ×) once a currency is chosen, click the chip to search again. Country uses the same `CreatableSearchSelect` component but in `serverSearch` mode over the live `C_Country_ID` selector (239 active countries, unlike the fixed ~3-currency list) — pre-filled with the organization's country, one-shot guarded (`countryDefaultedRef`) so it never snaps back after the user clears it. The chip label is the matching `countryIbanRules[].name` (`displayValue={selectedCountry?.name}`), localized to the request language since ETP-5579 ("España" in es_ES, base name when the country has no translation) — see "`countryIbanRules` catalog" below.
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
`countryIbanRules`-backed IBAN cross-check as the New Account form. Its initial label comes from
`account.countryName`, which is localized to the request language since ETP-5579 ("España" in
es_ES, "Spain" in en_US; base name when the country has no translation) — see the
`financial-accounts-page` guide's "Backend contract".

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
  country was already empty and simply never touched during this edit — unless the IBAN itself is
  edited (ETP-5473: the backend no longer derives the missing country from the IBAN, so an edited
  IBAN on a country-less account needs a Country before Save).
- **Currency** is editable only while the account is **both** not bank-connected **and** has no
  registered transactions yet (ETP-4530). `hasTransactions` is a server-computed flag (not a real
  AD column) injected into every account row by `FinancialAccountsPageHandler` (the handler behind
  `/sws/neo/financial-accounts-page`, which both the Cuentas list and the detail view's
  `useFinancialAccount`/`useFinancialAccounts` hooks read) and, for completeness, also by
  `FinancialAccountHandler.afterHandle` on the generic `/sws/neo/financial-account/account` GET
  path (MCP `etendo_list`/generic CRUD consumers). This is a **different, stricter** condition than
  `bankConnected`: an offline (never-connected) account can still accumulate real movements
  (manual statements, funds transfers), and the currency must lock the moment that history exists
  so past balances and journal entries stay consistent. `useAccountFields` exposes this as
  `fields.currencyEditable`.
- **Connection block** (General tab, non-cash only): connected → live bank connection panel (provider, Sync
  now, Import from/to dates, Statement grouping, re-authorization banner) + a Disconnect footer
  button; not connected → a single "Connect bank" button.
- **Import date range** (ETP-5104). `Importar desde` / `Importar hasta` are validated as a pair by
  `isImportRangeInvalid`, which compares the ISO `yyyy-mm-dd` strings `DateInput` emits — in that
  format lexicographic order is chronological order, so the check is exact and timezone-free and
  deliberately does NOT build a `Date` (the ETP-4850 date-only shift cannot occur here). An empty
  box means "no bound" and never invalidates. An inverted range renders
  `bank-connection-import-range-error` under the three fields, disables Save, and makes
  "Sincronizar ahora" refuse to run. The bridge repeats the check in
  `handleImportSettings` (400, `The import from date cannot be later than the import to date`) for
  callers that skip the form; it validates the *resulting* pair before touching the entity, since a
  body may carry only one bound and a managed instance would be flushed at commit even after a
  rejection. That 400 is deliberately NOT mapped in `lib/backendErrors.js`: the modal is the only
  caller of `import-settings` and it refuses the range before the request fires, so the message
  cannot reach a toast — and every addition to that map lands inside a pre-existing CPD block
  (~150 homogeneous `'string': 'key'` lines, 20.8% duplication), which fails the Sonar new-code
  gate. Map it only once a surface exists that can actually surface it.

  Why it is worth guarding twice: nothing downstream catches an inverted range usefully. The PSD2
  module validates it only at synchronization time
  (`SaltEdgeConnectionHelper.validateDateRange`), and the `OBException` it throws is swallowed by
  `processProviderTransactions` and re-wrapped into
  `PSD2_ErrorRetrievingRransactionsForTheAccount` — so the user got an untranslated toast carrying
  the Salt Edge connection id and raw Java timestamps, far away from the field that caused it.
- **Provider max fetch interval** (ETP-5181). PSD2 providers publish a `max_fetch_interval` — the
  most days of history they will serve (90 under the regulation's baseline, more for some banks) —
  stored on `PSD2_PROVIDER.MAX_FETCH_INTERVAL` and browsable in the AD window **Bank Provider**.
  `GET status` now exposes it as `maxFetchInterval`, an **int**, resolved by
  `FinancialAccountBankConnectionSupport.maxFetchIntervalOf(connection)` from the active
  connection's `providerCode` — deliberately NOT from the `FIN_FinancialAccount.psd2Provider` FK,
  which is provider *memory*: it is written when an account is created offline with a bank chosen
  and survives a reconnect to a different bank until the account is relinked, so reading it would
  let the field advisory name a different number than the sync warning. The providerCode route
  reproduces `SaltEdgeConnectionHelper.findProviderMaxFetchInterval` exactly, so the two cannot
  disagree. The key sits **inside** the `connection != null` block (an account with no active
  connection cannot sync at all — `fetchAccountTransactions` throws
  `PSD2_NoActiveConnectionForAccount` before the interval check) and is **omitted**, never
  defaulted, when the provider declares no limit or stores 0.

  The SPA renders `bank-connection-import-fetch-interval-warning` as a **banner at the foot of the
  panel, stacked immediately above the re-authorization banner**, mirroring that banner's shape
  (same `--status-warning-bg` / `--status-warning-fg` tokens, same `AlertTriangle`) minus the action
  button — there is nothing to click, the fix is to edit the date in the grid above. It started life
  as one line of small print under the grid and was simply not read; a first fix (ETP-5181) promoted
  it to a banner at the TOP of the panel, and QA then read the two banners sitting at opposite ends
  as two unrelated things, so they were grouped into one block of "what you should know about this
  connection" at the bottom. It stays first of the two: it is the notice the date box directly above
  it can fix, so it stays closest to its cause. Warning tokens rather than `text-destructive`:
  nothing is wrong with the value and Save stays enabled. It shows whenever
  `importFromDate < today − N`. **Strict `<`, on ISO strings, with the bound from
  `calendarISODaysAgo` in `lib/dateOnly.js`** — the local-time `Date` constructor, so month/year
  roll over and DST cannot shift it, and never `toISOString().slice(0,10)`, which reads yesterday
  west of UTC. Strict is not a style choice: the module computes
  `daysDiff = (now − importFromDate) / 86400000` with integer division and warns on
  `daysDiff > maxInterval`, so `today − 90` against a limit of 90 does NOT warn and `today − 91`
  does. `<=` would advise a full day earlier than the sync ever warns. Derived from `form`, not
  `initial`, so it shows on open for an already-saved out-of-range date and tracks edits live.

  The advisory is **advisory**: it does not clamp the date, does not feed `saveBlocked`, and does
  not block the sync. That is deliberate, and the reason is structural — **the date range is never
  sent to Salt Edge.** `BankIntegrationUtils.buildSaltEdgeTransactionsEndpoint` sends only
  `connection_id` and `account_id` (its own javadoc records that Salt Edge ignores
  `from_date`/`to_date`); the window is applied client-side in
  `BankStatementHelper.shouldIncludeTransaction`. So an over-long range loses nothing inside the
  period that IS available, and clamping it would only destroy user intent for the day the
  provider's history deepens. The sync-side warning needed no new code: the module already
  downgrades `SUCCESS` to `WARNING` and appends `PSD2_ImportDateBeyondMaxInterval`, which
  `lib/backendErrors.js` already translates — ETP-5181 only changed the toast **type** from
  `toast.info` to `toast.warning` in `notifySyncResult` and in `ImportedStatementsTab`, since a
  WARNING is something the user has to act on. QA then rejected the *copy*: "sólo pueden estar
  disponibles los movimientos de ese período" left it ambiguous whether the sync would still run, so
  `backendError.psd2ImportDateBeyondMaxInterval` now states the outcome — "**sólo se sincronizarán**
  los movimientos de ese período" (en_US: "only transactions from that period **will be
  synchronized**"). Only the locale value moved; the matcher in `lib/backendErrors.js` keys off the
  **English AD_MESSAGE text**, which is unchanged, and `{days}` must keep appearing exactly once
  (`useUI` replaces only the first occurrence). Known gap: the same branch in
  `AccountsHeaderTable.jsx` is being rewritten on the ETP-5140 branch and was left untouched here
  to avoid a conflict.

  Caveat worth knowing: `fetchAndRegisterProvider` upserts a **hard-coded 90** when the Salt Edge
  provider-details call fails, so the advisory can confidently cite 90 for a bank that actually
  offers more. Pre-existing, and shared with `AisConnectionCallback` in the PSD2 module, so both
  connect paths agree — fixing it means making the fallback `null` on both sides, which is a
  separate change.
- **Re-authorization banner tone** (ETP-5181 QA). `bank-connection-edit-reauth-banner` is
  **informational blue by default and only turns amber inside the last 7 days** before the consent
  lapses (`buildReauthTone`, `REAUTH_WARNING_DAYS`; the tone is also published on the banner as
  `data-tone` so a test can assert it without reading Tailwind classes). A PSD2 consent lasts ~90
  days and this banner is on screen for every one of them, so the amber treatment it used to carry
  unconditionally was permanent — which is what makes a warning stop being read, and what left the
  genuinely time-critical fetch-interval notice stacked next to it competing with a wall of yellow.
  Same call product already made for the credit-limit notice in `contract-ui/BlockingBpBanner.jsx`
  (info/blue, not warning/amber), and the icon follows the tone — `Info` on blue, `AlertTriangle` on
  amber — so a triangle never sits on a blue background. An **expired** consent
  (`daysUntilExpires <= 0`, the `…ReauthExpired` copy) falls under the same comparison and stays
  amber: sync is already broken at that point. A non-numeric `daysUntilExpires` (the bridge
  published no countdown) stays informational rather than guessing at urgency. The two banners share
  `BANNER_TONE_CLASSES`, whose entries are whole literal class strings — Tailwind's scanner only
  sees literals, so a `bg-[var(--status-${tone}-bg)]` template would emit no CSS at all.
- **"Sincronizar ahora" saves first** (ETP-5104). The button persists the whole form — the same
  `persistAccountEdits` call "Guardar cambios" makes, via the shared `persistAll()` — before it
  calls the bridge `sync` action, and does NOT close the modal afterwards. Before the fix it synced
  straight away: the bridge reads the date range from the DB, so an unsaved range was silently
  ignored, and the `refresh()` that follows a sync rewrites both `form` and `initial` from the
  server, overwriting whatever the user had typed ("los campos se restablecen"). Wiring note: the
  save step reaches `useBankConnection` as a **ref** (`beforeSyncRef`), because that hook is
  declared before the hooks holding the rest of the form. If the form cannot be saved (blank name,
  invalid IBAN/tolerance/range) the sync is aborted rather than run against stale values, and a
  failure is reported once — `runSync` skips its own toast for an error flagged `handled`.
- **Save** persists every changed field across both tabs in one call: account fields via
  `updateAccount(id, payload)`, bank import settings via the bridge `import-settings` action, and
  (ETP-4530, extended ETP-4872) the accounting configuration via `saveAccountingConfiguration`.
  Enabled purely on `dirty && !saving && !saveBlocked`, where `saveBlocked` is
  `fields.name.trim() === '' || fields.ibanInvalid || recon.amountToleranceInvalid ||
  bankConnection.rangeInvalid` (ETP-5104 added the last term and split the predicate out so the
  sync path can reuse it) — **no accounting field can block Save** (ETP-4872 dropped the
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

**"Clears it" only became true in ETP-5305 — do not remove the `isNull` guard.** The clearing
half of the contract above was broken from the start: `applyCombination` read each key with
Jettison's `optString(field, null)`, which for an explicit JSON `null` returns the **literal
4-character string `"null"`**, not a Java `null` (the parsed value is the `JSONObject.NULL`
sentinel, and `optString` hands back its `toString()`). That string was then looked up as an
accounting-combination id, so every save died with `Accounting combination not found: null`.
Because `EditAccountModal.jsx` always sends all 9 keys — and `clearedPaymentAccount`/
`clearedPaymentAccountOUT` are `null` **by design** since ETP-5207 — this made the Contabilidad
tab unsaveable for *every* account, not just accounts with a blank field (QA case OF-24). The fix
tests `body.isNull(field)` before falling back to `optString`. Note the guard must stay *inside*
the existing `body.has(field)` check: `isNull` is also `true` for an absent key, so hoisting it
would turn "leave untouched" into "clear". Same root cause and same fix as
`FinancialAccountCountrySupport.bodyString` on the General tab of this window.

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
| `clearedPaymentAccount` / `clearedPaymentAccountOUT` | always empty for every type — **explicitly cleared** (ETP-5207) | | |

**Why the cleared pair is `set…(null)` and not simply omitted (ETP-5207).** Core's `AFTER INSERT`
trigger `FIN_FINANCIAL_ACCOUNT_TRG` (`src-db/database/model/triggers/`, lines 53-65) creates the
`fin_financial_account_acct` row *before* this code runs and seeds **both** underlying columns
(`FIN_IN_CLEAR_ACCT` / `FIN_OUT_CLEAR_ACCT`) with the ledger's asset account — `B_Asset_Acct`, or
`CB_Asset_Acct` for a Caja account, i.e. `57200000` on a PGC-España chart. Since `findOrCreateRow`
*finds* that row, "not setting" the fields is **not** the same as "leaving them empty": the original
ETP-4872 implementation only ever assigned, so the trigger's value survived. The trigger is core and
must not be modified, so `applyDefaultsForType` now ends with an unconditional
`row.setClearedPaymentAccount(null); row.setClearedPaymentAccountOUT(null);`.

**Functional consequence, deliberate.** `DocFINReconciliation` queues a transaction for posting only
when the relevant account is non-null (`#getDocumentConfirmation`), so with both columns empty a
reconciliation is simply **not posted** (`STATUS_DocumentDisabled`) instead of generating the
accounting entries that were distorting Sumas y Saldos and Libro Mayor. This covers the `CLE`
upon-clearing path (the seeded **"Recibo"** method carries `INUPONCLEARINGUSE`/`OUTUPONCLEARINGUSE`
= `CLE` and is auto-assigned to Banco and Tarjeta accounts) **and** the GL-item `BPD`/`BPW` and
bank-fee `BF` paths — note that includes GO's own cash-close *difference* postings, which therefore
no longer reach the ledger. Payments and transactions are unaffected: all four seeded payment
methods use `UPONDEPOSITUSE=DEP` / `UPONWITHDRAWALUSE=WIT`, and that path reads the deposit/
withdrawal accounts, which are still filled.

Both fields stay **user-editable** in the Contabilidad tab (a different handler,
`FinancialAccountAccountingHandler`, which writes whatever the user chose). Only the value they are
*born* with changed — a tenant that genuinely runs a `CLE` payment method can still fill them
deliberately. The two sibling fronts are `OnboardingAccountingWiringService`'s
`FIN_FINANCIAL_ACCOUNT_ACCT_SQL` (new tenants) and data-fix
`R34-fin-account-cleared-payment-accounts` (already-provisioned tenants).

### New-account provisioning: one seam, two creation paths

**`FinancialAccountSupport.provisionNewAccount(account)` is THE single entry point for everything a
newly created financial account must receive.** It does exactly two things today —
`assignDefaultPaymentMethods` then `applyDefaultAccountingConfiguration` — and both creation flows
call it and nothing else:

| Path | Who inserts the record | Provisioning | Path-specific extra |
|---|---|---|---|
| Manual ("sin conexión") | generic NEO CRUD, from the request body | `provisionNewAccount` from `FinancialAccountHandler.afterHandle`'s POST branch | — |
| Bank connection (CONNECT ACCOUNT / Salt Edge) | `FinancialAccountSupport.createAccount`, from the Salt Edge account node | `provisionNewAccount` from `FinancialAccountBankConnectionHandler.handleCreateAndLink` | Salt Edge linking (`linkAccount`), after provisioning |

**Adding a new default? Put it in `provisionNewAccount` (or in the support class it delegates to) —
never inline in a handler.** Anything every new account needs reaches both flows automatically from
there. Path-specific work stays in its handler.

> **Why the seam exists: this duplication drifted twice, and shipped both times.** ETP-4872 added
> `applyDefaultAccountingConfiguration` to the manual path only. ETP-5207's first pass then fixed
> the cleared-payment defect on the manual path only — and QA immediately found that an account
> created through **CONNECT ACCOUNT** still came up with both cleared fields set to `57200000`,
> because `handleCreateAndLink` built the account itself (its `flush` fires the trigger) and called
> only `assignDefaultPaymentMethods`, under a comment claiming to "mirror the manual flow" while
> being half a mirror. That same gap also left the trigger's cruder per-type mapping in force on
> that path: the trigger uses `B_Asset_Acct` for anything that is not type `'C'`, so a **connected
> Tarjeta** account was getting `57200000` for deposit/withdrawal instead of ETP-4872's `57210000`.
> Both defects disappear once the path routes through the shared seam. Test layering that keeps this
> honest: the two handler tests assert each handler calls `provisionNewAccount`, and
> `FinancialAccountSupportTest` asserts `provisionNewAccount` performs both steps — neither level
> alone is sufficient, which is exactly how the original bug hid.

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
navigates back to `/finance/accounts` — today only a redirect to `/financial-account`, the
Cuentas list (there is no reason to stay on the detail page of an
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
- **Provider memory:** creating a bank **or card** account offline with a real Salt Edge provider
  selected stores that provider on the FA (`psd2Provider` FK, metadata only — the account stays
  offline). `FinancialAccountHandler.supportsProvider` accepts types `B` and `CA`; a cash (`C`)
  create ignores the provider keys and only strips them. This matches the online link, which
  already sets `psd2Provider` on any linked account regardless of type. A later
  connect then preselects that bank, so the Salt Edge widget skips the bank picker.
  - **The provider logo is stored too (ETP-5521) — fill-only, Salt Edge CDN only.** The create
    body carries a transient `providerLogoUrl`. Because it comes from the client and
    `PSD2_PROVIDER` is **shared across tenants by provider code**, `FinancialAccountHandler` treats
    it as untrusted:
    1. `sanitizeProviderLogoUrl` keeps it only when it is non-blank, at most 255 chars (the column
       size) and parses with `java.net.URI` as `https` (case-insensitive), no user-info (so
       `https://<cdn-host>@evil.tld` is rejected), default port, and a host in
       `TRUSTED_PROVIDER_LOGO_HOSTS` — today only `d1uuj3mi6rzwpm.cloudfront.net`, the Salt Edge
       logo CDN every stored `LOGO_URL` points at (`/logos/providers/<cc>/<code>.svg`). Anything
       else becomes `null`.
    2. `fillOnlyLogo` then passes it to `ProviderCatalogUtils.upsertProvider(code, name, null, logoUrl)`
       **only when the provider does not exist yet or its stored `LOGO_URL` is blank**; otherwise
       it passes `null`, so an existing logo is never replaced. (`upsertProvider` itself overwrites
       with any non-blank value — that is what `SyncBankProviders` relies on — so the fill-only
       guard lives in the handler, not in the utility.)
    
    An unusable logo is dropped silently; it never fails the create. The transient `providerCode` /
    `providerName` / `providerLogoUrl` keys are always stripped from the body — on create (also for
    cash accounts or without a provider code) and on update, where they are ignored entirely.
  - **Remediation for accounts created before ETP-5521:** those created a `PSD2_PROVIDER` row
    without a logo, so their row shows the `<Landmark>` placeholder. The catalog is shared per
    provider code and fill-only still writes a blank row, so the logo heals on its own the next
    time any offline account is created with the same bank, or immediately by running the psd2
    `SyncBankProviders` process (which refreshes the whole provider catalog, logos included). No
    data-fix is needed.
- **Sandbox/fake banks are offered to Demo tenants only (ETP-5344).** Whether the Salt Edge widget
  lists test banks alongside the real ones is decided by `handleConnect` and passed down as the
  `includeSandboxes` argument of `SaltEdgeConnectionBuilder.createSaltEdgeConnection`, which is the only
  thing that puts `include_sandboxes` in the consent body. Two conditions, both required: the PSD2
  module's own `PSD2_ShowFakeProviders` preference must be `Y` (an operator who turns it off is
  never overridden), **and** the tenant must not carry `ETGO_TenantPlan = productive`. A tenant that
  paid for its plan is connecting its real bank and has no use for test providers; a Demo tenant
  needs them to exercise the flow without real credentials. This is the same demo/productive signal
  (`TenantPlanService#resolvePlan`) that `OnboardingForceTestModeService` uses to keep Demo tenants'
  fiscal submissions in test mode, and absence of the plan marker reads back as Demo.
  - `com.etendoerp.go` ships the System-level `PSD2_ShowFakeProviders='Y'` row (its only
    `AD_PREFERENCE.xml` entry) so the preference is on everywhere and the plan is what
    discriminates. That row carries **`SELECTED='Y'` and must keep it**: the PSD2 module ships its
    own System row at `'N'`, and two System rows with different values and no `Selected` flag make
    `Preferences.getHighestPriority` report a conflict — `isFakeProvidersEnabled()` swallows the
    resulting `PropertyConflictException` and returns `false`, which would silently disable fake
    banks for every tenant, Demo included.
  - The plan is read **live on every connect**, not cached into a preference, so upgrading a tenant
    takes effect on its next connection with no data-fix and nothing to re-run.
  - Unaffected on purpose: the offline bank picker (`BankPicker` → `GET ?action=providers`) never
    lists sandbox providers in any tenant — its middleware query omits `include_sandboxes`, and Salt
    Edge keeps sandboxes under `country_code=XF` while the picker only queries `ES`. The PIS
    (payments) flow and the `SyncBankProviders` catalog job still decide from the preference alone.
- **Sync statements:** bank-synced accounts run the PSD2 module per-account statement fetch (the
  Classic "Get Bank Statement" equivalent) from the row-hover sync icon, the kebab "Sincronizar
  ahora", the Edit modal "Sincronizar ahora", and — on the Imported Statements tab — a dedicated
  "Sincronizar extractos" button that replaces the manual import/create split-button.
- **Sync result messages are translated in the frontend, not by Core (ETP-4891, ETP-5109).** The
  bridge returns HTTP 200 with `{status, message}`, where `message` is the raw `AD_MESSAGE` text
  built by `SaltEdgeAccountLinkHelper.fetchAccountTransactions`. `com.etendoerp.psd2.bank.integration`
  ships its es_ES text in a separate `.es_es` translation module, so an environment that never
  imported that pack resolves `AD_MESSAGE_TRL` to the English string with `istranslated = 'N'` — and
  the toast reads English on a Spanish UI. The SPA therefore maps these strings itself in
  `tools/app-shell/src/lib/backendErrors.js` (`translateBackendError`), covering
  `PSD2_TransactionsObtained`, `PSD2_NoNewTransactionsFound`, the bank-error wrapper,
  `PSD2_ConnectionWentInactive`, `PSD2_ConsentExpiredReconnect`,
  `PSD2_ImportDateBeyondMaxInterval` and `PSD2_NoActiveConnectionForAccount`. Two consequences worth
  knowing before touching either side: those English strings are a **de facto wire contract** —
  rewording one on the Java side silently un-translates the toast — and because the helper can
  append several messages into one newline-joined buffer, `translateBackendError` resolves the
  string **line by line**.
- **An empty account list explains itself with a CODE, not a sentence (ETP-5179).** Connecting a USD
  Financial Account to a bank that only exposes EUR accounts used to raise the very same generic
  toast ("No se encontraron cuentas bancarias compatibles para esta conexión") as a wrong account
  type or an account already linked elsewhere, so the user had no way to learn that the currency was
  the cause. The connection *was* correctly refused — what was missing was the why.
  `handleAccounts` had chained its three filters (`filterAccountsByFAType` →
  `filterUnlinkedAccounts` → `filterAccountsByCurrency`) by reassigning one variable, so by the time
  the list came out empty the stage that emptied it was unrecoverable. Each stage now keeps its own
  array (`fromBank` → `typeFiltered` → `unlinked` → the currency-filtered result), and when the
  final list is empty `putEmptyDiagnosis` adds a machine-readable `emptyReason` to the payload —
  plus `accountCurrency` for the one reason that carries a parameter:

  | The list was emptied by | `emptyReason` | `accountCurrency` |
  |---|---|---|
  | the bank returned nothing at all | `noAccounts` | absent |
  | the Financial Account **type** filter | `typeMismatch` | absent |
  | the **already-linked** filter | `allLinked` | absent |
  | the **currency** filter | `currencyMismatch` | the FA's ISO code, e.g. `USD` |

  **Cascade rule:** the FIRST stage that emptied the list wins — `emptyReasonOf` tests
  `fromBank` → `typeFiltered` → `unlinked` in that order and falls through to `currencyMismatch`
  as the last resort (the currency filter only runs in case 1, where the FA already exists and
  therefore already has a currency). Note the bridge's order is type → already-linked → currency,
  which is *not* Classic's order (type → currency → already-linked), so a list that both the
  currency and the already-linked filter would have emptied is reported here as `allLinked`.
  Neither key appears when the list is non-empty — that branch resolves `providerName` /
  `providerLogoUrl` instead. The status code is unchanged in every case: still **HTTP 200 with
  `{accounts: []}`**, never an error.

  **Why a code and not an English message.** The obvious alternative was an `AD_MESSAGE` from
  `com.etendoerp.psd2.bank.integration`, which is what Etendo Classic does — `AisConnectionCallback`
  (lines 141-168) resolves `PSD2_NoAccountsFoundForType`, `PSD2_NoAccountsFoundForCurrency` and
  `PSD2_AllAccountsAlreadyLinked` and redirects to its own HTML error page. The bridge deliberately
  does **not**, for two independent reasons: those rows ship with `istranslated='N'`, so Core
  resolves them to their English text unless the environment happened to import the `.es_es`
  translation pack (the same trap the sync-message bullet above documents); and their `%s`
  templates never interpolate, because `OBMessageUtils.getI18NMessage` substitutes `%0` only —
  Classic works around this with a manual `msg.replace("%s", currencyCode)`. A code, by contrast,
  is translated by the SPA in all three shipped locales, with its parameter, independently of how
  Core was provisioned. And unlike the sync strings above, `emptyReason` is explicitly **not** a
  de facto wire contract of English prose: it is a stable, language-independent identifier, chosen
  precisely so this class of problem does not recur.

  **Frontend side.** `useBankConnectionActions.fetchAccounts` passes both fields through
  *without* defaulting them to `''` — the bridge omits them when there is nothing to explain, so
  `undefined` is semantic and an empty string would read as "a reason is present but unknown".
  `useBankConnectionFlow` maps them in `NO_ACCOUNTS_REASON_KEYS` /
  `noAccountsMessage(emptyReason, accountCurrency, ui)` to
  `financeAccountsBankConnectionNoAccountsCurrency` / `…Type` / `…AllLinked`, added to `en_US.json`,
  `es_ES.json` and `es_AR.json`. Two deliberate fall-backs to the generic
  `financeAccountsBankConnectionNoAccounts` label: `noAccounts` is **not** in the table (the generic
  wording already says exactly that), and a `currencyMismatch` that arrives without an
  `accountCurrency` also degrades to it, mirroring the `isNotBlank` guard on the Java side — a
  correct generic message beats a specific one rendering "cuentas en undefined". The same
  fall-through covers an unknown or absent reason, so the SPA keeps working against a backend that
  predates ETP-5179.
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

### Widget language and the waiting overlay (ETP-5102)

**The Salt Edge widget opens in the language of whoever asked.** It used to always open in
Spanish: the `attempt.locale` sent when creating the Salt Edge session was the literal `"es"` in
all three payload builders of the PSD2 module — `BankIntegrationUtils.buildAndConnect` (connect),
`BankIntegrationUtils.reconnectSaltEdgeConnection` (reconnect) and
`GenerateBankPayment.processPayment` (PIS). They now call
`SaltEdgeLocaleResolver.resolve()` (`com.etendoerp.psd2.bank.integration`), which reads
`OBContext.getOBContext().getLanguage()` and maps the Etendo code onto the widget's own locale
(`es_ES → es`, `en_US`/`en_GB` → `en`, keeping the region only where Salt Edge distinguishes it:
`es_MX → es-MX`, `pt_BR → pt-BR`, `zh_CN`, `zh_TW`). An unknown or missing language falls back to
`es`, the previous behaviour.

No frontend change and no new bridge parameter were needed: the GO locale already reaches the
`OBContext` on every NEO request, because `NeoAuthenticator.authenticateJwt` applies the SPA's
`Accept-Language` header to it (`NeoAuthenticator.java:109-111` → `NeoLanguage.applyToContext`).
Verified live: with GO in Spanish and the Classic user in *English (USA)*,
`GET /sws/neo/listmenu` carries `Accept-Language: es_ES`. **The fix therefore reaches Etendo
Classic too** — the PSD2 module is shared and depends only on Core, so it cannot tell which front
end is calling; in the AD window the widget now follows the user's AD language. Deliberate
consequence, not a side effect: it is the same bug on both sides.

> Anyone touching `SaltEdgeLocaleResolver` must keep it on Core APIs only. PSD2 declares
> dependencies on Core and the Openbravo Framework and has zero references to
> `com.etendoerp.go` — the dependency runs GO → PSD2. Reaching for GO's `NeoLanguage` helper
> would invert it and break every Classic-only installation.

**The "Conectando con tu banco…" overlay has no close button, on purpose.** `DialogContent`
(app-shell-core) always renders a Radix close X and offers no prop to suppress it, while
`BankConnectionFlowUI`'s `<Dialog open={connecting}>` is controlled with no `onOpenChange` — so
the X was rendered but inert, and Escape / outside-click are `preventDefault()`-ed as well. It is
now hidden with `[&>button]:hidden` on the `DialogContent` className, the same idiom used by
`AddPaymentModal`, `DetailView`, `NewMovementWizard` and `NewTransactionModal`. The flow is
cancelled by closing the Salt Edge popup window, which `waitForConnection`'s `popup.closed` poll
picks up within 500 ms (`useBankConnectionActions.js:70-80`), resolving `null` so nothing is
created or linked and the user can retry without reloading. Wiring the X instead would have
required an external abort handle that `launchSaltEdgePopup` does not expose.

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

`AccountLogoAvatar` renders it whenever it is present, whatever the account type (so a card
created with a provider shows the bank logo too, ETP-5521), falling back to the generic per-type
icon (unchanged default) for any account without a logo — including a logo URL
that fails to load, caught via the `<img>`'s `onError`, so a dead or 403 URL degrades to the icon
instead of showing a broken image.

In the account detail's `AccountSummaryStrip` the avatar sits in the fixed-width (364 px) identifier
block, which follows these rules (ETP-5521):

| Account | Identifier block |
|---|---|
| Bank | Avatar + "IBAN" label + chunked IBAN (em dash when none) + copy button |
| Card with masked PAN | Avatar + card-number label + masked PAN |
| Card without PAN, with a non-blank `providerLogoUrl` | **Avatar only** (the bank logo) — no label, no empty number line |
| Card with neither PAN nor logo | Hidden (no generic icon is added) |
| Cash | Hidden |

The logo-only case exists because an offline card created from the bank picker now remembers its
provider and logo but has no PAN until it is connected.

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

**ETP-4239 converted the spec from report-style (`SPEC_TYPE=R`, `?action=` routing) to a generic W (window) spec** over the core Financial Account AD window (`94EAA455D2644E04AB25D93BE5157B6D`). The `account` header entity is served by the generic NEO CRUD, with `FinancialAccountHandler` (`@Named("financialAccountHeaderHandler")`, wired via `ETGO_SF_ENTITY.Java_Qualifier`) running as a **pre/post hook** — the same pattern as `SalesInvoiceHeaderHandler`. This also makes the entity **agentic**: MCP agents can `etendo_list` / `etendo_create` financial accounts of the 3 types (Bank `B` / Cash `C` / Card `CA`).

| Operation | HTTP | URL | Notes |
|-----------|------|-----|-------|
| List | `GET` | `/sws/neo/financial-account/account` | generic list (included fields only); every row now carries `deletable`/`deleteBlockedReason` (ETP-4871) alongside the pre-existing `hasTransactions` |
| Create | `POST` | `/sws/neo/financial-account/account` | body (DAL names): `{ name, currency, country, type?, iBAN?, swiftCode? }` — `country` is required for every account type and every caller, SPA or API/MCP (ETP-5473); it is never derived from the IBAN |
| Update | `PUT` | `/sws/neo/financial-account/account/{id}` | omitting `iBAN`/`swiftCode`/`country` keys preserves stored values; sending `country: null`/blank clears it (persisted as `NULL`) except on a Bank account that keeps an IBAN, where it is rejected (ETP-5473) |
| Archive | `PATCH` | `/sws/neo/financial-account/account/{id}` `{active: false}` | soft-archive (`IsActive='N'`); 409 if open reconciliations. ETP-4871: this used to be the `DELETE` verb (short-circuited into an archive) — DELETE now does a real delete instead, see below |
| Delete | `DELETE` | `/sws/neo/financial-account/account/{id}` | **ETP-4871 — a real delete**, gated by `deletable`: every FK into `FIN_Financial_Account` is RESTRICT, so the row is only deletable with zero dependent records anywhere (movements, statements, reconciliations, payments, payment proposals, journal lines, bank-file exceptions, defaulting business partners, an active bank connection). 409 (with a human-readable message) if a dependency appeared since the row was loaded — defense-in-depth against the list-load/click race |
| Currencies | `GET` | `/sws/neo/financial-account/account/selectors/C_Currency_ID` | generic FK selector (replaces `?action=defaults` currency list); restricted to EUR/USD/GBP by `CurrencyIsoAllowlistSelectorPolicy` (a `SelectorContextPolicy` keyed on the `Currency` target entity, registered in `NeoSelectorPolicy`) — applies to every Currency TableDir selector, not just this one |
| Defaults | `GET` | `/sws/neo/financial-account/account/defaults` | generic defaults; `defaults.currency` = org currency, `defaults.country` = org country (ETP-4896, omitted entirely when it can't be resolved to a usable value — never the AD-seeded United States), with `defaults.country$_identifier` translated via `C_Country_Trl` in the request language (ETP-5579, base name as fallback); the response also carries a `countryIbanRules` sibling (see below) |

**Hook behavior (`handle()` pre-phase):**
- POST: validates `name` (required, max 60, unique per org → 409), `currency` (required, valid), `iBAN` ≤ 34 / `swiftCode` ≤ 20; normalises `type` (`'C'`/`'CA'` kept, anything else → `'B'`); then requires `country` (all types, see below) and validates the `(IBAN, country)` pair and a default `matchingAlgorithm` (first active) when absent, and returns `null` so the generic CRUD persists.
- PUT/PATCH: name uniqueness (excluding self) + a sent `country` must resolve (clearing it is only refused on a Bank account with an IBAN) + the same `(IBAN, country)` pair validation; a bare `{active}` PATCH (archive/unarchive) passes straight through since it only validates keys the body actually carries.
- DELETE (ETP-4871): re-validates `deletable` server-side and 409s if any dependency exists, otherwise performs the real, permanent delete.
- **Sub-endpoints are not account writes (ETP-5468).** Button actions (`POST /account/{id}/action/<button>`, MCP `etendo_action`), callouts and display-logic evaluation reach the hook with `httpMethod=POST` too. `handle()` and `afterHandle()` now act only when `NeoContext.getEndpointType()` is `CRUD` (or `null`, which internal callers such as batch/clone leave unset) — see `FinancialAccountHandler.isCrudRequest`. Before, every button call on `account` first ran the create validation, so an agent had to invent a unique `name` and a `currency` to get its button through, and the post-hook could provision a "new" account off an action response.
- `matchingAlgorithm` is declared `visibility: "system"` in `decisions.json` so its `ETGO_SF_FIELD` row stays **included** — required for the injected value to survive `NeoFieldFilter`. `country` is `visibility: "editable"` (ETP-4896, see below) — it was `"system"` before. `deletable`/`deleteBlockedReason` are virtual, handler-injected fields, the same shape as `hasTransactions`/`pendingCount`.

### List summary — `response.summary` and its currency (ETP-5580)

The Cuentas sidebar ("Saldo total", the per-currency breakdown, "Cuentas con pendientes") reads
`meta.summary` from **this W-spec list GET**, not from the `financial-accounts-page` R spec:
`AccountsHeaderTable.jsx` renders `<AccountsSidebar summary={meta?.summary}>`, and
`/finance/accounts` only redirects to `/financial-account`. The summary is attached as a sibling of
`response.data` by `FinancialAccountHandler.injectDerivedFields`, which calls the shared
`FinancialAccountsPageHandler.buildSummary(visible, resolveOrgCurrency())`. The R spec builds its
own summary with the same method, so the two surfaces cannot drift apart.

Before ETP-5580 `totalBalance` was the raw sum of every active account's `CurrentBalance`
regardless of currency: EUR -357.99 + USD -20.00 was shown as "-377.99 €". Shape now (aggregated
over the **active** rows of this response only, as before):

```json
"summary": {
  "totalBalance": -375.13,
  "totalBalanceCurrencyIso": "EUR",
  "totalBalanceApproximate": true,
  "missingRateCurrencies": [],
  "byCurrency": [{"currencyIso": "EUR", "total": -357.99}, {"currencyIso": "USD", "total": -20.00}],
  "pending": {"accountsWithPending": 1, "suggestionsReady": 0, "byRule": 0}
}
```

- **Target currency** — the **login organization's** functional currency
  (`NeoConversionHelper.resolveOrgCurrencyId()`, which tries the org, then its legal entity, then
  the client), exposed as `totalBalanceCurrencyIso`.
- **Conversion** — balances are grouped by currency first, and each foreign-currency subtotal is
  converted **once** with **today's** general system rate (`C_Conversion_Rate`, via core
  `FinancialUtils.getConversionRate(new Date(), from, orgCurrency, loginOrg, client)`). The
  converted total is rounded to the org currency's standard precision (HALF_UP). The figure
  therefore follows the day's rate, not the rates the movements were booked at.
- **`totalBalanceApproximate`** — `true` when at least one currency with a **non-zero** subtotal
  was converted with a rate. The sidebar marks the total with "≈" when it is set. It is `false`
  when every counted balance was already in the org currency.
- **Zero foreign subtotals are ignored** (ETP-5580 QA BUG-1). A foreign currency whose subtotal is
  exactly 0 adds nothing at any rate, so it is skipped before the rate lookup. It never makes the
  total "≈" and is never listed in `missingRateCurrencies`, because that warning would be noise.
  It still appears in `byCurrency`. Real case: on an EUR org with a USD account at 0.00, the total
  is exact.
- **`missingRateCurrencies`** — ISO codes of the currencies left **out** of the total because no
  usable rate exists. They are excluded, never summed unconverted. Two cases end up here even though
  some rate is configured:
  - **Direct direction only.** The lookup is account currency → org currency, the same as core. If
    only the inverse rate is configured (e.g. EUR → USD for an EUR org), USD is reported as missing.
  - **Login-org anchor.** Core walks from the login organization **up** to `0`, while the listed
    accounts span the whole accessible org tree. A rate defined only on a sibling or child org is
    not found, and that currency is reported as missing. This is fail-safe and accepted.
- **`byCurrency`** — unchanged: the exact, **unconverted** per-currency subtotals, including any
  currency listed in `missingRateCurrencies`.
- **No org currency at all** (none on the org, the legal entity or the client): legacy raw sum,
  `totalBalanceApproximate: false`, `missingRateCurrencies: []`, and `totalBalanceCurrencyIso` set
  to the first `byCurrency` ISO, or JSON `null` when there are no active accounts.

**Sidebar rendering** (`components/financial-accounts/AccountsSidebar/index.jsx`):

- The total is formatted in `totalBalanceCurrencyIso`. A missing, `null` or empty value is treated
  as unknown, and the sidebar falls back to the first `byCurrency` ISO, then to `EUR`. Each
  breakdown row keeps its own currency.
- When `totalBalanceApproximate` is strictly `true`, the total is prefixed with `≈ `.
- When `missingRateCurrencies` is not empty, a warning line appears under the total
  (`data-testid="balance-missing-rate"`, `financeAccountsBalanceMissingRate`), e.g.
  "No incluye: GBP (sin tasa de cambio)". Several ISO codes are joined with ", ".
- The ⓘ button next to "Saldo" (`data-testid="balance-info-button"`) opens a Radix tooltip
  (`data-testid="balance-info-tooltip"`, `financeAccountsBalanceInfo`). It explains that the total
  is in the organization currency, that accounts in other currencies, if any, are converted with
  the system rate, which makes the total approximate (≈), and that the per-currency detail shows
  the real balances.
- The total is the **full amount**, formatted with the canonical `formatCurrency(iso, total)`
  (`AccountsSidebar/balanceDisplay.js`, `buildBalanceDisplay`), e.g. "-357,99 €",
  "≈ 2.242,12 €", "46.108.698,41 €", or "$14.028.905,17" for a USD organization. There is **no**
  K/M/B compact notation in the sidebar (the dashboard's `FinancialSummaryCard` keeps it). The
  symbol side comes from the currency-format config (`C_CURRENCY.ISSYMBOLRIGHTSIDE`, loaded from
  `GET /sws/neo/currency-format`): EUR on the right, USD on the left, with the minus before the
  symbol ("≈ -$100.000.000,00"). A test or page that never loads that config puts every symbol on
  the right ("2.500,00 $"); that is not what users see.
- The size is **fixed at 30px / 32px** (`BALANCE_TYPOGRAPHY`, the original `text-[30px] leading-8`)
  and never steps down with the length of the amount, because a smaller font loses visibility.
  The sidebar does not use `getDashboardValueTypography`.
- **Overflow: ellipsis plus tooltip.** The amount renders through `TruncatedText`
  (`components/ui/truncated-text.jsx`, the same component as the breakdown rows and the list
  `BalanceCell`). The row (`data-testid="balance-total"`, `flex min-w-0`) carries the 30px size and
  bounds the width; the amount (`data-testid="balance-card"`, `min-w-0 flex-1`) ellipsises when it
  does not fit, and only then does hovering it (hover only, it is not focusable) open a tooltip
  (`data-testid="balance-card-tooltip"`) with the exact value, `≈ ` included. An amount that fits
  shows no tooltip.
- **What fits.** The usable width is 268px (292px column minus `px-3`), i.e. 268 / 30 = 8.93em.
  With Inter's approximate advances (tabular digit 0.63em; `.`, `,`, NBSP and space 0.28em; `-`
  0.4em; `≈` 0.6em; `€` 0.62em; `$` 0.6em): "99.999.999,99 €" is 8.04em (241px, fits),
  "-99.999.999,99 €" 8.44em (253px, fits), "≈ 99.999.999,99 €" 8.92em (268px, fits at the limit),
  "≈ -99.999.999,99 €" 9.32em (280px, ellipsised), "≈ -100.000.000,00 €" 9.95em (299px,
  ellipsised). So every amount under 100 million shows in full except an approximate **and**
  negative one from about 10 million up; anything larger is ellipsised with the exact value in the
  tooltip. The browser decides on the real glyphs, so an amount right at the limit may go either
  way.
- **Breakdown rows** ("Detalle de saldos por moneda", `balance-by-currency-<ISO>`) show the exact
  `formatCurrency` balance. The ISO label is `shrink-0`; the amount is a `TruncatedText`
  (`balance-by-currency-<ISO>-amount`, `min-w-0 flex-1 text-right`), so an amount that does not
  fit next to the label ellipsises and shows the exact value in a tooltip. One that fits shows no
  tooltip.
- The exact per-currency balances are in the breakdown card below the total.
- While loading, the amount shows "—" (same 30px size), with no warning line.
- Backward compatibility: an older backend that omits the new fields gets the first `byCurrency`
  ISO (or `EUR`), no `≈` and no warning. `useFinancialAccounts`'s empty summary carries the same
  neutral defaults (`totalBalanceCurrencyIso: null`, `totalBalanceApproximate: false`,
  `missingRateCurrencies: []`).

Tests:

- Backend: `FinancialAccountHandlerTest.testAfterHandleGetCrudAttachesSummarySiblingOverVisibleActiveRows`
  (converted total) and `testAfterHandleGetCrudSummaryExcludesCurrencyWithoutRate` (W spec), plus
  the `testBuildSummary*` conversion cases in `FinancialAccountsPageHandlerTest` (including the two
  `testBuildSummaryZeroForeignSubtotal*` cases) and `testLookupRateDelegatesToFinancialUtils`.
- Frontend:
  - `AccountsSidebar/__tests__/index.vitest.jsx`: total currency and fallbacks, `≈`, the
    missing-rate line, the full total in `TruncatedText`, the info tooltip.
  - `AccountsSidebar/__tests__/balanceDisplay.vitest.js`: full `formatCurrency` text with the
    `≈ ` prefix and the fixed 30px typography, under the default currency-format config.
  - `AccountsSidebar/__tests__/balanceDisplay.symbolSide.vitest.js`: the same helper with a
    realistic currency-format config loaded ("$2.500,00" for USD, EUR on the right). It is a
    separate file so the loaded module-level config cannot leak into the default-config tests.
  - `lib/__tests__/dashboardValueTypography.test.js`: the dashboard's 30/24/20px length steps
    (10 / 12 characters).
  - `components/dashboard/__tests__/financialSummaryCard-typography.test.js` (updated): it now
    exercises the real `getDashboardValueTypography` (dashboard only) instead of an inline copy, and checks
    that `FinancialSummaryCard` imports it.
  - `hooks/__tests__/useFinancialAccounts.vitest.jsx`: the new fields pass through unchanged.
- E2E: `e2e/tests/flows/finance/financial-accounts-page.mocked.spec.js` mocks the ETP-5580
  `summary` contract.
  - `sidebar aggregate values match the summary sibling of response.data` asserts the full
    total (`273.853,46 €`) and that no missing-rate line appears.
  - The "Financial Accounts list — Saldo converted total (ETP-5580)" describe covers the
    converted total, with `≈` and an unconverted breakdown, and the `balance-missing-rate` line
    for a currency without an exchange rate.

Known gaps and follow-ups (accepted, out of scope for ETP-5580):

- **E2E for the ⓘ tooltip:** the E2E covers the total, `≈` and the missing-rate line, but
  not the `balance-info-tooltip`. Vitest already covers it (`AccountsSidebar/__tests__/index.vitest.jsx`,
  "info tooltip"), so only the browser-level check is missing.
- **Spanish "B" suffix (dashboard only):** `formatDashboardCompact` uses `K`/`M`/`B` with
  `B` = 10^9. In Spanish a *billón* is 10^12, so "797,84B €" can be misread as a thousand times
  larger. For example, "87.542,31B €" means 87,542 × 10^9, which is 87.5 trillion in English, or
  87,5 *billones* in Spanish usage. A Spanish reader can take it for 87.542 *billones* (about
  8.75 × 10^16). The Cuentas sidebar no longer compacts, so this now affects only the dashboard's
  `FinancialSummaryCard`; the fix belongs in `formatDashboardCompact`.
- **Clipped total only in a hover tooltip:** when the total ellipsises, its exact value is only in
  the `TruncatedText` tooltip, which opens on **hover only**. The `TruncatedText` span has no
  `tabIndex` and cannot take focus, so the exact value of a clipped total is not reachable by
  touch or by keyboard. Those users see the ellipsised total. The breakdown below still shows the
  exact per-currency balances, but not the converted total. The same applies to a clipped
  breakdown row and to the list `BalanceCell`.
- **Movement amounts clip without a tooltip:** in the account detail's movements table
  (`MovementsTable.jsx`), the Importe and Saldo cells render `MoneyAmount` as a bare inline amount.
  A huge value is clipped by the shared `TableCell` ellipsis, and nothing reveals the rest. The
  Cuentas `BalanceCell` and the sidebar breakdown rows solved this with `TruncatedText`. The
  clean fix here is a truncate option on `MoneyAmount` itself (`components/ui/money-amount.jsx`),
  so every caller gets the ellipsis plus the exact-value tooltip, rather than wrapping each call
  site by hand.
- **Account-detail KPI strip can overflow:** `AccountSummaryStrip.jsx`'s `kpi-balance`,
  `kpi-inflows` and `kpi-outflows` render a full `MoneyAmount` in `flex-1` sections, with no
  truncation and no size step. With huge values the amounts can overflow their section.

**Manual verification.** Open **Finanzas → Cuentas** (`/financial-account`; `/finance/accounts`
redirects there) with active accounts in two currencies, e.g. EUR + USD under an EUR org:

1. With a USD → EUR `C_Conversion_Rate` valid today on the login org or one of its ancestors, the
   sidebar total is in EUR, shows "≈", and is the full amount at 30px, which equals
   EUR + USD × rate. With a converted total too large for the column (e.g. "≈ -100.000.000,00 €")
   it ellipsises; hover it and the tooltip shows the exact value. The breakdown still lists both currencies, exact and
   unconverted.
2. Delete or expire that rate and reload. The total now counts only the EUR accounts, without "≈",
   and the line "No incluye: USD (sin tasa de cambio)" appears under it. The list GET response
   (DevTools → Network) carries `"missingRateCurrencies": ["USD"]`.
3. Archive the USD account. It drops out of the total, the breakdown and `missingRateCurrencies`.
4. Leave the USD account at a 0.00 balance (with or without a rate). The total is exact: no "≈"
   and USD is not in `missingRateCurrencies`, but it is still listed in the breakdown.

### Country field + IBAN↔country validation (ETP-4896)

`C_Country_ID` used to be backend-only: `FinancialAccountHandler` derived it from the IBAN's ISO prefix and silently overwrote whatever was there, so a Cash/Card/IBAN-less-Bank account was always left with no country and no way to set one, and Salt Edge-connected accounts could never disagree with their own IBAN. Country is now a normal, always-editable field — required on create by `NewAccountWizard`/`AccountFormStep` (all three account types) and, since ETP-5473, by the backend for every caller. `EditAccountModal` does **not** require it: it can be cleared on edit except on a Bank account that keeps an IBAN (the backend applies the same rule) — pre-filled with the active organization's country (`defaults.country` above) but never locked, unlike Type/Currency which lock once the account has transactions or a bank link.

- **Server-side country rule (ETP-5473)** — the backend now mirrors the UI exactly (the New Account form on create, `EditAccountModal` on update), so an API/MCP caller can no longer create an account the UI would refuse:
  - **Create** (Bank, Cash and Card alike): a missing, `null` or blank `country` → 400 `Country is required`; an id that does not resolve → 400 `Invalid country`.
  - **Update**: a `country` id that does not resolve → 400 `Invalid country`. Sending `country: null` or blank **clears** it, and the handler normalizes the value to JSON `null` so it persists as `NULL`, never `''`. That is allowed for Cash and Card accounts and for a Bank account whose effective IBAN (the body's, else the stored one) is blank. On a Bank account that keeps a non-blank IBAN it is rejected with 400 `A bank account with an IBAN must have a country.`, the same rule `EditAccountModal` enforces client-side (`missingCountry` → `financeAccountsNewCountryRequiredForIban`). A PUT/PATCH that carries neither `iBAN` nor `country` skips all of this, so legacy rows stored without a country (seed data, pre-ETP-4896 accounts) keep accepting unrelated edits (rename, tolerances, archive, …).
  - **No IBAN→country derivation**. Until ETP-5473 a body carrying an IBAN but no country got its country filled in from the IBAN prefix (a fallback kept by ETP-4896 for API/MCP callers). The UI never derived it, so the backend no longer does either. A create with an IBAN and no country is rejected with `Country is required`. A PATCH that adds an IBAN to a legacy Bank account with no stored country, without sending a country in the same body, is rejected with `A bank account with an IBAN must have a country.`.
  - Both messages are translated in the SPA through `lib/backendErrors.js`: `Country is required` → `backendError.countryRequired` (new), and `A bank account with an IBAN must have a country.` → `backendError.countryIban` (existing). See the "Backend error messages are translated in the SPA" note under "Not implemented yet". The New Account form requires Country, so it never reaches `Country is required`. `EditAccountModal` pre-checks the IBAN-without-country case (`financeAccountsNewCountryRequiredForIban`, blocks Save). That check fires when Country is actively cleared during the edit, **or** when the IBAN is edited while Country is empty (a legacy country-less Bank account). A rename-only edit of such an account leaves the IBAN untouched and still saves. The backend messages remain the safety net for what slips past (a stale/empty `countryIbanRules`, a race with another tab).
  - **API/MCP callers:** when updating the IBAN of a Bank account whose stored record has no country, send `country` in the same body. A full-record PUT that re-sends the IBAN without a country is rejected with `A bank account with an IBAN must have a country.`
  - No data-fix: existing accounts stored without a country are left as they are.
- **Validation** (`FinancialAccountCountrySupport.validateIbanCountryPair`, Java) runs whenever the body touches `iBAN` or `country` on a Bank account with a non-blank effective IBAN, mirroring trigger `FIN_FINANCIAL_ACCOUNT_TRG2`'s own `IF (:NEW.TYPE='B') ... IF (:NEW.IBAN IS NOT NULL)` guards so Cash/Card accounts and IBAN-less Bank accounts are never rejected. A mismatched pair now returns a **readable 400** instead of the trigger's raw `@20259@`/`@20257@`/`@COUNTRY_IBAN@` message, which `NeoErrorSanitizer` would otherwise flatten into a generic 500. The frontend runs the same checks client-side first (`@/lib/countryIban.js`'s `validateIbanForCountry`, mirrored against the `countryIbanRules` catalog) so the 400 is a safety net, not the primary UX.
- **`countryIbanRules` catalog**: only ~45 of the 243 seeded countries carry IBAN metadata (`IBANCOUNTRY`/`IBANNODIGITS` on `C_Country`); the other ~198 (e.g. Argentina, United States) have none. For those, `validateIbanForCountry`'s prefix/length checks are **skipped, not failed** — only mod-97 applies — because the function receives an already-resolved catalog *row* and cannot tell "no country picked yet" from "picked one with no metadata". But the DB **does** reject an IBAN on such a country (`C_GET_IBAN_DISPLAYED_ACCOUNT` folds the null-metadata case into the same `@20259@` as a mismatch), so the QA follow-up added `countryLacksIbanConfig(countryId, countryIbanRules)`: callers synthesize a `noIbanConfig` error code from it, the same out-of-band pattern already used for `missingCountry`. Its **empty-catalog guard is load-bearing, not defensive noise** — `countryIbanRules` is legitimately `[]` on a non-ok `/defaults`, a network throw, a payload without the key, and on every render before the fetch resolves (both consumers start from `[]`), so an empty catalog means "unknown, defer to the backend" rather than "no country can hold an IBAN". The catalog (`{id, iso, name, ibanPrefix, ibanLength}`) is server-cached 24h **per language** and served as a sibling of `accounts`/`summary`/`defaults` from all three read surfaces the SPA uses: the `account/defaults` response, `financial-accounts-page`, and the spec W list GET. It is **not** the country picker's option list — the picker itself is the generic, searchable `C_Country_ID` selector (`CreatableSearchSelect`, `serverSearch`), since 239 active countries don't fit a `staticOptions` dropdown the way the ~20-currency picker does. Since ETP-5579 each rule's `name` is the country's identifier translated through `C_Country_Trl` in the OBContext language (base name as fallback) — it is the text the New Account form's Country chip shows. Two consequences:
  - **The cache is keyed per language**: `IBAN_RULES_CACHE` uses `"countryIbanRules:" + NeoLanguage.currentCode()` (bounded at 32 entries, 24h TTL). Before, a single JVM-wide entry meant the first language to fill it was served to everyone for 24h.
  - **Ordering contract**: rules are ordered by the **base** (untranslated) name, not by `name`. Consumers look rules up by `id`/`iso`, so this does not matter today; anything that renders them as a list must sort client-side by `name`.
- **Changing the country on an account with a stored IBAN is not free**: the (IBAN, country) pair must stay consistent, so changing one may require changing the other — this is the real, pre-existing DB constraint, not a new restriction.
- **Salt Edge / "Conectar banco" is restricted to Spain** (ETP-4896 Test Cases 5–7). The service is contracted for Spain only, so an account whose stored country is not `ES` is never offered the connect action. The rule lives in **one** predicate — `components/financial-accounts/saltEdgeEligibility.js`'s `canConnectToSaltEdge(account)` — consumed by all three surfaces that expose the action, so they cannot drift apart:

  | Surface | Treatment | Why |
  |---|---|---|
  | `EditAccountModal` → `BankConnectionSection` | Button **disabled** + `financeAccountsBankConnectionSpainOnly` hint (`edit-account-connect-country-hint`) | The only surface where the Country field that causes it is on screen, so it is the one that explains the rule |
  | List row → `SyncStatusInline` | Link **hidden** | A bare inline affordance with nowhere to put an explanation |
  | Row kebab → `AccountRowMenu` | Item **hidden** | Matches how every other inapplicable action in that menu behaves (conditional render; the menu has no disabled-item styling) |

  Three deliberate properties: it keys off the **stored** `countryIso`, not a pending form selection — matching the acceptance criteria's "guarda el cambio", and saving closes the modal + reloads the list, so the next render already reflects it. An **unknown** country reads as *not* eligible rather than implicitly Spain, since offering a connection Salt Edge would then reject is worse than withholding it. And the rule gates **connecting only** — an account linked before the restriction existed keeps its live status, its Sincronizar/Desconectar actions and its "Borrar conexión", because nothing about it became invalid.

  Unchanged by this: `SaltEdgeAccountLinkHelper.populateBankIBANField` still reconciles a linked account's country against the IBAN Salt Edge returns and surfaces a mismatch as a **warning toast** (via `data.warning`) rather than blocking — that path now only matters for already-linked accounts, and no change was made to that helper.

Server-side IBAN/country validation helpers live in `FinancialAccountCountrySupport` (`com.etendoerp.go`), extracted out of `FinancialAccountHandler` to keep it under Sonar's method-count ceiling — same rationale as `FinancialAccountDeleteSupport`.

**MCP hook parity (ETP-4239, runtime change):** `McpToolRouter` now resolves the entity's `NeoHandler` by `Java_Qualifier` and runs `handle()` (pre, may mutate the body) / `afterHandle()` (post) around `etendo_create` / `etendo_update` / `etendo_delete` — previously MCP writes bypassed ALL entity hooks (no validation, no derivation). This applies to every W spec, not just financial-account.

**MCP delete response + unknown-id status (ETP-5474, runtime change):** `FinancialAccountHandler.deleteAccount` answers a successful account `DELETE` with `204 No Content`, which `etendo_delete` used to render as `{}` — so an agent read a successful delete as a failure. `McpToolRouter.handleDelete` now returns `{"deleted": true, "id": "<id>"}` for any handler 2xx (other than 202) with an empty body, the same shape as the generic delete path; REST and the SPA are unchanged (still 204). An **unknown** account id on `DELETE` now answers `404 not_found` ("Account not found") instead of 400; a blank id stays 400 and dependency blockers stay 409 with the reason sentence (e.g. "Cannot delete this account. This account has registered transactions. …"). No UI impact: `useBulkRowDelete`/`batchDelete` treat any 4xx as a refusal alike, and `useAccountMutations().deleteAccount` only special-cases 409. Out of scope: `guardArchive` (the `PATCH {active: false}` path) still answers 400 for a missing account. Verified live via MCP on 2026-09-28 (delete → confirmation and row gone; second delete → 404; "Caja", with transactions → 409 with reason, row kept). Platform reference: `{etendo_root}/modules/com.etendoerp.go/docs/neo-headless.md` §4.12.16.

The spec + entity + field source-data records live in `src-db/database/sourcedata/ETGO_SF_SPEC.xml`, `ETGO_SF_ENTITY.xml` and `ETGO_SF_FIELD.xml` of `com.etendoerp.go` (regenerated by `push-to-neo financial-account` + `export.database`).

## MCP / agent access to manual movements (ETP-5558)

The Movements tab's manual movements — a deposit (*Entrada*, `BPD`) or a withdrawal (*Salida*,
`BPW`) booked against a G/L item, recorded with *Nuevo movimiento* (`NewTransactionModal`) and then
edited, processed, reactivated or deleted from the row kebab (`MovementRowKebab`) — are reachable
from the MCP as **declared actions of the `account` entity**:

```
etendo_action {spec:"financial-account", entity:"account", id:<financial account id>, action, parameters}
```

| Action | Kind | Parameters (required in **bold**) | What the UI allows, and so the action |
|---|---|---|---|
| `listMovements` | read | — | the Movements list: `transactions[]` (`processed`, `posted`, `paymentId`, `transferTxnId`, …) and `totals` |
| `movementGlItems` | read | `search` | the G/L item picker |
| `createMovement` | write | **`trxType`** (`BPD`\|`BPW`), **`amount`** (> 0), **`date`**, **`glItemId`**, `description` (≤ 255), `bpartnerId`, `projectId`, `costcenterId`, `productId`, `process` (`true` = *Confirmar*; default = *Guardar*, a draft) | no bank fee, a G/L item is mandatory, the date is also the accounting date |
| `updateMovement` | write | **`movementId`** + only what changes | not on a posted movement nor on one of a payment/collection; a processed one takes only description, G/L item, contact and dimensions |
| `processMovement` | write | **`movementId`** | drafts that belong to no payment |
| `reactivateMovement` | write | **`movementId`** | processed movements; posting and reconciliation are undone first |
| `deleteMovement` | write | **`movementId`** | any status (a processed one is reactivated and removed, as *Eliminar*); never a payment's movement nor a funds-transfer leg |

The actions hand `FinancialAccountTransactionsHandler` the same body the SPA sends to
`/sws/neo/financial-account-transactions?action=…`, so the business rules are the SPA's. Before that
they check what the SPA settles in the browser: the movement must belong to the account in `id`
(404 otherwise), the row gates above (409), the form's requirements (422 naming the field), and every
referenced id must be readable by the tenant (422; the SPA's endpoint drops an unreadable one
silently). `updateMovement` merges over the movement's own values, since the endpoint has no partial
update. Each answer is the movement as it now is (`deleteMovement`: `{deleted:{…}}`). The SPA's
endpoint is unchanged. Before ETP-5558 an agent had no way to record a movement: the endpoint is a
report spec the MCP refuses, and `financial-account/transaction` refuses every MCP write — its 405
now names these actions.

**A movement is not a bank-statement line.** A movement is the account's own record of money in
or out, and it moves the balance once processed. A statement line (`createStatement` /
`importStatement` below) is what the bank reports, waiting to be matched to movements in a
reconciliation. In blind run `20261001T1949-local-a00c` an agent asked to "record a deposit" created a
statement line because no movement route existed.

**Funds transfers (*Transferir*, `FundsTransferModal`)** are declared on the same entity, `id` =
the source account:

| Action | Kind | Parameters (required in **bold**) | What the UI allows, and so the action |
|---|---|---|---|
| `transferDestinations` | read | — | the destination dropdown: active accounts other than the source, in its organization tree; between two currencies, today's system rate (what the modal prefills) |
| `transferFunds` | write | **`destinationAccountId`**, **`amount`** (> 0), **`glItemId`**, `conversionRate` (default today's system rate; required when there is none), `description` (≤ 255), `bankFeeFrom`, `bankFeeTo` | *Confirmar* needs a destination, a G/L item, an amount and, between currencies, a rate. The date is always **today**, as the modal books it |

The action sends `?action=transfer` the modal's own body, so Classic `createTransfer` books both
legs as it does for a person. A transfer cannot be deleted afterwards (each leg references the
other; *Eliminar* answers 409 on both) — it is undone with a transfer back. Classic's *Funds
Transfer* button (`aprmFundsTrans`) is now listed as withdrawn with `useInstead: transferFunds`.

**Add payment from the account is not offered — to people or agents.** The endpoint
(`?action=create-payment`, `AddPaymentService`) still exists, but its only SPA caller,
`NewMovementWizard`, has been mounted nowhere since ETP-4500 replaced it with
`NewTransactionModal`. Payments and collections are registered from the invoice
(`registerPayment`), so the MCP does not declare it either.

Posting stays on `financial-account/transaction` (`post` / `unpost`). Runtime reference:
`com.etendoerp.go/docs/neo-headless.md` §4.12.1.4 (movements), §4.12.1.5 (transfers) and §4.12.9
(differences with the SPA's route).

## MCP / agent access to bank statements (ETP-5447, ETP-5469)

Bank statements are reachable from the MCP as **declared actions of the R spec
`bank-statements`** — the same mechanism (`NeoHandler#actionContracts()`, ETP-5468) and the same
shape as reconciliation on `bank-reconciliation` (see *Reconciliation happens only through
`bank-reconciliation`* in `financial-account.md`). An agent calls

```
etendo_action {spec:"bank-statements", entity:"bank-statements", id, action, parameters}
```

and reads the catalogue (descriptions, `idDescription`, JSON-Schema parameters) with
`etendo_schema({spec:"bank-statements", view:"actions"})`.

| Action | Kind | `id` = | Engine route |
|---|---|---|---|
| `listStatements` | read | financial account (`FIN_Financial_Account`) | `GET ?FIN_Financial_Account_ID=` — the account's statements |
| `statementLines` | read | bank statement (`FIN_BankStatement`) | `GET ?action=lines&statementId=` — one statement's lines |
| `createStatement` | write | financial account (`FIN_Financial_Account`) | `POST ?action=create` — header + lines by hand; processed by default (`process:false` keeps a draft) |
| `previewStatement` | read | financial account | `POST ?action=preview` — parses a file, saves nothing |
| `importStatement` | write | financial account | `POST ?action=import` — Cuaderno 43 or the generic CSV, lands processed |
| `updateStatement` | write | bank statement (`FIN_BankStatement`) | `POST ?action=update` — drafts only; replaces the unmatched lines |
| `processStatement` | write | bank statement | `POST ?action=process` |
| `reactivateStatement` | write | bank statement | `POST ?action=reactivate` — does not reverse reconciliations |
| `deleteStatement` | write | bank statement | `POST ?action=delete` — drafts only; 409 on a PSD2-connected account, 400 while matched lines remain |

Parameters, line shape and refusals are documented once, in the runtime reference
(`com.etendoerp.go/docs/neo-headless.md` §4.12.1.2) and in the catalogue itself; this guide does not
repeat them. Both header dates (`transactionDate`, `importDate`) of `createStatement` /
`updateStatement` are **required** and never defaulted to today. The agent path also applies the
checks the UI does on the client before sending a manual statement (line date required, exactly one
positive amount, no over-long texts, known contact / G/L item ids, only the declared line keys) and
caps an imported file at 1 MiB; the SPA route keeps its current behaviour.

**Reads:** besides the `listStatements` / `statementLines` actions (the same handler methods the
Extractos tab uses), the generic `etendo_list` / `etendo_get` on `financial-account/importedBankStatements`
(statements, with their persisted `EM_ETGO_*` aggregates) and `financial-account/bankStatementLines`
(their lines) keep working — either route gives an agent a statement id.

**Where it lives (com.etendoerp.go).** `BankStatementsHandler#actionContracts()` returns
`BankStatementAgentActions.CONTRACTS`; `handle()` diverts only `NeoEndpointType.ACTION` contexts to
`BankStatementAgentActions.dispatch`, which validates the contract, requires `id`, applies the
report-spec role gate (`POST` for writes, `GET` for the reads, `previewStatement` included), and translates the call into
the exact request the SPA sends to `/sws/neo/bank-statements?action=…` (the `id` goes into the body
as `FIN_Financial_Account_ID` or `id`, and always wins over an id-like parameter, which the contract
refuses as undeclared). The engine is **unchanged**, so the required dates, the BSF document type,
the line-amount rules and the draft/processed/PSD2 guards apply identically on both paths. The SPA
is untouched: its requests carry no endpoint type and never enter the ACTION branch.

**Generic CRUD writes are blocked (405), in two layers.** Both entities are declared
`"readOnly": true` in `decisions.json` (ETP-5469), so `ETGO_SF_ENTITY` (`495659D9…`, `6EFF323F…`)
grants `GET` + `GETBYID` only and `POST` / `PUT` / `PATCH` / `DELETE` answer `405 "<METHOD> not
enabled for <entity>"` on REST and MCP (`etendo_create` / `etendo_update` / `etendo_delete`). Both also carry
`Java_Qualifier = bankStatementEntityHandler` (ETP-5447, set in `decisions.json`), so any generic write
that still reaches `BankStatementEntityHandler` answers `405` with a message naming the `bank-statements` action to use (`createStatement` /
`importStatement` with the account id, `updateStatement`, `deleteStatement`; any line write →
`updateStatement` on the line's statement); the MCP maps 405 to `method_not_allowed`. Reads (list,
get, defaults, selectors) pass through. Why: a live probe on 2026-09-25 showed the generic path
bypasses the engine entirely — a generic create stamped **today** on both header dates, a line's
date could not be set, `referenceNo` became required, and deleting a statement with lines failed
with a Hibernate cascade error because `BankStatementLineAggregateHandler` saves the parent
statement during the cascade delete. The SPA never used these paths. (Carrying a `Java_Qualifier`
also exempts the entities from `NeoFieldFilter`'s IMP-28 read-only rejection on create — moot, since
create is refused first.)

**Header dates of a file import (ETP-5447).** `?action=import` — reached by the MCP
`importStatement` action (spec `bank-statements`) and by direct REST callers, for both Cuaderno 43 and the generic CSV
(the SPA itself no longer calls it: since ETP-4954 its import parses the file in the browser and
posts `?action=create`) — stamps
`importdate` = now and `statementdate` (`transactionDate`) = the **latest `datetrx` among the lines
kept after pruning**, anchored to midnight of that calendar day in the server's timezone (the same
anchoring `parseIsoDate` applies to the dates the SPA sends). Only when no kept line has a date does
it stay today. That is the rule the SPA's CSV/Excel import already applied client-side
(`buildStatementCreatePayload` in `bankStatementImportPipeline.js`: `importDate` = today,
`transactionDate` = `periodTo`, falling back to today), so a statement lands in the same place of
the date-ordered Extractos list whichever path imported it. Before this, a live MCP test on
2026-09-25 showed `importStatement` stamping today on both dates. `newBankStatement` still starts
both as now (the lines are not parsed yet); `BankStatementLinePruner` records the latest kept-line
date while it renumbers the survivors (`PruneResult.getLatestTransactionDate`, no second read), and
`handleImport` applies it via `BankStatementsSupport.statementDateFromLastLine` **before**
`processStatement`, whose first save + flush persists it — so the statement is processed with its
real date. `?action=preview` is unchanged: it returns no statement header, only `periodFrom` /
`periodTo`, and `periodTo` is the value the import now stores.

**The classic APRM button also works over MCP now, but prefer `processStatement`.**
`etendo_action {spec:"financial-account", entity:"importedBankStatements", id, action:"aPRMProcessBankStatement", parameters:{docAction:"P"}}`
runs Classic `FIN_BankStatementProcess` after two engine fixes: `NeoButtonActionHelper.addTabParamsCore`
also passes the real key column `FIN_Bankstatement_ID` (it previously failed with *id to load is
required for loading*), and `NeoProcessService.buildBundleParams` aliases `docAction` to the
`action` key that Classic Java processes read (it previously failed with *strAction is null*). The
`bank-statements` `processStatement` action is still the recommended path: it goes through
`BankStatementsHandler`, which also recomputes the statement's `EM_ETGO_*` aggregates.

Agent prompts: `agent-prompts/financial-account/account.md` and
`agent-prompts/financial-account/importedBankStatements.md` — short pointers only (the
`bank-statements` spec and action names, reads via `etendo_list`/`etendo_get`, generic writes 405; and,
since ETP-5558, the account's movement actions and how a movement differs from a statement line). The
parameters are documented once, in the catalogue: `etendo_schema({spec:"bank-statements", view:"actions"})`.

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
| `components/financial-accounts/AccountsSidebar/balanceDisplay.js` (ETP-5580) | `buildBalanceDisplay(currencyIso, total, { approximate })` returns `{ text, style }` for the sidebar's "Saldo" total: `text` is the full `formatCurrency` value, with `≈ ` when approximate (no compact notation); `style` is the fixed `BALANCE_TYPOGRAPHY` (`{ fontSize: '30px', lineHeight: '32px' }`). `text` is both what is displayed and what the `TruncatedText` overflow tooltip shows. The file's header comment carries the glyph-width math for what fits in 268px at 30px. See "List summary — `response.summary` and its currency" above. |
| `lib/dashboardValueTypography.js` (ETP-5580) | `getDashboardValueTypography(value)` returns the inline `{ fontSize, lineHeight }` for a dashboard headline amount already in compact notation, measured on the string without a leading `-`: 12+ characters → 20px/24px, 10+ → 24px/28px, otherwise 30px/32px. Used by the dashboard's `FinancialSummaryCard` (which had the same rule inline as `getMetricValueTypography`). The Cuentas "Saldo" total does not use it: it is fixed at 30px and ellipsises instead. It is a separate module rather than part of `dashboardNumberFormat.js`, so tests that mock the formatter module still get the real rule. |
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
| ~~`bulkDeleteBlockedTooltip`~~ (generic, ETP-4871) | **Retired in ETP-5111**, together with `ListView`'s `isRowDeletable` prop. It was the tooltip on a bulk-delete button *disabled* because the selection included an undeletable row; that button is never disabled by row eligibility any more, so there is nothing left for it to explain. Removed from `en_US.json` / `es_ES.json` and from `generated/core.*`. See "Unified delete rule" at the top of this file |
| `financeAccountTransfer*` | Funds transfer modal (ETP-4272): action/title, source/destination, amount, currency-from/to, conversion rate, bank fee, description, confirm/cancel, success + validation errors |
| `financeAccountsEditTab*` / `financeAccountsAccounting*` | Edit modal tabs (ETP-4530): tab labels, section titles (`...SectionPaymentIn`/`...SectionPaymentOut`, plus the reused `financeAccountsEditTabGeneral` for Banco's General sub-section), the 9 field labels (`...BankRevaluationGain`/`...Loss`, `...BankFee`, `...InTransitIn`, `...Deposit`, `...ClearedIn`, `...InTransitOut`, `...Withdrawal`, `...ClearedOut`, ETP-4872), empty-ledger message. The retired `fINAssetAcct`/`fINTransitoryAcct` keys (`...BankAsset`, `...Transitory`, `...BankAssetRequired[Summary]`) are left in both locale files, unused, since nothing renders them anymore — pending confirmation the "no field required" behavior (ETP-4872) is final before deleting them |
| `financeAccountsNewFieldCountry` / `financeAccountsBankConnectionFieldCountry` (ETP-4896) | Country field label — New Account form and Edit modal respectively (kept separate from `financeAccountsNewBankCountry`, the unrelated BankPicker flag-dropdown `aria-label`) |
| `financeAccountsNewIbanCountryMismatch` / `financeAccountsNewIbanLengthMismatch` (ETP-4896) | IBAN validation error messages for the two country-aware checks (prefix mismatch, wrong length), shared by both forms alongside the pre-existing `financeAccountsNewIbanInvalid` (mod-97 failure) |
| `financeAccountsNewCountryRequiredForIban` (ETP-4896 follow-up) | EditAccountModal-only: shown when Country is explicitly cleared during the edit while a real IBAN remains, or (ETP-5473) when the IBAN of a Bank account with no country is edited while Country stays empty — mirrors the backend's "A bank account with an IBAN must have a country." 400 verbatim in translated form, and doubles as the backend-message fallback in `handleSave`'s catch block |
| `financeAccountsBalanceInfo` / `financeAccountsBalanceMissingRate` (ETP-5580) | Sidebar "Saldo": the ⓘ tooltip copy (organization currency, conversion at the system rate, `≈`) and the "No incluye: {currencies} (sin tasa de cambio)" warning. Also present in `es_AR.json` |
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

- **Cuentas "Saldo" total and large amounts** (ETP-5580): five follow-ups are listed under "List
  summary — `response.summary` and its currency" → "Known gaps and follow-ups":
  - an E2E check for the ⓘ tooltip (vitest already covers it);
  - the ambiguous Spanish "B" suffix of `formatDashboardCompact` (now dashboard only);
  - a clipped total being reachable only through the hover tooltip (not by touch or keyboard);
  - `MoneyAmount` clipping with no tooltip in the movements table (Importe/Saldo);
  - the account-detail KPI strip overflowing with huge values.
- **Bank connection / Connected mode** (T3): connection toggle is visible but both the "Connected" option and the Bank connection section in the edit modal are disabled.
- **Real bank logos**: `bankCatalog.js` uses `<Landmark>` as a placeholder icon for all banks.
- **Card accounts**: the CARD step shows a "Coming soon" placeholder — actual card creation requires a bank connection.
- **Bank catalog from endpoint**: `bankCatalog.js` is a static list; the component is designed so the data source can be swapped to a live endpoint without changing the layout.
- **`enablebankstatement` flag** (ETP-4530, narrowed by ETP-5305): `FinancialAccountAccountingHandler` used to set it to `true` on *every* Contabilidad save. It now only does so when the stored row already carries **both** `FIN_Asset_Acct` and `FIN_Transitory_Acct`. Forcing it unconditionally had become purely destructive once ETP-4872 retired that pair from this handler: the DB constraint `fin_finacc_acct_bsconfig_check` rejects `EnableBankStatement='Y'` when either account is null, so the save died at flush with an HTTP 500 — and Classic gained nothing from the flag anyway, since `DocFINBankStatement.getDocumentConfirmation` requires the flag *and* both accounts before it will post. Verified against the live DB: all 479 `FIN_Financial_Account_Acct` rows have the pair null and the flag `'N'`, so an A/B on the real table confirmed the old write fails the constraint and the new one succeeds. In practice the flag now stays as-is, which matches reality — bank-statement posting was never actually enabled through this tab. If the pair is ever re-exposed as editable fields, the flag starts being set again on its own, with no further change here.
- **Remaining `FIN_Financial_Account_Acct` columns** (ETP-4530/ETP-4872): `receivePaymentAccount`, `makePaymentAccount`, `creditAccount`, `debitAccount` stay `discarded` in `decisions.json` — explicitly out of scope per the ETP-4872 ticket, unlike the deposit/withdrawal/bank-fee/revaluation accounts it moved to `editable`.
- **"No field required" is an inference, not a confirmed product decision** (ETP-4872): the ticket's field tables carry no "required" marker for any of the 9 accounting fields, so the old `fINAssetAcct`-required validation was dropped entirely rather than moved to one of the new fields. This is flagged as pending product/PM confirmation in the implementation plan's Open Questions — do not treat it as permanently settled without checking whether that confirmation has since landed.
- **New-account "Con conexión" path is NOT country-gated** (ETP-4896): the Spain-only restriction applies to *accounts*, which is what Test Cases 5–7 specify ("una cuenta … tiene como país X"). In the New Account wizard's CONNECTION step no account and no country exist yet — the account is created *from* whichever bank account Salt Edge returns — so there is nothing to gate on. Consequence worth knowing: a user can still reach Salt Edge from that step and pick a non-Spanish provider via the BankPicker's country filter (`BANK_COUNTRIES` offers ES/IT/FR/DE/PT/GB/NL/BE/IE/AT). Whether that filter should also be restricted to ES is a **product decision left open**, deliberately not assumed here.
- **Backend error messages are translated in the SPA, not the backend** (ETP-4896 QA follow-up): `NeoResponse.error` carries only `{message, status}` — no machine-readable `code` — so this window routes `err.message` through the shared `lib/backendErrors.js#translateBackendError`, which recognises Etendo's English literals by text (exact-match table plus prefix/suffix matchers for the interpolated ones) and maps them to `backendError.*` locale keys. Both surfaces use it: `EditAccountModal` (which previously had its own ad-hoc one-entry table, now deleted) and `NewAccountWizard` (which previously showed raw English on create). **Consequence: the Java message literals in `FinancialAccountCountrySupport` are a de facto wire contract** — rewording one silently drops the user back to English, so its matcher and locale key must change in the same commit. The frontend pre-checks are meant to catch these before the request fires; this is the safety net for what slips past (a stale/empty `countryIbanRules`, a race with another tab, an API/MCP-shaped body). A stable `error.code` contract would be sturdier — there is precedent (`MISSING_REQUIRED_FIELDS` in `NeoCrudHandler` ↔ `useEntity`) — but it touches the wire format and its MCP/API consumers, so it stays a **follow-up option**, not part of this fix.
- **Country name inside the IBAN validation messages is not localized** (known gap, out of ETP-5579's scope): `FinancialAccountCountrySupport.validateIbanCountryPair` builds its no-IBAN-config / prefix-mismatch / length-mismatch messages as English sentences around `country.getName()`. The SPA translates the sentence (`backendError.countryNoIbanConfig` / `ibanPrefixCountryMismatch` / `ibanCountryLengthMismatch`), but the interpolated `{country}` stays the base English name ("…el país seleccionado es Spain (ES)").
- **SWIFT/BIC format validation** (ETP-4896): intentionally untouched. Classic has no SWIFT format validation either — no regex, no length check, no cross-check against country — only a presence check (`FIN_FINACC_SHOWSWIFT_CHK`) when "Using the SWIFT Code" is on, unrelated to this ticket's scope. This is why the ticket's Test Case 9 ("la validación del SWIFT se aplica según el país configurado") is not implementable as written: it asks an *existing* validation to start reading the Country field, and there is no existing rule to feed it into. The **field itself** is editable in both creation and edition (the QA follow-up added it to `EditAccountModal`); only the format rule is absent.
