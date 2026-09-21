---
name: schema-forge-architecture-audit
description: Audit Schema Forge for architecture drift, duplicated window logic, cross-window dependencies, generic components leaking window-specific fixes, selector/related-document repetition, AND propose grounded refactors. Triggers on architecture audit, duplicated code, código repetido, duplicado, dedupe, DRY, complejidad cognitiva, cross-window imports, generic leak, refactor, selector repetition, related documents duplication.
---

<!-- GENERATED MIRROR - DO NOT EDIT. Source: .claude/skills/schema-forge-architecture-audit/SKILL.md - Regenerate: make sync-agents -->

# Schema Forge Architecture Audit & Refactor

## Overview

This skill has two phases that share one knowledge base:

- **Phase 1 — AUDIT** (read-only). Identify design decisions that live in the wrong place, repeat across windows, or leak into generic layers. Produce an evidence-based report with the correct owner/layer for each finding.
- **Phase 2 — REFACTOR** (write, when explicitly requested). Pick a finding, look up the applicable pattern in [`patterns/`](patterns/), check precedent in [`cases/`](cases/), and produce a refactor brief or apply the change. Every applied refactor must end as a new case file.

Default scope is the `schema-forge` repository only. Do NOT inspect `etendo_core` module code unless the user explicitly asks for it.

Java duplication / static analysis lives elsewhere: delegate to `/etendo:sonar`.

---

## Non-negotiables

- **Phase 1 is read-only.** Phase 2 only runs when the user explicitly asks for a fix.
- **Never lose functionality.** Every style attribute, padding, gap, conditional in the original must remain reachable via the extracted component's props. When in doubt, add a prop rather than hardcode. Defaults match the most common original.
- Do not report generated output as the root cause. Attribute generated repetition to the generator/template/contract source when possible.
- Every issue needs exact file paths and observed evidence.
- Mark inference explicitly.
- Separate architecture smells from normal per-window configuration.
- Severity must be justified by blast radius, coupling, and maintenance risk.
- Refactors in `artifacts/*/generated/` are forbidden — those are regenerated from `decisions.json` and the generators.

---

## Phase 1 — AUDIT

### Audit areas

| Area | Smell | Where to look |
|---|---|---|
| Cross-window imports | A custom window imports another concrete window | `tools/app-shell/src/windows/custom/**` |
| Misplaced shared code | Generic/shared code imports from `windows/custom/<window>` or reusable code lives under one window | `tools/app-shell/src/components`, `tools/app-shell/src/windows/custom` |
| Selector duplication | Multiple components hand-roll selector fetch, pagination, mapping, fallback URLs, or result normalization | `tools/app-shell/src/components/contract-ui`, `tools/app-shell/src/hooks`, `tools/app-shell/src/windows/custom` |
| Related documents duplication | Each window redefines relation graph, fetches, chip rendering, dedupe, status mapping | `RelatedDocuments.jsx`, `components/related-documents`, `artifacts/*/(decisions|contract).json` |
| Specific fixes in generic code | Generic UI/CLI code branches on concrete window/entity/field names | `tools/app-shell/src/components`, `tools/app-shell/src/hooks`, `cli/src` |
| Backend generation drift | Schema Forge CLI embeds backend/window-specific behavior in generic pipeline code | `cli/src`, not `etendo_core` unless requested |
| Tactical UI duplication | N≥2 sibling components share an identical wrapper, header, empty-state, or leaf node | `tools/app-shell/src/components`, `tools/app-shell/src/windows/custom` |
| Cognitive complexity | A function or component has so many branches/nesting it's hard to read | Any layer; long generator files are common offenders |

### Required workflow

1. **Confirm scope** — repo path, branch, dirty-tree summary (do not modify), exclusions.
2. **Map source layers** — frontend generic (`tools/app-shell/src/components|hooks|lib`), frontend windows (`tools/app-shell/src/windows/custom/<window>`), CLI (`cli/src`), artifacts (config only, never `generated/`).
3. **Search before reading** — use the targeted patterns below.
4. **Read evidence sections** — answer: what layer, what concrete concept, repeated where, config vs shared behavior vs workaround.
5. **Classify severity** (table below).
6. **Report with recommendation** — name the correct owner/layer or, for tactical UI dup, the applicable pattern in `patterns/`.

