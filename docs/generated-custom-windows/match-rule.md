# Match Rule

## Intent

Use this window to maintain the catalog of **matching rules** ("Reglas de matcheo") used by Bank Reconciliation. A finance user defines, prioritizes, activates/deactivates, and removes rules that tell the reconciliation engine how to classify bank-statement lines that the standard algorithm could not link to an invoice. The business goal is fast catalog maintenance: create and edit rules in a modal, see them all in one prioritized list, and toggle a rule on/off inline without leaving the list.

## Pipeline registry (ETP-4658)

`match-rule` and [transaction-type](transaction-type.md) predate the `cli/config/regen-windows.json` convention (introduced 2026-05-14) — they were built via an older ad-hoc process and were never picked up by `make regen`/`sf-regen-all`, so they missed every generator change since, including the ETP-4520 window-access wiring below. ETP-4658 added both to the registry (`match-rule` / `24963D64E83B4543A7F6BD248CF944EE`) and ran a full DB extraction + regen. They now participate in the normal `make regen` cycle like every other registered window — no more ad-hoc handling.

## Runtime window-access gating (ETP-4520)

Because `match-rule`'s contract carries a real `window.id`, `generate-frontend.js` now emits the generic per-role gate into `EtgoMatchRuleHeaderPage.jsx` — the same `useWindowAccess`/`WindowAccessGuard` mechanism every other registered window gets (see `docs/decisions-reference.md`, "Runtime window-access gating"). A role whose `AD_Window_Access` tier for this window resolves to `"none"` gets the guard's blocked-render panel instead of the grid — before any data fetch — closing the deep-link gap where a role with no menu entry could still hit `/match-rule` directly. A `"read-only"` tier flips `window.readOnly` for this render; **`ListModalWindow` ignored that prop until ETP-4950** (see below), so until then a read-only role still saw create/edit/delete and only found out on click, when NEO rejected the write. `"full"` is unchanged. This did not require any decisions.json change — it is automatic once `window.id` is present, exactly like the 42 previously-registered windows.

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
  - Cuenta contable — plain text (the accounting account, FK `C_GLItem_ID`).
  - Conciliaciones — `boldText` (read-only match count).
  - Activa — `toggle` (inline `PillToggle`, `PATCH`; the shared pill toggle, same component as the modal footer and the Assets window).
  - Each row also shows a left **drag handle** (visual only; drag-to-reorder is deferred) and, on hover, an **edit** (pencil), a **clone** (Copy, opt-in via `templateConfig.allowClone`) and a **delete** (red trash) icon button. Clone opens the create modal pre-filled with the row's values; delete opens a confirmation dialog, then `DELETE`s the rule.
  - **Multi-select + bulk delete** — a leading checkbox column (the header checkbox selects every *visible* row, and renders indeterminate while partial) plus the floating "N Seleccionados" pill with a trash action: the same affordance the Cuentas / Movimientos / Extractos lists and `ListView`'s own grid already have. See "Multi-select and read-only gating (ETP-4950)" below.
- **Toolbar**: a **back button** ("Cancelar", navigates to the referrer), a **dropdown filter** "Todas las reglas" (filter by Active: Activas / Inactivas), an **advanced "by conditions" filter** (funnel button → `AdvancedFilterButton`, applied client-side via `applyConditions`), a **search** box ("Buscar…"), the **"Ordenar por"** popover, a **refresh** icon button, and the primary **"+ Nueva regla"** button (yellow `#FFD500` hover, like the Accounts window). Filters and search are applied client-side over the loaded rows.
  - The refresh button is the shared `contract-ui/RefreshButton.jsx` (the same one `ListView` renders for a generated list, in the same slot between sort and create) wired to this window's `useNeoResource` `reload`. `ListModalWindow` draws its own toolbar, so it never inherited `ListView`'s. It is paired with `contract-ui/ListProgressBar.jsx` — the thin indeterminate line above the grid, shown under `loading && allRows.length > 0`, i.e. only while refreshing over rows already on screen. On the FIRST fetch the existing skeleton rows are the indicator instead, so the two never appear together.
