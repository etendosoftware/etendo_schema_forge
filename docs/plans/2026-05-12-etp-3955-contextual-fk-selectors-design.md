# ETP-3955 Technical Design: Contextual FK Selectors for Agents

## Summary

ETP-3955 resolves the first and highest-impact blocker from the JuanCarlos agentic validation reports: agents cannot create transactional documents reliably because required FK selectors return empty results unless the caller already knows hidden context values or hardcodes IDs.

The design keeps Schema Forge responsible for declaring what context a selector needs, and keeps Etendo Go / NEO Headless responsible for resolving that context at runtime. The solution must work for both the React SPA and MCP agents.

This is a technical design only. It does not implement the feature.

## Problem Statement

Transactional document windows share a repeated failure mode:

- `partnerAddress` is required, but the selector returns no rows unless it receives the selected `businessPartner` as `C_BPartner_ID`.
- `invoiceAddress` is sometimes required by backend contracts but hidden or discarded from the form, leaving agents unclear on whether it must be supplied, defaulted, or derived.
- `priceList` is required, but selector results depend on sales/purchase mode and sometimes organization or business partner context.
- `transactionDocument` / `C_DocTypeTarget_ID` is required in several specs, but it is often hidden from the form and expected to come from defaults.
- line-level `tax` depends on sales/purchase mode, document date, price list, and sometimes partner address / tax zone.

The SPA already patches several of these cases with component-level selector context. MCP agents, however, call `neo_selectors` and `neo_create` directly and do not get the same implicit form state. The fix therefore cannot live only in the React components.

## Goals

- Make required document selectors return valid options when callers provide normal document state, not hardcoded IDs.
- Make selector context requirements discoverable from contracts / schema metadata.
- Preserve current SPA behavior.
- Avoid window-specific logic in generic NEO services.
- Use configuration first, and `NeoHandler` only for behavior that cannot be expressed generically.
- Cover sales, purchase, invoice, shipment/receipt, and return documents that share `C_Order`, `C_Invoice`, or `M_InOut`.

## Non-Goals

- Do not expose process execution; that is ETP-3956.
- Do not expose callouts as MCP tools; that is ETP-3957.
- Do not simplify large transactional schemas; that is ETP-3958.
- Do not create new classic AD/Jasper/classic-process implementation paths.
- Do not manually edit generated files under `artifacts/*/generated/`.

## Repository Ownership

This work spans two repositories. The split must stay explicit throughout implementation and review.

### `schema_forge`

`schema_forge` owns design-time metadata and generated contract shape. Changes here should declare selector context requirements, keep frontend behavior aligned, and produce documentation/tests that prove the contracts are correct.

Expected `schema_forge` changes:

- Update `decisions.json` source artifacts for affected specs where selector behavior is incorrectly classified, for example plain `selector` fields that should be `dependent`.
- Extend contract generation so selector entries expose machine-readable context requirements.
- Add curated selector-context overrides where raw AD validation metadata is missing from checked-in artifacts or insufficient.
- Centralize the React SPA selector-context builder so UI behavior is consistent and testable.
- Add Schema Forge tests for contract generation, selector metadata, and app-shell context derivation.
- Update functional docs and planning docs.

Out of scope for `schema_forge`:

- Executing MCP tools.
- Resolving runtime selector results from the database.
- Adding Java `NeoHandler` implementations.
- Persisting runtime configuration in Etendo source XML, except through normal exported database artifacts after `push-to-neo.js` when that step is part of implementation.

### `com.etendoerp.go`

`com.etendoerp.go` owns runtime NEO behavior, MCP tool execution, database-backed selector resolution, defaults, and entity-specific runtime fallbacks.

Expected `com.etendoerp.go` changes:

- Extend MCP `neo_selectors` to accept structured `recordContext` / `parentContext`, or expose equivalent selector-context metadata through `neo_schema` if structured context is deferred.
- Map contract selector metadata into NEO selector query parameters at runtime.
- Return actionable missing-context diagnostics for agent calls instead of undiagnosed empty selector responses where possible.
- Ensure `neo_defaults` / NEO defaults return hidden required values such as `transactionDocument` and required price list defaults.
- Add narrow per-entity `NeoHandler` fallbacks only when generic selector/default behavior cannot represent the rule.
- Add Java/runtime tests for NEO selector/default behavior and MCP tool behavior.

Out of scope for `com.etendoerp.go`:

- Curating which fields should be visible/editable in Schema Forge artifacts.
- Generating React code or contract JSON.
- Adding window-specific branches to generic NEO services.

### Cross-Repository Contract

