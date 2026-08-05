# MCP Improvements Registry (IMP-*) — single source of truth

**Jira:** ETP-4601 (Epic ETP-3504) · **Labels:** `plataforma`, `validacion-agentica`
**Scope:** every improvement item ever raised against the **Etendo GO MCP server**
(`com.etendoerp.go/src/com/etendoerp/go/mcp/`) by the Holded-vs-Etendo-GO agentic benchmark.
**Last updated:** 2026-08-05

---

## 0. Why this file exists

Before this registry, an item's status lived in **five** places at once (the base report's §1
delivery line, its §10 bullets, its §12 headings, its `Done when:` strikethroughs, and its wave
tables) — plus a sixth in every post-audit document. They drifted: the base report still claimed
"only Wave 3 remains" after Wave 3 had shipped, and claimed a global ✅ for items that were live on
2 of 246 entities.

**From now on, status lives here and only here.**

| Document | Role |
|---|---|
| **This file** | The registry. ID, title, priority, class, repo, **status**, evidence pointer. The only place a status may be changed. |
| [`mcp-comparison-holded-vs-etendo-go.md`](mcp-comparison-holded-vs-etendo-go.md) | The **baseline benchmark**: architecture contrast, inventories, coverage matrix, and the full `BEFORE`/`AFTER` specification of IMP-1…IMP-10. Reference material, not a status surface. |
| `mcp-comparison-post-audit-<date>.md` | One **run report** per benchmark execution. Live evidence + the run's deltas against this registry. Never restates a global status. |

A run report's status section is a **delta**, in exactly these three sentence shapes:

```
* Added IMP-15 — contradictory FK contracts across write verbs (P1, ⚙️).
* Advanced IMP-4 — FK-by-name now resolves display names on neo_create; still absent on neo_batch.
* Resolved IMP-6 — actions-only view shipped (McpActionsView, commit bbfce9db).
```

Anything else — "IMP-3 is done", a re-tallied scoreboard, a wave table — belongs here, not there.

---

## 1. Status vocabulary

| Mark | Meaning | Rule |
|---|---|---|
| ✅ **resolved** | The item's own `Done when:` clause is satisfied by a live call, on the named environment | Requires the verbatim response and the implementing class. A ✅ that holds on a subset of specs is **not** ✅ |
| ⚠️ **partial** | The mechanism shipped; the outcome does not hold everywhere | Must name what is missing and which subset works |
| ⏳ **open** | Specified, not implemented | |
| ❌ **regressed** | Was ✅, no longer holds | Report to a human immediately; never downgrade quietly |
| 🗄️ **withdrawn** | No longer wanted | Keep the row; never recycle the number |

**Numbers are permanent.** `ref §7.x` ↔ IMP-n is a two-way link across three documents — add, never
renumber, never reuse.

**Class:** ⚙️ signature change (arguments or name change) · ♻️ same call (same arguments, different
response shape only). ♻️ items cost nothing to existing integrations and are preferred at equal
leverage.

---

## 2. Metrics

Tracked per benchmark run, alongside the M1–M4 agentic metrics in the run report.

| Metric | Definition | 2026-08-03 | 2026-08-05 |
|---|---|---|---|
| **M5 — open items** | count(⚠️) + count(⏳) | 3 of 10 | **10 of 15** |
| **M5a — open P1** | the same, restricted to P1 | 0 | **4** (IMP-11, IMP-12, IMP-15, IMP-1) |
| **M5b — resolved** | count(✅) | 7 | **5** |
| **M5c — added this run** | new IDs registered | — | **5** (IMP-11…IMP-15) |

> The apparent regression from 7 resolved to 5 is **not** a code regression. It is the correction of
> two over-credited statuses (IMP-1, IMP-7) and three items whose `Done when:` clause was never
> actually met (IMP-4, IMP-5, IMP-10) — see §4 and the 2026-08-05 run report. No shipped behavior
> broke.

M5 is the honest headline number: **two thirds of the registry is open.** A run that only flips
marks without moving M5 down has not improved the product.

---

## 3. Master table