- **Banner**: a dismissible info banner (`bannerKey`) explaining that rules are evaluated by ascending priority and only apply to statement lines the standard algorithm could not match.
- **Search** rules by name or pattern (local filter over the list).
- **Create** a rule via the "Nueva regla" button → modal. The modal groups fields:
  - *General*: Name* (placeholder "Ej. Comisiones bancarias"), Pattern to match* (placeholder "Ej. comisión"), Applies to ("Afecta a"; financial account, defaulting to "Todas las cuentas" when empty), Transaction type (a **user-definable** lookup — searchable selector backed by `ETGO_Transaction_Type`, with an inline **"+ New transaction type"** action that creates a record on the fly via `POST /sws/neo/transaction-type/transactionType` and auto-selects it), Accounting account ("Cuenta contable", `C_GLItem` selector), Concept condition* (Contiene / Empieza con / Regex), Priority*, **Contacto** (`C_BPartner` selector), and **Activa** (checkbox, on by default — new rules are created active).
  - *Dimensiones* (`matchRuleSectionDimensions`): Project (`C_Project`), Cost center (`C_Costcenter`), Product (`M_Product`). Each selector renders **only while its accounting dimension is active** — see "Accounting-dimension gating (ETP-4950)" below. The 1st/2nd dimension (`User1_ID` / `User2_ID`) columns this section used to list were dropped from the model in ETP-4099 and no longer exist.
- **Edit** a rule by clicking its row → the same modal pre-filled.
- **Toggle Active** inline from the grid (no modal) — a `PATCH` that flips the rule on/off.
- **Delete** a rule from the row actions.

## Reactive behavior and dependencies

- **Priority auto-seed**: opening the create modal pre-fills `priority` with `max(priority) + 10` computed in the **frontend** from the loaded list (`templateConfig.autoPriorityField`/`autoPriorityStep`). There is no backend defaults endpoint for it.
- **Scope = tenant first, then financial account**: a rule always belongs to the client and organization it was created in, and is only ever evaluated for that tenant. Within it, `financialAccount` ("Afecta a") narrows the rule to one account, or leaves it applying to **all accounts of that tenant** when empty — "Todas las cuentas" never means all accounts in the instance. Priority uniqueness is enforced **within that scope**.
- **FK selectors** (accounting account, financial account, business partner, transaction type, and the dimensions — project, cost center, 1st/2nd dimension, product) load from the generic `/sws/neo/match-rule/etgoMatchRuleHeader/selectors/<field>` endpoints that the W contract emits — no mock catalog.
- **Transaction type (user-definable lookup)**: `transactionType` is a FK to `ETGO_Transaction_Type` (formerly a fixed `B`/`T`/`H` AD list). The selector is opt-in inline-creatable (`decisions.json`: `searchSelect`, `allowCreate`, `createSpec: "transaction-type"`, `createEntity: "transactionType"`). Creating one POSTs `{ name }` to the standalone W spec `transaction-type` (an AD window with **no menu**, exposed only for selector + create). Its `TransactionTypeHandler` pre-hook (`@Named("transaction-type")`) validates the name and derives the `Value` (search key) as an uppercase, accent-stripped slug, rejecting duplicates — HTTP 409.
- **Validation** runs server-side in the `MatchRuleHandler` pre-hook before the generic CRUD persists:
  - `textCondition` must be `C` (Contains), `S` (Starts with) or `R` (Regex) — HTTP 400.
  - `textPattern` is required — HTTP 400.
  - when the condition is Regex, the pattern is compiled and test-matched under a 200 ms cap; a pattern that fails to compile or shows catastrophic backtracking is rejected — HTTP 400.
  - `transactionType` is no longer validated against a fixed list — any `ETGO_Transaction_Type` record is accepted (referential integrity enforced by the FK).
  - `priority` is **not** required to be unique — per the functional spec it is an ordering/ranking key (the highest-priority match is the main suggestion, ties rank as alternatives), so duplicate priorities within a scope are allowed (e.g. a cloned rule may keep the source priority).
  - `priority` **must be a whole number, 1 or greater** (upper bound: what `DECIMAL(10,0)` holds) — HTTP 400. Added because the field had no validation at all: `0` and negatives persisted silently, and a decimal was truncated by the column on the way in. Nothing technically broke with a negative (rules sort `priority ASC`, so it simply ranked first), which is why the range is a product decision rather than a crash fix. Validated on its own, **before** the content gate, because `priority` carries `inlineEdit` — a PATCH can legitimately carry priority and nothing else, and `hasContentFields` (name / condition / pattern) would not fire for it.
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

