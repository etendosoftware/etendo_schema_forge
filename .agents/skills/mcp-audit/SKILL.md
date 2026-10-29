---
name: mcp-audit
description: >
  Investigate what happened in a call (or a series of calls) to the Etendo GO MCP on a deployed
  instance: a user reports an MCP error, a record was left half-done (e.g. an invoice with total 0,
  a header without lines), a tool misbehaved, or you need to audit who did what through the MCP.
  Covers the ETGO_MCP_USAGE telemetry table, how to export it from production/experimental, how to
  cross-check the affected business records with read-only SQL, and what the telemetry does NOT
  tell you. Triggers on: "error en el MCP", "falló una llamada del MCP", "quedó en 0", "factura
  en cero", "auditar el MCP", "qué hizo el agente", "mcp usage", "mcp-audit".
argument-hint: "[who / which record / when / environment]"
---

<!-- GENERATED MIRROR - DO NOT EDIT. Source: .claude/skills/mcp-audit/SKILL.md - Regenerate: make sync-agents -->

# /mcp-audit — Audit MCP calls on a deployed instance

**Arguments:** `$ARGUMENTS` (optional: user, record id or document number, time window, environment)

Everything here is **read-only**. The only write path in the tooling is `--mark-reviewed`; never use
it during an investigation (see "Rules").

---

## 1. Collect before querying

Ask the reporter (or get from the message) for:

| Item | Why |
|------|-----|
| Environment (production / experimental / staging) | Selects the profile, see §2 |
| Client (tenant) name and user | `ETGO_MCP_USAGE` is filtered by client, not by user id |
| Approximate time, with timezone | Rows are correlated by time, there is no record id in the telemetry |
| Document number or id of the affected record | Starting point for §5 |
| The error text the agent/user saw | Maps to `error_code` (§4) |
| MCP client (Claude.ai, claude-code, etendo copilot) | Maps to `client_name` |

---

## 2. Profiles and access

Remote connection profiles live in `~/.config/schema-forge/remote/<name>.env` (outside the repo).
Available on a standard dev machine: `production`, `experimental`, `staging`. Each has `SSH_HOST` and
`GRADLE_PROPERTIES` (path of `gradle.properties` on that host).

`psql` runs **on the remote host over SSH** with that host's own DB credentials, so no credential
ever reaches the local machine. Do NOT hardcode or copy DB credentials. Connection logic:
`scripts/lib/remote-etendo-psql.sh`.

---

## 3. The telemetry table: `ETGO_MCP_USAGE`

One row per MCP tool call (`row_type = 'tool_call'`) plus agent-written feedback
(`row_type = 'feedback'`, text in `payload`). Written by `McpUsageLogger` in `com.etendoerp.go`
(that module is not in this repo; the schema below is what the export script reads).

Exported columns (from `scripts/mcp-usage-dump.sh`):

| Column | Meaning |
|--------|---------|
| `etgo_mcp_usage_id` (`id`) | Row id |
| `created` | Timestamp of the call (DB server time) |
| `isactive` (`reviewed`) | **Repurposed as a review flag**: `'Y'` = not reviewed, `'N'` = reviewed. Default exports only `'Y'` |
| `ad_client_id`, `client` | Tenant id and name |
| `session_key` | MCP session; groups the calls of one agent conversation. Use it to replay a whole flow in order |
| `row_type` | `tool_call` or `feedback` |
| `tool_name` | `etendo_list`, `etendo_get`, `etendo_create`, `etendo_update`, `etendo_action`, `etendo_schema`, `etendo_selectors`, ... |
| `verb` | `list get create update action schema selectors discover defaults search batch process report` |
| `target_entity` | `<spec>/<entity>`, e.g. `sales-invoice/header`, `purchase-invoice/lines` |
| `fields_touched` | Comma list of **field names** sent (create/update/action). **Names only, no values** |
| `outcome` | `ok` or `error` |
| `error_code` | Present when `outcome = 'error'`, see §4 |
| `duration_ms`, `req_bytes`, `resp_bytes` | Timing and sizes |
| `client_name`, `client_version` | MCP client that made the call |
| `payload` | JSON only on `feedback` rows; null on tool calls |
| `triage_cell` | Feedback only: cell label the triage bot classified it into (`CelulaPlataforma`, ...) |
| `triage_assignee` | Feedback only: GitHub login the bot assigned; null when the bot was not sure |
| `triage_issue` | Feedback only: URL of the public GitHub pre-ticket the bot opened |
| `triage_task` | Feedback only: key of the private Jira task the bot opened (`ETP-...`) |
| `triaged` | Feedback only: when the bot processed the row; null = not triaged yet |

