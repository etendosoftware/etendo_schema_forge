---
name: schema-forge-pipeline
description: Use when working with Schema Forge windows — generating, regenerating, or modifying frontend/backend code from schemas and contracts. Triggers: "regenerate window", "update schema", "generate frontend", "run pipeline", "contract.json", "schema-curated", working in artifacts/ directory.
---

# Schema Forge Pipeline

## Overview

Schema Forge transforms Etendo ERP metadata into production code through a deterministic pipeline. Every window follows: **extract -> validate -> classify -> curate -> contract -> generate -> test**.

Never write generated code by hand. Always use the pipeline.

## Pipeline Phases

```
F1a: extract-fields ─┐
F1b: extract-rules  ─┤
F2:  validate        ─┤── Requires DB connection
F3:  pre-classify    ─┘
F4:  human-decisions ──── Interactive (Decision Panel)
F6:  generate-contract ─┐
F7:  generate-backend  ─┤── From curated artifacts
F8:  generate-frontend ─┤
F9:  run-tests         ─┘
```

## Quick Reference

| Task | Command |
|------|---------|
| Full pipeline | `node cli/src/pipeline.js <windowId> [windowName]` |
| Generate frontend only | `node cli/src/generate-frontend.js artifacts/<window>/contract.json` |
| Generate mock data | `node cli/src/generate-mock-data.js artifacts/<window>/contract.json` |
| Generate contract | Read schema-curated + rules-curated + processes, call `generateContract()` |
| Run contract tests | `node cli/src/run-contract-tests.js artifacts/<window>/contract.json` |
| Run all CLI tests | `make test` or `cd cli && node --test 'test/*.test.js'` |
| Dev server | `make dev` (localhost:3100) |

## Artifact Structure per Window

```
artifacts/{window-name}/
  schema-raw.json            # F1a: extracted from Etendo DB
  rules-raw.json             # F1b: extracted from Etendo DB
  schema-curated.json        # F4: human-reviewed field visibility
  rules-curated.json         # F4: human decisions (Keep/Replace/Simplify/Omit)
  processes.json             # F4: process definitions
  contract.json              # F6: generated frontend + backend contract
  auto-classification-result.json  # F3: AI pre-classification
  generated/
    web/{window-name}/       # F8: React components
      index.jsx              # Entry point (MasterDetailPage or SingleEntityPage)
      {Entity}Table.jsx      # DataTable wrapper with columns/filters
      {Entity}Form.jsx       # EntityForm wrapper with field config
      {Entity}Page.jsx       # MasterDetailPage wrapper (if header-detail)
      mockCatalogs.js         # FK reference data for selects
      mockData.js             # Realistic test data (10 headers + 20 lines)
```

## Contract Structure

```json
{
  "frontendContract": {
    "window": { "id": "143", "name": "Sales Order", "primaryEntity": "order", "category": "sales" },
    "entities": {
      "order": {
        "fields": [
          { "name": "businessPartner", "type": "foreignKey", "visibility": "editable",
            "required": true, "grid": true, "form": true,
            "reference": "BusinessPartner", "inputMode": "search" }
        ],
        "searchableFields": ["businessPartner", "documentNo"]
      }
    }
  },
  "backendContract": { "processEndpoints": [...] },
  "testManifest": { "summary": { "total": 145 } }
}
```

**Key contract fields per field:**
- `visibility`: editable | readOnly | system | discarded
- `type`: string | integer | amount | number | boolean | date | foreignKey
- `grid`: true = show in table columns
- `form`: true = show in edit form
- `inputMode` (FK only): search | selector | dependent
- `reference` (FK only): catalog name (BusinessPartner, Product, Warehouse, etc.)
- `dependsOn` (FK only): `{ field, filterKey }` for cascading selects

## Generated Code Pattern

Generated components are **thin declarative wrappers**. All logic lives in `@/components/contract-ui/`.

```jsx
// Generated {Entity}Table.jsx — DO NOT EDIT MANUALLY
import { DataTable } from '@/components/contract-ui';

const columns = [
  { key: 'businessPartner', label: 'Business Partner', type: 'string' },
  { key: 'grandTotal', label: 'Grand Total', type: 'amount' },
  { key: 'docStatus', label: 'Doc Status', type: 'status' },
];

const filters = ['businessPartner', 'documentNo'];

export default function OrderTable(props) {
  return <DataTable columns={columns} filters={filters} {...props} />;
}
```

## Contract-UI Components