- Active rules **of the current tenant** for the account (specific or account-less = all of that tenant's accounts), ordered by ascending `priority`, are evaluated against each pending statement line the standard Etendo algorithm could not match (invoice-backed lines are skipped). `textCondition` (`C`/`S`/`R`) is tested against the line's description + reference + partner name, reusing the same 200 ms regex guard as the validation hook.
- **Tenant isolation (ETP-4950 QA round).** `MatchRuleEngine.loadRules` reads through the DAL (`OBCriteria` over the `ETGO_Match_Rule` entity), which adds the readable-client / readable-organization predicates by itself. It used to be hand-written JDBC whose `WHERE` filtered on `isactive` and the account but **not** on `ad_client_id`, so an account-less rule of ANY tenant was loaded for EVERY account of EVERY tenant: Automatch matched lines against rules the user could not even see, since the list in this window goes through the DAL-backed generic CRUD and was correctly isolated all along. The DAL filter also survives the `setAdminMode(true)` this whole path runs in — admin mode only skips the entity-access check, not those predicates.
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

- Backend source of truth: `AccountingDimensionsSupport.flatActiveDimensionsFor*`, i.e. the
  **chart of accounts** (`C_AcctSchema_Element.IsActive`) — exactly what the "Esquema contable →
  Dimensiones" screen writes (`GeneralLedgerConfigurationHandler` toggles that column and nothing
  else), and therefore the only dimension configuration a user of Etendo GO can actually change. The
  New Movement wizard and the propagation to the generated movement read the same set, so the three
  surfaces always agree.
- **Why not the `FAT` header set (ETP-4950 QA round).** Until QA returned the task this gated on
  `activeHeaderDimensions*`, on the reasoning that the movement Automatch generates *is* a `FAT`
  document. That set is the chart of accounts **minus** `AD_Client_AcctDimension.Show_In_Header='N'`,
  and the shipped reference data marks Product hidden for `FAT` — so **Producto could never appear,
  on any tenant provisioned from the published dataset, no matter what the user toggled**. Worse,
  Etendo GO ships no screen for `AD_Client_AcctDimension`, so that row was unreachable. Project and
  cost centre only "worked" by accident (no such row exists for them). The header helpers are now
  `@Deprecated` and have no production consumer; gap K1 / ETP-4854 no longer applies here.
- Read endpoint: `GET /sws/neo/match-rule/etgoMatchRuleHeader?action=activeDimensions` →
  `{ "response": { "data": { "dimensions": ["project", "costcenter", "product", ...] } } }`, served by
  `MatchRuleHandler.buildActiveDimensions()`. No AD registration needed — same `?action=` pattern as
  `ReconciliationHandler`.
- Frontend: generic, in `ListModalWindow`. Dimension fields are recognised from each descriptor's AD
  `column` (`lib/accountingDimensions.js`), the active set comes from
  `hooks/useActiveAccountingDimensions.js`, and a section left with no visible field is dropped
  together with its heading. No `decisions.json` change, no `make regen`, no generator change — the
  generated `fields` array already carries `column`.
- **Contacto is gated like the other three** (ETP-4950 QA round). On a rule the contact is an
  *assignment* carried onto the generated movement, not a matching criterion — the engine only ever
  matches on `textPattern` — so the Accounting Schema toggle governs it. It was previously ungated and
  stayed visible even when switched off. Scope of that gate is the rule form only: on a
  `FIN_FinaccTransaction` the contact is a first-class field and the New Movement wizard keeps it
  visible regardless. Note `C_BPartner_ID` deliberately does **not** trigger the `activeDimensions`
  request (`FETCH_TRIGGER_COLUMNS` in `lib/accountingDimensions.js`): it appears on dozens of windows
  that do not implement that action, and letting it trigger the fetch would 404 on all of them.
- Write path: `MatchRuleHandler.stripInactiveDimensions` removes an inactive dimension from the
  request body instead of rejecting it with a 400 — the clone and edit flows pre-fill from a stored
  row that may still hold a now-inactive value, and a hard error there would be a false alarm.
- **A value stored on a rule whose dimension was later switched off is ignored, never cleared.** The
  movement is generated without it and the rule starts applying it again if the dimension is
  re-enabled.
