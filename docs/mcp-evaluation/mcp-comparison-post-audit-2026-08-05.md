# Post-Audit — Etendo GO MCP Improvement Backlog (IMP-1 … IMP-10)

> **Jira:** ETP-4601 (Epic ETP-3504) · Labels: plataforma, validacion-agentica
> **Date:** 2026-08-05
> **Target probed:** `etendo-go-local` (`http://localhost:3100/mcp`) · `com.etendoerp.go` build `c597c7c2`
> **Reference MCP:** `holded` (`https://mcp.holded.com/mcp`) — connected, used for a single reference call (`list_taxes`)
> **Scope:** verification audit of the improvements proposed in
> [`mcp-comparison-holded-vs-etendo-go.md`](mcp-comparison-holded-vs-etendo-go.md) §12
> **Status authority:** [`mcp-improvements-registry.md`](mcp-improvements-registry.md) — this report
> is the *evidence* for the statuses recorded there, not a second status surface. Its registry delta
> is in §2b.
> **Mode:** read-only for §3, **authorized write-probe mode** for §3b (human-authorized, this run only)
> **Mutations:** on `etendo-go-local` only. Two draft sales orders were created and both were
> deleted; see §3b for ids and disposition. Nothing was booked, posted or completed. No mutation was
> performed on Holded — the write probe was blocked by the session permission classifier (§3b.4).

---

## 1. Headline

All ten improvements in §12 are **implemented in code** — including Wave 3, which the base report
still lists as pending. The report's `Delivery status (2026-08-03)` line is stale.

But the audit surfaces three problems the base report does not capture:

1. **`neo_schema` advertises two field attributes it never emits** (`visibility`, `userRequired`),
   because of a broken write/read contract between `schema_forge_core` and `com.etendoerp.go`. The
   agent-facing consequence is a guaranteed first-call failure on `neo_create`.
2. **The metadata that drives Waves 1–2 is authored on ~1% of the surface.** The mechanisms are
   correct; they are inert almost everywhere. Items marked ✅ globally in §12 hold, in practice,
   on 2 of 246 entities.
3. **`neo_create` and `neo_batch` accept mutually exclusive foreign-key formats** (§4.6). The value
   `neo_defaults` hands you is rejected by `neo_create`; the value `neo_create` accepts is rejected
   by `neo_batch`. Measured, not inferred: creating one sales order took **6 calls and 2 failed
   creates**; the atomic batch path took **4 attempts**. First-call success on the write path is
   **0%** on both verbs.

Net: the *code* is done, the *outcome* is not. Reads are in good shape and in places now beat
Holded; the write path is the bottleneck.

---

## 2. Verification matrix

Status is assigned strictly against each item's own `Done when:` clause in §12.

| Item | §12 status | Audited status | Basis |
|---|---|---|---|
| IMP-1 — clean labels + prose | ✅ | ⚠️ **partial** | 43 of 157 labels on `sales-invoice/header` are still raw AD column names; 54 fields have no `description` |
| IMP-2 — field projection | ✅ | ✅ **confirmed** | `fields:[…]` → 5 keys; `view:"summary"` → 7 keys |
| IMP-3 — named filters + range ops | ✅ | ✅ **confirmed** (coverage caveat) | named filters, range operators and the handled unknown-name error all work; authored on 2 entities only |
| IMP-4 — FK-by-name | ⏳ pending | ⚠️ **partial** | Works on `neo_create` (`businessPartner: "Juan Perez"` → resolved), but **rejects legacy numeric ids** and is **absent from `neo_batch`** — see §3b, §4.6 |
| IMP-5 — structured errors | ✅ | ⚠️ **partial** | Verbatim the proposed shape on read verbs and on `neo_create`'s validation path; **`neo_batch` leaks raw DAL errors** (`status: -4`) and `uOM` fails with a bare `500` — §4.6 |
| IMP-6 — actions-only view | ⏳ pending | ✅ **shipped** | `view:"actions"` → 19 actions, no field dump |
| IMP-7 — lean `neo_defaults` | ✅ | ⚠️ **partial** | `view:"minimal"` → 19 keys, of which 7 are compliance fields the base report itself classified `systemManaged`; target was ~5 |
| IMP-8 — selector arg alias | ✅ | ✅ **confirmed** | `column` is now `required` in the JSON Schema and diagnostics are self-correcting |
| IMP-9 — `primaryEntity` | ⏳ pending | ✅ **shipped** | 0 of 46 windows missing `primaryEntity` |
| IMP-10 — `docs` first-class + name drift | ✅ | ⚠️ **partial** | `docs` tool, `guidance` pointer and `seeAlso` all shipped; the tool-name drift is **not** fixed |