### Search recipes

- Cross-window imports: `@/windows/custom/`, `from '../<window>/`, `../../windows/custom/`, one-line re-exports `export { default } from '@/windows/custom/`.
- Selector duplication: `selectors/`, `serverResults`, `fetchServerResults`, `fetchAllPages`, `fetchSelectorPage`, `parseSelectorItems`, `SELECTOR_PAGE`, `hasMore`, `offsetRef`, `data?.items`, `data?.response?.data`, `Array.isArray(data)`, `label || name`, `label ?? name`.
- Contacts selector policy drift: `countrySelectors`, `selectorBases`, `C_Country_ID`, `C_Region_ID`, `country`, `region`, `locationAddress/selectors`, `bankAccount/selectors`, `intrastatAdquisitions/selectors`.
- Related documents: `RelatedDocuments`, `RelatedDocumentsShell`, `DocChip`, `relatedDocuments`, `fetchPayments`, `fetchLinkedDocuments`, `fetchChild`, `fetchByCriteria`, `fetchById`, `new Set()`, `chips.push`, `neoBase(apiBaseUrl)`.
- Generic-layer concrete leaks: `entity ===`, `field.key ===`, `col.key ===`, `windowName ===`, `customDir ===`, `aliases =`, `internalConsumptionLine`, `InternalConsumptionProductSearchDrawer`, `contacts`, `businessPartner`, `sales-order`.
- Document-line policies in generic UI: `standardPrice`, `grossUnitPrice`, `grossListPrice`, `netUnitPrice`, `unitPrice`, `listPrice`, `lineNetAmount`, `grossAmount`, `taxRate`, `orderedQuantity`, `invoicedQuantity`, `movementQuantity`, `SL_Order_Amt`, `SL_Invoice_Amt`, `PriceActual`, `inpgrossUnitPrice`.
- Selector context leaks: `isSOTrx`, `IsSOTrx`, `isCustomer`, `isVendor`, `DateInvoiced`, `invoiceDate`, `orderDate`, `priceList`.

### Severity

| Severity | Criteria |
|---|---|
| Critical | Wrong-layer logic can corrupt generated output or broadly mis-route pipeline behavior across many windows. |
| High | Cross-window dependency or generic-to-window dependency that makes unrelated windows break together. |
| Medium | Repeated domain logic across several windows/components with likely divergence or inconsistent bug fixes. |
| Low | Localized hardcoded compatibility fallback, naming smell, or tactical UI duplication limited to a small surface. |

### Audit report format

```markdown
# Schema Forge Architecture Audit

Scope observed:
- Repo: [path]
- Branch: [branch]
- Excluded: [e.g. etendo_core]
- Working tree: [clean/dirty summary]

## Executive Summary
- Critical: N
- High: N
- Medium: N
- Low: N

## Issues

### [Severity] [Title]

Evidence:
- `path:line` — observed fact
- `path:line-line` — observed fact

Why it matters:
- [coupling/duplication/wrong layer/blast radius]

Recommendation:
- [target layer/config/helper/generator] or [pattern: extract-card-shell, see patterns/<file>.md]
- [clean cutover; no aliases unless compatibility requires it]

Confidence: High|Medium|Low
```

---

## Phase 2 — REFACTOR (on explicit user request)

Workflow when the user picks an audit finding and asks to fix it:

1. **Read all listed files in full** — never excerpts. Duplication signal lives in style attrs, repeated wrappers.
2. **Classify** the duplication against [`patterns/INDEX.md`](patterns/INDEX.md). If no pattern fits, propose a new one and ask the user before continuing.
3. **Check precedent** in [`cases/`](cases/) — prior cases ground prop naming, file location, prop shape.
4. **Produce a refactor brief** (template below) and confirm with the user.
5. **Verify tests exist** for every consumer being touched. If missing, delegate to Tester (`test-generator` subagent) FIRST, then refactor.
6. **Apply the refactor**, run the test suite, confirm zero regressions.
7. **Add tests** for the new shared component(s).
8. **Write a case file** in `cases/` documenting the refactor (template below). The skill learns from it.

### Refactor brief template

```markdown
# Refactor brief — <date> — <short-name>

## Duplication map
| # | Block | File A:lines | File B:lines | File C:lines |
|---|---|---|---|---|

## Proposed extraction
- **Location:** `<dir>/_shared/<Component>.jsx`
- **Props API:** ...
- **Pattern:** [pattern-name](../patterns/<pattern-name>.md)
- **Precedent:** [case-name](../cases/<date>-<name>.md) (if any)

## Functionality preservation checklist
- [ ] No prop omitted vs original (style attrs, padding, gap)
- [ ] Optional behaviors configurable via prop, not hardcoded
- [ ] Tests covering each original file BEFORE refactor
- [ ] Tests for the new shared component AFTER refactor

## Estimated impact
- LOC delta: -X
- Future card creation cost: -Y LOC starting baseline
```

### Case file template

See [`cases/2026-05-13-dashboard-cards.md`](cases/2026-05-13-dashboard-cards.md) for a canonical example. Sections required: targets, duplication map (pre-refactor), extracted components, functionality preservation notes, tests (before/after counts), LOC delta table, decisions worth remembering, surprises.

---

## Evidence patterns

### Cross-window import

```jsx
// Bad architecture boundary
import InvoicePreviewModal from '../purchase-invoice/InvoicePreviewModal.jsx';
```

Better: move reusable component to `windows/custom/shared`, `components/contract-ui`, or another neutral layer; both windows import it.

### Generic code importing window code

```jsx
// Bad: shared component depends on contacts implementation
import LocationEditorModal from '../../windows/custom/contacts/LocationEditorModal.jsx';
```

Better: generic code depends on generic/shared implementation; windows supply config or callbacks.

### Selector repetition

Report when multiple places independently implement: URL construction for `/selectors/`, bearer headers, `{ id, label || name || id }` mapping, pagination loops, fallback selector URL arrays, local/server result reconciliation.

Better: shared `fetchSelectorOptions`, `fetchAllSelectorPages`, and `useSelectorSearch` with one normalization shape.

### Related documents repetition

Repeated `RelatedDocuments.jsx` files are not automatically bad. Report when they duplicate relation graph traversal, fetch/dedupe/status/chip rendering patterns that could be declarative.

Better: `relatedDocuments` config should describe document graph edges; shared renderer/hook performs fetch, dedupe, status labels, and routing.

### Specific fixes in generic code

```js
if (entity === 'internalConsumptionLine' && field.key === 'product') { ... }
if (windowName === 'contacts') { ... }
```

Better: declare behavior in metadata (`selectorResultMappings`, aliases, field policies, line amount policy) and let generic code execute the declaration.

### Tactical UI duplication (small surface)

Two or more sibling components inline the same wrapper/header/empty-state. Recommend the matching pattern from `patterns/`:

- Same outer container + header strip → [`extract-card-shell`](patterns/extract-card-shell.md)
- Same "no data" layout with optional CTAs → [`extract-empty-state`](patterns/extract-empty-state.md)
- Same small leaf (icon + fixed-size wrapper) → [`extract-leaf-icon-slot`](patterns/extract-leaf-icon-slot.md)

---

## Project-specific current hotspots

> These examples are current Schema Forge failure modes. Future audits should search for the pattern, not only the exact file.