- Everything **fails open**: an unreadable accounting configuration leaves every field visible and
  simply assigns no dimensions, rather than hiding fields or failing the reconciliation.

## Multi-select and read-only gating (ETP-4950)

Two gaps found while testing the dimension fix, both in the generic `ListModalWindow` and therefore
fixed once for every `list-modal` window.

### Multi-select + bulk delete

The rules grid had no way to act on more than one row: deleting five rules meant five hover-and-click
rounds, while every other list in the app (Cuentas, its Movimientos / Extractos tabs, and the generic
`ListView`) already offered a checkbox column and a bulk delete. Added here with the **same** parts,
not a second implementation:

- `hooks/useBulkRowDelete` — the confirm dialog, one `DELETE /{entity}/{id}` per row in parallel, and
  the three-outcome toast (all / partial / none).
- `components/financial-accounts/BulkDeleteSelectionBar` — the floating "N Seleccionados" pill
  (count + trash + close), itself built on the generic `SelectionToolbar` portal.

Behaviour worth knowing:

- **Selection follows the visible rows.** `ListModalWindow` prunes any selected id that stops being
  visible when a toolbar filter, the advanced filter or the search changes, so a bulk delete can
  never reach a row the user can no longer see.
- The header checkbox selects/deselects every visible row and renders indeterminate while partial.
- On a **partial** failure only the rows that failed stay checked, and the list reloads so the
  deleted ones disappear — the shared outcome contract `ListView` follows.
- No new i18n keys: `selected`, `selectAll`, `selectRow`, `delete` and `close` already existed.

### Read-only window access is finally honoured

`EtgoMatchRuleHeaderPage` passes `window={{ ...window, readOnly: true }}` when the role's
`AD_Window_Access` tier for this window is `"read-only"` (ETP-4520), but `ListModalWindow` never
destructured the `window` prop, so the flag was silently dropped. A read-only role saw the
"Nueva regla" button, the row pencil / clone / trash and a live *Activa* toggle, and got a backend
error on click — the write itself was never at risk (`NeoAccessHelper.hasWindowAccess` gates write
methods on `AD_Window_Access.IsReadWrite`), so this was a UX defect, not a permission hole.

With `window.readOnly` true the component now hides the create button, drops the whole row-actions
cell, disables the inline toggle (`ListModalCell` -> `ToggleCell` -> `PillToggle disabled`) and
offers no selection column or bulk bar at all — there is no action a read-only role could take
with one.

## Gap assessment

- Inline editing of `priority` directly in the grid is carried as a contract flag (`inlineEdit`) but the primary edit path verified here is the modal; treat in-grid priority editing as future behavior.
- The accounting account (`C_GLItem`) selector lists every accounting account in scope.

## Manual verification

1. After the user runs `push-to-neo` + `export.database` + smartbuild and wires the menu, open `/match-rule` from the Finance menu and confirm the prioritized grid renders with the columns above and the read-only Reconciliations count.
2. Click "Nueva regla", confirm the modal opens with Priority pre-filled to `max + 10`, fill Name + Pattern + Concept condition, save, and confirm the row appears.
3. Create a Regex-condition rule with a deliberately catastrophic pattern (e.g. `((a+)+)+$` — Java 17 optimizes the single-nested form) and confirm the save is rejected with a 400 error message (shown in Spanish via `translateBackendError`).
4. Create two rules with the same Priority and the same "Afecta a" account and confirm **both are accepted** (priority is a ranking, not a unique key).
4b. Enter `-1` (and then `0`, and `10.5`) in Priority and save: each must be rejected with a legible Spanish message — "La prioridad debe ser 1 o mayor" / "La prioridad debe ser un número entero". Same for the inline priority edit in the grid, which PATCHes only that field.
5. Toggle a rule's Active switch in the grid and confirm it persists after refresh (PATCH, no modal). Creating a rule with the modal "Activa" check on must persist as active.
6. Edit a rule by clicking its row, change a dimension under "Dimensiones" (e.g. Product), save, and confirm the change persists.
6b. Deactivate the Proyecto dimension in the Esquema Contable (General Ledger Configuration → Dimensiones) and reload `/match-rule`: the Proyecto selector must be gone from both the create and the edit modal, while Producto and Centro de coste stay. Deactivate all three and the whole "Dimensiones" section (heading included) must disappear.
6c. The symmetric case, which is what QA returned the task for: with **Producto ACTIVE** in the Esquema Contable, the Producto selector must be **present** — on a freshly provisioned tenant, not only on the hand-tuned `GOClient`. Do the same with Contacto in both directions (off → the field disappears; on → it comes back).
6d. **Multi-tenant**: create an account-less rule ("Todas las cuentas") in client A, then log in as client B and open its bank reconciliation. A statement line matching that rule's pattern must stay `pending` — never `byRule` — and Automatch must not propose it. Repeat between two sibling organizations of the same client. A rule created on the `*` organization must still apply to every organization of its own client.
7. Hover a row and click the **clone** (Copy) action: the create modal opens pre-filled with the source rule's values (same priority included); save creates an independent copy.
8. Tick two rules with the row checkboxes, confirm the floating "2 Seleccionados" pill appears, press the trash and confirm: both rules disappear and the list reloads. Then tick one rule and type something in the search that excludes it — the pill must vanish (the selection is pruned, not silently kept).
9. With a role whose `AD_Window_Access` for this window is read-only, open `/match-rule` and confirm the grid renders but "Nueva regla", the row pencil / clone / trash, the checkbox column and the *Activa* toggle are all gone or disabled.