**Feedback arrives triaged.** An external bot, the bug router (`etendo-bots`, `bin/bug-router`),
polls the `McpFeedbackPending` webhook every 15 minutes, classifies each new feedback row into a
cell, assigns it when it is sure, opens a GitHub pre-ticket (and, optionally, a Jira task), and
writes the result back with the
`McpFeedbackTriage` webhook (the `triage_*` columns and `triaged`). The triage is the bot's job, not
this audit's: read those columns, never write them. They are independent of the review flag
(`isactive`): a triaged row is still unreviewed until someone reviews it.

### What the telemetry does NOT contain (limits of the audit)

- **No argument values and no record id.** You can see that a `create` on `sales-invoice/lines`
  touched `invoicedQuantity,parentId,product` but not which invoice (`parentId` value) or what
  quantity/price. Tie a call to a record only by **client + time + session**, then confirm in the
  business tables (§5).
- **No response body and no error message**, only `error_code`. The detail of an error is in the
  Tomcat log of the host (§6).
- **`outcome = ok` does not mean the business result is right.** A line created without price
  succeeds. Check the data, not only the outcome.
- No user id column: the user is inferred from `client`, `client_name` and `session_key`.

---

## 4. Export and read

```bash
# How many rows match (writes nothing)
scripts/mcp-usage-dump.sh --count --include-reviewed --since 2026-10-19 production

# Export tool calls in a window to JSONL (gitignored folder, or /tmp for throwaway)
scripts/mcp-usage-dump.sh --include-reviewed --since 2026-10-19 --until 2026-10-21 \
  --row-type tool_call --out /tmp/prod-mcp.jsonl production
```

Flags worth remembering: `--include-reviewed` (**always use it when investigating**, otherwise rows
someone already marked reviewed are hidden), `--since/--until YYYY-MM-DD` (`--until` is exclusive and
day-granular; narrow by hour with `jq`), `--row-type`, `--limit`, `--count`, `--out`.
`make mcp-usage PROFILE=production ARGS='...'` is the same script. `make mcp-usage-help` lists all.

Dumps contain production data: never commit them and keep them out of public places. `mcp-usage/`
is gitignored; `/tmp` is fine for throwaway.

### jq recipes

```bash
# Outcome overview
jq -r '.outcome' /tmp/prod-mcp.jsonl | sort | uniq -c

# All failures with who/what/why
jq -r 'select(.outcome=="error") | [.created,.client,.tool_name,.verb,.target_entity,.error_code,.client_name]|@tsv' /tmp/prod-mcp.jsonl

# Replay one session in order (find the session_key from a row near the reported time)
jq -r 'select(.session_key|startswith("m-55d335")) | [.created,.verb,.target_entity,.outcome,.error_code,.fields_touched]|@tsv' /tmp/prod-mcp.jsonl

# Every write on an entity family (invoices) for one client around a time
jq -r 'select((.target_entity//"")|test("invoice";"i")) | select(.verb|IN("create","update","action","batch","process")) | select(.client=="<client name>") | [.created,.session_key[0:8],.verb,.target_entity,.outcome,.error_code,.duration_ms,.fields_touched]|@tsv' /tmp/prod-mcp.jsonl

# Agent feedback text
jq -r 'select(.row_type=="feedback") | .payload | fromjson' /tmp/prod-mcp.jsonl
```

### `error_code` values seen in production

| `error_code` | Typical cause |
|--------------|---------------|
| `validation_error` | Payload rejected (missing/invalid required field). Frequent on `etendo_action` and `etendo_selectors` |
| `not_found` | Record, entity or tab does not exist (wrong entity name such as `goods-shipment/lines`, or bad id) |
| `unknown_filter_field` | `etendo_list` filter on a field the entity does not expose |

The list can grow; list the live values with
`jq -r 'select(.outcome=="error")|.error_code' dump.jsonl | sort | uniq -c`.

### Patterns that matter for "left in a bad state"

- **Header `create` ok, then no `lines` create (or lines `create` error)** in the same `session_key`:
  header orphan with total 0. Check the order and count of `create .../header` vs `create .../lines`.
- **Several headers created within milliseconds** (parallel calls) followed by fewer lines: some
  header got no line.
- **`update .../lines` touching only `unitPrice` / `tax` / `invoicedQuantity`** after the create:
  partial edits can leave the line total at 0 if the other field was never set.
