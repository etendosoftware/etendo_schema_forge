# Configurable Agent Prompt for `neo_discover` / `neo_schema`

**Date:** 2026-06-16
**Status:** Approved (design)

## Goal

Allow customizing an "agent guidance" text at two levels — **spec** (`ETGO_SF_SPEC`)
and **field** (`ETGO_SF_FIELD`) — configurable from `decisions.json`, flowing
through the pipeline to the database, and returned in the MCP responses:

- **Spec-level prompt** → returned by `neo_discover` (one per spec).
- **Field-level prompt** → returned by `neo_schema` (inside each `fieldObj`).

The text is consumed by AI agents that introspect the NEO Headless MCP server to
understand how to operate each window/process and each field.

## Naming

- JSON key (decisions, contract, MCP responses): **`agentPrompt`**
- DB column: **`AGENT_PROMPT`**
- Webhook param: **`AgentPrompt`**

## Storage approach

Dedicated columns (chosen over reusing `DESCRIPTION` or a global `AD_Message`):

- `ETGO_SF_SPEC.AGENT_PROMPT` — `CLOB` (long, multi-paragraph guidance).
- `ETGO_SF_FIELD.AGENT_PROMPT` — `VARCHAR(2000)` (short per-field hint).

Rationale: keeps functional `DESCRIPTION` (already surfaced as `description`)
separate from agent guidance, and supports per-spec/per-field granularity that a
global message cannot.

## Components

### 1. Database (`com.etendoerp.go`)
- Add column `AGENT_PROMPT` (CLOB) to `ETGO_SF_SPEC` + AD_Column metadata + DAL
  property `agentPrompt`.
- Add column `AGENT_PROMPT` (VARCHAR 2000) to `ETGO_SF_FIELD` + AD_Column metadata
  + DAL property `agentPrompt`.
- New IDs via `make uuid` (never hand-typed).

### 2. Java MCP layer (`com.etendoerp.go`)
- `McpToolRouterSupport.buildDiscoverSpec(...)` → add `agentPrompt` to `specObj`
  when `spec.getAgentPrompt()` is non-null/non-empty.
- Field summary builder (`buildFieldObj` / `buildSchemaFieldsArray`) → add
  `agentPrompt` per field. Load a `promptByColumnId` map analogous to
  `loadVisibilityByColumnId`.
- Webhooks `SFUpsertSpec` / `SFUpsertField` → accept optional `AgentPrompt` param
  and persist it (keeps runtime webhook path at parity with the CLI SQL path).

### 3. CLI / contract (`schema-forge`)
- `decisions.json`: new `window.agentPrompt` (spec-level) and per-field
  `agentPrompt` in field decisions.
- `resolve-curated.js` / `generate-contract.js`: propagate both into the contract
  (MCP / `agentProfile` section).
- `push-to-neo.js` + `neo-writer.js`: `upsertSpec` sends `agentPrompt`;
  `upsertSingleField` / `upsertField` send per-field `agentPrompt` → INSERT/UPDATE
  the new columns.

### 4. Tests + docs
- JUnit: `buildDiscoverSpec` with/without prompt, field summary with prompt,
  webhook param handling.
- CLI: `neo-writer`, `push-to-neo`, `generate-contract` (Node test runner).
- Docs: `neo-headless.md`, `decisions-reference.md`, `ui-customization.md`.

## Data flow

```
decisions.json (window.agentPrompt + field.agentPrompt)
  → resolve-curated.js (in memory)
  → generate-contract.js (contract MCP / agentProfile)
  → push-to-neo.js + neo-writer.js (SQL)
  → ETGO_SF_SPEC.AGENT_PROMPT / ETGO_SF_FIELD.AGENT_PROMPT
  → McpToolRouterSupport.buildDiscoverSpec / buildFieldObj
  → neo_discover (spec prompt) / neo_schema (field prompt)
```

## Out of scope

- Global server-wide agent instructions (not per-spec/per-field).
- Listing fields inside `neo_discover` (fields stay in `neo_schema`).
- i18n/translation of the prompt (single-language free text for now).

## Backward compatibility

- New columns are nullable; existing specs/fields with no prompt are unaffected.
- MCP responses omit `agentPrompt` entirely when null/empty (no schema break).
