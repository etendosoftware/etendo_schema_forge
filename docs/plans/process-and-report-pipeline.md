# Plan: Process & Report Pipeline Support

**Status:** Phases 1, 2, 3 & 4 COMPLETE — Process Pipeline + Reports + Forms Detection + Unified Entry Point
**Date:** 2026-03-10
**Phase 1 completed:** 2026-03-11
**Phase 2 completed:** 2026-03-12
**Phase 3 completed:** 2026-03-12
**Phase 4 completed:** 2026-03-12

### Implementation Status

| Phase | Scope | Status | Date |
|-------|-------|--------|------|
| **Phase 1** | Standalone Processes | **Complete** | 2026-03-11 |
| **Phase 2** | Reports | **Complete** — NeoReportService + pipeline support | 2026-03-12 |
| **Phase 3** | Forms | **Complete** — not automated, pipeline detects and shows source paths | 2026-03-12 |
| **Phase 4** | Unified entry point | **Complete** | 2026-03-12 |

## Context

The Schema Forge pipeline originally supported **only AD_Window entries**. Phase 1 added standalone process support. The Etendo AD_Menu links to 4 types of actionable entries:

| AD_Menu.action | Type | Count (approx) | Pipeline Support | NEO Runtime Support |
|----------------|------|-----------------|------------------|---------------------|
| `W` | Window | ~254 | Full | Full (CRUD + selectors + actions) |
| `P` | Process | ~20 | None (standalone) | Full (GET describe + POST execute) |
| `R` | Report | ~49 | Full | Full (GET describe + POST generateReport) |
| `X` | Form | ~13 | None | None |

Additionally, folders (`issummary='Y'`, ~72) are grouping nodes — no pipeline needed.

### Current State of Process Support

**What NEO Headless already does for processes:**
- `SFUpsertSpec` webhook accepts `SpecType=P` + `ProcessID` (creates process spec)
- `PopulateSpecHelper.populateProcess()` iterates `AD_Process_Para` → creates 1 entity + N fields
- `NeoServlet` routes process specs: GET (describe metadata) + POST (execute)
- `NeoProcessService` executes: OBUIAPP (via `BaseProcessActionHandler`) and Classic (via `DalBaseProcess`)
- DB procedure processes return 501 Not Implemented
- `SFListProcesses` webhook lists available processes (with search)
- `SFListMenu` webhook returns full menu tree with type resolution

**What Schema Forge is missing for processes:**
- No standalone process extraction (`extract-from-db.js` only accepts `windowId`)
- No process-specific artifact structure
- No process curation flow (Decision Panel only handles windows)
- No process contract generation
- No process-specific frontend generation

---

## Phase 1: Standalone Process Pipeline (Quick Win)

### Goal
Enable the full Schema Forge pipeline for standalone processes (AD_Menu.action = 'P'), from extraction to frontend.

### 1.1 Process Extraction — `extract-from-process.js`

**Input:** `processId` (AD_Process_ID)

**SQL queries needed:**

```sql
-- Process metadata
SELECT p.AD_Process_ID, p.Name, p.Description, p.Help,
       p.UIPattern, p.JavaClassName, p.ProcedureName,
       p.IsReport, p.IsBackground
FROM AD_Process p
WHERE p.AD_Process_ID = $1 AND p.IsActive = 'Y'

-- Process parameters (equivalent to fields for windows)
SELECT pp.AD_Process_Para_ID, pp.Name, pp.ColumnName, pp.Description,
       pp.AD_Reference_ID, pp.AD_Reference_Value_ID,
       pp.IsMandatory, pp.IsRange, pp.DefaultValue, pp.SeqNo,
       pp.FieldLength, pp.AD_Val_Rule_ID,
       r.Name AS reference_name
FROM AD_Process_Para pp
JOIN AD_Reference r ON r.AD_Reference_ID = pp.AD_Reference_ID
WHERE pp.AD_Process_ID = $1 AND pp.IsActive = 'Y'
ORDER BY pp.SeqNo
```

**Output:** `process-raw.json`

```json
{
  "process": {
    "id": "...",
    "name": "Generate Invoices",
    "description": "...",
    "uiPattern": "S",
    "javaClassName": "com.example.GenerateInvoices",
    "isReport": false,
    "isBackground": false
  },
  "parameters": [
    {
      "name": "dateFrom",
      "column": "DateFrom",
      "referenceId": "15",
      "referenceName": "Date",
      "mandatory": true,
      "isRange": false,
      "defaultValue": "@#Date@",
      "seqNo": 10
    }
  ]
}
```

### 1.2 Process Artifact Structure

