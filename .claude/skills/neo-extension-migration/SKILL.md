---
name: neo-extension-migration
description: >
  Migrate NEO handlers in com.etendoerp.go from the legacy ETGO_SF_ENTITY.Java_Qualifier + @Named
  binding to @NeoExtension(spec, entity), and pull entity-specific logic out of the generic NEO/MCP
  services into that entity's NeoExtension. Use it before migrating any handler, before touching a
  legacy (qualifier-bound) handler for any other reason, when reviewing a PR that adds a
  Java_Qualifier / @Named handler or a spec-name branch in a generic service, and when planning the
  next migration batch. Triggers on: "migrar a NeoExtension", "@NeoExtension", "Java_Qualifier",
  "javaQualifier", "migrar handler", "extension-parity", "lógica de ventana en código genérico",
  "ETP-5588".
---

# NeoExtension migration

## Why this skill exists

Fixes land on whatever base exists. While a handler is bound by `Java_Qualifier`, every fix to it
reinforces the legacy path, and every hook `NeoHandler` lacks pushes the next fix into a generic
service (`if ("sales-invoice".equals(spec))`). The legacy perpetuates itself. Proof, measured on
2026-10-22: `make extension-parity` has a ceiling of 90 distinct qualifiers, the real count was
**97** and the target was failing — unnoticed, because it never ran in CI.

The goal is one base: **for each `(spec, entity)`, one class annotated `@NeoExtension` is the single
entry point of all its API/MCP customization** (REST single, REST batch, MCP, callout, actions,
field filter, read enrichment). Shared logic may live in utils or in a shared base class; the entry
point is the NeoExtension.

Out of scope by decision: DAL event handlers (`EntityPersistenceEventObserver`) and AD callouts.
They must keep firing outside NEO (classic UI, processes).

## Vocabulary — get this right first

- **`NeoHandler`** — the interface. Each method is a *question* the generic engine asks a
  customization ("run before create?", "which actions do you expose?"), with an empty default.
  Never put window logic here.
- **`@NeoExtension(spec, entity)`** — the annotation that binds a class to a pair. Indexed by
  `NeoExtensionIndex` (case-folded key, not repeatable).
