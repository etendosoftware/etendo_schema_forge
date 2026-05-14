---
name: aggregate-contracts
description: Use when creating or modifying overview/dashboard pages, adding KPIs, kanban boards, alert panels, or activity feeds to module landing pages. Triggers - aggregate-contract.json, overview page, module dashboard, KPI header data.
---

# Aggregate Contracts

## Overview

Aggregate contracts define overview/dashboard pages that aggregate data across multiple entities. Unlike entity contracts (CRUD windows), aggregate contracts drive module landing pages with KPIs, tables, kanban boards, alerts, and activity feeds.

**Rule: Overview pages never hardcode data. Everything comes from the aggregate contract.**

## When to Use

- Creating a new module overview page (e.g., Inventory, Sales, CRM)
- Adding KPIs, data tables, kanban, or alert panels to a landing page
- Modifying existing overview page data or layout

When NOT to use: For CRUD windows with entity forms — use the entity contract pipeline instead (see schema-forge-pipeline skill).

## Contract Location

`artifacts/{module-name}/aggregate-contract.json` — same level as entity contracts.

## Contract Schema

```json
{
  "version": "0.1.0",
  "type": "aggregate",
  "module": "inventory",
  "label": "Inventory",
  "icon": "Package",
  "route": "/inventory",
  "sections": [
    { "id": "kpis", "type": "kpi-header", "kpis": [
      { "key": "totalSkus", "label": "Total SKUs", "format": "number", "icon": "Package" }
    ]},
    { "id": "stockLevels", "type": "data-table", "title": "Stock Levels",
      "columns": [{ "key": "sku", "label": "SKU" }], "filters": ["name"] },
    { "id": "pipeline", "type": "kanban",
      "columns": [{ "id": "draft", "title": "Draft", "color": "gray" }] },
    { "id": "lowStock", "type": "alerts-panel", "title": "Alerts",
      "severities": ["red", "amber"], "fields": { "label": "name", "current": "current", "threshold": "minimum" } },
    { "id": "recentMovements", "type": "activity-feed",
      "fields": { "direction": "direction", "label": "product", "detail": "qty", "time": "time" } },
    { "id": "revenueTrend", "type": "chart", "chartType": "line" },
    { "id": "quickActions", "type": "quick-actions" },
    { "id": "notes", "type": "chatter" }
  ],
  "layout": { "type": "grid", "areas": [
    { "section": "kpis", "span": "full" },
    { "section": "stockLevels", "span": "2/3" },
    { "section": "lowStock", "span": "1/3" }
  ]},
  "actions": [
    { "label": "Physical Inventory", "route": "/physical-inventory", "variant": "outline" }
  ],
  "mockData": {
    "kpis": { "totalSkus": 248 },
    "stockLevels": [{ "id": 1, "sku": "PRD-001" }]
  }
}
```

## Section Types

| Type | Config | mockData Shape |
|------|--------|----------------|
| `kpi-header` | `kpis[]: { key, label, format, icon?, trend? }` | `{ [key]: value }` |
| `data-table` | `columns[], filters[]` | `[{ id, ...row }]` |
| `kanban` | `columns[]: { id, title, color }` | `[{ id, columnId, title, subtitle }]` |
| `alerts-panel` | `severities[], fields` | `[{ severity, ...fields }]` |
| `activity-feed` | `fields: { label, detail, time, ... }` | `[{ id, ...fields }]` |
| `chart` | `chartType` | `{ labels[], values[] }` |
| `quick-actions` | (none, uses actions[]) | (none) |
| `chatter` | (none) | `[{ id, author, text, timestamp, type }]` |

Valid KPI formats: `currency`, `number`, `percent`.

## CLI Commands

```bash
# Generate config.js + mockData.js from contract
node cli/src/generate-aggregate.js artifacts/inventory/aggregate-contract.json

# Generate all aggregates
node cli/src/generate-aggregate.js --all

# Run aggregate tests (single)
node -e "import { runAggregateTests } from './cli/src/run-aggregate-tests.js'; ..."

# Run all tests (includes aggregate tests in suite)
node --test 'cli/test/*.test.js'
```

## Generated Outputs

`artifacts/{module}/generated/config.js` exports:
- `meta` — { module, label, icon, route }
- `kpisConfig` — KPI definitions array
- `sections` — keyed by id, excludes kpi-header
- `layout` — areas array with spans
- `actions` — action buttons

`artifacts/{module}/generated/mockData.js` exports:
- One named export per section id (e.g., `kpis`, `stockLevels`, `lowStock`)

## UI Consumption Pattern

```jsx
import { kpisConfig, sections, actions } from '@generated/inventory/generated/config';
import * as mockData from '@generated/inventory/generated/mockData';

const KPIS = kpisConfig.map(k => ({ ...k, value: mockData.kpis[k.key] }));
const COLUMNS = sections.stockLevels.columns;
const DATA = mockData.stockLevels;
```

**Never** define data constants inline in overview pages.

## Test Categories (8)

| Category | Validates |
|----------|-----------|
| `section-presence` | Each section has mockData |
| `kpi-integrity` | Valid format, label, and value |
| `table-column-match` | Columns exist in mockData rows |
| `kanban-column-match` | Card columnId in columns |
| `alert-severity` | Severity in declared set |
| `link-validity` | Action routes in menu.json |
| `layout-coverage` | All sections in layout |
| `mockData-shape` | Non-empty arrays/objects |

## Existing Modules

| Module | Route | Sections |
|--------|-------|----------|
| dashboard | /dashboard | kpis, chart, quick-actions, activity-feed, chatter |
| sales | /sales | kpis, kanban, data-table |
| purchases | /purchases | kpis, kanban, data-table |
| inventory | /inventory | kpis, data-table, alerts-panel, activity-feed |
| contacts | /contacts | kpis, kanban, data-table, chatter |

## Common Mistakes

- Forgetting to add section to `layout.areas` (fails layout-coverage test)
- Using invalid KPI format like "money" (must be currency/number/percent)
- Missing mockData key for a declared section (fails section-presence)
- Empty mockData arrays (fails mockData-shape)
- Action route not matching a menu.json window name (fails link-validity)
- Forgetting to regenerate after editing contract: `node cli/src/generate-aggregate.js artifacts/{module}/aggregate-contract.json`
