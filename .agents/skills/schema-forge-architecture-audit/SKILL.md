---
name: schema-forge-architecture-audit
description: Use when auditing Schema Forge for architecture drift, duplicated window logic, cross-window dependencies, shared code in concrete windows, selector repetition, related-document duplication, or generic components containing window-specific fixes.
---

# Schema Forge Architecture Audit

## Overview

Audit Schema Forge architecture boundaries with evidence. The goal is not to list every duplicate line; it is to identify design decisions that are represented in the wrong place, repeated across windows, or leaking into generic layers.

Default scope is the `schema-forge` repository only. Do **not** inspect `etendo_core` module code unless the user explicitly asks for Etendo module code.

## Non-Negotiables

- Read-only unless the user explicitly asks for fixes.
- Do not report generated output as the root cause. Attribute generated repetition to the generator/template/contract source when possible.
- Every issue needs exact file paths and observed evidence.
- Mark inference explicitly.
- Separate architecture smells from normal per-window configuration.
- Severity must be justified by blast radius, coupling, and maintenance risk.

## Audit Areas

| Area | Smell | Where to look |
|---|---|---|
| Cross-window imports | A custom window imports another concrete window | `tools/app-shell/src/windows/custom/**` |
| Misplaced shared code | Generic/shared code imports from `windows/custom/<window>` or reusable code lives under one window | `tools/app-shell/src/components`, `tools/app-shell/src/windows/custom` |
| Selector duplication | Multiple components hand-roll selector fetch, pagination, mapping, fallback URLs, or result normalization | `tools/app-shell/src/components/contract-ui`, `tools/app-shell/src/hooks`, `tools/app-shell/src/windows/custom` |
| Related documents duplication | Each window redefines relation graph, fetches, chip rendering, dedupe, status mapping | `RelatedDocuments.jsx`, `components/related-documents`, `artifacts/*/(decisions|contract).json` |
| Specific fixes in generic code | Generic UI/CLI code branches on concrete window/entity/field names | `tools/app-shell/src/components`, `tools/app-shell/src/hooks`, `cli/src` |
| Backend generation drift | Schema Forge CLI embeds backend/window-specific behavior in generic pipeline code | `cli/src`, not `etendo_core` unless requested |

## Required Workflow

1. **Confirm scope**
   - Verify repository path and branch.
   - State if dirty working tree exists, but do not modify it.
   - If user says “Schema Forge only”, exclude `etendo_core`.

2. **Map source layers**
   - Frontend generic: `tools/app-shell/src/components`, `tools/app-shell/src/hooks`, `tools/app-shell/src/lib`.
   - Frontend windows: `tools/app-shell/src/windows/custom/<window>`.
   - CLI/generators: `cli/src`.
   - Artifacts: `artifacts/*` for configuration/source clues only; never treat `artifacts/*/generated` as the fix target.

3. **Search before reading**
   Use targeted searches for:
   - Cross-window imports: `@/windows/custom/`, `from '../<window>/`, `../../windows/custom/`, one-line re-exports `export { default } from '@/windows/custom/`.
   - Selector duplication: `selectors/`, `serverResults`, `fetchServerResults`, `fetchAllPages`, `fetchSelectorPage`, `parseSelectorItems`, `SELECTOR_PAGE`, `hasMore`, `offsetRef`, `data?.items`, `data?.response?.data`, `Array.isArray(data)`, `label || name`, `label ?? name`.
   - Contacts selector policy drift: `countrySelectors`, `selectorBases`, `C_Country_ID`, `C_Region_ID`, `country`, `region`, `locationAddress/selectors`, `bankAccount/selectors`, `intrastatAdquisitions/selectors`.
   - Related documents: `RelatedDocuments`, `RelatedDocumentsShell`, `DocChip`, `relatedDocuments`, `fetchPayments`, `fetchLinkedDocuments`, `fetchChild`, `fetchByCriteria`, `fetchById`, `new Set()`, `chips.push`, `neoBase(apiBaseUrl)`.
   - Generic-layer concrete leaks: `entity ===`, `field.key ===`, `col.key ===`, `windowName ===`, `customDir ===`, `aliases =`, `internalConsumptionLine`, `InternalConsumptionProductSearchDrawer`, `contacts`, `businessPartner`, `sales-order`.
   - Document-line policies in generic UI: `standardPrice`, `grossUnitPrice`, `grossListPrice`, `netUnitPrice`, `unitPrice`, `listPrice`, `lineNetAmount`, `grossAmount`, `taxRate`, `orderedQuantity`, `invoicedQuantity`, `movementQuantity`, `SL_Order_Amt`, `SL_Invoice_Amt`, `PriceActual`, `inpgrossUnitPrice`.
   - Selector context leaks: `isSOTrx`, `IsSOTrx`, `isCustomer`, `isVendor`, `DateInvoiced`, `invoiceDate`, `orderDate`, `priceList`.