- **A NeoExtension** — a class implementing `NeoHandler` and carrying `@NeoExtension`. The
  *answers* (the entity's logic) live here.
- **Missing hook** — when the engine has no question for something an entity needs, add a hook
  (a defaulted method) to `NeoHandler` and answer it in the NeoExtension. Never special-case the
  entity in the generic service. Same pattern as `actionContracts()`, `protectedCreateCalloutFields()`.

## Resolution today (read before changing anything)

`NeoExtensionDispatcher.resolve` = annotation first (`NeoExtensionIndex.resolve`), then qualifier
(REST → `NeoServletSupport.lookupHandler`, MCP → `NeoHandlerLookup.byQualifier`; the two are NOT
equivalent — REST skips normal-scoped beans — and are kept separate on purpose).

Every reader that bypasses the dispatcher and reads `SFEntity.getJavaQualifier()` directly breaks
an entity whose qualifier is cleared. ETP-5588 migrated all of them to one resolver in
`NeoHandlerLookup`:

| Need | Call |
|---|---|
| handler, annotation first, MCP/discovery fallback | `forEntity(entity)` / `forEntityQuietly(entity)` |
| same, keeping the REST fallback resolver | `forEntity(entity, NeoServletSupport::lookupHandler)` |
| "is it customized?" without instantiating | `hasCustomization(entity)` (uses `NeoExtensionIndex.claims`) |
| report spec | `NeoReportCallability.resolveReportEntity/resolveReportHandler/reportHandlerName` |

| Reader | What it gates | Status |
|---|---|---|
| CRUD REST single/batch (`NeoCrudHandler.dispatchCrudRequestInternal`, `BatchService`) | handle/afterHandle | Dispatcher (ETP-5693) |
| MCP create/update/delete/action/selector/defaults (`McpToolRouter`) | hooks | Dispatcher |
| REST sub-endpoints (`NeoHookDispatcher`) | action/selector/callout/display | Dispatcher |
| `McpServerResolvedFields`, `NeoReadPredicates` | resolved fields, read predicates | Dispatcher `resolveOnly` |
| `McpDeclaredActions` | MCP actions, unavailable/excluded actions | `forEntityQuietly` (ETP-5588) |
| MCP read post-hook (`McpHookExecutor.runReadHook`), `McpWidgetHandler`, `McpWriteRequestSupport` | `afterHandle` on get/list, widgets, no-tab error | `forEntity` (ETP-5588; `resolveEntityHandler` removed) |
| `NeoFieldFilter` read-only exemption | read-only fields a handler injects on create | `hasCustomization` (ETP-5588) |
| `NeoCalloutEndpoint.applyAfterCalloutHook` | `afterCallout` (REST) | `forEntity(.., servlet::lookupHandler)` (ETP-5588) |
| `NeoActionContract.resolve` | `actionContracts()` in discover | `forEntityQuietly` (ETP-5588) |
| `NeoCrudHandler` create cascade | `protectedCreateCalloutFields` | `forEntity(.., NeoServletSupport::lookupHandler)` (ETP-5588) |
| `NeoActionSurface.hasActionSurface` | action route of tab-less entities | `forEntity(.., resolver)` (ETP-5588) |
| `NeoReportCallability`, `NeoAccessHelper.handlerRule`, `McpToolRouter.handleReport`, `McpResourceProvider`, `NeoRequestRouter` | report contract, role gate, dispatch | report helpers above (ETP-5588) |

What still reads the column, on purpose: the dispatcher inputs (`.qualifier(sfEntity.getJavaQualifier())`
in `McpToolRouter`, `McpHookExecutor`, `McpServerResolvedFields`, `NeoReadPredicates`,
`NeoHookDispatcher`, `BatchService`, `NeoCrudHandler`, `NeoRequestRouter`) — that is the fallback —
and the resolver itself. Each is counted in `scripts/extension-guardrails-allowlist.json`; a new
read fails CI. Not related, do not touch: `NeoFieldFilter` ~328 and `NeoButtonActionHelper` ~264
read `SFField.getJavaQualifier()` — a different column (field API alias).

Re-check before trusting this table: `python3 scripts/check-extension-guardrails.py --print-current`
in com.etendoerp.go lists every file that still reads the column.

## Recipe — migrating one (spec, entity)

1. **Find the pair and its handler.** `make extension-parity` (or `ALL=1`) in com.etendoerp.go
   lists every pair, its mechanism and the class. Never guess spec/entity names; they come from
   `ETGO_SF_SPEC` / `ETGO_SF_ENTITY` (`src-db/database/sourcedata/*.xml`).
2. **Inventory what the handler answers.** `make extension-parity HOOKS=1` lists, per bound pair,
   the `NeoHandler` hooks its class (or a superclass under `src/`) overrides. Every hook must be
   reached by an annotation-aware reader (table above), or clearing the qualifier silently drops
   that behaviour. If a hook appears that no row above covers, find its reader first.
3. **Annotate the class that already serves the pair.** `@NeoExtension(spec = "...", entity = "...")`
   on that class itself, never on a second class with different behaviour.
   - One class serving several pairs: the annotation is not repeatable. Keep the behaviour in a
     shared base and add one empty concrete subclass per pair, each annotated, **without**
     `@Named` (a second bean with the same name is ambiguous). Precedent:
     `SalesOrderLineHandler`/`SalesQuotationLineHandler`, `PaymentIn/OutReactivateHandler`.
4. **Audit scattered logic for the pair** (section below). Move what belongs to the entity into
   its NeoExtension; add a hook if none fits.
5. **Cut the data.** Clear `JAVA_QUALIFIER` on the row in
   `src-db/database/sourcedata/ETGO_SF_ENTITY.xml` (rows without a qualifier simply omit the
   element); remove `javaQualifier` from `artifacts/<spec>/decisions.json` in schema_forge and
   regenerate with **`make regen ONLY=<spec>[,<spec>] FROM_CACHE=1`** (never edit `contract.json`
   or `generated/` by hand). Then `make regen-check ONLY=<specs> FROM_CACHE=1
   REGEN_CHECK_PREV_XML_DIR=<go worktree>/src-db/database/sourcedata` must report no drift.
6. **Drop `@Named`.** Safe: `beans.xml` uses `bean-discovery-mode="all"`, the class stays a
   `@Dependent` bean. Never give a handler a normal scope (`@ApplicationScoped`): the Weld proxy
   hides `@Named` from `lookupHandler`. Grep the qualifier string in `src`/`src-test` first.
7. **Lower the ratchet.** Set `EXTENSION_CEILING` in the Makefile to the new distinct count
   (`make extension-parity` tells you the number), and remove the class from `legacyHandlers` in
   `scripts/extension-guardrails-allowlist.json` (`python3 scripts/check-extension-guardrails.py`
   reports the stale entry). Both are enforced in CI.
8. **Verify** (checklist below) and update the ledger at the end of this file.

## Auditing scattered logic

Search the generic services for branches tied to the pair. Generic services:
`NeoCrudHandler`, `NeoServlet*`, `BatchService`, `NeoHookDispatcher`, `NeoFieldFilter`,
`NeoCalloutEndpoint`, `NeoSelectorService`, `NeoDefaultsService`, `NeoBuiltInEndpointHandler`,
`NeoDocumentDownloadService`, `NeoResponse`, `selector/policy/*`, everything under `mcp/`.

Look for: spec-name literals, entity names, table names, AD window/tab/process/reference ids,
`instanceof <Handler>`, entity classes (`Invoice.class`…), hardcoded field names re-injected
around the field filter. A scout prompt that worked: "find logic in these generic services
special-cased for pair X; for each: file:line, what it does, channel, which existing NeoHandler
hook could host it or whether a new one is needed, risk".

Classify each finding:

| Class | Rule | Action |
|---|---|---|
| Entity logic in a generic service | Keyed on spec/window/entity | Move to the NeoExtension; add a hook if needed |
| Derivable from metadata | Hardcoded map that AD already knows (spec → window → tab → table) | Replace by metadata lookup; delete the map |
| Legitimately generic | Keyed on target entity, AD_Reference, message key, table, or present properties — applies to any window that has it | Keep; document as generic |
| Data reference | A factory naming which spec's contract applies to a document it builds | Keep (it passes the spec as data, not a branch) |
| Not yet movable | Several entities rely on it and they are not in this batch | Keep, add `// Pending: move to the @NeoExtension of each entity that needs it …` and an allowlist entry |

## Findings catalog (audit of 2026-10-22, ETP-5588, treasury pairs)

The core pipeline (CRUD REST, batch, hook dispatch, field filter, callout endpoint, MCP
router/hook/write) had **no** branch on the treasury pairs. Findings sat in edge helpers:

| Id | Where | What | Decision |
|---|---|---|---|
| F1 | `NeoDocumentDownloadService` (+ frontend `documentEmailSend.js`) | spec → attachment table map for email download links | **Done (ETP-5588)**: backend reads the spec's header entity (included, level-0 tab) by native SQL; frontend reads `backendContract.window.primaryEntity` → `tableName` from the window contract (`resolveAttachmentTable`). Both maps deleted |
| F2 | `NeoCrudHandler:95, 1086-1137` | `accountingDate` re-injected after the read-only filter on update, so header pre-hooks (`AbstractInvoiceHeaderHandler`, order, in/out headers via `NeoHandlerUtils.mirrorAccountingDate*`) can write it | Kept, commented as pending, allowlisted. Future hook: `writableOnUpdate(ctx)` answered by invoice, order and in/out header NeoExtensions; add it when the first of those is migrated (not before — an unused hook is dead code). Check first which entities PATCH `accountingDate` |
| F3 | `NeoSelectorService:398-407` + `FinancialAccountPaymentMethodSelectorPolicy` | account selector filtered by payment method | Legitimately generic (target entity) |
| F4 | `ReferenceOverrideSelectorPolicy:28-41` | filters keyed by AD_Reference id | Legitimately generic (reference shared with orders) |
| F5 | `NeoResponse:266-327` | `@ETPR_PeriodClosedForUnRemovePayment@` → `PeriodNotAvailable` | Legitimately generic (message key) |
| F6 | `McpToolRouter:~2219` | hint text naming `open-close-period-control` | Text only; keep |
| F7 | `DocTypeResolver:392-420` | table → DocBaseType | Legitimately generic (metadata table) |
| F8 | `NeoBackgroundDefaultsService` + factories passing `"sales-invoice"`/`"purchase-invoice"` | SII key deferred to trigger on background-created invoices | Data reference + property-gated; keep (the scout first flagged it as needing a hook — it does not) |
| — | `CurrencyOptionsHandler` | `specName.contains("invoice")` in a shared helper | **Done (ETP-5588)**: `isInvoiceTab(ctx)` reads `ctx.getAdTab().getTable()` (both REST and MCP action contexts carry the tab) |

Same kind of violation outside treasury (allowlisted in `scripts/extension-guardrails-allowlist.json`
`specLiterals`, fix when that area migrates):
- `NeoCrudHandler` — `"contacts"` / `businessPartner` billing-default strip.
- `NeoBuiltInEndpointHandler` — `"amortization"` (and fiscal specs through constants).
- `McpSchemaFieldBuilder` — `"physical-inventory"` (found by the guardrail script, not the scout).
- `McpConstants` — `"dashboard"` (the widget tool is dashboard-specific by design).
- Not caught by the literal check (no spec string): `InvoiceLineTaxSifSelectorPolicy:133` window ids
  `167/183/143/181`; `NeoDefaultsService:1078` `AD_USER` deny-list; MCP create pre-pass
  `McpLinePriceInjector` / `McpBillToInjector`. Review them by hand when their area migrates.

Hooks `NeoHandler` offers (re-list with `grep -n "default " NeoHandler.java`): `handle`,
`afterHandle`, `afterCallout`, `readPredicates`, `filterAliases`, `isAccessibleForCurrentRole`,
`protectedCreateCalloutFields`, `serverResolvedCreateFields`, `createDirectives`,
`responseEnrichedFields`, `servesActions`, `actionContracts`, `unavailableActions`,
`agentExcludedActions`, `reportParameters`, `reportFormats`. Missing so far: selector filter,
read-only-writable-on-update (F2), attachment table (avoided by F1's metadata route).

## Guardrails (what stops the legacy from growing back)

- `.github/workflows/extension-guardrails.yml` in com.etendoerp.go (since ETP-5588), offline, on
  every PR:
  - the distinct `Java_Qualifier` count may not rise against the base branch;
  - `make extension-parity` runs `--exact`: count must **equal** `EXTENSION_CEILING`, so the PR
    that migrates lowers the Makefile value in the same change;
  - `scripts/check-extension-guardrails.py` fails on a new `@Named`-only `NeoHandler`, a new
    `getJavaQualifier()` read, a spec literal in a generic service (`GENERIC_FILES`/`GENERIC_GLOBS`
    in the script), and on any stale allowlist entry (the list only shrinks). `--print-current`
    shows today's state; never paste it over the allowlist to silence a finding.
- Rule in `CLAUDE.md`/`AGENTS.md`/`neo-headless.md` §5.3.a: **touching a legacy handler means
  migrating it in the same PR** (replaces "migrate opportunistically").

If a guardrail is missing when you start, that is the first gap to report — without it the
migration is not durable.

## Verification checklist

- Behaviour tests per migrated reader, two cases each: entity bound only by annotation, entity
  bound only by qualifier (proves fallback unchanged). Priority: read-only rejection on create,
  `afterCallout`, `actionContracts` in discover, MCP read enrichment.
- `goTestUnit`, `make extension-parity` with the lowered ceiling, no CONFLICT lines.
- Logs: `@NeoExtension index built: annotated=N`; no `(warn) @NeoExtension conflict` for migrated
  pairs (a disagreement means the row still carries a qualifier naming another class).
- Live smoke per pair (local env, see `local-env` skill):
  REST — GET single and list, create, update, callout (if overridden), one action per handler;
  MCP — `etendo_get`/`etendo_list` (enriched fields present), create, `etendo_discover`
  (action contracts present), one action.
- `innocuous-check` on the reader refactor: for non-annotated entities nothing may change.

## Known traps

- `@NeoExtension` wins on **every** surface once present; put it on the class that already
  serves the pair, never on a different class "to try".
- `NeoExtensionIndex` keys are case-folded; two classes differing only in case collide.
- `warnOnQualifierDisagreement` logs at ERROR with a `(warn)` prefix on every resolution while a
  row's qualifier names a different class than the annotated one (the payment subclasses until the
  qualifier is cleared). Expected during a partial migration, not after.
- `javaQualifier` in `decisions.json`/`contract.json` is echoed metadata; the runtime reads the DB
  row. Confirmed 2026-10-22: `make regen-check` predicts identical ETGO_SF XML with or without
  `JAVA_QUALIFIER` in the committed rows, so push-to-neo neither writes nor restores it.
- `npx sf-resolve-curated --window <spec> --write` alone regenerates with drift (it dropped the
  `field` key of every action in `generated/`). Use `make regen ONLY=<spec> FROM_CACHE=1`, which
  produced only the intended diff.
- Unit tests that `mockStatic(NeoHandlerLookup.class)` return `null` from `forEntity*` and `false`
  from `hasCustomization`. Use `mockStatic(NeoHandlerLookup.class, Mockito.CALLS_REAL_METHODS)` and
  stub `byQualifier`/`byQualifierQuietly`: the real resolver then runs over the stubs.
  `NeoExtensionIndex` without a mocked `WeldUtils` answers `null`/`false`, never throws.
- Report dispatch (`NeoRequestRouter`) builds the context with `entityName = specName`, so an
  annotated report handler must use the entity name the row has. Today all 15 report entities are
  named like their spec; check it before migrating a report.
- `NeoCrudHandlerTest$HandleDefaultAggregateHandover` fails in a single JVM after other suites
  (static init of `DefaultJsonDataService`), on `develop` too. Not a regression; it passes alone.
- Compiling outside gradle (no local env): develop needs JDK 17. Classpath that worked:
  `build/classes` plus `WebContent/WEB-INF/lib`, `build/lib`, `lib` and `modules/*/lib` jars of an
  up-to-date `local-env` environment (`/Users/futit/Workspace/.worktrees/<env>`), mockito 5.2 /
  byte-buddy 1.14 from `~/.gradle/caches`, and `junit-platform-console-standalone-1.9.2`. Compare
  any failure against the same run on `origin/develop` before blaming the change.
- The only UI consumer of `javaQualifier` in schema_forge is the explorer `SpecManager.jsx`.

## Keep this skill improving (mandatory)

Every migration must leave the next one easier. Before closing a migration PR:

1. Update the reader inventory, the hook list and the findings catalog with what you found.
2. Add any new trap, wrong assumption or slow step to **Known traps** or the recipe.
3. If you repeated a manual step (grep sequence, smoke calls), turn it into a script or make
   target and reference it here.
4. Append a row to the ledger below.
5. Regenerate the agent mirror: `make sync-agents` (source of truth is
   `.claude/skills/neo-extension-migration/SKILL.md`).

## Ledger

| Date | Ticket | Pairs | Qualifier count after | Notes |
|---|---|---|---|---|
| 2026-10-22 | ETP-5588 (PR com.etendoerp.go#1369) | financial-account/account, sales-invoice/header, purchase-invoice/header, open-close-period-control/periodControl, payment-in/finPayment, payment-out/header | 92 (from 97; `payment-reactivate` was shared by both payment pairs) | Pilot. All direct readers moved to `NeoHandlerLookup`; CI guardrails added; qualifiers, `javaQualifier` and `@Named` removed for the 6 pairs; F1 and `CurrencyOptionsHandler` fixed; F2 left pending with a comment. Next candidates: the 4 already-annotated line pairs (`sales-invoice/lines`, `purchase-invoice/lines`, `sales-order/lines`, `sales-quotation/quotationLine`) still carry a qualifier — clearing it is now safe and removes the 4 CONFLICT lines |
| 2026-10-29 | ETP-5051 (com.etendoerp.go 004387689) | user/user | 91 (from 92) | Opportunistic, forced by the touch-means-migrate rule while moving the seat-quota guards out of `UserRoleAssignmentHandler`. Hooks `handle`, `afterHandle`, `readPredicates` were all already reached through `NeoExtensionDispatcher`, so no reader change. `@Named("user")`, the row's `JAVA_QUALIFIER` and the decisions `javaQualifier` removed; `make regen ONLY=user FROM_CACHE=1` changed only `contract.json` (two `javaQualifier` lines + checksum) and the checksum echo in `contract.mcp.json`; `make regen-check` OK (3/3 XML match) |
| 2026-10-28 | ETP-6002 | goods-shipment/goodsShipment, sales-quotation/quotation | 89 (from 91 once merged with develop, where ETP-5051 had migrated user/user; 90 from 92 on the branch) | Forced by the touch rule: both header handlers were edited for IMP-3 (quotation flag on the shipment's `linkedOrders`, quotation `linkedShipments`). One class per pair, no subclass, no third handler; every overridden hook (`handle`, `afterHandle`, `afterCallout`, `filterAliases`, `responseEnrichedFields`, `actionContracts`, `unavailableActions`) already has an annotation-aware reader. Audit of the generic services found no branch on either pair (one comment in `NeoReturnReceiptService`). `make regen ONLY=goods-shipment,sales-quotation SKIP_EXTRACT=1 FROM_CACHE=1` produced only the `javaQualifier` removal + checksum, and `regen-check` against the go sourcedata reported no drift. A local DB that has not run `update.database` keeps the old qualifier on both rows: harmless, the annotation wins and no bean carries that `@Named` any more |
| 2026-10-30 | ETP-6062 (hotfix, com.etendoerp.go `hotfix/ETP-6062`) | tax/tax | 96 on the `main` base of the hotfix (one fewer than before it; `main` does not yet carry the develop-side migrations counted above) | Opportunistic, forced by the touch-means-migrate rule while letting tenants save the SIF regime key on shared taxes in `TaxSifOverrideHandler`. Bound with `@NeoExtension(spec="tax", entity="tax")`; the row's `JAVA_QUALIFIER` and the decisions `javaQualifier` (`taxSifOverrideHandler`) removed — `tax/accounting` keeps `taxAccountingHandler` (still legacy, next candidate). Trap hit: the GO PR's Offline Regen Check flagged `JAVA_QUALIFIER: <none> → "taxSifOverrideHandler"` until the schema_forge `decisions.json` side landed — the two sides must ship together. `make regen ONLY=tax FROM_CACHE=1` changed only `contract.json` (two `javaQualifier` lines + checksum) and the checksum echo in `contract.mcp.json`; `make regen-check` OK (3/3 XML match) |
| 2026-11-02 | ETP-6026 | sales-order/header | 87 (from 88) | Forced by the touch rule: `SalesOrderHeaderHandler` gained the VO refusal (DR/IP/CO). One class, one pair, no subclass. Every hook it overrides or inherits (`handle`, `afterHandle`, `afterCallout`, `actionContracts`, `responseEnrichedFields`, `unavailableActions`) already had an annotation-aware reader — the same set `SalesQuotationHeaderHandler` (same base class) proved in ETP-6002. Two tests used the qualifier only as a legacy-binding fixture (`NeoExtensionParityTest`, `McpWriteGateTest.theHandlerQualifierDoesNotExempt`); both now use `purchase-order/header` (`purchaseOrderHeaderHandler`), still legacy. Trap: `make regen SKIP_EXTRACT=1` WITHOUT `FROM_CACHE=1` pulled unrelated drift from the local DB into both contracts (callout class names, an installed module's bank-account field, a label); re-run with `FROM_CACHE=1` and only the two `javaQualifier` lines + checksum changed. `make regen-check ONLY=sales-order,sales-quotation FROM_CACHE=1 REGEN_CHECK_PREV_XML_DIR=<go>/src-db/database/sourcedata` OK (3/3). `make extension-parity` passes at 87; guardrails 0 findings |
| 2026-11-02 | ETP-6026 | return-material-receipt/returnMaterialReceipt | 86 (from 87) | Forced by the touch rule: the customer return's `createReturnInvoice` stopped honouring `allowDuplicate` (new `acceptsAllowDuplicate()` hook of `AbstractReturnDocumentHeaderHandler`, default `true`; only this class overrides it). Hooks overridden or inherited (`handle`, `afterHandle`, `responseEnrichedFields`, `actionContracts`, `unavailableActions`; `make extension-parity HOOKS=1`) all have annotation-aware readers — the same set ETP-6002 proved for `goods-shipment`. No test fixture or doc used the qualifier string; only Javadoc names the class. `ReturnToVendorShipmentHeaderHandler` (same base) stays legacy: untouched in this change. `make regen ONLY=return-material-receipt SKIP_EXTRACT=1 FROM_CACHE=1` changed only the two `javaQualifier` lines, the spec prompt and checksums; `regen-check` OK (3/3); parity passes at 86; guardrails 0 findings |
| 2026-11-02 | ETP-5581 | bank-reconciliation/bank-reconciliation, bank-statements/bank-statements | 83 (from 86 once merged with develop, where ETP-6026 migrated sales-order/header and return-material-receipt/returnMaterialReceipt and ETP-6108 migrated purchase-order/header; 86 from 88 on the branch) | Forced by the touch-means-migrate rule: both report-spec handlers (`ReconciliationHandler`, `BankStatementsHandler`) are edited for the bounce/discard work of the bank reconciliation. Both override only `handle` and `actionContracts`, already reached annotation-first (report route via `NeoRequestRouter` → dispatcher with `entityName = specName`; MCP via `McpDeclaredActions`/`NeoActionContract.resolve`). No `decisions.json` exists for either spec (rows maintained in the go sourcedata only), so there was no regen and the Offline Regen Check does not cover them. Audit: no branch on either pair in the generic services (only comments in `ToolRegistry`, `McpToolRouter`, `McpReportActionsSchema`). Visible side effect: MCP's `reportHandler` attribute now names the class instead of the qualifier |
| 2026-11-03 | ETP-6053 | sii-config/siiConfiguration, tbai-config/header, verifactu-config/cabeceraDeConfiguraciónVerifactu | 80 (from 83 once merged with develop, where ETP-6108 had migrated purchase-order/header and ETP-5581 bank-reconciliation/bank-reconciliation and bank-statements/bank-statements; 83 from 86 on the branch) | Forced by the touch rule: the three fiscal-config handlers gained the `FiscalSifGuard` pre-check (Fiscal Configuration rules for MCP). One class per pair, no subclass; hooks `handle`, `afterHandle` (and the base class's `beforeDelete`/`smartDeactivate`, reached through `handle`) all have annotation-aware readers. The new `fiscalSystemCatalog` / `configureFiscalSystem` actions are served by `FiscalSystemConfigureAction`, delegated from `SiiConfigDeactivateHandler` — the `sii-config/siiConfiguration` pair's single `@NeoExtension` (the annotation is not repeatable). A first version hung them on `organization/organization` (delegating from `OrganizationCertificateAction`), which wrongly required write access to the Organization window; they moved to `sii-config` in the same ticket. Trap: `export.database` from a local DB that has drifted from the branch exports unrelated rows (other qualifiers, AD_COLUMN, a whole sourcedata file); keep only the rows you changed. `make regen ONLY=sii-config,tbai-config,verifactu-config SKIP_EXTRACT=1 FROM_CACHE=1` changed only the `javaQualifier` lines + checksums; `regen-check` OK (3/3); parity passes at 83; guardrails 0 findings |
| 2026-11-04 | ETP-6108 | purchase-order/header | 85 (from 86) | Forced by the touch rule: `PurchaseOrderHeaderHandler` gained the same documentAction allow-list as the sales order (shared `OrderDocActionPolicy`) and `OrderReactivationGuard`. One class, one pair, no subclass; every hook it overrides or inherits already had an annotation-aware reader (same set as `SalesOrderHeaderHandler`, ETP-6026). The qualifier was the legacy-binding fixture of `NeoExtensionParityTest`; it now uses `goods-receipt/goodsReceipt` (`goodsReceiptHeaderHandler`), still legacy. Both sides shipped together: GO row `Java_Qualifier` + `@Named` + `legacyHandlers` entry removed, `EXTENSION_CEILING` 86 -> 85, and the `javaQualifier` of `artifacts/purchase-order/decisions.json` + `contract.json`. Trap: `make regen ONLY=purchase-order SKIP_EXTRACT=1` (even without `FROM_CACHE=1`, and the cache was reported STALE) pulled heavy unrelated drift from the local DB (es_ES enum labels lost, callout class names, an installed module's bank-account field, a label, two generated PaymentDetails files); it was reverted and only the two `javaQualifier` lines were removed from `contract.json` by hand (checksum left untouched), `sf-validate-pipeline --scope=purchase-order` 0 violations. `make extension-parity` passes at 85; guardrails 0 findings |
| 2026-11-05 | ETP-6154 | financial-account-bank-connection/financial-account-bank-connection | 79 (from 80) | Forced by the touch rule: `FinancialAccountBankConnectionHandler` gained the `syncStatus` action and the `IN_PROGRESS` mapping of `sync` (per-account sync lock). Report spec (SPEC_TYPE R) whose entity is named like the spec, the same shape as `bank-statements` (ETP-5581). Only hook overridden: `handle` (`make extension-parity HOOKS=1`), reached annotation-first on both surfaces: REST via `NeoRequestRouter` (entityName = specName) and MCP via `FinancialAccountBankConnectionEndpoint`, which dispatches through `NeoExtensionDispatcher` with spec/entity set and a qualifier that is now null. No `decisions.json` for the spec, so no regen. `FinancialAccountBankConnectionEndpointTest` keeps a mocked qualifier string as its stub (harmless: it stubs `resolveReportHandlerQualifier`). `make extension-parity` passes at 79; guardrails 0 findings. The `.agents/skills` mirror was already stale for other skills before this change, so `make sync-agents` was not run here |