| Component | Used By | Key Props |
|-----------|---------|-----------|
| `DataTable` | {Entity}Table.jsx | columns, filters, data, onRowSelect, selectedId, loading |
| `EntityForm` | {Entity}Form.jsx | fields, data, onChange, catalogs |
| `MasterDetailPage` | {Entity}Page.jsx | entity, Table, Form, DetailTable, summary, statusField, processes, addLineFields |
| `SingleEntityPage` | index.jsx (no detail) | entity, Table, Form, catalogs, entityLabel |
| `Chatter` | Overview pages | entityType, entityId, messages[], onAddNote |
| `KPIHeader` | Overview pages | kpis[] (label, value, trend) |
| `KanbanBoard` | Overview pages | columns, cards, onDragEnd |

## Field Type Mappings

**Grid columns** (`mapFieldType`):
| Contract Type | Column Type |
|--------------|-------------|
| field name contains 'status' | `status` (Badge) |
| boolean | `boolean` |
| amount | `amount` (tabular-nums) |
| number/integer | `number` |
| date | `date` |
| everything else | `string` |

**Form fields** (`mapFormFieldType`):
| Contract Type | Form Type |
|--------------|-----------|
| foreignKey + search | `search` (combobox) |
| foreignKey + selector | `selector` (dropdown) |
| foreignKey + dependent | `dependent` (cascading dropdown) |
| boolean | `checkbox` |
| name matches notes/description/comments/remarks | `textarea` |
| number | `number` |
| date | `date` |
| everything else | `text` |

## Common Workflows

### Regenerate a single window
```bash
node cli/src/generate-frontend.js artifacts/sales-order/contract.json
```

### Regenerate all Base windows
```bash
for contract in artifacts/*/contract.json; do
  window=$(echo "$contract" | cut -d/ -f2)
  # Skip enterprise windows
  node cli/src/generate-frontend.js "$contract"
done
```

### Modify how fields are generated
1. Edit `cli/src/generate-frontend.js` (the generator)
2. Run tests: `make test`
3. Regenerate a sample: `node cli/src/generate-frontend.js artifacts/sales-order/contract.json`
4. Review diff: `git diff artifacts/sales-order/generated/`

### Add a new contract-ui component
1. Create in `tools/app-shell/src/components/contract-ui/{Component}.jsx`
2. Export from `tools/app-shell/src/components/contract-ui/index.js`
3. If generated code should use it, update `cli/src/generate-frontend.js`

### Change field visibility (curate schema)
1. Edit `artifacts/{window}/schema-curated.json`
2. Regenerate contract: update `contract.json` via `generateContract()`
3. Regenerate frontend: `node cli/src/generate-frontend.js artifacts/{window}/contract.json`

## Window Categories

From `contract.frontendContract.window.category`:
- `sales` — Sales Order, Invoice, Quotation, Shipment, Returns
- `procurement` — Purchase Order, Invoice, Receipt, Returns
- `warehouse` / `warehouseManagement` — Physical Inventory, Goods Movements
- `reference` — Business Partner, Product, Tax, UOM, Payment Term/Method, Price List
- `setup` — Warehouse Storage Bins

## Mock Data

Mock data lives in `mockData.js` per window. The app-shell loads all mock data in `App.jsx` and intercepts fetch calls via `createMockFetch()`.

**Entity key convention**: The mock store uses entity names (e.g., `inventory`, `order`) not window names. The `useEntity` hook fetches `/api/{entityName}`.

**Mock catalogs** (`mockCatalogs.js`): FK reference data for dropdowns. Generated from `CATALOG_DATA` in `generate-frontend.js`. Available catalogs: BusinessPartner, Product, User, Warehouse, PriceList, PaymentTerm, PaymentMethod, Tax, UOM, ProductCategory, BusinessPartnerLocation, StorageBin.

## Enterprise Windows (excluded from Base)

These 10 windows exist in artifacts but are excluded from the Base menu:
bom-production, commission-payment, commission, cost-adjustment, inventory-quality-inspection, landed-cost, manage-requisitions, packing, requisition, stock-reservation, warehouse-picking-list.

## Common Mistakes

- **Writing generated code by hand** instead of using the pipeline
- **Editing files in `generated/`** directly (they get overwritten on regeneration)
- **Forgetting to regenerate** after changing `generate-frontend.js`
- **Non-array API responses** crashing DataTable — `useEntity.js` guards with `Array.isArray`
- **Missing mock data entity key** — check export names in `mockData.js` match what `useEntity` fetches
