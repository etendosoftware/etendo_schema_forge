# Match Rule

## Intent

Use this window to maintain the catalog of **matching rules** ("Reglas de matcheo") used by Bank Reconciliation. A finance user defines, prioritizes, activates/deactivates, and removes rules that tell the reconciliation engine how to classify bank-statement lines that the standard algorithm could not link to an invoice. The business goal is fast catalog maintenance: create and edit rules in a modal, see them all in one prioritized list, and toggle a rule on/off inline without leaving the list.

## Pipeline registry (ETP-4658)

`match-rule` and [transaction-type](transaction-type.md) predate the `cli/config/regen-windows.json` convention (introduced 2026-05-14) — they were built via an older ad-hoc process and were never picked up by `make regen`/`sf-regen-all`, so they missed every generator change since, including the ETP-4520 window-access wiring below. ETP-4658 added both to the registry (`match-rule` / `24963D64E83B4543A7F6BD248CF944EE`) and ran a full DB extraction + regen. They now participate in the normal `make regen` cycle like every other registered window — no more ad-hoc handling.

## Runtime window-access gating (ETP-4520)

Because `match-rule`'s contract carries a real `window.id`, `generate-frontend.js` now emits the generic per-role gate into `EtgoMatchRuleHeaderPage.jsx` — the same `useWindowAccess`/`WindowAccessGuard` mechanism every other registered window gets (see `docs/decisions-reference.md`, "Runtime window-access gating"). A role whose `AD_Window_Access` tier for this window resolves to `"none"` gets the guard's blocked-render panel instead of the grid — before any data fetch — closing the deep-link gap where a role with no menu entry could still hit `/match-rule` directly. A `"read-only"` tier flips `window.readOnly` for this render, disabling create/edit/delete; `"full"` is unchanged. This did not require any decisions.json change — it is automatic once `window.id` is present, exactly like the 42 previously-registered windows.

## Interaction model

- Route: `/match-rule` — a single list screen. There is **no drill-in detail route**.
- Layout: `layoutType: "list-modal"` — a grid (list) plus a create/edit **modal**, rendered by the generic `ListModalWindow` component (`tools/app-shell/src/components/contract-ui/ListModalWindow.jsx`).
- Visibility: intended for the Finance menu, label "Reglas de matcheo" (`Matching Rules` in `en_US`).
- Window shape: header-only (`detailEntity: null`). The single entity is `etgoMatchRuleHeader`, backed by table `ETGO_Match_Rule`.
- Backend: **generic NEO Headless W CRUD** (persistence served from the AD tab / `ETGO_SF_FIELD`) plus a thin validation pre-hook (`MatchRuleHandler`, `@Named("match-rule")`).

## What this window should allow

- **List** all rules in a grid styled to the Figma design (Inter, white rows, `#E8EAEF` separators). Columns and their cell renderers (`cellType`, driven by the contract):
  - Prioridad — `priorityPill` (bordered neutral pill).
  - Nombre — `nameWithSubline` (bold name + a muted `→ <account>` sub-line sourced from `financialAccount`; falls back to "Todas las cuentas" when the rule has no account scope).
  - Condición — `conditionChip` (derived text `<kind>: "<pattern>"`, e.g. `empieza con: "IMPUESTO"`; kind label is i18n from `textCondition` C/S/R, pattern from `textPattern`).
  - Tipo — plain text showing the transaction type's name (FK `ETGO_Transaction_Type_ID` → `ETGO_Transaction_Type`, identifier `Name`).
  - Concepto contable — plain text (the G/L item, FK `C_GLItem_ID`).
  - Conciliaciones — `boldText` (read-only match count).
  - Activa — `toggle` (inline `PillToggle`, `PATCH`; the shared pill toggle, same component as the modal footer and the Assets window).
  - Each row also shows a left **drag handle** (visual only; drag-to-reorder is deferred) and, on hover, an **edit** (pencil), a **clone** (Copy, opt-in via `templateConfig.allowClone`) and a **delete** (red trash) icon button. Clone opens the create modal pre-filled with the row's values; delete opens a confirmation dialog, then `DELETE`s the rule.