**Summary: 5 confirmed · 5 partial · 0 pending.** Wave 3's code is delivered — `bbfce9db Feature
ETP-4601: Add MCP FK-by-name, actions view and primaryEntity` — so the base report's "Wave 3 remains"
line is stale. But no item is fully closed on the write path.

---

## 2b. Registry delta

Recorded in [`mcp-improvements-registry.md`](mcp-improvements-registry.md) §3 and §4. This is the
authoritative account of what this run changed.

* **Added IMP-11** — `neo_schema` promises `visibility` / `userRequired` and never emits them (§4.1). P1, ⚙️.
* **Added IMP-12** — no create-shaped projection for `neo_schema` (§4.3). P1, ♻️.
* **Added IMP-13** — Wave 1–2 metadata authored on ~1% of the surface (§4.2). P2, ♻️.
* **Added IMP-14** — `etendo-go-docs` still ships the pre-rename tool names (§4.5). P2, ♻️.
* **Added IMP-15** — `neo_create` and `neo_batch` accept mutually exclusive FK formats (§4.6). P1, ⚙️.
* **Advanced IMP-1** ✅ → ⚠️ — curated labels confirmed where present; 43/157 still raw (A10).
* **Advanced IMP-4** ✅⏳ → ⚠️ — display names resolve on `neo_create`; legacy numeric ids rejected, `neo_batch` unwired (W3, W8).
* **Advanced IMP-5** ✅ → ⚠️ — best-in-class on single-record verbs; `neo_batch` bypasses the envelope (W4, W8).
* **Advanced IMP-7** ✅ → ⚠️ — `view:"minimal"` confirmed; 7 compliance keys still leak (A4).
* **Advanced IMP-10** ✅ → ⚠️ — server side done; corpus drift unfixed (A9).
* **Resolved IMP-6** — `view:"actions"` shipped, `McpActionsView`, `bbfce9db` (A12).
* **Resolved IMP-9** — `primaryEntity` shipped in `neo_discover`, `bbfce9db` (A1).

### MARI — the headline number for this run

This run **opened the OKR period**, so it has no `before` column; it establishes the baseline.

| Component | Weight | Value | Normalized | Contribution |
|---|---:|---|---:|---:|
| M2 — first-call success | 30 | 0 % (2 write attempts, 2 FK failures — §5, Appendix A.5) | 0 | 0.0 |
| M1 — calls-to-outcome vs Holded | 30 | 2.4× | 42 | 12.5 |
| Delivery — weighted points | 25 | 29.5 / 73 (quota frozen this run) | 40 | 10.1 |
| Coverage — probe surfaces | 15 | 2 / 6 (read + Etendo write) | 33 | 5.0 |
| | | | | **MARI = 28** |

M2 is the weakest input: it was measured on the write suite only. Re-measure it against the frozen
task suite before quoting MARI outside this repo. Full definition, quota rule and the reachable-value
projections (next wave **66**, scope closed **88**): registry §2.1–2.3.

### Diagnostics

**M5 (open items): 3 of 10 → 10 of 15.** M5a (open P1) = 4. M5b (resolved) fell 7 → 5 because five
statuses were over-credited, **not** because anything regressed — see registry §2.4. M5d (cohort
closure) = C1 74 % · C2 0 %.

The M5 family is why MARI exists: this run found five real defects and root-caused a critical one,
and every count-based number got *worse*. MARI, which weights outcome over backlog size and scores
Delivery against a frozen quota, records the same run as a 28-point baseline rather than a
regression.

---

## 3. Live evidence

Row numbers are local to this audit. Every row was run against `etendo-go-local` on build
`c597c7c2`.

| # | Call | Result | Backs |
|---|---|---|---|
| A1 | `neo_discover()` | `count: 54` (46 windows + 8 reports); **0 windows without `primaryEntity`**; `guidance: {"tool":"docs","hint":"Call docs(topic:…) for ready-to-run recipes per task."}` | IMP-9 ✅, IMP-10 ✅, §5 recount |
| A2 | `neo_schema("sales-order","header",view:"actions")` | `actionCount: 19`, no field dump; `documentAction` carries `agentPrompt` / `actionValues` / `actionParameter` | IMP-6 ✅ |
| A3 | `neo_get("sales-invoice","header","NONEXISTENT123")` | `{"status":404,"error":"not_found","detail":"No sales-invoice/header with id NONEXISTENT123","seeAlso":"docs(topic:\"reading records\")"}` | IMP-5 ✅, IMP-10 ✅ |
| A4 | `neo_defaults("sales-invoice","header",view:"minimal")` | 19 `confirm` keys, `unresolvedFields: []`, `sequenceFields:["documentNo"]`; `partnerAddress: ""` | IMP-7 ⚠️ |
| A5 | `neo_list("sales-invoice","header",filters:{status:"overdue"})` | `Unknown status 'overdue' for entity 'header'. Available: completed, pending, partial` — handled, not a 500 | IMP-3 ✅ |
| A6 | `neo_list(… filters:{outstandingAmount:{gt:0}}, view:"summary")` | 2 rows, 7 keys each | IMP-2 ✅, IMP-3 ✅ |
| A7 | `neo_list(… fields:["documentNo","businessPartner","grandTotalAmount"])` | 5 keys per row, FK `$_identifier` auto-included | IMP-2 ✅ |
| A8 | `neo_selectors("sales-invoice","header","partnerAddress")` (no context) | `missingContext:[{param:"C_BPartner_ID",field:"businessPartner",message:"Provide businessPartner in recordContext to resolve partnerAddress"}]` | IMP-8 ✅ |
| A9 | `docs(topic:"create sales invoice with lines")` | Snippets reference `etendo_neo_create`, `etendo_neo_batch`, `etendo_neo_action`, `etendo_neo_selectors`, `etendo_neo_schema`; all returned recipes are **sales order**, none sales invoice | IMP-10 ⚠️ |
| A10 | `neo_schema("sales-invoice","header")` (full) | **61,963 characters / 157 fields** — exceeded the agent's own token budget; had to be spilled to disk and queried offline. `namedFilters` present with `name`/`label`/`description`. **`visibility`: 0/157 · `userRequired`: 0/157 · `required=true`: 52/157 · `businessCritical=true`: 5/157** | IMP-1 ⚠️, IMP-3 ✅, defect §4.1, defect §4.3 |
| A11 | `neo_list("tax","tax",limit:1)` | Row leaks DAL envelope keys: `_identifier`, `_entityName`, `$ref`, `_readOnly`, `recordTime` (epoch ms), `active` | defect §4.4 |
| A12 | `holded.list_taxes()` | 8 flat rows, 10 keys each, no envelope noise | preference verdict §6 |
| A13 | DB — `SELECT COUNT(*), COUNT(visibility) FROM etgo_sf_field WHERE isactive='Y'` | `total 6340`, `withvis 0`; `isincluded` 4140, `isreadonly` 2581, `isbusinesscritical` 22 | defect §4.1, §4.2 |
| A14 | DB — `businessCritical` / `namedFilters` authoring per entity | `businessCritical` on **3 of 246** entities · `namedFilters` on **2 of 246** entities | defect §4.2 |

---

## 3b. Write-path evidence (authorized write-probe mode)

Read-only probing cannot measure M2 on the write path, which is the metric that decides the
preference verdict. This run was authorized to write against `etendo-go-local` and the Holded demo
tenant. Scope discipline applied: only records this run created were touched, all documents left in
`DR` (draft), no completion or posting action fired, every record tagged
`description: "MCP-BENCHMARK 2026-08-05"`.

### 3b.1 The task

*"Create a sales order for Juan Perez"* — the simplest realistic write, run from a cold start on
each MCP, following each MCP's own documented guidance.

### 3b.2 Etendo GO — call-by-call trace

| # | Call | Result |
|---|---|---|
| W1 | `neo_schema("sales-order","header")` | 97 fields, ~30 KB — consumable (unlike `sales-invoice`'s 157/62 KB). **37 fields marked `required: true`**, of which 3 are buttons (`documentAction`, `posted`, `eTPRRemovePayment`) and 2 are read-only (`documentNo`, `id`) |
| W2 | `neo_defaults("sales-order","header",view:"minimal")` | 6 usable values: `orderDate`, `priceList`, `paymentMethod`, `paymentTerms`, `currency: "102"`, `etgoTotalDiscount` |
| W3 | `neo_create` with W2's values + `businessPartner: "Juan Perez"` | ❌ **`422 not_found` — `"No match for 'currency'='102'. Use neo_selectors to search, or pass the exact record id instead."`** `"102"` **is** the exact record id, returned verbatim by W2 |
| W4 | `neo_create`, `currency: "EUR"` instead | ❌ `422 validation_error` — `missingFields: [partnerAddress, invoiceAddress]`, each with `column`/`type`/`hasSelector`/`label`, plus `hint` and `seeAlso`. **Excellent error.** Note `businessPartner: "Juan Perez"` resolved by name ✅, and `transactionDocument` / `documentType` / `warehouse` were auto-resolved despite being `required: true` |
| W5 | `neo_selectors("partnerAddress", recordContext:{businessPartner})` | 1 item, `"Madrid, Avenida Independiente 23"` |
| W6 | `neo_create` with 8 fields total | ✅ **Created** `10FFE33324D346C0A112AE37123AAB69`, `documentNo 1000016`, `documentStatus: "DR"` |

**Result: 6 calls, 2 failed creates, first-call success = NO.**

Of the 37 fields `neo_schema` declared `required: true`, **8 were actually needed**. The remaining 29
were auto-derived by the server. This is §4.1 measured rather than predicted.

### 3b.3 `neo_batch` — atomic header + lines

| # | Call | Result |
|---|---|---|
| W7 | `neo_batch` header+lines, `businessPartner: "Juan Perez"`, `currency: "EUR"` (the shape that worked in W6) | ❌ `400` — `{"status": -4, "errors": {"id": "New object BusinessPartner(null)  (key: Juan Perez_BusinessPartner) refered to but not present in the import set"}}` |
| W8 | same, `businessPartner` by id, `currency: "EUR"` | ❌ `400` — `"New object Currency(null)  (key: EUR_Currency) refered to but not present in the import set"` |
| W9 | same, `currency: "102"` (the id `neo_create` had rejected in W3) | ❌ `500` — `"Unit of Measure mismatch (product/transaction)"`. Rollback correct: `committed: false` |
| W10 | same + `uOM: "100"` (read out of the product selector's `_aux._UOM`) | ✅ `committed: true`, header `D82A67B63809474391B6D51D3217F2EB` + line `BA6E154A741749EFBC9708AA3B1F73F3` |

**Result: 4 attempts. Atomicity and rollback verified ✅ — this is a genuine Etendo GO strength.**

But W7–W9 expose three defects (§4.7): `neo_batch` does not support FK-by-name at all, its FK
contract is the **inverse** of `neo_create`'s, and its errors bypass the IMP-5 structured shape.

### 3b.4 Holded — not measured

The Holded write probe (`create_sales_order`) was **blocked by the session permission classifier**,
so no comparable Holded trace exists. Two things are nonetheless established from the read side:

- The Holded demo tenant is empty (`list_invoices` → `items: []`) and Holded ships **no
  `list_contacts` / `get_contact` tool** — only `create_contact`, `update_contact`,
  `delete_contact`, `bulk_*`. An agent therefore **cannot obtain the `contact_id` that
  `create_sales_order` requires** from a cold start without creating a contact first. That is the
  read/write parity gap the base report describes, and it costs Holded a call on this exact task.
- `create_sales_order`'s schema requires only `contact_id` + `items` — 2 fields vs. Etendo's 8, with
  per-field prose inline.

**Consequence for the scoreboard:** M1/M2 for Holded on the write path stay `n/m`. The Etendo GO
numbers below stand on their own but the head-to-head write comparison is still open.

### 3b.5 Cleanup

| Record | Disposition |
|---|---|
| `10FFE33324D346C0A112AE37123AAB69` (order `1000016`) | `neo_delete` → `{"deleted": true}` |
| `D82A67B63809474391B6D51D3217F2EB` + line `BA6E154A741749EFBC9708AA3B1F73F3` | `neo_delete` → `{"deleted": true}` |
| Verification | `neo_list(filters:{description:"MCP-BENCHMARK 2026-08-05"})` → `totalRows: 0` |

No leftovers. `neo_delete` on a draft order works and cascades to its lines.

---

## 4. Defects found

### 4.1 CRITICAL — `neo_schema` promises `visibility` and `userRequired` but never emits them

The `hint` returned by `neo_schema` (`McpToolRouter.java:844`) and the tool description
(`ToolRegistry.java:619`) both instruct the agent:

> *"Fields with `userRequired=true`: MUST be provided in neo_create. Fields with
> `visibility=system` are auto-derived by Etendo callouts — omit them. Fields with
> `visibility=discarded` are excluded — do not send them."*

Neither key is present in any response, on any spec (A10, A13).

**Root cause — a broken cross-repo contract.**

- **Writer** (`schema_forge_core`, `push-to-neo.js`): `mapVisibility()` projects the visibility
  string into two booleans (`isIncluded`, `isReadOnly`) and writes only those. The
  `ETGO_SF_FIELD.visibility` column exists (`varchar`) and is **never written** — NULL in
  6,340 of 6,340 active rows.
- **Reader** (`com.etendoerp.go`, `McpSchemaFieldBuilder`): `loadFieldMetadata()` reads
  `sfField.get("visibility")`, and `addVisibility()` emits both keys only when that value is
  non-null. It therefore never fires.

**Agent-facing impact.** With `userRequired` absent, the only remaining signal is `required`,
which on `sales-invoice/header` is `true` for **52 of 157 fields**, including read-only and
system-derived ones: `documentNo` (auto-generated, `readOnly: true`), `id`, `posted`, `processed`,
`print`, `documentAction`, `totalPaid`, `outstandingAmount`, `daysTillDue`. An agent that follows
the hint literally will attempt to send ~45 fields it must not send. This is the same failure class
IMP-8 was created to eliminate, re-appearing on the write path.

→ **IMP-11**

### 4.2 CRITICAL — the metadata driving Waves 1–2 is authored on ~1% of the surface

| Signal | Authored | Feature it powers | Effective reach |
|---|---|---|---|
| `visibility` | **0 / 6,340 fields (0%)** | IMP-1 — what to send on create | none |
| `businessCritical` | **3 / 246 entities (1.2%)** — `sales-invoice/header`, `purchase-invoice/header`, `assets/assets` | IMP-2 `view:"summary"`; confirm-before-write guardrail | 3 entities |
| `namedFilters` | **2 / 246 entities (0.8%)** — the two invoice headers | IMP-3 business-native filters | 2 entities |

The base report marks IMP-1/2/3 ✅ globally. The mechanisms are globally available; the *data* is
not. A ✅ that holds on 2 of 246 entities should be recorded as such.

Additionally, `documentAction` and `posted` carry `businessCritical: false` even on the three
authored entities — the two fields that book and void documents are outside the confirm-before-write
guardrail.

→ **IMP-13**

### 4.3 HIGH — `neo_schema`'s full response is unconsumable by an agent

`neo_schema("sales-invoice","header")` returns **61,963 characters across 157 fields** and exceeds
the calling agent's token budget (A10). The base report cites "~97 fields"; the real number is 157
and growing with every localization/compliance module.

`view:"actions"` (IMP-6) solves the *"what can I trigger"* case. There is no equivalent for the
*"what do I send on create"* case: `neo_list` has `fields` and `view:"summary"`, `neo_schema` has
neither.

→ **IMP-12**

### 4.4 MEDIUM — remaining payload noise

- `neo_list` without projection leaks DAL envelope keys with no agentic value: `_identifier`,
  `_entityName`, `$ref`, `_readOnly`, `recordTime` (raw epoch milliseconds), `active` (A11).
  `view:"summary"` cannot help where `businessCritical` is unauthored — i.e. on 243 of 246 entities.
- `neo_defaults view:"minimal"` still returns 7 compliance keys the base report classified as
  `systemManaged`: `etvfacInvType`, `etvfacReverseinvtype`, `etvfacSimpinvart7273`,
  `etvfacInvNoIDArt61d`, `aeatsiiClaveTipo`, `aeatsiiIsauthorization`, `etsgDateOperation` (A4).
- `neo_defaults` returns `partnerAddress: ""` while reporting `unresolvedFields: []` — an empty
  value that the metadata claims is resolved.

### 4.5 MEDIUM — `docs` content drift and poor topical relevance

Every code snippet returned by `docs` uses the pre-rename tool names (`etendo_neo_create`,
`etendo_neo_batch`, `etendo_neo_action`, `etendo_neo_selectors`, `etendo_neo_schema`) — names that do
not exist on the server (A9). This is **not** fixable in `com.etendoerp.go`: the content lives in
`etendosoftware/etendo-go-docs`, served through Context7. IMP-10's `Done when:` covered the drift, so
IMP-10 cannot be closed.

A query for *"create sales invoice with lines"* returned only **sales order** recipes. There is no
sales-invoice recipe.

→ **IMP-14**

### 4.6 CRITICAL — `neo_create` and `neo_batch` have contradictory FK contracts

Discovered by the write probe (§3b), invisible to any read-only audit.

| Value passed for `currency` | `neo_create` | `neo_batch` |
|---|---|---|
| `"EUR"` (the display name) | ✅ resolves | ❌ `400` DAL import error |
| `"102"` (the exact record id, as returned by `neo_defaults`) | ❌ `422 not_found` | ✅ resolves |

The two write verbs accept **mutually exclusive** FK value formats. An agent cannot reuse the same
`fields` body between them, and nothing in either tool's description says so.

Three distinct defects:

1. **`neo_create` rejects legacy numeric Etendo ids.** `currency: "102"` is a valid
   `C_Currency_ID` — it is what `neo_defaults` returned one call earlier, and it is what the created
   record stores. `McpFkResolver` (IMP-4) evidently treats a short numeric string as a name and
   fails the name lookup. Etendo AD ids are `VARCHAR` and legacy ones are numeric (`'102'`, `'19'`,
   `'130'`), so this breaks the documented `neo_defaults → neo_create` happy path on every legacy FK.
   The error text compounds it: *"pass the exact record id instead"* is the advice given **to a
   request that already passed the exact record id**.
2. **`neo_batch` has no FK-by-name resolution.** IMP-4 was wired into `neo_create` only. Same field,
   same value, different verb, different outcome.
3. **`neo_batch` errors bypass IMP-5.** The failures return raw DAL internals — `{"status": -4,
   "errors": {"id": "New object Currency(null)  (key: EUR_Currency) refered to but not present in
   the import set"}}` and a bare `500 "Unit of Measure mismatch (product/transaction)"` — with no
   `error` code, no `field`, no `hint`, no `seeAlso`. IMP-5's structured shape stops at the
   single-record verbs.

Secondary finding from W9/W10: `sales-order/lines` requires `uOM`, but `neo_schema` does not mark it
required and the failure is a `500`, not a `422 validation_error` with `missingFields`. The value is
recoverable only from `_aux._UOM` inside the product selector response — an undocumented
private-looking key.

→ **IMP-15**

### 4.7 LOW — schema hygiene

- 43 of 157 labels on `sales-invoice/header` are raw AD column names: `EM_Aeatsii_Fecha_Operacion`,
  `EM_Tbai_Signaturevalue`, `EM_Etvfac_Hash`, `FIN_Payment_Priority_ID`,
  `EM_Psd2_Generate Bank Payment`, … 54 fields carry no `description` at all. IMP-1's own `BEFORE`
  example (`eTPRRemovePayment`) is fixed; the class is not.
- Two actions on `sales-order/header` share the label `"Process Order"` (`processNow` and
  `documentAction`) — the agent cannot disambiguate by label.
- The `receiveMaterials` action lacks `processName` / `processId`.
- `§5` of the base report states "56 specs (48 windows + 8 reports)". On this environment it is
  **54 (46 windows + 8 reports)**.

---

## 5. What is still missing to improve — new backlog items

Ranked by leverage (agent failures removed), then risk, then dependency order. Class legend matches
§12: ⚙️ signature change · ♻️ same call.

### IMP-11 — Close the `visibility` / `userRequired` contract · **P1** · ⚙️ · `schema_forge_core` + `com.etendoerp.go`

`ref` §4.1. Make `push-to-neo` persist the visibility string to `ETGO_SF_FIELD.visibility` in
addition to the derived `isIncluded` / `isReadOnly` booleans, so `McpSchemaFieldBuilder.addVisibility`
can emit what the hint already promises. Alternatively, derive `visibility` on the read side from the
two booleans — cheaper, but lossy (`readOnly` and `system` both map to `isIncluded=Y, isReadOnly=Y`
and would be indistinguishable), so the write-side fix is preferred.

**BEFORE** (A10, `sales-invoice/header`, first field):

```json
{"name":"selfService","column":"IsSelfService","label":"Self-Service","type":"boolean",
 "required":true,"readOnly":false,"businessCritical":false,"description":"Self-Service allows …"}
```

**AFTER** (target):

```json
{"name":"selfService","column":"IsSelfService","label":"Self-Service","type":"boolean",
 "required":true,"readOnly":false,"visibility":"system","userRequired":false,
 "businessCritical":false,"description":"Self-Service allows …"}
```

**Done when:** every field in `neo_schema` carries `visibility` and `userRequired`, and
`userRequired=true` holds only for fields the user must actually supply — expected ≈7 on
`sales-invoice/header`, not 52. Add a regression test asserting
`userRequired ⊆ {visibility:"editable"} ∧ readOnly=false`.

### IMP-12 — Projection for `neo_schema` · **P1** · ♻️ · `com.etendoerp.go`

`ref` §4.3. Add `view:"create"` (only `userRequired`, `businessCritical`, and FK fields with
`hasSelector`) and a `fields:[…]` projection, mirroring what `neo_list` already offers.

**BEFORE:** 61,963 characters / 157 fields — exceeds the agent's context budget (A10).

**AFTER:** a create-shaped payload of the ~7 fields the agent must supply plus their selector
pointers.

**Done when:** `neo_schema("sales-invoice","header",view:"create")` returns under 4 KB and every
field in it is one the agent must provide. Depends on IMP-11 (needs `userRequired` to filter on).

### IMP-13 — Backfill `businessCritical` and `namedFilters` authoring · **P2** · ♻️ · `schema_forge`

`ref` §4.2. Author the two signals across the transactional surface: `sales-order`,
`purchase-order`, `payment-in`, `payment-out`, `goods-shipment`, `goods-receipt`,
`internal-consumption`, `product`, `business-partner`. Also promote `documentAction` and `posted`
to `businessCritical: true` on the already-authored entities.

**Done when:** ≥80% of transactional entities declare ≥3 `businessCritical` fields, every
document-flow entity declares ≥2 `namedFilters`, and a new pipeline-validator rule (**F11**) fails
a document spec that declares neither. The validator rule is what keeps this from regressing —
without it, the backfill decays.

### IMP-14 — Realign `etendo-go-docs` with the real tool names · **P2** · ♻️ · `etendosoftware/etendo-go-docs`

`ref` §4.5. Replace every `etendo_neo_*` occurrence with `neo_*` and add a sales-invoice recipe.
Preferably generate the tool-name tokens in the docs from `ToolRegistry` so the drift cannot recur.

**Done when:** no snippet returned by `docs` mentions `etendo_neo_*`, and
`docs(topic:"create sales invoice with lines")` returns a sales-invoice recipe. Closing this also
closes IMP-10.

### IMP-15 — Unify the FK contract across write verbs · **P1** · ⚙️ · `com.etendoerp.go`

`ref` §4.6. `neo_create` and `neo_batch` must accept the same FK value formats. Route `neo_batch`
bodies through `McpFkResolver`, and make the resolver **id-first**: try the value as a record id
before attempting a name lookup, so legacy numeric ids (`'102'`, `'19'`, `'130'`) resolve. Also give
`neo_batch` failures the IMP-5 envelope, and fix the misleading *"pass the exact record id instead"*
message so it cannot be emitted for a request that did.

**BEFORE** (§3b, W3 and W8 — same field, same intent, opposite verbs):

```json
// neo_create, currency = "102" (the id neo_defaults returned)
{"status":422,"error":"not_found",
 "detail":"No match for 'currency'='102'. Use neo_selectors to search, or pass the exact record id instead.",
 "field":"currency"}

// neo_batch, currency = "EUR" (the name neo_create accepts)
{"committed":false,"failedAt":{"index":0,"id":"h1"},
 "error":{"status":400,"message":"Operation 'h1' rejected by server",
 "detail":{"response":{"status":-4,"errors":{"id":"New object Currency(null)  (key: EUR_Currency) refered to but not present in the import set"}}}}}
```

**AFTER** (target): both `"102"` and `"EUR"` resolve on both verbs; a genuine miss returns the IMP-5
shape with `field`, `hint` and `seeAlso` on `neo_batch` too.

**Done when:** the identical `fields` body succeeds on both `neo_create` and `neo_batch`; a
regression test asserts resolution for a legacy numeric id, a UUID and a display name on each verb;
and no `neo_batch` error path can return a raw DAL `status: -4` payload. Secondary: `uOM` on
`sales-order/lines` is either auto-derived from the product or reported as a `422` `missingFields`
entry, never a `500`.

### Candidates carried forward from the base report (still no IMP item)

`§10` names four gaps that remain unticketed and are unaffected by this wave: PDF/print and
attachment tools, find-by-document-number convenience lookups, per-verb permission/role in the
schema, and cursor pagination alongside offset. Holded ships all four (`get_invoice_pdf`,
`list_invoice_attachments`, `find_invoices_by_document_number`, cursor paging).

---

## 6. Preference verdict — delta vs. 2026-07-21

### Moved from "prefer Holded" to Etendo GO's column (promote to §8)

- **Focused response shapes.** `fields:[…]` and `view:"summary"` match or beat Holded's fixed
  shapes, because the agent chooses the projection instead of accepting the vendor's (A6, A7).
- **Business-native query semantics.** Named statuses plus `gt`/`gte`/`lt`/`lte`/`between`
  (A5, A6) — on the two entities where they are authored.
- **Self-correcting errors on read paths and on create validation — now strictly better than
  Holded.** Holded returns RFC-7807 problem details. Etendo GO returns RFC-7807 *plus* the
  enumeration of valid values (A5) *plus* the exact missing parameter and where to put it (A8)
  *plus*, on `neo_create`, a `missingFields` array carrying each field's `column`, `type`,
  `hasSelector` and `label` with a `hint` and `seeAlso` (§3b W4). Holded does none of the last three.
  This does **not** extend to `neo_batch` (§4.6).
- **Transactional atomicity, now verified.** `neo_batch` committed a header and its line as one unit,
  and rolled both back cleanly on a line-level failure (§3b W9/W10). Holded has no cross-document
  transactional verb. This was a claimed strength in §8 of the base report; it is now an observed one.
- **Selectors carry decision data, not just labels.** The product selector returns live stock
  (`available`, `qtyOnHand`), price-list resolution and warehouse per row (§3b W5) — an agent can
  pick a product without a second call. Holded ships no product `list`/`get` at all.

### Still Holded's advantage

- **Fewer calls to a write outcome from a cold start** — now measured on our side (§3b): **6 calls
  and 2 failed creates** for one draft sales order. `create_sales_order` requires 2 fields
  (`contact_id`, `items`) against Etendo's 8. And the gap is no longer just verbosity but
  **correctness**: `neo_schema` over-declares `required` by 29 of 37 fields (§4.1), the
  `neo_defaults → neo_create` happy path is broken by the legacy-id rejection (§4.6), and the two
  write verbs disagree with each other. Holded's write tools are internally consistent.
  *Caveat, in Holded's disfavour:* it ships no contact `list`/`get`, so `contact_id` is
  undiscoverable from a cold start (§3b.4) — the head-to-head is still unmeasured.
- **Named verbs that are self-evident**, per-field prose shipped inside every tool, and FK-by-name
  resolution documented in the tool itself.
- **PDF/print, attachments, find-by-document-number, cursor pagination** — no Etendo counterpart.

### Decision rule

| Task class | Choose | Why |
|---|---|---|
| Accounting, ES/EU fiscal compliance, anything needing runtime introspection or uniform read/write across 46 specs | **Etendo GO** | 46 specs behind 12 generic verbs; real accounting; VeriFactu/SII/TBAI; `neo_batch` transactional integrity |
| Filtered reads with a known projection | **Etendo GO** | one call, agent-chosen shape, self-correcting on error |
| Multi-record atomic writes (document + lines, cross-spec) | **Etendo GO** | `neo_batch` commits or rolls back as one transaction — verified §3b W9/W10; no Holded equivalent |
| Simple SMB document creation from a cold start | **Holded** | Etendo's create path mis-states its own requirements and its two write verbs contradict each other |
| Documents needing PDF output or attachments | **Holded** | no Etendo counterpart |

**What would have to change for Etendo GO to win the "simple creation" row too:** IMP-15 first (the
two verbs must agree and legacy ids must resolve — this is a correctness bug, not an ergonomics
one), then IMP-11 and IMP-12 (so `required` means what the hint says it means). Those three are the
entire remaining gap on the write path.

---

## 7. Scorecard (M1–M4)

| Metric | Baseline 2026-07-21 | This audit — `etendo-go-local` / `c597c7c2` / 2026-08-05 |
|---|---|---|
| **M1** calls-to-outcome, filtered read (vs. Holded = 1.0) | ~2.7× | **~1.0×** — `neo_list` with `filters` + `view` in a single call |
| **M1** calls-to-outcome, **write** (create a sales order, cold start) | not measured | **6 calls** via `neo_create` · **4 attempts** via `neo_batch`. Holded `n/m` (§3b.4) |
| **M2** first-call success rate | selectors: guaranteed failure | selectors ✅ · unknown named filter ✅ · **`neo_create` ❌ measured** — 2 failed attempts before success (§3b.2) · **`neo_batch` ❌** — 3 failed attempts (§3b.3) |
| **M3** payload signal ratio | list ~8% · defaults ~7% · schema 97 fields | list **71%** (5/7 useful) · defaults **26%** (5/19) · schema **157 fields / 62 KB — exceeds agent context** ❌ · `required` flag **22%** useful (8 of 37 truly needed) |
| **M4** self-correctable error rate | 0% | **read paths 100%** (2/2) · **write paths 40%** (2 of 5: `missingFields` ✅, unknown FK name ✅; legacy-id rejection ❌ misleading, `neo_batch` DAL leak ❌, `uOM` 500 ❌) |

M1-read, M3-list and M4-read improved substantially. **M3-schema regressed** and the **write path is
now measured and failing**: 0% first-call success on both write verbs, 40% self-correctable errors.
That is the bottleneck, and IMP-11/12/15 are what move it.

---

## 8. Coverage of this audit — what was NOT tested

Stated explicitly so the results are not over-read:

| Not tested | Why | How to close |
|---|---|---|
| **Holded write path** (`create_sales_order`, `create_contact`, `delete_*`) | Blocked by the session permission classifier (§3b.4) | Re-run with the permission granted. Until then the head-to-head write comparison — the deciding half of the preference verdict — is one-sided |
| **`neo_action`** | Every meaningful action on a sales order is a completion or posting step (`documentAction: CO`, `posted`), which books accounting entries. Out of scope in every mode by skill rule | A dedicated, separately-authorized run on a throwaway tenant |
| **`neo_update`** | Not needed to measure M2 on create; would have required mutating a pre-existing record | Create a record, update it, delete it — all within one authorized run |
| **`etendo-go-exp` / `etendo-go-staging`** | Only `etendo-go-local` was connected | Re-run the probe set per environment. Until then all ✅ marks here hold on **local**, not on any released environment — including Wave 3 |
| **Holded's full catalog re-scan (§4, §6 of the base report)** | This was a Job A audit of our own wave; Holded was probed once for reference | Job B full re-benchmark |
| **`neo_widget` and the 8 report generators** | Out of the base report's §11 call set | Extend the canonical probe set |

---

## 9. Recommended next actions

1. **IMP-15** — unify the FK contract across `neo_create` / `neo_batch` and make the resolver
   id-first. This is a correctness bug on the documented happy path, reachable by any agent on the
   first try. Highest priority.
2. **IMP-11** — restore the `visibility` / `userRequired` contract. Unblocks IMP-12.
3. **IMP-12** — `view:"create"` for `neo_schema`. Removes the context-budget blocker.
4. **Grant the Holded write permission** and re-run §3b against it, so the head-to-head write
   comparison stops being one-sided.
5. **IMP-13 + validator rule F11** — backfill the authoring, then fence it so it cannot decay.
6. **IMP-14** — fix the docs drift; this is what actually closes IMP-10.
7. **Fold this audit into the base report:** correct the `Delivery status` line (Wave 3's code
   shipped), recount §5 to 54, downgrade IMP-1 / IMP-4 / IMP-5 / IMP-7 / IMP-10 to ⚠️ partial,
   append IMP-11…IMP-15 to §12 and §10, promote atomicity and rich selectors from §7 to §8, and
   create §13 Scorecard from §7 above.