Environment for all 2026-08-05 statuses: **`etendo-go-local`**, build `c597c7c2`.
`Evidence` points at the run report row that justifies the mark.

| # | Improvement | P | Class | Repo(s) | Status | Evidence | Spec |
|---|---|---|---|---|---|---|---|
| **IMP-1** | Clean field names + per-field prose in `neo_schema` | P1 | ♻️ | `com.etendoerp.go` (+ `schema_forge_core`) | ⚠️ partial | A10 · 43/157 labels still raw AD columns, 54 without `description` | base §12 |
| **IMP-2** | Field projection + `view:"summary"` on `neo_list`/`neo_get` | P1 | ⚙️ additive | `com.etendoerp.go` | ✅ resolved | A6, A7 · `McpFieldProjection` | base §12 |
| **IMP-3** | Business query semantics on `neo_list` (named filters + range ops) | P1 | ⚙️ additive | `com.etendoerp.go` + `schema_forge` + core | ✅ resolved | A5, A6 · mechanism verified; authoring coverage tracked as IMP-13 | base §12 |
| **IMP-4** | Human-friendly FK resolution on write verbs | P2 | ⚙️ | `com.etendoerp.go` | ⚠️ partial | W3, W8 · works on `neo_create` for display names; rejects legacy numeric ids; absent from `neo_batch` | base §12 |
| **IMP-5** | Explicit not-found + structured validation errors | P1 | ♻️ | `com.etendoerp.go` | ⚠️ partial | A5, A8, W4 · excellent on single-record verbs; `neo_batch` leaks raw DAL `status:-4` | base §12 |
| **IMP-6** | Actions-only discovery view (`view:"actions"`) | P2 | ⚙️ additive | `com.etendoerp.go` | ✅ resolved | A12 · `McpActionsView`, commit `bbfce9db` | base §12 |
| **IMP-7** | Lean / grouped `neo_defaults` | P2 | ⚙️ additive | `com.etendoerp.go` | ⚠️ partial | A4 · `view:"minimal"` still returns 7 compliance keys; `partnerAddress:""` reported as resolved | base §12 |
| **IMP-8** | `neo_selectors` argument alias + self-correcting error | P2 | ⚙️ additive | `com.etendoerp.go` | ✅ resolved | A8 · `field` alias, `McpToolRouter` | base §12 |
| **IMP-9** | Expose `primaryEntity` in `neo_discover` | P2 | ⚙️ additive | `com.etendoerp.go` | ✅ resolved | A1 · commit `bbfce9db` | base §12 |
| **IMP-10** | Make `docs` first-class + fix tool-name drift | P1 | ♻️ | `com.etendoerp.go` + `etendo-go-docs` | ⚠️ partial | A9 · server side done; every corpus snippet still says `etendo_neo_*` | base §12 |
| **IMP-11** | Close the `visibility` / `userRequired` contract | P1 | ⚙️ | `schema_forge_core` + `com.etendoerp.go` | ⏳ open | A10, A13 · 0/6,340 fields carry `visibility` | audit §5 |
| **IMP-12** | Projection for `neo_schema` (`view:"create"`, `fields:[…]`) | P1 | ♻️ | `com.etendoerp.go` | ⏳ open | A10 · 61,963 chars / 157 fields exceeds the agent's budget | audit §5 |
| **IMP-13** | Backfill `businessCritical` + `namedFilters` authoring (+ validator rule F11) | P2 | ♻️ | `schema_forge` | ⏳ open | 3/246 and 2/246 entities authored | audit §5 |
| **IMP-14** | Realign `etendo-go-docs` with the real tool names | P2 | ♻️ | `etendo-go-docs` | ⏳ open | A9 · closing this also closes IMP-10 | audit §5 |
| **IMP-15** | Unify the FK contract across write verbs | P1 | ⚙️ | `com.etendoerp.go` | ⏳ open | W3, W8 · see **Appendix A** | audit §5 |

**Unnumbered candidates** (raised, not yet specified — promote to an IMP before implementing):
PDF/print + attachment tools · find-by-document-number lookups · per-verb permission/role in the
schema · cursor pagination alongside offset · `overdue` named filter (needs a payment-schedule
subquery).