- **Toolbar**: a **back button** ("Cancelar", navigates to the referrer), a **dropdown filter** "Todas las reglas" (filter by Active: Activas / Inactivas), an **advanced "by conditions" filter** (funnel button → `AdvancedFilterButton`, applied client-side via `applyConditions`), a **search** box ("Buscar…"), and the primary **"+ Nueva regla"** button (yellow `#FFD500` hover, like the Accounts window). Filters and search are applied client-side over the loaded rows.
- **Banner**: a dismissible info banner (`bannerKey`) explaining that rules are evaluated by ascending priority and only apply to statement lines the standard algorithm could not match.
- **Search** rules by name or pattern (local filter over the list).
- **Create** a rule via the "Nueva regla" button → modal. The modal groups fields:
  - *General*: Name* (placeholder "Ej. Comisiones bancarias"), Pattern to match* (placeholder "Ej. comisión"), Applies to ("Afecta a"; financial account, defaulting to "Todas las cuentas" when empty), Transaction type (a **user-definable** lookup — searchable selector backed by `ETGO_Transaction_Type`, with an inline **"+ New transaction type"** action that creates a record on the fly via `POST /sws/neo/transaction-type/transactionType` and auto-selects it), Accounting concept ("Concepto contable", `C_GLItem` selector), Concept condition* (Contiene / Empieza con / Regex), Priority*, **Contacto** (`C_BPartner` selector), and **Activa** (checkbox, on by default — new rules are created active).
  - *Dimensiones* (`matchRuleSectionDimensions`): Project (`C_Project`), Cost center (`C_Costcenter`), Product (`M_Product`). Each selector renders **only while its accounting dimension is active** — see "Accounting-dimension gating (ETP-4950)" below. The 1st/2nd dimension (`User1_ID` / `User2_ID`) columns this section used to list were dropped from the model in ETP-4099 and no longer exist.
- **Edit** a rule by clicking its row → the same modal pre-filled.
- **Toggle Active** inline from the grid (no modal) — a `PATCH` that flips the rule on/off.
- **Delete** a rule from the row actions.

## Reactive behavior and dependencies

- **Priority auto-seed**: opening the create modal pre-fills `priority` with `max(priority) + 10` computed in the **frontend** from the loaded list (`templateConfig.autoPriorityField`/`autoPriorityStep`). There is no backend defaults endpoint for it.
- **Scope = financial account**: `financialAccount` ("Afecta a") scopes a rule to one account, or to all accounts when left empty. Priority uniqueness is enforced **within that scope**.
- **FK selectors** (accounting concept, financial account, business partner, transaction type, and the dimensions — project, cost center, 1st/2nd dimension, product) load from the generic `/sws/neo/match-rule/etgoMatchRuleHeader/selectors/<field>` endpoints that the W contract emits — no mock catalog.
- **Transaction type (user-definable lookup)**: `transactionType` is a FK to `ETGO_Transaction_Type` (formerly a fixed `B`/`T`/`H` AD list). The selector is opt-in inline-creatable (`decisions.json`: `searchSelect`, `allowCreate`, `createSpec: "transaction-type"`, `createEntity: "transactionType"`). Creating one POSTs `{ name }` to the standalone W spec `transaction-type` (an AD window with **no menu**, exposed only for selector + create). Its `TransactionTypeHandler` pre-hook (`@Named("transaction-type")`) validates the name and derives the `Value` (search key) as an uppercase, accent-stripped slug, rejecting duplicates — HTTP 409.
- **Validation** runs server-side in the `MatchRuleHandler` pre-hook before the generic CRUD persists:
  - `textCondition` must be `C` (Contains), `S` (Starts with) or `R` (Regex) — HTTP 400.
  - `textPattern` is required — HTTP 400.
  - when the condition is Regex, the pattern is compiled and test-matched under a 200 ms cap; a pattern that fails to compile or shows catastrophic backtracking is rejected — HTTP 400.
  - `transactionType` is no longer validated against a fixed list — any `ETGO_Transaction_Type` record is accepted (referential integrity enforced by the FK).
  - `priority` is **not** required to be unique — per the functional spec it is an ordering/ranking key (the highest-priority match is the main suggestion, ties rank as alternatives), so duplicate priorities within a scope are allowed (e.g. a cloned rule may keep the source priority).
  - On a partial `PATCH` (inline Active toggle), content fields absent from the body are not re-validated.

## CRUD endpoints (generic W convention)

```
list   GET    /sws/neo/match-rule/etgoMatchRuleHeader
create POST   /sws/neo/match-rule/etgoMatchRuleHeader
update PUT    /sws/neo/match-rule/etgoMatchRuleHeader/{id}
patch  PATCH  /sws/neo/match-rule/etgoMatchRuleHeader/{id}   (inline Active toggle)
delete DELETE /sws/neo/match-rule/etgoMatchRuleHeader/{id}
```

