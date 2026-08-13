# ETP-4252 — Cross-domain plan

**Feature:** Configurable `agentPrompt` text at spec and field level that flows
from `decisions.json` through the pipeline to the database and is returned in the
NEO Headless MCP responses (`neo_discover` per spec, `neo_schema` per field).

This PR is approved as cross-domain because the Schema Forge side spans the
pipeline generators (`generator-change`), the NEO writer (`cli/src/neo-writer.js`),
and shared documentation (`repo-infra`). The companion runtime changes (new
`AGENT_PROMPT` columns, MCP response builders, and webhooks) live in the
`com.etendoerp.go` repository on the same `feature/ETP-4252` branch and are tracked
in its own PR.

## Domains touched

### `generator-change`

- `cli/src/resolve-curated.js` — pass `window.agentPrompt` and per-field
  `agentPrompt` through to the curated schema (`WINDOW_DEFINED_PROPS`,
  `WINDOW_KEY_ORDER`, `FIELD_DECISION_COPY_PROPS`).
- `cli/src/generate-contract.js` — surface `agentPrompt` in
  `agentProfile.agentPrompt` (contract / `contract.mcp.json`).
- `cli/src/push-to-neo.js` — `buildFieldAgentPromptMap` plus threading of the
  spec-level and per-field `agentPrompt` into the NEO writer calls.
- `cli/test/generate-contract.test.js`, `cli/test/push-to-neo.test.js`,
  `cli/test/resolve-curated.test.js`, `cli/test/neo-writer-upsert.test.js`,
  `cli/test/neo-writer-upsert-field.test.js` — unit tests for the above.

### `cli/src/neo-writer.js`

- `upsertSpec` and `upsertField` persist the new `agent_prompt` column
  (INSERT appends it; UPDATE keeps the partial-update contract). This file is the
  direct-SQL writer the pipeline uses to configure NEO Headless.

### `repo-infra`

- `docs/decisions-reference.md` — document `window.agentPrompt` and per-field
  `agentPrompt`.
- `docs/ui-customization.md` — add `agentPrompt` to the extension-point list.
- `docs/superpowers/specs/2026-06-16-mcp-agent-prompt-design.md`,
  `docs/superpowers/plans/2026-06-16-mcp-agent-prompt.md` — design spec and
  implementation plan.

## Companion runtime changes (`com.etendoerp.go`, separate PR, same branch)

- `ETGO_SF_SPEC.AGENT_PROMPT` (CLOB) and `ETGO_SF_FIELD.AGENT_PROMPT` (VARCHAR 2000)
  columns + AD_Column / AD_Element metadata.
- `McpToolRouterSupport.buildDiscoverSpec` / field summary +
  `loadPromptByColumnId` → return `agentPrompt` in `neo_discover` / `neo_schema`.
- `SFUpsertSpec` / `SFUpsertField` webhooks accept an optional `AgentPrompt` param.

## Tests

- CLI suite: `node --test 'cli/test/*.test.js'` — 0 failures (includes the new
  `agentPrompt` tests in neo-writer, push-to-neo, generate-contract,
  resolve-curated).
- Runtime: `./gradlew test --tests 'com.etendoerp.go.mcp.McpToolRouterSupportTest'`
  — `BuildDiscoverSpec` 8/8, 0 failures (includes the two new `agentPrompt` cases).
- End-to-end (no DB): resolve-curated → generate-contract confirms `agentPrompt`
  reaches `agentProfile` and `contract.mcp.json` for a sample window.

## Rollback

- **generator-change / neo-writer:** revert the listed `cli/src/*.js` changes;
  the `agentPrompt` keys become inert (no reader). New DB column is nullable, so
  existing data is unaffected.
- **repo-infra:** revert the doc additions.
- **runtime (`com.etendoerp.go`):** revert the column additions and re-run
  `update.database` + `generate.entities`; MCP responses simply omit `agentPrompt`.