---

## 4. Changelog

One entry per benchmark run. Append; never rewrite a past entry.

### 2026-08-05 — post-audit run (`etendo-go-local`, build `c597c7c2`)

First run with **authorized write probes** enabled, which is what surfaced IMP-15.

* **Added IMP-11** — `neo_schema` promises `visibility` / `userRequired` in its own `hint` and never
  emits them. P1, ⚙️, cross-repo.
* **Added IMP-12** — no create-shaped projection for `neo_schema`; the full response is unconsumable.
  P1, ♻️.
* **Added IMP-13** — the metadata driving Waves 1–2 is authored on ~1% of the surface. P2, ♻️.
* **Added IMP-14** — `etendo-go-docs` still ships the pre-rename tool names. P2, ♻️.
* **Added IMP-15** — `neo_create` and `neo_batch` accept mutually exclusive FK formats. P1, ⚙️.
* **Advanced IMP-4** — display-name resolution confirmed live on `neo_create`; two gaps found
  (legacy numeric ids rejected; `neo_batch` not wired). Downgraded ✅ → ⚠️.
* **Advanced IMP-5** — `neo_create`'s `missingFields` error confirmed strictly better than Holded's;
  `neo_batch` bypasses the envelope entirely. Downgraded ✅ → ⚠️.
* **Advanced IMP-10** — server-side pointers confirmed; corpus drift unfixed. Downgraded ✅ → ⚠️.
* **Advanced IMP-1** — curated labels confirmed on the fields that have them; 43/157 still raw.
  Downgraded ✅ → ⚠️.
* **Advanced IMP-7** — `view:"minimal"` confirmed; 7 compliance keys still leak. Downgraded ✅ → ⚠️.
* **Resolved IMP-6** — `view:"actions"` shipped (`McpActionsView`, `bbfce9db`).
* **Resolved IMP-9** — `primaryEntity` shipped in `neo_discover` (`bbfce9db`).
* **Registry created.** Status moved out of the base report's five surfaces into this file.

Run report: [`mcp-comparison-post-audit-2026-08-05.md`](mcp-comparison-post-audit-2026-08-05.md)

### 2026-08-03 — Wave 2 close (`etendo-go-local`)

* **Resolved IMP-2, IMP-3, IMP-7** (Wave 2, commit `c5b51c1f`).

### 2026-07-21 — baseline benchmark

* **Added IMP-1…IMP-10.** Report: `mcp-comparison-holded-vs-etendo-go.md`.

---

## Appendix A — IMP-15 explained

This is the least intuitive item in the registry, so it gets a full walk-through. It is also the
only one that a **read-only** benchmark can never find: the contradiction only exists on the write
path.

### A.1 What a foreign key looks like to an agent

Every Etendo document references other records: an invoice references a currency, a business
partner, a price list, a warehouse. In the MCP body those come through as plain strings:

```jsonc
neo_create({ spec:"sales-order", entity:"header", fields:{
  businessPartner: "…",
  currency:        "…",      // ← a foreign key
  priceList:       "…"
}})
```

The agent has two possible things to put in that slot:

1. **the record id** — what Etendo actually stores. For legacy master data these are short numeric
   strings: `"102"` for EUR, `"19"`, `"130"`. For anything created in the last decade they are
   32-char uppercase hex: `"FFA767684E234FCFB8A1CA24459B934B"`.
2. **the display name** — `"EUR"`, `"IVA 21%"`. **IMP-4** was built so this works too, saving the
   agent a `neo_selectors` round-trip per FK.

Both should be accepted. That was the whole point of IMP-4.

### A.2 What actually happens

Two verbs create records. `neo_create` writes one record; `neo_batch` writes a header and its lines
in one transaction. They disagree — and they disagree in **opposite directions**:

| Value passed for `currency` | `neo_create` | `neo_batch` |
|---|---|---|
| `"EUR"` — the display name | ✅ resolves | ❌ `400`, raw DAL error |
| `"102"` — the exact record id | ❌ `422 not_found` | ✅ resolves |