```
artifacts/{process-name}/
├── process-raw.json          # Extracted from DB
├── process-curated.json      # After human decisions (if any)
└── contract.json             # Process contract
```

### 1.3 Pipeline Changes — `pipeline.js`

Add process mode to the pipeline:

```
Current:  pipeline.js --window-id <id> --window-name <name>
New:      pipeline.js --process-id <id> --process-name <name>
```

**Process pipeline steps (subset of window pipeline):**

| Phase | Step | Description |
|-------|------|-------------|
| P1 | extract-process | Extract process metadata + parameters from DB |
| P2 | validate-process | Validate parameter types, references, mandatory flags |
| P3 | curate-process | (Optional) Human review of parameter visibility |
| P4 | generate-contract | Generate process contract |
| P5 | push-to-neo | Upsert spec (SpecType=P), entity, fields via webhooks |
| P6 | generate-frontend | Generate process form component |
| P7 | run-tests | Contract tests for process |

**Key difference:** No tabs, no parent-child entities, no selectors, no display logic. Much simpler.

### 1.4 Process Contract Schema

```json
{
  "version": "0.1.0",
  "type": "process",
  "process": {
    "id": "...",
    "name": "Generate Invoices",
    "specName": "generate-invoices",
    "uiPattern": "S",
    "javaClassName": "com.example.GenerateInvoices"
  },
  "parameters": [
    {
      "name": "dateFrom",
      "column": "DateFrom",
      "type": "date",
      "tsType": "string",
      "required": true,
      "isRange": false,
      "defaultValue": "@#Date@",
      "inputMode": "date-picker",
      "reference": null
    }
  ],
  "apiPrediction": {
    "specName": "generate-invoices",
    "baseUrl": "/sws/neo/generate-invoices",
    "describe": "GET /sws/neo/generate-invoices",
    "execute": "POST /sws/neo/generate-invoices"
  },
  "testManifest": {
    "tests": [
      { "id": "t-1", "category": "param-presence", "param": "dateFrom" },
      { "id": "t-2", "category": "param-type", "param": "dateFrom", "expectedType": "string" },
      { "id": "t-3", "category": "execution-happy", "runner": "junit" },
      { "id": "t-4", "category": "execution-failure", "runner": "junit" }
    ]
  }
}
```

### 1.5 Frontend Generation — Process Form

Process forms are simpler than CRUD forms:
- Input fields for each parameter (rendered by type/reference)
- "Execute" button
- Result display area (success message or error)
- No grid, no navigation, no parent-child

**Component structure:**
```
ProcessForm.jsx
├── Parameter inputs (mapped from contract.parameters)
├── Execute button → POST /sws/neo/{specName}
└── Result display (JSON response or formatted message)
```

### 1.6 push-to-neo Changes

`push-to-neo.js` already calls `SFUpsertSpec` — needs to support:
- `SpecType: "P"` instead of `"W"`
- `ProcessID` instead of `WindowID`
- Single entity (the process itself, not tabs)
- Fields = process parameters (no AD_Column FK, uses parameter metadata)

The webhook `SFUpsertSpec` already handles this — minimal changes needed.

### 1.7 Effort Estimate

| Component | Effort |
|-----------|--------|
| `extract-from-process.js` | New file, ~100 lines |
| `pipeline.js` changes | Add process mode, ~50 lines |
| `generate-contract.js` changes | Add `generateProcessContract()`, ~80 lines |
| `push-to-neo.js` changes | Support SpecType=P, ~30 lines |
| `generate-frontend.js` changes | Process form template, ~60 lines |
| Tests | ~100 lines |
| **Total** | **~420 lines of new/modified code** |

---

## Phase 2: Reports

### The Report Problem

Reports in Etendo are **technically AD_Process entries** (AD_Menu.action = 'R' links via `ad_process_id`), but they behave differently:

1. **Execution model:** Generate a file (PDF, XLS, HTML, CSV) instead of performing a data operation
2. **Output:** Binary file download, not JSON response
3. **Engine:** Jasper Reports (most common) or BIRT — requires JasperReports library + .jrxml template
4. **Parameters:** Same as processes (AD_Process_Para), but include format selection

### What NEO Headless Would Need

```
POST /sws/neo/{reportSpecName}
  Body: { "dateFrom": "2026-01-01", "format": "PDF" }
  Response: binary file (Content-Type: application/pdf)
```

**Missing in NEO Headless:**
- Report execution handler (Jasper compilation + fill + export)
- Binary response support (current NeoServlet only returns JSON)
- Report template resolution (find .jrxml by process ID)
- Format parameter handling (PDF, XLS, HTML, CSV)