| Hotspot | Current evidence pattern | Correct owner |
|---|---|---|
| Invoice preview ownership | `sales-invoice/index.jsx` imports `../purchase-invoice/InvoicePreviewModal.jsx`; modal accepts `specName` and branches for sales invoice | neutral invoice/shared component |
| Address creation ownership | `PartnerAddressPicker.jsx` in `contract-ui` imports `windows/custom/contacts/LocationEditorModal.jsx` and derives `/contacts` API base | shared address editor/service or injected callback |
| Contacts/businessPartner aliasing | `contacts/BusinessPartnerSidebar.jsx` re-exports from `businessPartner`; quality-gate maps `businessPartner` to `contacts` | central alias metadata/policy |
| Internal Consumption lookup | `DataTable.jsx` imports `InternalConsumptionProductSearchDrawer`, branches on `internalConsumptionLine`, maps `_aux._LOC` to `storageBin` | contract `lookupRenderer`, `selectorResultMappings`, `displayFieldPolicy` |
| Commercial line amounts | `DetailView.jsx` knows `SL_Order_Amt`, `SL_Invoice_Amt`, quantity guards, gross/net fields | contract `calloutCascadePolicy`, `quantityGuardPolicy`, `lineAmountPolicy` |
| Selector protocol | `EntityForm`, `DataTable`, `CreateContactModal`, `LocationEditorModal`, quick hooks each normalize selector responses | `selectorClient` + `useSelectorSearch/useSelectorOptions` |
| Related documents | per-window `RelatedDocuments.jsx` graph traversal, de-dupe, lifecycle, and `DocChip` props | relation graph config + `useRelatedDocuments` + document-type chip registry |
| Pipeline default | `pipeline.js` falls back to `sales-order` when only `windowId` is supplied | required `windowName`, DB/menu resolution, or explicit legacy flag |
| Dashboard cards shell/empty-state/chevron | `CollectionsPaymentsCard`, `RecentSalesList`, `BestProductsList` inlined the same shell+header+empty-state+chevron | extracted to `dashboard/_shared/` — see [case](cases/2026-05-13-dashboard-cards.md) |

When reporting these, name the intended owner: contract metadata, decisions.json, generator, shared app-shell helper, window adapter, or quality-gate policy. Do not stop at "dedupe this".

---

## Common mistakes

| Mistake | Correction |
|---|---|
| Reporting every duplicate component | Report only repeated design decisions or wrong ownership. |
| Blaming generated files | Trace to generator, contract, decisions, or app-shell source. |
| Mixing Etendo module code into Schema Forge audit | Exclude `etendo_core` unless explicitly requested. |
| Calling a window-specific requirement a bug | It is only an architecture issue if it leaks across layer boundaries or repeats. |
| Suggesting incremental aliases by default | Default to clean cutover; name compatibility boundaries only if required. |
| Refactoring without prior tests | Always ensure consumer tests exist before extracting; add tests for new shared components after. |
| Hardcoding a value the original had as variable | If the original differed across consumers, expose as a prop. |

---

## Completion checklist (audit phase)

- [ ] Scope and exclusions are stated.
- [ ] No `etendo_core` findings included unless requested.
- [ ] Every issue has file/line evidence.
- [ ] Severity is justified.
- [ ] Generated artifacts are attributed to source causes.
- [ ] Recommendations name the target owner/layer or the applicable pattern.
- [ ] Report distinguishes observed facts from inference.

## Completion checklist (refactor phase)

- [ ] Pattern in `patterns/` matched or new pattern proposed and confirmed.
- [ ] Consumer tests existed (or were added) before refactor.
- [ ] Refactor preserves every original style/behavior, configurable via props when needed.
- [ ] Tests for the new shared component(s) added.
- [ ] Test suite green pre and post.
- [ ] Case file written in `cases/`.
- [ ] If pattern was new, added entry to `patterns/INDEX.md` and a `patterns/<name>.md` reference.

---

## Knowledge base

- [`patterns/`](patterns/) — named refactors with anti-pattern/refactored/prop-API/validation. Adding a new pattern requires at least one case file backing it.
- [`cases/`](cases/) — real refactors applied in this repo. Before/after, decisions, surprises, LOC delta. Future refactors cite these.