The boundary between repositories is the generated contract / persisted `ETGO_SF_*` configuration:

1. `schema_forge` declares selector context requirements in source artifacts and generated contracts.
2. `push-to-neo.js` writes the relevant configuration into Etendo.
3. `com.etendoerp.go` reads runtime configuration and uses it to resolve selectors/defaults for SPA and MCP callers.

If a requirement cannot be represented in the contract/configuration, the implementation must either:

- add a generic representation to Schema Forge and NEO runtime, or
- use a per-entity `NeoHandler` in `com.etendoerp.go` with a documented reason.

It must not encode a spec-specific rule in a generic NEO service.

### Deliverables by Repository

| Deliverable | Repository | Notes |
|---|---|---|
| Selector context metadata shape | `schema_forge` | Define in source artifacts/contracts. |
| `decisions.json` selector normalization | `schema_forge` | Affected specs only; no generated-file edits. |
| `generate-contract.js` selector context output | `schema_forge` | Adds machine-readable context requirements. |
| App-shell selector context builder | `schema_forge` | Keeps SPA behavior equivalent and testable. |
| Contract/app-shell/E2E tests | `schema_forge` | Covers generated metadata and browser selector behavior. |
| MCP `neo_selectors` structured context | `com.etendoerp.go` | Accepts `recordContext` / `parentContext` and maps it to selector params. |
| Runtime missing-context diagnostics | `com.etendoerp.go` | Prevents silent empty results for agents. |
| NEO defaults for hidden required fields | `com.etendoerp.go` | Ensures `transactionDocument`, `priceList`, and derived addresses are available when safe. |
| Per-entity `NeoHandler` fallback logic | `com.etendoerp.go` | Only where generic configuration/runtime behavior cannot express the rule. |
| Java/MCP runtime tests | `com.etendoerp.go` | Covers selector/default behavior through runtime APIs. |
| Exported `ETGO_SF_*` data after push | `com.etendoerp.go` | Only if implementation runs `push-to-neo.js`; follow with `./gradlew export.database`. |

## Current Behavior and Evidence

### Schema Forge

Field extraction already parses AD validation rules in `cli/src/extract-fields.js`:

- `@#VAR@` becomes session context.
- `@FIELD@` becomes cascade / record context.

The parsed rule metadata is attached as `field.validationRule` when raw metadata is available. In the current checked-in artifacts, only `contract.json` and `decisions.json` are present for many target specs, so the design must not assume raw extraction files are available at implementation time.

`cli/src/resolve-curated.js` already converts `decisions.json` `dependsOn` declarations into field `inputMode: "dependent"`.

`cli/src/generate-contract.js` emits selector predictions, but the current prediction only lists endpoint URLs and basic reference metadata. It does not expose required context params in a machine-readable way.

### React SPA

The SPA already sends selector context in several places:

- `DetailView.jsx` computes `selectorContextByEntity`.
- Header selectors receive sales/purchase hints:
  - `isSOTrx=Y` for sales windows;
  - `isSOTrx=N` for purchase windows;
  - `isCustomer=Y` for sales;
  - `isVendor=Y` for purchases.
- Line selectors receive:
  - `parentId`;
  - `isSOTrx` and `IsSOTrx`;
  - current `priceList`;
  - `DateInvoiced`, derived from `invoiceDate` or `orderDate`.
- `EntityForm.jsx`, `DataTable.jsx`, `SelectorInput.jsx`, `CreatableSearchSelect.jsx`, and `PartnerAddressPicker.jsx` forward `selectorContext`.
- Dependent address fields pass `[dependsOn.filterKey]=parentValue`, for example `C_BPartner_ID=<businessPartner>`.

This proves the required data exists in normal form state, but that knowledge is currently spread across frontend components and not fully reflected in agent-facing metadata.

### NEO Headless / Runtime

NEO Headless supports selector endpoints:

`GET /sws/neo/{spec}/{entity}/selectors/{column}`

The selector implementation resolves OBUISEL and validation-rule params. Session variables can be resolved from `OBContext`; non-session variables must come from query parameters. The `NeoHandler` extension point can intercept `SELECTOR`, `DEFAULTS`, `CALLOUT`, and `CRUD` endpoint types per entity.

The project rule is explicit: do not put window-specific behavior into `NeoSelectorService`, `NeoDefaultsService`, `NeoCrudHandler`, or `NeoServlet`.

## Affected Selector Matrix