## Engine integration (ETP-4101 / T7)

The rules maintained here are now **consumed by the bank-reconciliation automatch engine** (`MatchRuleEngine` + `AutoMatchSupport`, invoked from `ReconciliationHandler`, `@Named("bankReconciliation")`):

- Active rules for the account (specific or account-less = all), ordered by ascending `priority`, are evaluated against each pending statement line the standard Etendo algorithm could not match (invoice-backed lines are skipped). `textCondition` (`C`/`S`/`R`) is tested against the line's description + reference + partner name, reusing the same 200 ms regex guard as the validation hook.
- The first (lowest-priority) match wins; the rest rank as alternatives. A match can create a payment (G/L-item based) when the line has no counterpart, and on apply it **increments the rule's `matchCount`** — surfaced read-only as the "Conciliaciones" column here.
- This window remains catalog-only (create / list / prioritize / toggle / delete); the matching itself runs in the reconciliation surface (see `docs/generated-custom-windows/financial-account.md` → "Automatch engine (T7)").

## Dimension propagation + gating (ETP-4950)

Reported as a bug: a rule with Producto / Proyecto / Centro de costos generated a movement without
any of them, and the three fields were offered regardless of the Accounting Schema configuration.

**Propagation.** The rule's dimensions now travel all the way to the transaction Automatch creates:

1. `MatchRuleEngine.loadRules` already loaded `c_project_id` / `c_costcenter_id` / `m_product_id`
   into `MatchRuleEngine.Rule` — that part was never broken.
2. `AutoMatchSupport.buildRuleGroup` now emits them (`putRuleDimensions`) into **both** the
   `operations[]` preview entry and the `createPayment` spec, under the wire keys `projectId`,
   `costcenterId` and `productId` (the same names the New Movement wizard uses). The suggestion
   modal forwards `createPayment` verbatim, so nothing had to change in the frontend for this.
3. `ReconciliationHandler.createTransactionForRule` reads those keys and assigns them via
   `applyRuleDimensions` → `FinancialAccountTransactionsSupport.attachOptional` →
   `setProject` / `setCostCenter` / `setProduct`. The business partner now goes through the same
   helper instead of its own hand-rolled null check.
   `applyRuleDimensions` returns early when the spec carries no non-blank dimension id, so the
   tenant's dimension configuration is only queried when something actually needs it — a rule with
   no dimensions, and the difference postings in `ReconciliationDifferenceSupport` (the other caller
   of `createTransactionForRule`), issue no extra query at all.

The rule's **transaction type** (`ETGO_Transaction_Type_ID`) is deliberately NOT propagated: there
is no column on `FIN_FINACC_TRANSACTION` to hold it — the movement's own type is `TRXTYPE`
(`BPD`/`BPW`), derived from the sign of the amount. It stays a catalog attribute of the rule. Known
gap, decided out of scope for ETP-4950.

**Gating.** A dimension switched off in the Esquema Contable disappears from the rule form *and* is
never assigned to the generated movement:

- Backend source of truth: `AccountingDimensionsSupport.activeHeaderDimensions*`, which resolves the
  header-level set for document base type `FAT` — the same set the New Movement wizard renders
  (`financial-account.md` → "Dimensiones contables"), which is correct because the movement Automatch
  generates *is* a `FAT` document. It picks between the two configuration sources depending on
  `AD_Client.Acctdim_Centrally_Maintained` (`C_AcctSchema_Element` when `'N'`, Core's
  `DimensionDisplayUtility.getAccountingDimensionConfiguration` when `'Y'`), because reading
  `C_AcctSchema_Element` directly is a no-op for centrally-maintained tenants — gap K1 / ETP-4854.
- Read endpoint: `GET /sws/neo/match-rule/etgoMatchRuleHeader?action=activeDimensions` →
  `{ "response": { "data": { "dimensions": ["project", "costcenter", "product", ...] } } }`, served by
  `MatchRuleHandler.buildActiveDimensions()`. No AD registration needed — same `?action=` pattern as
  `ReconciliationHandler`.
- Frontend: generic, in `ListModalWindow`. Dimension fields are recognised from each descriptor's AD
  `column` (`lib/accountingDimensions.js`), the active set comes from
  `hooks/useActiveAccountingDimensions.js`, and a section left with no visible field is dropped
  together with its heading. No `decisions.json` change, no `make regen`, no generator change — the
  generated `fields` array already carries `column`.
