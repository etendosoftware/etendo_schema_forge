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
│  │               │     │  NeoReportService (report generation)  │     │
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
│  ├── extract-from-process.js  ├── decision-panel (port 5174)        │
│  ├── resolve-menu.js                                                │
│  ├── extract-fields.js        └── ui-preview (port 5175)            │
│  ├── extract-rules.js                                                │
│  ├── pre-classify.js          DB Writers (direct PostgreSQL)         │
│  ├── validate-schema.js       ├── neo-writer.js (ETGO_SF_* tables)  │
│  ├── generate-contract.js     └── push-to-neo.js (orchestrator)     │
│  ├── generate-frontend.js                                            │
│  ├── generate-mock-data.js    Webhooks (legacy, still available)    │
│  ├── run-contract-tests.js    ├── SFUpsertSpec / SFUpsertEntity     │
│  └── pipeline.js              ├── SFUpsertField / SFPopulateSpec    │
│                                └── SFListProcesses / SFListWindows  │
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

Etendo DB ──SQL──▶ extract-from-process.js ──▶ artifacts/{process}/
                                                    └── process-raw.json   (metadata + parameters)
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
contract.json ──▶ push-to-neo.js ──▶ neo-writer.js ──▶ ETGO_SF_SPEC
                                                       ETGO_SF_ENTITY
                                                       ETGO_SF_FIELD
```

Schema Forge writes configuration directly to the Etendo PostgreSQL database via `neo-writer.js` (transactional, all-or-nothing). The legacy webhook approach is still available but deprecated. The 4 webhooks on the Etendo instance are:

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
                                                  ├── Check window/process/report access (RBAC)
                                                  ├── Route report specs → NeoReportService
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
| `extract-from-process.js` | Etendo DB (processId) | `process-raw.json` (metadata + parameters) |
| `pre-classify.js` | `rules-raw.json` | `rules-classified.json` (AI pre-classification) |
| `validate-schema.js` | `schema-curated.json` | Validation report (4 levels: structural, semantic, visibility, cross-reference) |
| `generate-contract.js` | Curated schema + rules (windows) or `process-raw.json` (processes/reports) | `contract.json` (frontend + backend contract, process contract, or report contract) |
| `neo-writer.js` | DB client + params | Direct INSERT/UPDATE to ETGO_SF_* tables (transactional) |
| `push-to-neo.js` | Contract + schema artifacts | Orchestrates neo-writer: spec → populate → field updates |
| `generate-frontend.js` | Contract | React SPA components (window entities or process forms) |
| `translate-todos.js` | Generated React components | Components with translated callout/onchange logic (AI-assisted, interactive) |
| `generate-mock-data.js` | Contract | `mockData.js`, `mockCatalogs.js` for UI preview |
| `run-contract-tests.js` | Contract | Test results (Node.js assertions) |
| `resolve-menu.js` | AD_Menu_ID or menu name | Resolves menu entry type (W/P/R/X) and linked ID by ID or name |
| `pipeline.js` | Window ID, process ID, report ID, menu ID, or menu name | Runs full pipeline: window, process, report, or auto-detect mode |

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

### Per-Process Artifacts

Standalone processes (AD_Menu.action = 'P') produce a simpler artifact structure:

```
artifacts/generate-invoices/
├── raw-query-results/
│   ├── process-metadata.csv    # Process info from AD_Process
│   └── process-parameters.csv  # Parameters from AD_Process_Para
├── process-raw.json            # Structured extraction
├── contract.json               # Process contract (type: "process")
└── generated/
    └── web/generate-invoices/
        ├── GenerateInvoicesProcess.jsx  # Process form component
        └── index.jsx                   # Entry point
```

Key differences from window artifacts: no tabs, no curation step, no rules, single POST-only entity.

---

## Etendo Go Components

The runtime module is at `modules/com.etendoerp.go/`. Full API reference: `modules/com.etendoerp.go/docs/neo-headless.md`.

### Java Classes

| Class | Package | Purpose |
|-------|---------|---------|
| `NeoServlet` | `com.etendoerp.go.schemaforge` | Main servlet at `/sws/neo/*`. JWT auth, path parsing, routing. |
| `NeoHandler` | same | CDI hook interface |
| `NeoContext` | same | Request context, builder pattern |
| `NeoResponse` | same | Response wrapper with static builders |
| `NeoSelectorService` | same | FK dropdown resolution + querying |
| `NeoProcessService` | same | Process execution: OBUIAPP + Classic |
| `NeoReportService` | same | Report generation (Jasper via ReportingUtils) |
| `PopulateSpecHelper` | same | Auto-populate from AD metadata |
| `PopulateSpecProcess` | same | AD_Process button for populate |
| `SFUpsertSpec` | `...webhooks` | Webhook: create/update spec |
| `SFUpsertEntity` | `...webhooks` | Webhook: create/update entity |
| `SFUpsertField` | `...webhooks` | Webhook: create/update field |
| `SFPopulateSpec` | `...webhooks` | Webhook: populate from AD |

### Database Tables

| Table | Records | Purpose |
|-------|---------|---------|
| `ETGO_SF_SPEC` | 1 per window/process/report | Top-level spec: name, type (W/P/R), linked AD_Window or AD_Process |
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
| `/{spec}` | GET, POST | Report spec: describe / generateReport (binary file response) |

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