4. **Read evidence sections**
   For each candidate, read enough context to answer:
   - What layer is this file in?
   - What concrete concept does it know about?
   - Is the concept repeated elsewhere?
   - Is this config, shared behavior, or a workaround?

5. **Classify severity**

| Severity | Criteria |
|---|---|
| Critical | Wrong-layer logic can corrupt generated output or broadly mis-route pipeline behavior across many windows. |
| High | Cross-window dependency or generic-to-window dependency that makes unrelated windows break together. |
| Medium | Repeated domain logic across several windows/components with likely divergence or inconsistent bug fixes. |
| Low | Localized hardcoded compatibility fallback or naming smell with limited blast radius. |

6. **Report with recommendation**
   Recommend the smallest architectural move that restores one concept/one representation.

## Report Format

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
- [target layer/config/helper/generator]
- [clean cutover; no aliases unless compatibility requires it]

Confidence: High|Medium|Low
```

## Evidence Patterns

### Cross-window import

Report when a concrete window imports another concrete window:

```jsx
// Bad architecture boundary
import InvoicePreviewModal from '../purchase-invoice/InvoicePreviewModal.jsx';
```

Better direction: move reusable component to `windows/custom/shared`, `components/contract-ui`, or another neutral layer; both windows import it.

### Generic code importing window code

Report when generic components depend on a custom window:

```jsx
// Bad: shared component depends on contacts implementation
import LocationEditorModal from '../../windows/custom/contacts/LocationEditorModal.jsx';
```

Better direction: generic code depends on generic/shared implementation; windows supply config or callbacks.

### Selector repetition

Report when multiple places independently implement selector fetch concerns:

- URL construction for `/selectors/`.
- Bearer headers.
- `{ id, label || name || id }` mapping.
- pagination loops.
- fallback selector URL arrays.
- local/server result reconciliation.

Better direction: shared `fetchSelectorOptions`, `fetchAllSelectorPages`, and `useSelectorSearch` with one normalization shape.

### Related documents repetition

Repeated `RelatedDocuments.jsx` files are not automatically bad. Report when they duplicate relation graph traversal, fetch/dedupe/status/chip rendering patterns that could be declarative.

Better direction: `relatedDocuments` config should describe document graph edges; shared renderer/hook performs fetch, dedupe, status labels, and routing.

### Specific fixes in generic code

Report concrete names in generic layers:

```js
if (entity === 'internalConsumptionLine' && field.key === 'product') { ... }
if (windowName === 'contacts') { ... }
```

Better direction: declare behavior in metadata (`selectorResultMappings`, aliases, field policies, line amount policy) and let generic code execute the declaration.

## Project-Specific Current Hotspots

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

When reporting these, name the intended owner: contract metadata, decisions.json, generator, shared app-shell helper, window adapter, or quality-gate policy. Do not stop at “dedupe this”.

## Common Mistakes

| Mistake | Correction |
|---|---|
| Reporting every duplicate component | Report only repeated design decisions or wrong ownership. |
| Blaming generated files | Trace to generator, contract, decisions, or app-shell source. |
| Mixing Etendo module code into Schema Forge audit | Exclude `etendo_core` unless explicitly requested. |
| Calling a window-specific requirement a bug | It is only an architecture issue if it leaks across layer boundaries or repeats. |
| Suggesting incremental aliases by default | Default to clean cutover; name compatibility boundaries only if required. |

## Completion Checklist

Before yielding:

- [ ] Scope and exclusions are stated.
- [ ] No `etendo_core` findings included unless requested.
- [ ] Every issue has file/line evidence.
- [ ] Severity is justified.
- [ ] Generated artifacts are attributed to source causes.
- [ ] Recommendations name the target owner/layer.
- [ ] Report distinguishes observed facts from inference.