- Write path: `MatchRuleHandler.stripInactiveDimensions` removes an inactive dimension from the
  request body instead of rejecting it with a 400 — the clone and edit flows pre-fill from a stored
  row that may still hold a now-inactive value, and a hard error there would be a false alarm.
- **A value stored on a rule whose dimension was later switched off is ignored, never cleared.** The
  movement is generated without it and the rule starts applying it again if the dimension is
  re-enabled.
- Everything **fails open**: an unreadable accounting configuration leaves every field visible and
  simply assigns no dimensions, rather than hiding fields or failing the reconciliation.

## Gap assessment

- Inline editing of `priority` directly in the grid is carried as a contract flag (`inlineEdit`) but the primary edit path verified here is the modal; treat in-grid priority editing as future behavior.
- The accounting concept (`C_GLItem`) selector lists every G/L item in scope.

## Manual verification

1. After the user runs `push-to-neo` + `export.database` + smartbuild and wires the menu, open `/match-rule` from the Finance menu and confirm the prioritized grid renders with the columns above and the read-only Reconciliations count.
2. Click "Nueva regla", confirm the modal opens with Priority pre-filled to `max + 10`, fill Name + Pattern + Concept condition, save, and confirm the row appears.
3. Create a Regex-condition rule with a deliberately catastrophic pattern (e.g. `((a+)+)+$` — Java 17 optimizes the single-nested form) and confirm the save is rejected with a 400 error message (shown in Spanish via `translateBackendError`).
4. Create two rules with the same Priority and the same "Afecta a" account and confirm **both are accepted** (priority is a ranking, not a unique key).
5. Toggle a rule's Active switch in the grid and confirm it persists after refresh (PATCH, no modal). Creating a rule with the modal "Activa" check on must persist as active.
6. Edit a rule by clicking its row, change a dimension under "Dimensiones" (e.g. Product), save, and confirm the change persists.
6b. Deactivate the Proyecto dimension in the Esquema Contable (General Ledger Configuration → Dimensiones) and reload `/match-rule`: the Proyecto selector must be gone from both the create and the edit modal, while Producto and Centro de coste stay. Deactivate all three and the whole "Dimensiones" section (heading included) must disappear.
7. Hover a row and click the **clone** (Copy) action: the create modal opens pre-filled with the source rule's values (same priority included); save creates an independent copy.

## Automated evidence

- `artifacts/match-rule/decisions.json` declares `layoutType: "list-modal"`, the `templateConfig` (incl. `toolbarFilters` and `backLabelKey`), the grid/modal field classification, the per-field `cellType` config (`priorityPill`/`nameWithSubline`/`conditionChip`/`percent`/`boldText`/`toggle`), the `transactionType` FK selector with inline create (`allowCreate`/`createSpec`/`createEntity`), and the `inlineToggle`/`inlineEdit` flags.
- `tools/app-shell/src/components/contract-ui/listModalCells.jsx` + `ListModalToolbarFilter.jsx` — the generic cell-renderer registry and toolbar dropdown used by `list-modal` (with `__tests__/listModalCells.vitest.jsx` and `__tests__/ListModalToolbarFilter.vitest.jsx`).
- `artifacts/match-rule/contract.json` carries `frontendContract.window.layoutType = "list-modal"` + `templateConfig`, the `etgoMatchRuleHeader` fields, and the `apiPrediction` selectors.
- `artifacts/match-rule/generated/web/match-rule/EtgoMatchRuleHeaderPage.jsx` renders `<ListModalWindow>` with the generated `columns`/`fields`/`sections`/`config`, gated by `useWindowAccess('24963D64E83B4543A7F6BD248CF944EE')`/`WindowAccessGuard` (ETP-4520/ETP-4658).
- `cli/config/regen-windows.json` — registry entry added by ETP-4658.
- `tools/app-shell/src/components/contract-ui/ListModalWindow.jsx` + `__tests__/ListModalWindow.vitest.jsx` — the generic component and its tests.
- `cli/test/generate-frontend-list-modal.test.js` + `cli/test/generate-contract-list-modal.test.js` — generator regression tests.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/MatchRuleHandler.java` — the validation pre-hook,
  the `?action=activeDimensions` read endpoint and `stripInactiveDimensions` (ETP-4950).
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/AccountingDimensionsSupport.java` — the single
  source of truth for active accounting dimensions, shared with `FinancialAccountTransactionsHandler`.
- `tools/app-shell/src/lib/accountingDimensions.js` + `tools/app-shell/src/hooks/useActiveAccountingDimensions.js`
  — the generic column→dimension mapping and the fail-open fetch used by `ListModalWindow`.
