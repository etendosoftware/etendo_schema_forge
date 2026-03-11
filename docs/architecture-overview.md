# Architecture Overview

## Two Repositories, One System

The Etendo Go project spans two repositories with distinct roles:

| Repository | Role | Path |
|------------|------|------|
| **Schema Forge** | Design, analysis, tooling, documentation | `schema_forge/` |
| **Etendo Go** | Runtime API engine (NEO Headless) | `modules/com.etendoerp.go/` |

Schema Forge decides **what** to expose. Etendo Go decides **how** to serve it.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        ETENDO ERP INSTANCE                           │
│                                                                      │
│  ┌──────────────┐     ┌────────────────────────────────────────┐     │
│  │  AD Metadata  │     │         com.etendoerp.go                │     │
│  │  (Windows,    │     │         (NEO Headless Runtime)          │     │
│  │   Tabs,       │     │                                        │     │
│  │   Columns,    │     │  NeoServlet (/sws/neo/*)               │     │
│  │   Processes)  │     │    ├── JWT auth                        │     │
│  │               │     │    ├── Path parsing                    │     │
│  │               │     │    ├── ETGO_SF_* table lookups         │     │
│  │               │     │    ├── NeoHandler CDI hooks            │     │
│  │               │     │    └── DataSourceServlet fallback      │     │
│  │               │     │                                        │     │
│  │               │     │  NeoSelectorService (FK dropdowns)     │     │
│  │               │     │  NeoProcessService (process execution) │     │
│  │               │     │  4 webhooks (configuration API)        │     │
│  └──────┬───────┘     └────────────────┬───────────────────────┘     │
│         │                              │                             │
│         │  reads                       │  reads config from          │
│         │                              │                             │
│         │         ┌────────────────────┴──────────┐                  │
│         │         │  ETGO_SF_SPEC                  │                  │
│         └────────▶│  ETGO_SF_ENTITY                │◀── written by   │
│                   │  ETGO_SF_FIELD                  │    Schema Forge  │
│                   └─────────────────────────────────┘    webhooks     │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     SCHEMA FORGE (this repo)                         │
│                                                                      │
│  CLI Tools (Node.js)          Decision UIs (React)                   │
│  ├── extract-from-db.js       ├── app-shell (port 5173)             │
│  ├── extract-fields.js        ├── decision-panel (port 5174)        │
│  ├── extract-rules.js         └── ui-preview (port 5175)            │
│  ├── pre-classify.js                                                 │
│  ├── validate-schema.js       Webhooks (NEO Headless config)        │
│  ├── generate-contract.js     ├── SFUpsertSpec                      │
│  ├── push-to-neo.js (planned) ├── SFUpsertEntity                    │
│  ├── generate-frontend.js     ├── SFUpsertField                     │
│  ├── generate-mock-data.js    └── SFPopulateSpec                    │
│  ├── run-contract-tests.js                                          │
│  └── pipeline.js                                                     │
│                                                                      │
│  Artifacts (per-window)        Documentation                         │
│  ├── sales-order/              ├── PRD.md, TDD.md                   │
│  ├── purchase-order/           ├── architecture-overview.md (this)   │
│  ├── business-partner/         ├── etendo-ad/ (AD reference)        │
│  └── ... (36 windows)          └── plans/ (feature plans)           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Extraction (Schema Forge reads Etendo)

```
Etendo DB ──SQL──▶ extract-from-db.js ──▶ artifacts/{window}/
                                              ├── schema-raw.json      (all fields, FK refs, callouts)
                                              ├── rules-raw.json       (all business rules)
                                              └── schema-curated.json  (after human decisions)
```

The extraction connects to the Etendo PostgreSQL database and queries AD_Window, AD_Tab, AD_Column, AD_Field, AD_Reference, and related tables. It resolves FK types (TableDir, Table, Search, OBUISEL) and captures callout references, display logic, and validation rules.

### 2. Curation (Human decides)

```
schema-raw.json ──▶ Decision Panel UI ──▶ schema-curated.json
rules-raw.json  ──▶ Decision Panel UI ──▶ rules-curated.json
```

Humans classify each field's visibility (editable, readOnly, system, discarded) and each rule's disposition (Keep, Replace, Simplify, Omit). AI pre-classifies approximately 60% deterministically; the remaining 40% requires human review.

### 3. Configuration (Schema Forge writes to Etendo Go)

```
schema-curated.json ──▶ Webhooks ──▶ ETGO_SF_SPEC
                                     ETGO_SF_ENTITY
                                     ETGO_SF_FIELD
```

Schema Forge calls 4 webhooks on the running Etendo instance:

| Webhook | Purpose |
|---------|---------|
| `SFUpsertSpec` | Create/update a spec (links to AD_Window or AD_Process) |
| `SFUpsertEntity` | Create/update an entity (tab, HTTP method flags, CDI hook) |
| `SFUpsertField` | Create/update a field (column, included/excluded, read-only) |
| `SFPopulateSpec` | Auto-populate entities and fields from AD metadata |

All webhooks are idempotent. Calling them again with the same parameters updates existing records.

### 4. Runtime (Etendo Go serves API)

```
Client ──HTTP──▶ /sws/neo/{spec}/{entity} ──▶ NeoServlet
                                                  ├── Authenticate JWT
                                                  ├── Resolve spec + entity from ETGO_SF_* tables
                                                  ├── Check HTTP method flag
                                                  ├── Check window/process access (RBAC)
                                                  ├── Optional: CDI NeoHandler hook
                                                  └── Default: DataSourceServlet (Etendo RX)
```

No code generation needed for the runtime. The API is live as soon as the configuration records exist.

---

## Schema Forge Components

### CLI Tools

All tools are Node.js, zero-dependency. Located in `cli/src/`.

| Tool | Input | Output |
|------|-------|--------|
| `extract-from-db.js` | Etendo DB (windowId) | `schema-raw.json`, `rules-raw.json` |
| `pre-classify.js` | `rules-raw.json` | `rules-classified.json` (AI pre-classification) |
| `validate-schema.js` | `schema-curated.json` | Validation report (4 levels: structural, semantic, visibility, cross-reference) |
| `generate-contract.js` | Curated schema + rules | `contract.json` (frontend + backend contract) |
| `push-to-neo.js` (planned) | Curated schema | Webhook calls → ETGO_SF_* tables (NEO Headless config) |
| `generate-frontend.js` | Contract + decisions | React SPA components |
| `translate-todos.js` | Generated React components | Components with translated callout/onchange logic (AI-assisted, interactive) |
| `generate-mock-data.js` | Contract | `mockData.js`, `mockCatalogs.js` for UI preview |
| `run-contract-tests.js` | Contract | Test results (Node.js assertions) |
| `pipeline.js` | Window name | Runs full pipeline: extract → validate → classify → generate |

### Decision UIs

Three React web apps (Vite + Tailwind):

| App | Port | Purpose |
|-----|------|---------|
| `app-shell` | 5173 | Main navigation shell |
| `decision-panel` | 5174 | Field visibility + rule curation |
| `ui-preview` | 5175 | Live preview with mock data (Babel standalone, no backend) |

### Backend Configuration (NEO Headless)

Backend code generation has been replaced by runtime configuration. Instead of generating Java source files via templates, Schema Forge writes configuration records directly to Etendo via webhooks. The NEO Headless runtime (NeoServlet) reads these records and serves the API dynamically — no compilation or restart needed.

See [Webhook Configuration Flow](diagrams/webhook-config-flow.mmd) for the detailed sequence.

### Core Maps

Shared metadata in `core-maps/`:

| File | Purpose |
|------|---------|
| `system-columns.json` | System field categories (audit, accounting, inventory, costing, internal) |
| `impact-messages.json` | Human-friendly impact messages for rule decisions |
| `ad-reference-map.json` | Etendo AD Reference type mappings |

### Per-Window Artifacts

Each analyzed window produces artifacts in `artifacts/{window-name}/`:

```
artifacts/sales-order/
├── schema-raw.json           # Raw extraction from DB
├── schema-curated.json       # After human visibility decisions
├── rules-raw.json            # Extracted business rules
├── rules-curated.json        # After human rule decisions
├── processes.json            # Process definitions with edge cases
├── contract.json             # Frontend + backend contract
├── FINDINGS.md               # Extraction findings and notes
├── GENERATION-LOG.md         # Generation run history with deltas
└── generated/
    └── web/sales-order/      # React SPA components
        ├── mockData.js
        ├── mockCatalogs.js
        └── ...
```

36 windows are currently in the artifacts directory.

---

## App Shell UI Architecture

The app shell (`tools/app-shell/`) serves as the production frontend. It has a 3-layer page architecture:

| Layer | Count | Source | Loading |
|-------|-------|--------|---------|
| **Window pages** | 37 | Fully autogenerated from `contract.json` via pipeline | Dynamic import via `registry.js` |
| **Overview pages** | 9 | Semi data-driven (layout is manual JSX, data from `aggregate-contract.json`) | Direct import in router |
| **Utility pages** | 3 | Standalone (Dashboard, Onboarding, SmartScan) | Direct import in router |

### UI Registration Mechanism

When the pipeline generates a window, the output lands in `artifacts/{window}/generated/web/{window}/`. For the window to appear in the running app shell, it must be registered in 3 files:

```
artifacts/{window}/generated/web/{window}/    pipeline output
         │
         │  (1) registry.js maps slug → dynamic import
         │  (2) menu.json adds sidebar entry
         │  (3) App.jsx imports mockData (mock mode only)
         ▼
┌─────────────────────────────────────────────────────────┐
│  tools/app-shell/src/                                    │
│                                                          │
│  windows/registry.js ─── windowLoaders map               │
│      │   { 'sales-order': () => import('@generated/     │
│      │       sales-order/.../index.jsx') }               │
│      ▼                                                   │
│  windows/WindowLoader.jsx ─── reads windowMap            │
│      │   calls loader() → renders component              │
│      │   falls back to PlaceholderWindow if not found     │
│      ▼                                                   │
│  menu.json ─── sidebar groups + items                    │
│      │   { group: "Sales", items: [                      │
│      │     { name: "sales-order", label: "Sales Orders" }│
│      │   ]}                                              │
│      ▼                                                   │
│  App.jsx ─── loadAllMockData()                           │
│      imports mockData.js for each window (mock mode)     │
└─────────────────────────────────────────────────────────┘
```

**File details:**

| File | Purpose | Format |
|------|---------|--------|
| `windows/registry.js` | Maps window slug to a dynamic `import()` loader function. `WindowLoader.jsx` calls the loader; unregistered slugs fall back to `PlaceholderWindow`. | JS object: `{ slug: () => import(...) }` |
| `menu.json` | Sidebar menu structure. Groups (with icon) contain items (name + label). The `name` field must match the slug used in `registry.js`. | JSON array of `{ group, icon, items[] }` |
| `App.jsx` (`loadAllMockData`) | Imports `mockData.js` from each window for mock mode (`VITE_MOCK=true`). Only needed for offline/demo preview. | Async function with `Promise.all` of dynamic imports |

### Two Registration Scenarios

**Existing window (90% case):** The 37 windows currently in the UI are already registered. Re-running the pipeline regenerates component files in place. No registration changes needed -- the existing `registry.js` entry already points to the right path.

**New window not yet in UI:** Must be manually added to all 3 files:
1. Add a loader entry in `registry.js`
2. Add a menu item in `menu.json` (in the appropriate group)
3. Add a mockData import in `App.jsx` (if mock mode support is needed)

This could be automated as a future pipeline step (post-`generate-frontend`).

---

## Etendo Go Components

The runtime module is at `modules/com.etendoerp.go/`. Full API reference: `modules/com.etendoerp.go/docs/neo-headless.md`.

### Java Classes

| Class | Package | Purpose |
|-------|---------|---------|
| `NeoServlet` | `com.etendoerp.go.schemaforge` | Main servlet at `/sws/neo/*`. 953 lines. |
| `NeoHandler` | same | CDI hook interface (22 lines) |
| `NeoContext` | same | Request context, builder pattern (147 lines) |
| `NeoResponse` | same | Response wrapper with static builders (65 lines) |
| `NeoSelectorService` | same | FK dropdown resolution + querying (825 lines) |
| `NeoProcessService` | same | Process execution: OBUIAPP + Classic (564 lines) |
| `PopulateSpecHelper` | same | Auto-populate from AD metadata (273 lines) |
| `PopulateSpecProcess` | same | AD_Process button for populate (55 lines) |
| `SFUpsertSpec` | `...webhooks` | Webhook: create/update spec (122 lines) |
| `SFUpsertEntity` | `...webhooks` | Webhook: create/update entity (120 lines) |
| `SFUpsertField` | `...webhooks` | Webhook: create/update field (103 lines) |
| `SFPopulateSpec` | `...webhooks` | Webhook: populate from AD (56 lines) |

### Database Tables

| Table | Records | Purpose |
|-------|---------|---------|
| `ETGO_SF_SPEC` | 1 per window/process | Top-level spec: name, type (W/P), linked AD_Window or AD_Process |
| `ETGO_SF_ENTITY` | 1 per exposed tab | Entity: HTTP method flags, CDI hook qualifier, sequence |
| `ETGO_SF_FIELD` | 1 per exposed column | Field: included/excluded, read-only, default value |

### API Endpoints

All URLs relative to `/sws/neo`:

| Pattern | Methods | Purpose |
|---------|---------|---------|
| `/{spec}/{entity}` | GET, POST | List records / Create record |
| `/{spec}/{entity}/{id}` | GET, PUT, PATCH, DELETE | Single record operations |
| `/{spec}/{entity}/selectors` | GET | List available FK selectors |
| `/{spec}/{entity}/selectors/{col}` | GET | Query selector values (?q=, ?limit=, ?offset=) |
| `/{spec}/{entity}/{id}/action` | GET | List button actions |
| `/{spec}/{entity}/{id}/action/{col}` | POST | Execute button action |
| `/{spec}` | GET, POST | Process spec: describe / execute |

---

## Core Concepts

### Visibility Model

Every field is classified into one of four visibility levels:

| Visibility | API Behavior | Frontend |
|------------|-------------|----------|
| `editable` | In request + response schemas | User can modify |
| `readOnly` | In response schema only | Display only |
| `system` | Hidden from API (auto-derived by AD) | Not shown |
| `discarded` | Excluded from API entirely | Not shown |

### Rule Decisions

Business rules extracted from Etendo are classified:

| Decision | Meaning |
|----------|---------|
| `Keep` | Preserve the rule as-is in the generated module |
| `Replace` | Replace with a simpler implementation |
| `Simplify` | Reduce complexity while maintaining behavior |
| `Omit` | Remove the rule from the generated module |

### Derivation Types

System fields have automatic derivation rules:

| Type | Source | Example |
|------|--------|---------|
| `fromConfig` | Session/context | `context.client` → AD_Client_ID |
| `fromParent` | Parent entity | `order.id` → C_Order_ID on OrderLine |
| `fromField` | Same entity | `businessPartner.paymentTerms` |
| `computed` | Expression | `"'D'"` (constant), `"dateOrdered"` (copy) |
| `lookup` | Query | Price from PriceList by Product |
| `sequence` | Document sequence | DocumentNo auto-generation |

---

## Documentation Map

| Document | Location | Content |
|----------|----------|---------|
| **This file** | `docs/architecture-overview.md` | System architecture, data flow, component inventory |
| **NEO Headless API Reference** | `modules/com.etendoerp.go/docs/neo-headless.md` | Full API documentation for the runtime |
| **PRD** | `docs/PRD.md` | Product requirements, decision map, pipeline |
| **TDD** | `docs/TDD.md` | Technical design, data models, generators |
| **API Versioning** | `docs/PRD-anex.md` + `docs/TDD-anex.md` | Three independent version model |
| **Etendo AD Reference** | `docs/etendo-ad/` | How AD tables, processes, callouts actually work |
| **Conventions** | `docs/conventions.md` | Edge case conventions (13 rules) |
| **Feature Plans** | `docs/plans/` | Vertical slice, feature-level plans |
| **Pending Proposals** | `pending/` | Callout endpoints, OpenAPI auto-registration |