- **`action` with `docAction`** repeated many times in the same second: batch completion;
  check each document's `docstatus`.
- **Error rows right before an ok `action`**: the agent retried and may have acted on a stale or
  incomplete record.

---

## 5. Cross-check the business data (read-only SQL on the host)

Ad-hoc SQL through the same remote helper. Use the profile of the environment under audit:

```bash
source scripts/lib/remote-etendo-psql.sh
resolve_remote_target production ""
remote_psql -A -F'|' <<'SQL'
-- Invoices created in a window, with line count and totals
SELECT i.created::timestamp(0), c.name AS client, i.documentno, i.issotrx, i.docstatus,
       i.totallines, i.grandtotal,
       (SELECT count(*) FROM c_invoiceline l WHERE l.c_invoice_id = i.c_invoice_id) AS nlines,
       i.c_invoice_id
FROM c_invoice i JOIN ad_client c ON c.ad_client_id = i.ad_client_id
WHERE i.created >= '2026-10-20' AND c.name = '<client name>'
ORDER BY i.created;
SQL
```

Useful predicates:

| Question | Predicate |
|----------|-----------|
| Total 0 or no lines at all | `i.grandtotal = 0 OR NOT EXISTS (SELECT 1 FROM c_invoiceline l WHERE l.c_invoice_id = i.c_invoice_id)` |
| Lines that priced at 0 | `c_invoiceline.priceactual = 0 OR linenetamt = 0` |
| Who and when touched it | `i.createdby`, `i.updated`, `i.updatedby` joined to `ad_user` |
| Completed with total 0 (worse: accounting posted) | `i.docstatus = 'CO' AND i.grandtotal = 0` |
| Header without lines in draft | `i.docstatus = 'DR'` and `nlines = 0` |

`docstatus`: `DR` draft, `CO` completed, `VO` voided, `RE` reversed.

Notes:
- `psql` is `-X` and `ON_ERROR_STOP`; keep every statement a `SELECT`. Do not run `UPDATE/DELETE`
  here. Fixing a record is a separate, explicit decision (see §7).
- The same pattern works for any entity (`c_order`, `m_inout`, `fin_payment`): replace the table and
  correlate by `created` and client.
- Zero-total drafts are common noise from tests and abandoned drafts. Narrow by client and time
  before drawing conclusions. In production on 2026-10-20 there were 72 invoices with total 0 or no
  lines in the previous 45 days, most of them drafts.

---

## 6. Server-side detail: Tomcat log

For the error message and stack behind an `error_code`, read the Tomcat/NEO log on the host for the
same time window (`SSH_HOST` of the profile; the log directory depends on the install, look under
the Etendo root of `GRADLE_PROPERTIES`). Search by the `created` timestamp of the failed row and the
entity name. This is the only place the exception text lives.

---

## 7. Conclude and report

Deliver, in this order:

1. **What the agent did**: the ordered calls of the session (verb, entity, outcome, error_code).
2. **State of the records**: document number, `docstatus`, totals, line count, who created it.
3. **Cause**: one of the patterns in §4, with the rows that prove it. If the telemetry cannot
   prove it (no values stored), say so and name what is missing instead of guessing.
4. **Remediation options**, not applied:
   - Draft: fix the lines through the MCP/UI or delete the draft.
   - Completed: reactivate or void through the normal document flow, never with raw SQL.
5. **Product fix** if it is a defect: e.g. header and lines not atomic, price list missing, schema
   understating required fields. Existing findings live in `mcp-tests/findings/`.
   Report tool bugs with `/sf-bug` when the fault is in this repo's tooling.

---

## Rules

- Production data is read-only here. `--mark-reviewed` and any DB write need an explicit user
  request.
- Always `--include-reviewed` when investigating.
- Never paste client data (names, amounts) into public places or commits.
- Do not guess ids: take them from the user, the telemetry or SQL.
- State limits explicitly: the telemetry has no values, no record id and no error message.

## Related

- `scripts/mcp-usage-dump.sh`, `scripts/lib/remote-etendo-psql.sh`, `mcp-usage/README.md`
- `modules/com.etendoerp.go/docs/mcp-usage-telemetry.md` (in the `com.etendoerp.go` module repo:
  full rationale of the table and the reviewed flag)
- `docs/ops/mcp-copilot-metrics.md` (metrics derived from the same table)
- Skills `mcp-comparison`, `mcp-ace-comparison`, `mcp-ui-parity` (benchmarks, not incident audits)
