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