## Automated evidence

- `artifacts/match-rule/decisions.json` declares `layoutType: "list-modal"`, the `templateConfig` (incl. `toolbarFilters` and `backLabelKey`), the grid/modal field classification, the per-field `cellType` config (`priorityPill`/`nameWithSubline`/`conditionChip`/`percent`/`boldText`/`toggle`), the `transactionType` FK selector with inline create (`allowCreate`/`createSpec`/`createEntity`), and the `inlineToggle`/`inlineEdit` flags.
- `tools/app-shell/src/components/contract-ui/listModalCells.jsx` + `ListModalToolbarFilter.jsx` — the generic cell-renderer registry and toolbar dropdown used by `list-modal` (with `__tests__/listModalCells.vitest.jsx` and `__tests__/ListModalToolbarFilter.vitest.jsx`).
- `artifacts/match-rule/contract.json` carries `frontendContract.window.layoutType = "list-modal"` + `templateConfig`, the `etgoMatchRuleHeader` fields, and the `apiPrediction` selectors.
- `artifacts/match-rule/generated/web/match-rule/EtgoMatchRuleHeaderPage.jsx` renders `<ListModalWindow>` with the generated `columns`/`fields`/`sections`/`config`, gated by `useWindowAccess('24963D64E83B4543A7F6BD248CF944EE')`/`WindowAccessGuard` (ETP-4520/ETP-4658).
- `cli/config/regen-windows.json` — registry entry added by ETP-4658.
- `tools/app-shell/src/components/contract-ui/ListModalWindow.jsx` + `__tests__/ListModalWindow.vitest.jsx` — the generic component and its tests,
  including the multi-select / bulk-delete and read-only gating coverage added by ETP-4950.
- `tools/app-shell/src/hooks/useBulkRowDelete.jsx` and `tools/app-shell/src/components/financial-accounts/BulkDeleteSelectionBar.jsx`
  — reused unchanged; this window is a consumer, not a second implementation.
- `cli/test/generate-frontend-list-modal.test.js` + `cli/test/generate-contract-list-modal.test.js` — generator regression tests.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/MatchRuleHandler.java` — the validation pre-hook,
  the `?action=activeDimensions` read endpoint and `stripInactiveDimensions` (ETP-4950).
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/MatchRuleEngine.java` + `src-test/.../MatchRuleEngineTest.java`
  — the DAL-backed, tenant-scoped rule load (ETP-4950 QA round).
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/TenantOwnership.java` + `src-test/.../TenantOwnershipTest.java`
  — the ownership guard for request-supplied ids. Its tests are the only place the isolating behaviour is
  actually exercised: every other unit test runs with no `OBContext` on the thread, where the guard fails open.
- `modules/com.etendoerp.go/src/com/etendoerp/go/schemaforge/AccountingDimensionsSupport.java` — the single
  source of truth for active accounting dimensions, shared with `FinancialAccountTransactionsHandler`.
- `tools/app-shell/src/lib/accountingDimensions.js` + `tools/app-shell/src/hooks/useActiveAccountingDimensions.js`
  — the generic column→dimension mapping and the fail-open fetch used by `ListModalWindow`.