| Spec | Entity | Field | Column | Current issue | Required context |
|---|---|---|---|---|---|
| `sales-order` | `header` | `partnerAddress` | `C_BPartner_Location_ID` | empty without BP | `C_BPartner_ID`, active/customer address, org/client |
| `sales-order` | `header` | `priceList` | `M_PriceList_ID` | empty or wrong mode | `isSOTrx=Y`, org/client, optional BP default |
| `sales-order` | `lines` | `tax` | `C_Tax_ID` | empty without date/SO context | `IsSOTrx=Y`, `DateInvoiced`/`DateOrdered`, price list, partner address |
| `sales-quotation` | `quotation` | `partnerAddress` | `C_BPartner_Location_ID` | same as sales order | `C_BPartner_ID`, active/customer address |
| `sales-quotation` | `quotation` | `priceList` | `M_PriceList_ID` | mode-specific | `isSOTrx=Y` |
| `sales-quotation` | `quotationLine` | `tax` | `C_Tax_ID` | date/SO context | `IsSOTrx=Y`, date, price list, partner address |
| `sales-invoice` | `header` | `partnerAddress` | `C_BPartner_Location_ID` | empty without BP | `C_BPartner_ID`, active/customer billing address |
| `sales-invoice` | `header` | `priceList` | `M_PriceList_ID` | mode-specific | `isSOTrx=Y` |
| `sales-invoice` | `lines` | `tax` | `C_Tax_ID` | date/SO context | `IsSOTrx=Y`, `DateInvoiced`, price list, partner address |
| `purchase-order` | `header` | `partnerAddress` | `C_BPartner_Location_ID` | empty without vendor | `C_BPartner_ID`, active/vendor address |
| `purchase-order` | `header` | `transactionDocument` | `C_DocTypeTarget_ID` | hidden but required | default or doc-base filter |
| `purchase-order` | `header` | `priceList` | `M_PriceList_ID` | mode-specific | `isSOTrx=N` |
| `purchase-order` | `lines` | `tax` | `C_Tax_ID` | date/PO context | `IsSOTrx=N`, date, price list, partner address |
| `purchase-invoice` | `header` | `partnerAddress` | `C_BPartner_Location_ID` | empty without vendor | `C_BPartner_ID`, active/vendor billing address |
| `purchase-invoice` | `header` | `transactionDocument` | `C_DocTypeTarget_ID` | hidden but required | default or doc-base filter |
| `purchase-invoice` | `header` | `priceList` | `M_PriceList_ID` | mode-specific | `isSOTrx=N` |
| `purchase-invoice` | `lines` | `tax` | `C_Tax_ID` | date/PO context | `IsSOTrx=N`, `DateInvoiced`, price list, partner address |
| `goods-receipt` | `goodsReceipt` | `partnerAddress` | `C_BPartner_Location_ID` | empty without vendor | `C_BPartner_ID`, vendor address |
| `goods-shipment` | `goodsShipment` | `partnerAddress` | `C_BPartner_Location_ID` | empty without customer | `C_BPartner_ID`, customer address |
| `return-from-customer` | `customerReturn` | `partnerAddress` | `C_BPartner_Location_ID` | empty without customer | `C_BPartner_ID`, customer address |
| `return-from-customer` | `customerReturnLine` | `tax` | `C_Tax_ID` | return document context | `IsSOTrx=Y`, date, price list, partner address |
| `return-to-vendor` | `header` | `partnerAddress` | `C_BPartner_Location_ID` | currently selector, not dependent | should become dependent on `businessPartner` |
| `return-to-vendor` | `header` | `priceList` | `M_PriceList_ID` | mode-specific | `isSOTrx=N` |
| `return-to-vendor` | `lines` | `tax` | `C_Tax_ID` | currently search, not selector | should use purchase tax context |
| `return-material-receipt` | `returnMaterialReceipt` | `partnerAddress` | `C_BPartner_Location_ID` | empty without customer | `C_BPartner_ID`, customer address |
| `return-to-vendor-shipment` | `header` | `partnerAddress` | `C_BPartner_Location_ID` | currently selector, not dependent | should become dependent on `businessPartner` |

## Proposed Architecture

### Layer 1: Selector Context Contract

Add explicit selector context metadata to generated contracts. The metadata should be generated from:

1. `field.dependsOn` declarations in `decisions.json`;
2. parsed `validationRule.contextParams` and `validationRule.cascadeParams` when available;
3. curated overrides for known document fields where raw metadata is unavailable or insufficient.

Proposed shape:

```json
{
  "entity": "header",
  "field": "partnerAddress",
  "column": "C_BPartner_Location_ID",
  "inputMode": "dependent",
  "context": {
    "required": [
      { "param": "C_BPartner_ID", "source": "field", "field": "businessPartner" }
    ],
    "optional": [
      { "param": "isCustomer", "source": "windowCategory", "valueWhen": { "category": "sales", "value": "Y" } },
      { "param": "isVendor", "source": "windowCategory", "valueWhen": { "category": "purchases", "value": "Y" } }
    ],
    "fallbacks": [
      "If no address is selected but exactly one valid address exists, auto-select it in defaults/create helpers."
    ]
  }
}
```

For tax selectors:

```json
{
  "entity": "lines",
  "field": "tax",
  "column": "C_Tax_ID",
  "context": {
    "required": [
      { "param": "IsSOTrx", "source": "windowCategory" },
      { "param": "DateInvoiced", "source": "parentField", "field": "invoiceDate", "fallbackField": "orderDate", "format": "DD-MM-YYYY" }
    ],
    "recommended": [
      { "param": "priceList", "source": "parentField", "field": "priceList" },
      { "param": "C_BPartner_Location_ID", "source": "parentField", "field": "partnerAddress" }
    ]
  }
}
```

This metadata should live in `contract.json` under API prediction or backend/frontend contract fields. The exact location can be decided during implementation, but it must be generated from source artifacts, not hand-edited in generated output.

### Layer 2: Shared Selector Context Builder

Create a small shared JavaScript helper in the app-shell layer that builds selector context from a contract field, current record, parent record, and window category. This replaces the ad hoc logic currently embedded in `DetailView.jsx` and gives tests a stable unit.

Candidate module:

`tools/app-shell/src/lib/selectorContext.js`

Proposed API:

```js
export function buildSelectorContext({
  windowCategory,
  entityName,
  field,
  record,
  parentRecord,
  parentId,
  selectorContextSpec,
}) {
  // returns query params for selector endpoint
}
```

Responsibilities:

- derive `isSOTrx`, `IsSOTrx`, `isCustomer`, `isVendor` from the window category;
- map `dependsOn` to filter params, e.g. `C_BPartner_ID`;
- derive line-level `parentId`;
- derive `priceList` from parent header;
- derive `DateInvoiced` from `invoiceDate` or `orderDate`;
- format dates to the legacy `DD-MM-YYYY` format when needed;
- omit null/empty params;
- preserve existing SPA behavior.

The helper is not the full fix for MCP, but it prevents SPA regressions and centralizes the behavior that the runtime/MCP must match.

### Layer 3: Runtime Selector Context Resolution

MCP callers cannot be expected to reimplement UI context rules. NEO should support a richer selector call that accepts either explicit query params or a `recordContext` object.

Preferred runtime behavior:

- Existing selector endpoint remains compatible:

  `GET /sws/neo/{spec}/{entity}/selectors/{column}?C_BPartner_ID=...`

- MCP `neo_selectors` accepts optional `recordContext`:

```json
{
  "spec": "sales-order",
  "entity": "header",
  "field": "partnerAddress",
  "recordContext": {
    "businessPartner": "..."
  }
}
```

- The MCP router maps `recordContext` to selector query params using contract metadata:
  - `businessPartner` -> `C_BPartner_ID`;
  - window category -> `isSOTrx`, `IsSOTrx`, `isCustomer`, `isVendor`;
  - parent/header date -> `DateInvoiced`;
  - parent/header price list -> `priceList`.

If adding `recordContext` to MCP is out of scope for ETP-3955, the minimum acceptable runtime design is to document the query params in `neo_schema`/`neo_discover` so agents can pass them explicitly.

### Layer 4: Defaults and Create-Time Fallbacks

Selectors alone do not fix hidden required fields. Agents need create payloads to succeed with normal business inputs.

Required behavior:

- `GET /defaults` for document headers should return valid defaults for hidden required fields such as `transactionDocument` and default `priceList` whenever Etendo can derive them from org/role/window context.
- When `businessPartner` is provided to create/update defaults or callout flows, defaults/callouts should derive:
  - `partnerAddress` when exactly one valid address exists or when BP has a configured default;
  - `invoiceAddress` when backend still requires it;
  - `paymentTerms`, `paymentMethod`, and `priceList` where existing BP callouts already support them.

Implementation options:

1. Prefer existing `NeoDefaultsService` / callout cascade if it already derives the field.
2. Add per-entity `NeoHandler` defaults enrichment only where a generic default cannot be derived.
3. Avoid making required fields optional unless the backend truly does not require them.

### Layer 5: Per-Window NeoHandler Fallbacks

Use `NeoHandler` only when generic selector context and defaults are insufficient.

Likely handlers:

- `SalesOrderHeaderHandler`
- `PurchaseOrderHeaderHandler`
- `SalesInvoiceHeaderHandler`
- `PurchaseInvoiceHeaderHandler`
- `SalesQuotationHeaderHandler`
- `GoodsReceiptHeaderHandler`
- `GoodsShipmentHeaderHandler`
- return document header handlers as needed

Handler responsibilities should stay narrow:

- enrich `DEFAULTS` responses with a deterministic default document type or price list;
- post-process `SELECTOR` responses only when a known AD selector cannot express required filtering;
- in `CRUD` POST, reject missing context with a clear error when no safe default exists;
- never hardcode record IDs.

Do not add `if (specName.equals("sales-order"))` branches to generic services.

## Detailed Design by Field

### `partnerAddress`

Desired behavior:

- Header address selector is always dependent on `businessPartner`.
- The selector query includes `C_BPartner_ID=<businessPartner>`.
- Sales windows prefer customer/invoice/ship-to addresses as appropriate.
- Purchase windows prefer vendor addresses as appropriate.
- If exactly one valid address exists, UI/default helpers may auto-select it.
- If more than one exists, selector returns all valid options and does not guess.
- If none exist, the error/help text should say the BP has no valid address in the current org/context.

Schema Forge changes:

- Normalize all document address fields to:

```json
{
  "inputMode": "dependent",
  "dependsOn": { "field": "businessPartner", "filterKey": "C_BPartner_ID" }
}
```

- Apply especially to:
  - `return-to-vendor.header.partnerAddress`;
  - `return-to-vendor-shipment.header.partnerAddress`;
  - any remaining `BPartner_Location` reference that is currently a plain selector.

Runtime changes:

- Confirm `NeoSelectorService` accepts either field key or column name, because UI calls `/selectors/{column}` while contract prediction often shows `/selectors/{field}`.
- Ensure `C_BPartner_ID` filters both `BusinessPartnerLocation` and `BPartner_Location` references consistently.
- If AD validation uses a different param name, expose the mapping in selector context metadata.

Tests:

- `sales-order/header/selectors/C_BPartner_Location_ID?C_BPartner_ID=<customer>` returns `count > 0`.
- `purchase-order/header/selectors/C_BPartner_Location_ID?C_BPartner_ID=<vendor>` returns `count > 0`.
- `goods-receipt/goodsReceipt/selectors/C_BPartner_Location_ID?C_BPartner_ID=<vendor>` returns `count > 0`.
- no-results case returns an empty list with a diagnostic, not HTTP 500.

### `invoiceAddress`

Desired behavior:

- If backend requires `invoiceAddress`, it must be either visible/selectable, defaulted, or derived before create.
- If backend no longer requires it for a spec, mark it as system/discarded consistently and make sure create does not require it.

Schema Forge changes:

- Audit each C_Order spec where `invoiceAddress` appears in the backend detail payload.
- For `sales-order`, `purchase-order`, `sales-quotation`, and return orders, classify `invoiceAddress` explicitly:
  - `system` if always derived from `partnerAddress` / BP billing location;
  - `editable` + dependent if users/agents must choose it;
  - never ambiguous hidden-required.

Runtime changes:

- Defaults/callout cascade should derive it from BP locations when hidden.
- If multiple billing addresses exist and the field is hidden, create should fail with an actionable message rather than choosing arbitrarily.

Tests:

- Creating a sales order from BP + partner address succeeds without hardcoding `invoiceAddress` if the field is configured as system-derived.
- If configured editable, selector returns values with `C_BPartner_ID`.

### `priceList`

Desired behavior:

- Sales specs list sales price lists.
- Purchase specs list purchase price lists.
- Defaults return the org/BP preferred list when available.
- Agents can discover that the selector needs sales/purchase mode.

Schema Forge changes:

- Add selector context metadata:
  - sales: `isSOTrx=Y`;
  - purchases: `isSOTrx=N`.
- Keep `priceList` visible where users/agents are expected to choose it.
- For hidden price list use cases, verify default source is present.

Runtime changes:

- MCP `neo_selectors` should infer `isSOTrx` from spec/category when omitted.
- `neo_defaults` should include default `priceList` for transactional document headers where required.

Tests:

- `sales-order/header/selectors/M_PriceList_ID?isSOTrx=Y` returns sales lists only.
- `purchase-order/header/selectors/M_PriceList_ID?isSOTrx=N` returns purchase lists only.
- Calling MCP selectors without explicit `isSOTrx` still returns the correct mode if the tool has spec metadata.

### `transactionDocument`

Desired behavior:

- Hidden `transactionDocument` / `C_DocTypeTarget_ID` fields must come from defaults.
- Agent flows should not need to select a document type unless the business process has multiple valid choices.
- If multiple choices exist, selector metadata must explain the discriminator.

Schema Forge changes:

- Keep hidden required document-type fields as `system` or `editable form=false` only if defaults are reliable.
- Add explicit default expectations per spec:
  - sales order -> standard sales order document type;
  - sales quotation -> quotation document type;
  - purchase order -> purchase order document type;
  - sales invoice -> AR invoice;
  - purchase invoice -> AP invoice;
  - returns -> corresponding return document type.

Runtime changes:

- Verify `GET /defaults` returns `transactionDocument` for every affected header entity.
- If not, add per-header `NeoHandler` default enrichment based on document base type or AD window/process context.

Tests:

- `GET /sws/neo/{spec}/{header}/defaults` includes `transactionDocument` where required.
- Creating a header without `transactionDocument` succeeds when defaults can derive it.
- If explicit selection is needed, selector returns valid options and metadata explains required params.

### `tax`

Desired behavior:

- Line tax selectors should return valid taxes with normal document state.
- Tax selectors should not require agents to know Classic validation variables.
- Date formatting must be handled centrally because current Etendo SQL rules expect `DD-MM-YYYY`.

Schema Forge changes:

- Add selector context metadata for tax fields:
  - `IsSOTrx`;
  - `DateInvoiced`, source `invoiceDate` or `orderDate`, format `DD-MM-YYYY`;
  - `priceList`;
  - `C_BPartner_Location_ID` / `partnerAddress` if used by tax zone rules.
- Normalize return-document line tax fields from `search` to `selector` where the intended UX is a finite dropdown.

Runtime changes:

- MCP `neo_selectors` maps record/header context to tax params.
- If `recordContext` contains ISO date, runtime or MCP router formats it for Classic validation.
- Optionally include auxiliary tax data such as rate in selector result, matching current frontend expectations.

Tests:

- Sales line tax selector with order/invoice date returns sales taxes.
- Purchase line tax selector with order/invoice date returns purchase taxes.
- ISO input date in MCP context is accepted and converted correctly.
- Missing date returns an actionable missing-context response rather than an empty undiagnosed list.

## API and Metadata Design

### Contract Additions

Add selector context to each selector entry:

```json
{
  "field": "tax",
  "column": "C_Tax_ID",
  "context": {
    "required": [
      { "param": "IsSOTrx", "source": "windowCategory" },
      { "param": "DateInvoiced", "source": "parentField", "field": "invoiceDate", "fallbackField": "orderDate", "format": "DD-MM-YYYY" }
    ],
    "recommended": [
      { "param": "priceList", "source": "parentField", "field": "priceList" },
      { "param": "C_BPartner_Location_ID", "source": "parentField", "field": "partnerAddress" }
    ]
  }
}
```

For dependent fields:

```json
{
  "field": "partnerAddress",
  "column": "C_BPartner_Location_ID",
  "context": {
    "required": [
      { "param": "C_BPartner_ID", "source": "field", "field": "businessPartner" }
    ]
  }
}
```

### MCP Tool Behavior

Existing:

```json
{
  "spec": "sales-order",
  "entity": "header",
  "field": "partnerAddress"
}
```

Proposed:

```json
{
  "spec": "sales-order",
  "entity": "header",
  "field": "partnerAddress",
  "recordContext": {
    "businessPartner": "..."
  }
}
```

Tool behavior:

1. Load selector metadata for spec/entity/field.
2. Convert `recordContext` into selector params.
3. Add inferred window/session params.
4. Call NEO selector endpoint.
5. Return:

```json
{
  "items": [
    { "id": "...", "label": "..." }
  ],
  "contextUsed": {
    "C_BPartner_ID": "...",
    "isCustomer": "Y"
  },
  "missingContext": []
}
```

If required context is missing:

```json
{
  "items": [],
  "missingContext": [
    {
      "param": "C_BPartner_ID",
      "source": "field",
      "field": "businessPartner",
      "message": "Select or provide businessPartner before resolving partnerAddress."
    }
  ]
}
```

## Implementation Plan

### Step 1: Inventory and Reproduction

Owner: `schema_forge` for artifact/contract inventory, plus optional `com.etendoerp.go` runtime instance for live endpoint reproduction.

- Create an automated selector inventory script for the affected specs.
- For each selector, run with no context and with expected context.
- Record whether the failure is:
  - missing context;
  - bad field/column URL mismatch;
  - missing defaults;
  - access denied;
  - no fixture data;
  - real domain rule no-results.

Suggested script output:

```text
spec,entity,field,column,noContextCount,withContextCount,missingParams,status
```

### Step 2: Normalize `decisions.json`

Owner: `schema_forge`.

- Add missing `dependsOn` metadata for address fields.
- Normalize input modes where current artifacts disagree with expected UX.
- Explicitly classify hidden required fields (`invoiceAddress`, `transactionDocument`) as system/defaulted or visible/dependent.
- Do not edit generated outputs.

### Step 3: Generate Selector Context Metadata

Owner: `schema_forge`.

- Extend `generate-contract.js` selector predictions to include context requirements.
- Source context from:
  - field `dependsOn`;
  - validation rule params if present;
  - curated selector context overrides in `decisions.json`.
- Add contract tests for generated context metadata.

### Step 4: Centralize Frontend Selector Context

Owner: `schema_forge`.

- Extract current `DetailView.jsx` selector-context derivation into `tools/app-shell/src/lib/selectorContext.js`.
- Add unit tests for:
  - sales header;
  - purchase header;
  - sales line tax;
  - purchase line tax;
  - ISO to `DD-MM-YYYY` date conversion;
  - dependent address mapping.
- Keep UI behavior equivalent.

### Step 5: MCP / Runtime Context Mapping

Owner: `com.etendoerp.go`.

- Extend MCP `neo_selectors` to accept `recordContext` and `parentContext`.
- Use generated metadata to build query params.
- Include `contextUsed` and `missingContext` in responses.
- If the MCP layer cannot be changed in this task, expose the same metadata through `neo_schema` and document explicit query params.

### Step 6: Defaults and Hidden Required Fields

Owner: `com.etendoerp.go`, using metadata/configuration produced by `schema_forge`.

- Verify default payloads for all affected specs.
- Add defaults enrichment through existing defaults service or per-entity `NeoHandler` where necessary.
- Avoid arbitrary defaults when multiple valid choices exist.

### Step 7: Tests

Owners:

- `schema_forge`: contract-generation tests, app-shell selector-context tests, E2E/browser regression tests, documentation.
- `com.etendoerp.go`: Java/runtime selector/default tests and MCP tool tests.

Tasks:

- Add endpoint tests for contextual selectors.
- Add focused frontend unit tests for selector-context builder.
- Add or update E2E tests where existing coverage already targets partner address.
- Add MCP-level tests if the MCP tool accepts `recordContext`.

## Test Strategy

### Unit Tests

Schema Forge:

- `generate-contract` emits selector context metadata for dependent fields.
- `generate-contract` emits context metadata for tax fields based on curated overrides.

App shell:

- `buildSelectorContext` maps sales/purchase categories correctly.
- `buildSelectorContext` maps dependent BP address params correctly.
- `buildSelectorContext` formats ISO dates as `DD-MM-YYYY` for Classic validation rules.
- Existing `DetailView` behavior still passes.

### Endpoint Tests

Add scripts similar to `tests/test-sales-order-endpoints.sh`, but without hardcoded business IDs except fixture discovery steps:

1. list/select a business partner from the BP selector;
2. resolve address selector using that BP;
3. get defaults;
4. create draft header using selector/default values;
5. resolve line tax selector using header context.

Target scripts:

- `tests/test-contextual-selectors-sales-order.sh`
- `tests/test-contextual-selectors-purchase-order.sh`
- optional shared Node script if bash becomes too brittle.

### Integration Gates Added 2026-05-19

The non-MCP cut risk is covered by two integration gates:

- `cli/test/etendogo-agentic-risk-integration.test.js` runs in the normal Node test suite. It checks the real generated contracts against the app-shell selector-context builder for sales/purchase orders, sales/purchase invoices, goods receipt, and goods shipment. This keeps BP address, price list, tax, and transaction document context metadata aligned without requiring a live backend.
- `e2e/tests/flows/etendogo-contextual-selectors.integration.spec.js` is an opt-in live Etendo GO smoke. Run it with `cd e2e && ETENDO_URL=http://localhost:8080/etendo npm run test:etendogo-contextual-selectors`.

Known bug detected by the live smoke:

- [ETP-4058](https://etendoproject.atlassian.net/browse/ETP-4058): generated selector URLs use logical field names such as `partnerAddress` and `priceList`, while the local runtime rejects them with `404 Field not found or not included`; some column-name variants, such as `M_PriceList_ID`, are accepted.

### E2E Tests

Existing:

- `e2e/tests/flows/purchase-order-partner-address-bug.spec.js`
- `e2e/tests/flows/sales-order-crud.spec.js`
- `e2e/tests/flows/purchase-order-create.spec.js`

Add or update:

- sales invoice partner address resolution;
- purchase invoice partner address resolution;
- line tax dropdown has options after date/partner/price list context exists.

### MCP Tests

If MCP changes are included:

- `neo_selectors` for `partnerAddress` with `recordContext.businessPartner` returns options.
- `neo_selectors` for line `tax` with parent/header context returns options.
- missing context response includes `missingContext`, not a silent empty list.

## Edge Cases

- Business partner has no active address: selector returns empty with diagnostic; create fails with actionable message.
- Business partner has multiple valid addresses: selector returns all; defaults do not guess unless BP/default flags identify one.
- Business partner is customer and vendor: sales/purchase hints must filter by active role where AD rules support it.
- Date is missing for tax selector: response reports missing `DateInvoiced` / date context.
- Date is ISO formatted: builder converts to `DD-MM-YYYY` before passing Classic validation params.
- Price list missing for line tax: selector still returns broad valid taxes when possible, but marks `priceList` as recommended context.
- Hidden required `transactionDocument` missing from defaults: create is blocked before persistence with a specific error.
- Access denied spec such as `bp-location`: do not treat as selector bug; report as RBAC/configuration gap.
- Existing records with stale FK values: read-only rendering still displays current `$_identifier` even if selector no longer offers the value.

## Migration and Deployment

- Run the affected pipeline phases in order after decisions/contract changes.
- If `push-to-neo.js` is executed for any spec, run `./gradlew export.database` in the Etendo root afterward.
- Keep all versioned repository content in English.
- Do not manually edit generated outputs.

## Risks

- Context metadata may duplicate logic already embedded in AD validation rules. Mitigation: generate from raw validation rules where available, use curated overrides only for known gaps.
- MCP changes may require updates in the Etendo Go repository, not only Schema Forge. Mitigation: keep contract metadata and runtime behavior separately reviewable.
- Making hidden fields visible could change UX. Mitigation: prefer defaults/system derivation for fields users should not manage.
- Auto-selecting the first address could be wrong when multiple addresses exist. Mitigation: auto-select only a single unambiguous option.
- Date-format handling is fragile because Classic validation rules expect `DD-MM-YYYY`. Mitigation: centralize conversion and test it.

## Open Questions

- Should selector context metadata be persisted into `ETGO_SF_FIELD`, or is contract/MCP metadata enough?
- Should `neo_selectors` accept `recordContext` as a structured object, or should agents pass raw selector query params?
- Should hidden required `invoiceAddress` be made visible in order specs or derived from partner address/BP billing defaults?
- Can all document-type defaults be derived generically from AD window/spec configuration, or do returns require per-window handlers?
- Should no-results selector responses include diagnostics at the NEO endpoint level or only at MCP tool level?

## Acceptance Checklist

- [x] Address selectors return options with only `businessPartner` context. *(schema_forge: decisions.json normalized, contract context metadata generated)*
- [x] Price list selectors return mode-correct options for sales and purchase specs. *(schema_forge: context metadata with isSOTrx from window category)*
- [ ] Document-type defaults are available for hidden required `transactionDocument` fields. *(com.etendoerp.go: verify neo_defaults, add NeoHandler if needed)*
- [ ] Tax selectors return valid options with date and SO/PO context. *(com.etendoerp.go: map DateInvoiced context to selector params)*
- [x] Selector context requirements are visible in generated contracts or MCP schema output. *(schema_forge: apiPrediction.selectors[].context)*
- [ ] MCP agents can resolve required FK values without hardcoding IDs. *(com.etendoerp.go: extend neo_selectors with recordContext)*
- [x] No window-specific logic is added to generic NEO services. *(schema_forge: generic buildSelectorContext, no spec-specific branches)*
- [x] Tests cover sales, purchase, invoice, receipt/shipment, and return representative flows. *(schema_forge: 34 selectorContext tests + 5 contract generation tests)*

## References

- Jira: ETP-3955
- Planning overview: `docs/plans/2026-05-12-agentic-corrections-plan.md`
- MCP gap analysis: `docs/plans/etendo-go-mcp-gap-analysis.md`
- NEO extensibility: `docs/neo-headless-extensibility.md`
- Window guides:
  - `docs/generated-custom-windows/sales-order.md`
  - `docs/generated-custom-windows/sales-invoice.md`
  - `docs/generated-custom-windows/purchase-order.md`
  - `docs/generated-custom-windows/purchase-invoice.md`
  - `docs/generated-custom-windows/goods-receipt.md`
  - `docs/generated-custom-windows/goods-shipment.md`
  - `docs/generated-custom-windows/sales-quotation.md`