So there is **no single body** an agent can write that works on both verbs. Discovering the format
for one teaches it the wrong thing about the other.

### A.3 Why `"102"` fails on `neo_create` — the actual bug

`McpFkResolver` (the IMP-4 implementation) resolves **name-first**: it takes the string, looks it up
as a display name, and fails if there is no match. A 32-char hex string is recognized as an id, so
it short-circuits correctly. A **short numeric** string is not — it goes down the name path, finds
no currency literally named `"102"`, and returns:

```json
{"status":422,"error":"not_found",
 "detail":"No match for 'currency'='102'. Use neo_selectors to search, or pass the exact record id instead.",
 "field":"currency"}
```

Read that `detail` carefully. It advises the agent to *"pass the exact record id instead"* — and
`"102"` **is** the exact record id. It is the value `neo_defaults` returned one call earlier, and it
is the value the created record ends up storing. The error tells the agent to do precisely what it
just did.

The reason this matters more than an edge case: **all Etendo `_ID` columns are `VARCHAR`**, and the
legacy master data every document touches — currency, UOM, document type, tax rate — still carries
numeric ids. So this breaks the documented happy path:

```
neo_defaults  →  returns currency: "102"
neo_create    →  reject "102"
```

An agent following the documentation, on the first try, hits it. That is why it is P1 rather than a
polish item.

**The fix is one ordering change:** resolve **id-first**. Try the value as a record id; only if no
record has that id, try it as a name. Nothing is lost — a display name that happens to look like an
id would resolve to the record it identifies, which is what the agent meant anyway.

### A.4 Why `"EUR"` fails on `neo_batch`

Different cause, same family. `neo_batch` was never routed through `McpFkResolver` at all — IMP-4
was wired into `neo_create` only. So `neo_batch` passes the string straight to Etendo's DAL import
layer, which knows only ids, and the failure surfaces as DAL internals:

```json
{"committed":false,"failedAt":{"index":0,"id":"h1"},
 "error":{"status":400,"message":"Operation 'h1' rejected by server",
 "detail":{"response":{"status":-4,
   "errors":{"id":"New object Currency(null)  (key: EUR_Currency) refered to but not present in the import set"}}}}}
```

There is no `error` code, no `field`, no `hint`, no `seeAlso` — none of the IMP-5 envelope. `status:
-4` is an internal DAL constant. An agent cannot self-correct from this, which is the exact failure
class IMP-5 exists to eliminate: **IMP-5 stops at the single-record verbs.**

### A.5 What the contradiction cost, measured

Creating **one** draft sales order:

| Path | Calls | Failed writes | First-call success |
|---|---|---|---|
| `neo_create` (header, then line) | 6 | 2 | 0% |
| `neo_batch` (header + line, atomic) | 4 attempts | 3 | 0% |

Both created records were deleted afterwards; nothing was booked or posted (run report §3b.5).

### A.6 The three fixes IMP-15 asks for

1. **Make `McpFkResolver` id-first**, so legacy numeric ids resolve. Fixes the `neo_defaults →
   neo_create` path.
2. **Route `neo_batch` bodies through `McpFkResolver`**, so both verbs accept the same formats.
3. **Give `neo_batch` failures the IMP-5 envelope**, so no raw `status: -4` can reach an agent — and
   fix the `"pass the exact record id instead"` text so it cannot be emitted to a request that did.

**Secondary, found in the same probe:** `sales-order/lines` requires `uOM`, but `neo_schema` does not
mark it required and omitting it returns a bare `500 "Unit of Measure mismatch
(product/transaction)"`. The value is only recoverable from `_aux._UOM` inside the product selector
response — an undocumented, private-looking key. It should either be auto-derived from the product
or reported as a `422` `missingFields` entry.

### A.7 `Done when:`

The identical `fields` body succeeds on both `neo_create` and `neo_batch`; a regression test asserts
resolution for a legacy numeric id, a UUID and a display name **on each verb**; no `neo_batch` error
path can return a raw DAL `status: -4` payload; and `uOM` on `sales-order/lines` never produces a
`500`.