### Extraction Feasibility

Process parameter extraction is the same as Phase 1 (AD_Process_Para). Additional metadata:

```sql
-- Report-specific metadata
SELECT p.AD_Process_ID, p.Name, p.IsReport,
       p.JasperReport  -- path to .jrxml template
FROM AD_Process p
WHERE p.AD_Process_ID = $1 AND p.IsReport = 'Y'
```

### Contract Schema for Reports

```json
{
  "type": "report",
  "process": {
    "id": "...",
    "name": "Invoice Report",
    "specName": "invoice-report",
    "jasperReport": "/path/to/report.jrxml",
    "supportedFormats": ["PDF", "XLS", "HTML", "CSV"]
  },
  "parameters": [ /* same as process parameters */ ],
  "apiPrediction": {
    "execute": "POST /sws/neo/invoice-report",
    "responseType": "binary"
  }
}
```

### Frontend for Reports

- Same as process form (parameter inputs + execute button)
- Plus: format selector dropdown (PDF, XLS, HTML, CSV)
- Response handling: file download instead of JSON display

### Effort Estimate

| Component | Effort | Notes |
|-----------|--------|-------|
| Schema Forge extraction | Low | Reuse process extraction + `IsReport` flag |
| Schema Forge contract | Low | Extend process contract with report metadata |
| NEO Headless: report execution | **High** | New handler: Jasper compilation, fill, export |
| NEO Headless: binary response | **Medium** | NeoServlet currently only returns JSON |
| Frontend: report form | Low | Extend process form with format selector |
| **Total** | **High** | Primarily NEO Headless changes |

### Implementation (Completed 2026-03-12)

Phase 2 was implemented with the following components:

- **NeoReportService.java** — New runtime service that generates reports via `ReportingUtils.exportJR`. Handles Jasper compilation, parameter injection, and binary file response (PDF, XLS, HTML, CSV).
- **NeoServlet routing** — Updated to detect specType 'R' and route to `NeoReportService` for GET (describe) and POST (generateReport).
- **NeoOpenAPIEndpoint** — Registers report spec paths in the OpenAPI schema.
- **Pipeline support** — `pipeline.js` accepts `--report-id` and `--report-name` flags, and auto-detects reports via `--menu-id` when `AD_Menu.action = 'R'`.
- **push-to-neo.js / neo-writer.js** — Support specType 'R' for writing report configuration to `ETGO_SF_SPEC`.

---

## Phase 3: Forms

### The Form Problem

Forms (`AD_Menu.action = 'X'`) are **completely custom** UI components:
- Linked via `AD_Form_ID` to `AD_Form` table
- No standardized parameter/field model (unlike AD_Tab or AD_Process_Para)
- Implementation is pure Java + custom JSP/HTML
- No metadata to extract (the form IS the implementation)

### Resolution

**Forms are not automated.** They are inherently custom and have no extractable metadata. When the pipeline detects a form (action='X' via `--menu-id` or `--menu-name`), it shows the source file paths (Java + HTML) and tells the developer it must be built manually. The developer creates a custom React component + NeoHandler, registers in app-shell and NEO Headless. See PR #105.

---

## Phase 4: Unified Pipeline Entry Point

Once Phase 1 is complete, unify the pipeline to accept any AD_Menu entry:

```bash
# Current (window only)
sf-pipeline --window-id <id>

# Proposed (any menu entry)
sf-pipeline --menu-id <id>        # Auto-detect type from AD_Menu
sf-pipeline --window-id <id>      # Explicit window
sf-pipeline --process-id <id>     # Explicit process
```

**Auto-detection flow:**
1. Query `AD_Menu` for the entry by ID
2. Read `action` column: W → window pipeline, P → process pipeline, R → report pipeline
3. Resolve the linked ID (`ad_window_id`, `ad_process_id`)
4. Execute the appropriate pipeline

This could use the existing `SFListMenu` webhook or a direct SQL query.

---

## Summary

| Phase | Scope | Pipeline Impact | NEO Impact | Priority |
|-------|-------|----------------|------------|----------|
| **1** | Standalone Processes | New extraction + contract + frontend | None (already works) | **High — next** |
| **2** | Reports | Reuse process extraction + report flags | NeoReportService (Jasper + binary response) | **Complete** |
| **3** | Forms | None | None | Low — not planned |
| **4** | Unified entry point | CLI refactor | None | Medium — after Phase 1 |

### Key Insight

**Phase 1 is a quick win** because NEO Headless already fully supports process specs. The only work is in Schema Forge: extraction, contract, and frontend generation. No Java changes needed.
