# MCP usage telemetry — batch 1 findings and fixes (ETP-5405)

First review of `ETGO_MCP_USAGE`, exported on 18/09/2026 with
`make mcp-usage HOST=<host> MARK_REVIEWED=1`. All 914 rows in this batch are now
marked `isactive = 'N'` on both instances, so a second export returns only new traffic.

| | experimental | production |
|---|---|---|
| Rows | 253 | 661 |
| Window | 16–17/09 | 15–18/09 |
| Sessions | 37 | 8 |
| tool_call / feedback | 252 / 1 | 654 / 7 |
| Errors | 21 (8.3 %) | 39 (6.0 %) |

The two environments measure different things. Experimental is **exploration**: 37 short
sessions, mostly reads (`neo_list` 104, `neo_schema` 39, `neo_discover` 37), across nine
distinct MCP clients. Production is **two long write sessions and little else** — 94 % of
its rows belong to `7b522816` (409 rows, a bulk contact load, 0 errors) and `57b82d0d`
(209 rows, an agentic validation run on bank reconciliation, **36 of the 39 errors**).

Every fix below is one of three kinds:

- **CODE** — the server behaves wrongly; the agent did everything right.
- **METADATA** — the server behaves as designed, but what it advertises (tool description,
  action contract, error message) does not let the agent get it right on the first try.
- **DOCS** — the information exists nowhere the agent can reach it.

Most of the cost in this batch is **METADATA**, not CODE. Ten of production's eighteen
`validation_error` rows are an agent discovering a required parameter by trial and error.

**Scope note.** C1–C6 and M1–M7 come from this telemetry batch. C7–C8 and M8–M11 come from
verifying **ETP-5284** against experimental and local on 18/09 — the ticket was reported on
11/09, is still *Defined* with no branch or PR, and is **not fixed**. It is included here
because it is the same class of problem the telemetry keeps surfacing: the MCP promising an
agent something the server does not do.

> **Read this batch as retrospective.** The rows were written 15–18/09 and some were already fixed
> before this review was written — M4, M5 and M6 turned out to be live on the current build when
> probed. Verify each remaining item against a running instance before scheduling work on it; the
> telemetry says what happened, not what is still true.

---

## CODE

### C1 — `neo_action` does not forward the record ID to Classic processes

**Not verified 18/09.** The blind run that exercised the action path completed a sales order with
`documentAction`, which is a document action rather than a Classic process, so the condition this
item describes was never reached. M2's run did hit a Classic process and failed earlier, at
`"Process class is not a supported handler type"` — so on this build a Classic process may not be
reachable far enough to observe C1 at all. Settle M2 first.

**Evidence.** 5 `neo_action` rows on `financial-account/importedBankStatements`
(`57b82d0d`, 16/09 13:05 → 13:40), `outcome = error`, `error_code` NULL, 106–315 ms.
`fields_touched` shows the ID was sent three different ways:
`FIN_BankStatement_ID, docAction, inpRecordId, inpTabId, recordId`.
Feedback (16/09 13:06:56) reports the server answer verbatim:

> `id to load is required for loading` — even when the correct record ID is passed. The
> record exists and is in DRAFT state.

**Fix.** Make the Classic process route (`aPRMProcessBankStatement` and every
`org.openbravo.erpCommon.ad_actionbutton` sibling) receive the record ID from the MCP
layer. The agent already sends it under three keys; the handler reads none of them.

**Why it matters.** The whole bank-statement processing flow is unreachable from an agent.
The user was sent to the UI.

### C2 — `_buttonValue` is never injected for OBUIAPP processes

**Not verified 18/09.** No OBUIAPP process was exercised by the blind runs; still open.

**Evidence.** `neo_action` on `financial-account/account` (`57b82d0d`, 16/09 15:17 →
17/09 13:19), `error_code` NULL. One of the rows carries `_buttonValue` in
`fields_touched` — the agent passed it explicitly and still failed. Feedback (16/09
15:18:41) gives the server answer: `JSONObject["_buttonValue"] not found.`, for both
`aPRMMatchTransactions` and `aPRMMatchTransactionsForce`.

**Fix.** Inject `_buttonValue` in the MCP action bridge for OBUIAPP process definitions.
Passing it in `parameters` must also work, or be rejected with a message that says so.

**Why it matters.** Automatch — the core of reconciliation — cannot be triggered by an
agent at all.

### C3 — Tab-less entities are advertised as listable and 500 on every generic call — **FIXED 18/09**

**Reproduced on local 18/09**, and it is much larger than the telemetry showed. The batch caught
8 rows because those are the entities agents happened to try; the real surface is **16 entities**.

```
neo_schema(not-posted-documents, header) → 500 server_error "No AD_Tab linked to entity: header"
neo_list  (not-posted-documents, header) → 500 server_error "No AD_Tab linked to entity: header"
neo_list  (contacts, bp-stats)           → 500 server_error "No AD_Tab linked to entity: bp-stats"
```

**Cause.** The router resolves the entity's `AD_Tab` before dispatching, so an entity with
`ETGO_SF_ENTITY.ad_tab_id IS NULL` fails before its handler ever runs. Every one of these entities
*has* a handler — they are served by dedicated code (widgets, reports, aggregates), not by a tab:

| Spec | Entities with no tab | Handler |
|---|---|---|
| `dashboard` | activity, best-products, best-sellers, kpis, pending-amounts, pending-tasks, recent-invoices, top-clients, trends | `widget*Handler` |
| `contacts` | bp-stats, bp-trend | `contactsBpStats/BpTrendHandler` |
| `not-posted-documents` | header | `not-posted-documents` |
| `aging-receivable`, `tax-report`, `inventory-stock-report` | (the spec's own entity) | report handlers |
| `warehouse` | location | `warehouseLocationHandler` |

All 16 are `isactive='Y'` and `isincluded='Y'`, so they are advertised.

**The M5 fix makes this worse, not better.** Now that `not_found` lists the spec's entities, the
error walks the agent straight into the crash:

```json
neo_list(not-posted-documents, "xxx")
{"status":404,"error":"not_found","available":["header"],"hint":"Retry with one of the names in 'available'."}
```

The only name offered is the one guaranteed to return a 500.

**Blind verification (18/09).** A context-free agent was given a plain user request — *"mostrame
los documentos que estan sin contabilizar"* — with no mention of this defect and no hint about
which spec to use. It:

1. called `neo_discover` and found `not-posted-documents` listed there, one entity `header`,
   `primaryEntity: header` — so the spec is advertised at the catalog level, not merely in a
   `not_found` response;
2. called `neo_list(not-posted-documents, header)` → 500;
3. called `neo_schema(...)` → same 500;
4. **abandoned the spec entirely** and spent eight more calls rebuilding the answer by hand —
   searching `docs` (nothing relevant), discovering the `posted` column from `sales-invoice`'s
   schema, then querying sales-invoice / purchase-invoice / sales-order / payment-in one at a time.

Eleven calls, question unanswered.

Note what made it give up: the error's own hint, *"re-sending the same call with corrected values
will not help"*. The hint is accurate and well meant, but it reads as "this capability does not
work", so the agent writes the feature off rather than re-routing. An error that is both terminal
and uninformative about alternatives costs more than a vague one.

The agent's own summary: *"el spec está obviamente diseñado para esta pregunta exacta y habría
sido una sola llamada; la alternativa obliga a conocer de antemano todos los specs de documentos y
repetir la consulta N veces en vez de una vista consolidada."*

(The local tenant holds no transactional documents, so its fallback queries all returned 0 rows —
the workaround path itself could not be validated here. The 500 and the abandonment were.)

**It works over REST — this is the C7 asymmetry again.** Same instance, same spec, same entity:

```
REST   GET /sws/neo/not-posted-documents/header       → 200 OK   (the SPA screen renders)
MCP    neo_list(not-posted-documents, header)          → 500 "No AD_Tab linked to entity: header"
```

The REST dispatcher reaches the handler; the MCP path resolves the entity's `AD_Tab` first and dies
before the handler is ever consulted.

**What this spec actually is.** Not a window: a classic **OBUIAPP process**
(`D6AB95CE52D34E1599590526115E26C6`, the "Not Posted Documents" menu entry). In the SPA it is a
custom screen (`tools/app-shell/src/windows/custom/not-posted-documents/index.jsx`,
`layoutType: "custom"`), and `menu.json` marks it with `obuiappProcessId` where every sibling
carries `windowId`. `NotPostedDocumentsHandler` serves the grid by delegating to
`NoPostedDocumentDS` (`com.etendoerp.bulk.posting`) and exposes `post` / `bulk-post` actions.

Its `ETGO_SF_SPEC` row nevertheless says `spec_type = 'W'` with `ad_window_id = NULL` — a
process-backed spec declared as a window. The MCP generic path takes `W` at face value, assumes an
AD window and therefore a tab, and fails the precondition.

**The MCP read path has no hook dispatch at all.** Not an ordering problem — `handleList`
(`McpToolRouter.java:414`) and `handleGet` (`:499`) never call `resolveEntityHandler`. Both open
with `getAdTabOrThrow(sfEntity, entityName)` and then build everything on the tab: the DAL entity
name (`adTab.getTable().getName()`), the tab's HQL where clause, the query params. Skipping the
throw would not help; there is nothing behind it for a handler to feed.

| MCP operation | Dispatches to the entity handler |
|---|---|
| `create` (`:789`), `update` (`:911`), `delete` (`:989`) | yes |
| `defaults` (`:1129`), `action` (`:1586`) | yes |
| **`list` (`:414`), `get` (`:499`)** | **no** |

Writes and actions run hooks; reads do not. Over REST, reads do — which is the whole difference
between the SPA screen rendering and the agent getting a 500.

This is the read-side gap already recorded as an open item in the ETP-5368 worklog, including the
correction noted there: it is an independent MCP/REST hook asymmetry, not a symptom of the address
wrapper concept. Found again here from the opposite direction.

**FIXED 18/09** — clauses 1 and 2 below, in the narrow form. Four files in `com.etendoerp.go/mcp`,
REST untouched.

* `McpToolRouter.handleList`/`handleGet` consult the entity's handler before the AD tab is
  demanded, the way `NeoCrudHandler.dispatchCrudRequestInternal` does. **Deliberately narrower than
  REST: only when the entity has no tab.** The 171 entities that have one keep the exact path they
  have today, so nothing that currently answers can change shape.
* `McpHookExecutor.buildReadHookContext` builds what REST hands a handler on a GET —
  `endpointType=CRUD`, `httpMethod=GET`, no body, the arguments flattened into `queryParams` under
  the names the handler already reads from the SPA.
* `McpRoutingException.entityHasNoTab` replaces the bare `IllegalArgumentException`: **405** naming
  the tools that do work when a handler is registered, **422** when none is. This also covers
  `neo_schema`, `neo_defaults` and the write paths, which still cannot serve these entities but no
  longer claim a server fault.

**Blind verification (18/09).** Same request as the failing run, same conditions, a context-free
agent told nothing about the defect.

| | before | after |
|---|---|---|
| calls | 11 | **2** |
| question answered | no | yes |
| spec abandoned | yes | no |

```
1. neo_schema(not-posted-documents, header)
   → 405 "is served by a dedicated handler, not by a window"
     hint: "Read it with neo_list or neo_get, which route through the handler"
2. neo_list(not-posted-documents, header)   → 200 {rows: [], total: 0}
```

The agent still opened with `neo_schema` — the reflex before touching any entity — and still hit an
error. What changed is where the error left it: *"el propio mensaje de error me indicó la ruta
correcta, así que cambié de estrategia y fui directo a `neo_list`"*. The same agent, given the 500,
wrote the capability off. Given a 405 that names the alternative, it self-corrected in one call.
That is the whole value of clause 2, independent of clause 1.

`total: 0` is the correct answer, not an empty shape: every unposted document on this instance
(1493 invoices in `p`, 433 shipments in `E`, …) belongs to client *F&B International Group*, and the
MCP session runs under *vale MCP*, which holds 0 invoices, 0 shipments and 0 payments. So the
handler ran **and** honoured client isolation. What this run does not prove is the rendering of real
rows — the SPA exercises that over the same handler.

**Still open: the 80 tab-backed entities.** Reads now dispatch a handler only when there is no tab,
so an entity that has both a tab and a handler still runs no hook on `neo_list`/`neo_get` — while
REST runs both. 43 handler classes implement `afterHandle`, and `BusinessPartnerHandler`'s own
javadoc documents one of the consequences: on a GET it fills `etgoEmail` from a contact when the
partner's own email is blank, which happens over REST and not over MCP. No error, no warning, just a
field that is empty for the agent and populated for the screen. Closing that means running both
hooks on every read, which is a behaviour change across most of the API and needs tests and a
staged rollout — it belongs to the API alignment plan, not to this batch. The 16 that 500 were
visible; these 80 are not, and there are five times as many.

**Proposed fix.**

1. **Give the MCP read path the hook dispatch the write path already has**, so a handler-backed
   entity can serve `neo_list`/`neo_get` the way it already serves REST. This is the real fix and it
   covers all 16 tab-less entities at once; their configuration needs no change.
2. **Make the tab lookup conditional on there being no handler.** An entity with neither is
   genuinely unserviceable — that one deserves an error, and a 4xx naming the tool that does serve
   it, never a 500.
3. Not a blocker: `spec_type = 'W'` with a null `ad_window_id` is a contradiction worth validating
   at push time, so the generic path stops inferring a tab from the spec type.

Earlier drafts of this item proposed wiring a tab, hiding these entities from `available`, or
merely reordering the tab lookup. All three were wrong: the entities are correctly configured and
serve fine over REST, and the read path has no handler dispatch to reorder.

### C4 — Setting `gLItem` on a bank statement line does not reconcile

**Evidence.** Feedback 16/09 17:04:48. Setting `financialAccountTransaction` on a line
drives `eTGOPendingAmount` to 0 and sets `matchingtype`. Setting `gLItem` leaves both
untouched, and the update reports success. No `neo_action` exists on `bankStatementLines`
to close the cycle afterwards.

**Fix.** Either make the two reconciliation paths behave alike, or expose an action on
`bankStatementLines` / `importedBankStatements` that performs the matching step after an
assignment. Silently succeeding while doing nothing is the worst of the three options.

### C5 — `neo_feedback` rejected one submission with `validation_error` — **NOT REPRODUCED**

**NOT REPRODUCED — 18/09.** A context-free agent sent a full report (`outcome`, `summary`,
`achieved`, `plannedApproach`, `howKnown`, four `wastedCalls`, two `frictions`, three `suggestions`)
and it was accepted: `{"status":"ok","recorded":true}`. The original row may have been a
malformed submission rather than a defect in the tool. Close unless it recurs.

**Evidence.** Production, 16/09 13:06:42, `row_type = feedback`, `outcome = error`,
`error_code = validation_error`, `payload` NULL. The same agent resubmitted 14 seconds
later and succeeded. One feedback out of eight was lost.

**Fix.** Find which validation rejected it. A feedback payload should never be dropped for
a shape problem — if a field is malformed, store the rest and warn.

### C6 — 23 production rows have NULL `session_key` and NULL `client_name`

**Evidence.** 23 rows across 16–18/09, mostly `neo_schema` (14), plus `neo_widget` (3),
`neo_discover` (2), `docs` (2), `generate_aging_receivable` (1), `neo_selectors` (1).

**Fix.** Find the entry path that does not propagate client identity into
`McpUsageLogger`. Until then, any per-session analysis of production silently omits these.

### C7 — `neo_create` does not persist the default currency the REST path does (ETP-5284) — **FIXED 18/09**

**Ticket.** ETP-5284 — *"neo_create no asigna moneda por defecto al crear Contacto"*, reported
11/09, status *Defined*, no PRs or branches attached. **Retested 18/09: not fixed**, on
experimental and on local (a newer MCP build).

**Evidence.** Five contacts created on the same local instance, same client, same organisation:

```
value   | name                            | organisation | BP_Currency_ID
1000000 | ETP-5284 local test 18-09       | vale MCP     | NULL   ← neo_create
1000001 | Prueba                          | vale MCP     | 102    ← Etendo Go UI
1000002 | ETP5284 UI net                  | vale MCP     | 102    ← Etendo Go UI
1000003 | ETP5284 MCP con org             | vale MCP     | NULL   ← neo_create + explicit organization
1000004 | ETP5284 MCP currency explicita  | vale MCP     | 102    ← neo_create + explicit currency
```

The UI's create request does **not** send the currency:

```json
POST /sws/neo/contacts/businessPartner
{"invoiceTerms":"I","etgoIsperson":false,…,"organization":"E2EF7553…","client":"299CC061…","name":"ETP5284 UI net"}
```

So the server resolves it on the REST path. Record `1000004` shows the MCP write path stores the
field correctly when it is sent, so nothing is being dropped or mis-translated on write.

**What is ruled out.** The obvious explanations do not survive checking:

| Hypothesis | Verdict |
|---|---|
| The MCP write path drops or renames the field | **No** — explicit `currency` persists (`1000004`) |
| The record is created under a different organisation | **No** — all five rows carry `vale MCP` |
| The pre-hook does not run on the MCP path | **No** — `McpToolRouter.java:790` builds the context with `POST` and calls the same handler as REST |
| The entity has no handler wired for MCP | **No** — `ETGO_SF_ENTITY.java_qualifier = businessPartnerHandler`, matching `@Named("businessPartnerHandler")`, `ispost = Y` |
| The MCP session runs under org `*` | **No** — `McpSessionManager.resolveDefaultOrg` resolves the role's first transactional org; role `vale MCP Admin` has exactly one, which is the record's own org |
| The organisation has no currency configured | **No** — `vale MCP` → accounting schema `Esquema vale MCP` → currency `102` (EUR) |
| Passing the organisation explicitly helps | **No** — `1000003` sent it and is still NULL; the hook reads `OBContext`, never the body |

**Where the code is.** `BusinessPartnerHandler.java:622-644`, called from `handle()` at line 414
inside the `if ("POST".equals(method))` block:

```java
OBContext obContext = ctx.getObContext();                                     // 626
if (obContext == null || obContext.getCurrentOrganization() == null) return;  // 627
String orgId = obContext.getCurrentOrganization().getId();                    // 633
String currencyId = OBCurrencyUtils.getOrgCurrency(orgId);                    // 634
if (StringUtils.isNotBlank(currencyId)) body.put(FIELD_CURRENCY, currencyId); // 636
```

`McpHookExecutor.java:75` fills that context with `OBContext.getOBContext()`.

**Root cause — established.** The two paths hand the handler a body in **different field-naming
conventions**, and the MCP write path silently discards whatever does not match its own:

```
neo_create fields:{"currency":"102"}       → BP_Currency_ID = 102    (MCP name, accepted)
neo_create fields:{"bPCurrencyID":"102"}   → BP_Currency_ID = NULL   (REST name, discarded)
```

`FIELD_CURRENCY` is `"bPCurrencyID"` (line 134) — the REST body convention the handler was written
against. On the MCP path the body arrives under the MCP field name `currency`, so the guard at 623
never sees a value, the injection at 637 writes a key the write layer does not recognise, and the
field is dropped before `jsonService.add`. It is not reported in `unknownFields` either, so nothing
anywhere says a value was lost.

That the `POST` block itself runs on MCP is proven separately: `stripPreCreateBillingDefaults`
(line 404, ten lines earlier) does take effect — `priceList` and `paymentTerms` sent explicitly
through `neo_create` both come back NULL. Those two names happen to be identical in both
conventions, which is exactly why that half of the handler works and this half does not.

**This is a class, not a bug.** There are 132 `body.put(...)` call sites across 25 handler files in
`schemaforge/`. Every one that writes a field whose DAL/MCP name differs from its REST name is
silently inoperative over MCP, with no error and no log. `injectOrgCurrency` is simply the one that
got reported. This is the MCP/REST hook asymmetry already flagged as an open item in the ETP-5368
worklog.

**Fix applied (18/09) — workaround, scoped to this field.** `NeoContext` gained an additive
`mcpOrigin` flag (default `false`, so the REST dispatcher is untouched); `McpHookExecutor` sets it
on its three context builders; `injectOrgCurrency` now writes under the caller's own spelling:

```java
String currencyKey = ctx.isMcpOrigin() ? FIELD_CURRENCY_MCP : FIELD_CURRENCY;
```

No public name changed on either surface — renaming `currency` would break every agent, renaming
`bPCurrencyID` would break the SPA.

**Verified after deploy**, both paths, same instance:

```
mcpOrigin=true   key=currency      → injected — currency=102      → 1000007  BP_Currency_ID = 102
mcpOrigin=false  key=bPCurrencyID  → injected — bPCurrencyID=102  → 1000008  BP_Currency_ID = 102
```

The trace also settles the earlier doubt: `orgId` and `getOrgCurrency` were correct on the MCP path
all along (`orgId=E2EF7553… orgName=vale MCP currencyId=102`), and the pre-injection `bodyKeys` on
that path contains no `bPCurrencyID` — direct evidence of the convention split.

**Status.** Fixed, deployed and verified. The temporary `ETP-5284` trace that pinned the cause down
has been removed; the comments left in the code explain why two constants exist for one column and
say to collapse them once the conventions are reconciled. Re-verified on the clean build: record
`1000010`, created through `neo_create`, carries `BP_Currency_ID = 102`, with no trace lines left in
the log. ETP-5284 is *En curso* and carries a comment pointing at ETP-5405.

Not covered by tests. A regression test that creates through both paths and asserts the column is
populated is worth having — without one, the next refactor of either naming convention reopens this
silently.

**Still open — the real fix.** The workaround closes ETP-5284 and nothing else. The other 131
`body.put` call sites remain exposed, and a handler author still has to know which convention the
caller speaks. What `mcpOrigin` buys is that the two paths can now be told apart at all, which is
the same primitive a proper reconciliation needs. Two things belong in that work: one naming
convention at the hook boundary (translate in and out, leaving both public surfaces untouched), and
the write layer logging a hook-injected key it cannot map instead of discarding it in silence —
that silence is what made this cost a full session.

**Why it matters.** The hook's own javadoc says it: *"A new Business Partner (contact) with no
currency breaks purchase invoice confirmation later on (`ProcessInvoiceUtil` validates
`businessPartner.getCurrency() == null` with no fallback)."* Every contact an agent creates is a
future failed invoice.

**Related.** The handler's constant is `FIELD_CURRENCY = "bPCurrencyID"` while the MCP schema calls
the same column `currency`, and `neo_get` rejects `currency` as an unknown field — see M10. That
naming split is worth keeping in view while instrumenting: it is the one difference between the two
paths that a reader would not expect.

### C8 — Mandatory-field validation runs before the pre-hook that fills the field

**Evidence.** `neo_create` on `contacts/businessPartner` without `searchKey`:

```json
{"status":422,"error":"validation_error","detail":"Missing required fields that could not be auto-resolved",
 "missingFields":[{"name":"searchKey","column":"Value","label":"Search Key"}]}
```

The Etendo Go UI never sends `searchKey` — its "Identificador" field is rendered disabled with a
sequence placeholder — and the record is created fine. The value is generated by sequence, and
whatever an agent sends is discarded: `searchKey: "ETP5284-RETEST"` was persisted as `1000228`.

**Root cause.** In `McpToolRouter.java`, `validateMandatoryFields` runs at line **772** and the
entity pre-hook at line **790**. `BusinessPartnerHandler.handle()` fills the field itself at
line 407 (`body.put(FIELD_SEARCH_KEY, StringUtils.substring(name, 0, SEARCH_KEY_MAX_LENGTH))`),
but the request has already been rejected eighteen lines earlier.

**Fix.** Run mandatory-field validation after the pre-hook, so a field a handler supplies is not
demanded from the caller. Pair it with M9 below.

---

### C9 — `neo_action` reports success on a record that does not exist — **NEW 18/09**

Found by a context-free agent probing the unreconciliation route with a placeholder id:

```
neo_action(payment-in, finPayment, id:"0", action:"EM_Etpr_Reactivate_Payment")
→ processResult: "success"
  "Proceso completado satisfactoriamente List of payments reactivated or removed"
```

There is no record with id `0`. Nothing was reactivated. The response is indistinguishable from one
that did the work, so the agent has no way to tell "executed against a real record" from "executed
against nothing". Its own words: *"no hay forma de distinguir, desde la respuesta, 'se ejecutó sobre
un registro real' de 'se ejecutó sobre un id inventado y no hizo nada'."*

This is the failure mode the codebase already treats as the worst one — `handleList`'s IMP-40 comment
calls it *"a confident, wrong answer that reads exactly like a correct one. Worse than a refusal,
because the caller then acts on rows belonging to records it never asked about."* The same reasoning
applies here with more force: a write action that silently no-ops will be reported to a user as done.

Two behaviours are inconsistent and both need fixing: resolve the record before invoking and 404
when it does not exist, and do not report `success` for a process that acted on an empty set. Note
`EM_APRM_ImportBankFile` on the same fake id validated its parameters first and never complained
about the id either — the gap is in the shared action path, not in one handler.

**Verify against real data before closing.** The instance where this was found has no payments at
all, so "acted on nothing" and "record not found" could not be told apart from the outside.

### C10 — A validation error does not say which field it is about — **NEW 18/09**

Creating a customer with an invalid Spanish tax ID:

```json
{"detail": "The tax ID check digit does not match. Review the number.",
 "error": "validation_error", "status": 400}
```

Correct, readable, and with no `field` key — the agent inferred `taxID` from the prose. Every other
refusal in this API names the field it is about (`unknownFilterField`, `readOnlyField`,
`fieldNotAllowed`, the `missingFields` array), so this one is the outlier. An agent that has to parse
English prose to know which of its inputs to correct will eventually parse it wrong.

### C11 — A rejected foreign key is reported against a field the caller never sent — **NEW 18/09**

A context-free agent building a sales order passed the id of a `Location` where `partnerAddress`
expects a `BusinessPartnerLocation`:

```json
{"status": 422, "error": "validation_error",
 "detail": "One or more values were rejected by field validation",
 "fieldErrors": {"id": "New object BusinessPartnerLocation(null) (name: .) (key: FD019BC7…_BusinessPartnerLocation) refered to but not present in the import set"},
 "hint": "None of these fields were in your request: id — the server filled them in from an AD default, and that default value itself failed validation…"}
```

Three things are wrong at once. The error is attributed to `id`, a field the caller never sent; the
offending field, `partnerAddress`, is not named anywhere; and the hint supplies a causal story — the
server filled it from an AD default — that did not happen. A raw core DAL import-set message is
being surfaced verbatim and then wrapped in a generic explanation that misfires on it.

The agent recovered only by inference, and the surrounding confusion made that harder: the spec
named `bp-location` serves rows whose `_entityName` is `Location`, so the ids most readily to hand
are exactly the ones this field must not receive. `neo_schema` on `partnerAddress` says
`"type": "foreignKey", "column": "C_BPartner_Location_ID"` and nothing about which entity supplies a
valid value.

Two fixes, independent of each other. Attribute the failure to the field that carried the rejected
value and suppress the AD-default hint when the named field was not server-filled. And have a
`foreignKey` field publish the entity its values come from, so the pairing is knowable before the
call rather than after the refusal.

### C12 — An empty `neo_selectors` result does not say why it is empty — **NEW 18/09**

`neo_selectors(sales-order, header, partnerAddress, recordContext:{businessPartner:…})` returned zero
for every business partner a context-free agent tried. The answer was correct — the tenant holds nine
raw `Location` rows and not one `BusinessPartnerLocation` link — but a bare empty list does not
separate *there is nothing to offer* from *you asked wrongly*, and the agent assumed the latter,
which is the reasonable assumption. It spent roughly six calls probing: other partners, the DB column
name in place of the field name, `neo_schema` with `view:"full"` on the single field.

Same shape as C3: the result was not wrong, it was mute. A selector that resolves its context
successfully and finds nothing knows the difference and can say it.

## METADATA

### M1 — Action metadata does not publish the required parameters — **ALREADY FIXED**

**ALREADY FIXED — verified 18/09** by a context-free agent asked *"decime qué acciones puedo
ejecutar sobre una factura de venta, y para cada una qué datos tengo que darte"*. It answered in
**one call**. `neo_schema(view:"actions")` returned each invokable action with its parameter, its
value list and an `agentPrompt` that goes well beyond the parameter names — it states the
preconditions for `CO`, warns that completing does not post to the ledger, and names the values that
come from the shared AD list and do not belong to this window's flow. The twenty non-invokable
actions carry `notInvokableReason` instead of parameters, which is correct: they are outside the
curated surface, so there is nothing to publish.

**Evidence.** The single largest error bucket in this batch. `aPRMMatchTransactions`
required `name`, `currency` and `Fin_Bankstatement_ID`; the agent found them one at a time
by reading `validation_error` messages:

```
15:17  neo_action  validation_error  fields: (none)                          → "Name is required"
15:17  neo_action  validation_error  fields: Fin_Bankstatement_ID            → "Currency is required"
15:17  neo_action  validation_error  fields: Fin_Bankstatement_ID, name      → …
15:18  neo_action  (null)            fields: …, currency, …                  → _buttonValue bug (C2)
```

The same walk repeats on 17/09 for `aPRMImportBankFile` (12:36 → 12:37) and again at
13:19. Feedback 16/09 15:18:41 states it outright:

> Required parameters … are not documented anywhere — had to discover them through trial
> and error from validation errors. Cost: 3 wasted calls just to discover the parameter set.

**Count.** 10 of production's 18 `validation_error` rows are parameter discovery, not real
validation failures. **This single fix removes about a quarter of all production errors.**

**Fix.** `neo_schema view:actions` must return, per action, the full parameter contract:
name, type, required, and the reference/selector where applicable. If the contract cannot
be derived for a given process type, say that explicitly rather than returning an action
that looks callable with no arguments.

### M2 — `aPRMImportBankFile` advertises itself as invokable and is not — **CONFIRMED 18/09**

**CONFIRMED 18/09**, with the cause. A context-free agent asked to import a bank statement
found the route, filled the parameters one refusal at a time (`name` required → `currency` required
→ invalid currency → resolved via `neo_selectors` to `102`) and only then hit:

```
processResult: "error"
processMessage: "Process class is not a supported handler type:
                 org.openbravo.advpaymentmngt.ad_actionbutton.ImportBankFile"
```

Fifteen calls to reach a wall that was there from the first one. It is a Classic process the NEO
bridge cannot execute, and the refusal arrives as a business-level `processResult`, not a 4xx — so
the action stays advertised as invokable through parameter validation and right up to execution.
The fix is to decide invokability from whether the process class is a supported handler type, and
say so at `neo_schema(view:"actions")` time via `notInvokableReason`, the way the twenty curated-out
actions on `sales-invoice` already do.

**Evidence.** Feedback 17/09 12:41:31. `neo_schema view:actions` returns it with
`invokeVia: neo_action`; the server then rejects it at runtime:

> `Process class is not a supported handler type: org.openbravo.advpaymentmngt.ad_actionbutton.ImportBankFile`

Cost: 3 discovery calls plus the failed import.

**Fix (cheap, now).** Mark it `invokable: false` with a `notInvokableReason` that names the
unsupported handler type. Do the same sweep for every action whose process class is not in
the supported set — the check is static, so the metadata can be correct by construction.

**Fix (real, later).** Support the handler, which needs M3 below.

### M3 — No agent-accessible upload path for non-image files — **CONFIRMED 18/09**

**CONFIRMED 18/09.** A context-free agent asked to attach a signed PDF to a customer record
searched all 60 specs for an entity whose name contains `attach` (zero hits), read
`contacts/businessPartner` in full (103 fields, no attachment field) and its actions (one:
`setNewCurrency`). Its conclusion: the only upload mechanism is the organisation logo's `image`
field, which is a single typed column, not a general attachment surface.

**Evidence.** Same feedback. `neo_request_image_upload` / `neo_upload_image` accept PNG and
JPEG only. CSV bank statement import — a core workflow — has no agent path at all.

**Fix.** Either accept base64 `fileContent` on the import action, or add a generic upload
tool. Until one exists, M2's `notInvokableReason` should say so, so the agent stops looking.

### M4 — Entity resolution is case-sensitive and the error does not say it — **ALREADY FIXED**

**ALREADY FIXED — verified 18/09.** Subsumed by M5: the `not_found` response now carries the
spec's entity names, so the correct casing is visible in the answer itself.


**Evidence.** 3 `not_found` rows, experimental 17/09 17:28, session `87a85f5b`:

```
neo_schema  not_found  sales-invoice/Header
neo_schema  not_found  goods-shipment/Header
neo_schema  not_found  return-material-receipt/header   ← this entity genuinely does not exist
```

The first two work with a lowercase `header`.

**Fix.** Either resolve entity names case-insensitively, or have the `not_found` message
name the close match. This is one keystroke of agent error costing a full round trip.

### M5 — `not_found` does not list the available entities — **ALREADY FIXED**

**ALREADY FIXED — verified 18/09** against local. `McpRoutingException.entityNotFound` carries
the list; `specNotFound` deliberately does not (the catalog is large; the hint points at
`neo_discover` instead). Live probe, `neo_schema(sales-invoice, "Header")`:

```json
{"status":404,"error":"not_found","detail":"No entity 'Header' in spec 'sales-invoice'",
 "field":"entity","available":["header","lines","paymentPlan","reversedInvoices","exchangeRates"],
 "hint":"Retry with one of the names in 'available'."}
```


**Evidence.** 9 of the 12 `not_found` rows are an agent assuming every spec has a `header`
entity: `payment-in/header`, `payment-out/finPayment`, `financial-account/header` (×2),
`contacts/header`, `match-rule/header`, `transaction-type/header`,
`general-ledger-configuration/header`, `product-category/…`.

**Fix.** Make the `not_found` response carry the spec's actual entity list. One extra field
in the error turns a dead end into a correct retry, and it subsumes M4.

### M6 — `unknown_filter_field` does not list the filterable fields — **ALREADY FIXED**

**ALREADY FIXED — verified 18/09** against local. `McpRoutingException.unknownFilterField`
carries the filterable names, caps the list and says so when it truncates. Live probe,
`neo_list(contacts, businessPartner, filters:{"nombreInventado":"x"})`:

```json
{"status":422,"error":"unknown_filter_field","field":"nombreInventado",
 "available":["account","acquisitionCost",…,"deliveryMethod"],
 "hint":"Retry with one of the names in 'available'. That list is truncated — call neo_schema
         with view:\"full\" for this entity to see every filterable field."}
```


**Evidence.** 3 rows: `product/transactionAdjustments`, `contacts/businessPartner`,
`financial-account/clearedItems` (the last one with 6 fields touched —
`amount, depositAmount, description, paymentAmount, status, transaction…`).

**Fix.** Same shape as M5: return the accepted filter keys in the error.

### M7 — Unreconciliation actions are all discarded — **CONFIRMED 18/09**

**CONFIRMED 18/09**, and the discoverability cost is the real finding. The two actions named
for the job — `etprRemoveReconciliation` ("Remove Reconciliation") and `etprReactivateRecon`
("Reactivate Reconciliation") on `financial-account/reconciliations` — are both
`invokable: false, discarded`. The one that works lives in a different spec and entity
(`payment-in/finPayment`), is called `EM_Etpr_Reactivate_Payment` and is labelled *"Advanced
Reactivation"*, which does not suggest unreconciling anything. A context-free agent found it only by
reading the long description. Either un-discard the obvious two, or have their
`notInvokableReason` name the action that does the job.

**Evidence.** Feedback 16/09 15:11:17. `aprmProcessRec` (Reactivate),
`etprRemoveReconciliation` and `etprReactivateRecon` are all `invokable: false` on the
`reconciliations` entity.

> An agent that can reconcile should also be able to unreconcile.

**Fix.** This is a configuration decision, not a bug: expose at least one of them in the
window's `decisions.json` / `ETGO_SF_*` config. Worth a deliberate call rather than a
silent default — if it stays discarded, the reason belongs in `notInvokableReason`.

### M8 — `serverDefaulted: true` on fields nothing ever fills — **CONFIRMED 18/09**

**CONFIRMED 18/09**, and a context-free agent stated the defect better than this item did.
Creating a customer, `neo_defaults` resolved `priceList`, `paymentTerms`, `purchasePricelist` and
`pOPaymentTerms`; `neo_create` left all four `null` and the agent needed a second `neo_update` to
set them. Those four are in `BusinessPartnerHandler.PRECREATE_BILLING_FIELDS`, stripped by
`stripPreCreateBillingDefaults` before persist — cause confirmed, no further investigation needed.

What sharpens the item is that `currency`, flagged identically, **did** fill itself without being
sent. In the agent's words: *"`serverDefaulted: true` no garantiza que el AD complete el valor real
en el create — para algunos campos sí hay un default a nivel de columna AD, para otros el valor solo
existe como sugerencia de `neo_defaults` y no se aplica solo."* The bug is not the missing values,
it is that **the flag does not predict the behaviour**, so an agent that trusts it is wrong roughly
half the time. (The `currency` that filled itself is C7's fix running on the MCP path — a third
independent confirmation, from an agent that did not know the subject existed.)

**Evidence.** `neo_schema view:create` on `contacts/businessPartner` marks these foreign keys
`serverDefaulted: true`, and `neo_defaults` returns a resolved value for every one of them. None
of them is on the record afterwards — **by any path**, UI included:

| Field | `neo_defaults` | UI-created record | MCP-created record |
|---|---|---|---|
| `priceList` | Tarifa de venta principal | null | null |
| `purchasePricelist` | Tarifa de compra principal | null | null |
| `paymentTerms` | 30 Días | null | null |
| `pOPaymentTerms` | 30 Días | null | null |
| `businessPartnerCategory` | Cliente | Cliente | Cliente |

On experimental, which runs an older build, four more carry the flag and behave the same:
`paymentMethod`, `pOPaymentMethod`, `account`, `pOFinancialAccount`. The newer build already
dropped the flag from those four — the metadata was corrected there, the behaviour was not
changed, which confirms this is the metadata half of the problem and not a second code defect.

**Why this is METADATA, not CODE.** Unlike `currency` (C7), there is no divergence between UI and
MCP here, and the fields are not lost by accident: `BusinessPartnerHandler.handle()` **strips them
on purpose** at line 404 via `stripPreCreateBillingDefaults`, whose `PRECREATE_BILLING_FIELDS` set
(line 122) is exactly `priceList, paymentMethod, paymentTerms, account, customerBlocking,
purchasePricelist, pOPaymentMethod, pOPaymentTerms, pOFinancialAccount, vendorBlocking`. Verified:
`priceList` and `paymentTerms` sent explicitly through `neo_create` both come back NULL. So the
server deliberately refuses these values on create — and the schema tells the agent the opposite.
The defect is the promise, not the behaviour. The `view:create` hint states it outright — *"those carrying serverDefaulted=true are
mandatory in Etendo but the server already has a value for them, so do not ask the user"* — and
an agent that believes it creates a contact with no price list and no payment terms.

**Fix.** Make `serverDefaulted` mean what it says: never set it on a field the handler strips. The
stripped set is a static list in the handler, so the schema can be made truthful by construction
rather than by hand. A field the server refuses on create should be marked as such, with the reason
— an agent that knows the value is set later stops trying to send it, and stops reporting it as a
gap.

**Contradiction to resolve first.** The two tool descriptions disagree, and until that is settled
no wording is correct. `neo_schema view:create` says the server has the value and the agent should
not send it. `neo_defaults` on the same build says the opposite: *"an optional field this call
resolved (a price list, payment terms, a financial account, …) is NOT copied into the record unless
you send it explicitly in fields."* Decide which semantics is intended, then align all three
surfaces — the `serverDefaulted` flag, the `view:create` hint and the `neo_defaults` description.
Today an agent cannot get this right by reading the tools.

### M9 — `searchKey` is listed as required but is sequence-generated and discarded — **CONFIRMED 18/09**

**CONFIRMED 18/09**, exactly as described. A context-free agent sent
`searchKey: "TALLERESRIBERA"`; the stored record came back `searchKey: "1000011"`. No warning, not in
`unknownFields`, nothing in the response to say the value had been replaced — *"me di cuenta solo
comparando el payload enviado contra la respuesta"*. And the schema lists the field as **required**,
so the agent is obliged to invent a value that is then discarded in silence.

**Evidence.** `view:create` puts `searchKey` in `required` (2 of 2 required fields). The record
always ends up with a sequence value: `ETP5284-RETEST` → `1000228`, `ETP5284-LOCAL` → `1000000`,
`ETP5284-ORG` → `1000003`. The UI renders it disabled and never sends it.

**Fix.** Remove it from `required`, or mark it read-only/server-owned. Requiring a value that is
then thrown away teaches the agent something false about the entity. See C8 for the ordering half.

### M10 — A field is named `currency` for writing and `bPCurrencyID` for reading — **CONFIRMED 18/09**

**CONFIRMED 18/09.** A context-free agent reporting the stored record wrote the field as
`currency (bPCurrencyID)` — it saw both names for one column and recorded both rather than choose.
Note this is **not** closed by C7: C7 made the injected value arrive, M10 is the public contract
still exposing two names for `BP_Currency_ID`. The per-path key selection in
`BusinessPartnerHandler` collapses back to one constant when M10 is fixed.

**Evidence.** `neo_create` accepts `currency` and persists it. `neo_get` with
`fields:["currency"]` returns it under `unknownFields` and the record carries `bPCurrencyID`
instead. An agent that writes a field cannot read it back by the name it just used.

**Fix.** Use one name on both surfaces, or have `neo_get` accept the write-side alias. This is
also what makes C7 hard to diagnose: the handler's constant is `FIELD_CURRENCY = "bPCurrencyID"`
while the MCP schema calls the same column `currency`.

### M11 — An expired MCP session is reported as a business-rule validation error

**Evidence.** With a stale session, `neo_create` on `contacts/businessPartner` returned:

```json
{"status":422,"error":"validation_error","detail":"Could not find Sequence for: EM_Etgo_Identifier",
 "hint":"A business rule rejected the values sent. Read 'detail', correct the values it names and retry"}
```

After re-authenticating, the identical payload succeeded. Nothing about the sequence had changed.

**Fix.** Surface an authentication failure as an authentication error. As it stands the agent is
told to correct values it sent correctly, and the suggested remedy — retry with different values —
cannot ever work. This cost a full test run before the cause was spotted.

---

## DOCS

### D1 — No documentation on configuring the organisation logo for printed invoices — **CONFIRMED 18/09**

**CONFIRMED 18/09** — and the answer is now known, so this is writing, not research. A
context-free agent asked *"¿cómo configuro el logo de mi empresa para que salga en las facturas
impresas?"* got nothing from four `docs` calls and found it by brute force through
`neo_discover` + `neo_schema`:

* spec `organization`, entity `information` (table `AD_OrgInfo`, child of `organization`)
* field **`yourCompanyDocumentImage`** (column `Your_Company_Document_Image`), type `image`
* the field's own description already says *"La imagen que se muestra en los documentos impresos"*
* to set it: `neo_request_image_upload` (or `neo_upload_image` under 256 KB) for an `imageId`, then
  `neo_update` on `organization/information`

But see D3 before scheduling this: documentation the agent cannot retrieve does not help it.

**Evidence.** The only feedback row from experimental (16/09 16:07:25,
`ai-sdk-mcp-client`, client TECFRAN IT SERVICES SLU), outcome `MIXED`, suggestion kind
`clearerDocs`:

> The indexed documentation returned no specific guide on organisation logo or invoice
> templates. Cost: 3 documentation searches with no useful result.

The `docs` tool returned financial API reference and order/payment examples instead. The
agent answered from general Etendo knowledge and said so — the right behaviour, but the
answer was unverified.

**Fix.** Add a guide covering organisation/company logo configuration and its use in sales
printouts, and make sure it is indexed for `docs`.

### D2 — Document the action-invocation contract for agents

**Evidence.** C1, C2, M1 and M2 are all the same gap seen from four angles: an agent has no
way to know, before calling, which process types are invokable, what each one needs, and
what the MCP injects on its behalf.

**Fix.** One page in `com.etendoerp.go/docs/` describing the supported process handler
types, which parameters the MCP fills in automatically, and what an agent must supply.
Reference it from the `neo_action` tool description.

---

### D3 — `docs` returns the same corpus whatever the topic — **NEW 18/09**

**This precedes every other DOCS item.** Documentation an agent cannot retrieve does not help it, so
writing D1 or D2 before fixing this buys nothing.

A context-free agent made four `docs` calls on distinct topics (`company logo invoice printable`,
`logo`, `attachment`, `upload file document business partner`) and got treasury and bank-reconciliation
material every time. Confirmed directly afterwards with two deliberately opposite topics:

| `topic` | what came back |
|---|---|
| `company logo printed invoice image` | treasury, receipts, sales orders, financial reports |
| `kanban calendar layout` | **substantially the same** |

Five blocks were identical across the two responses (*Link receipt to invoice or order*, *Link Receipt
to Scheduled Payments*, *Render Financial Accounts Page*, *Create sales order header*, *Resolve line
selectors and create line*). Neither response mentions logos, images, kanban or calendars.

A second agent reported `docs` as *useful* in the same session — it had asked about bank statement
imports and unreconciling payments, which is precisely the treasury slice that comes back regardless.
It asked for the one subject the constant answer happens to cover, which looks like a working search
and is not. Worth remembering when reading any single report of this tool behaving.

Not a defect in this module: `Context7DocsClient.buildUri` URL-encodes the topic and sends it on the
query string as documented. The degenerate ranking is on the Context7 index for
`etendosoftware/etendo-go-docs` — either the corpus is too small to rank or the topic is not
influencing retrieval. Investigate there first; if the index cannot be made to discriminate, the
tool should say what it does not cover rather than answer every question with treasury.

## Telemetry quality notes (not fixes)

**`session_key` identifies the connection, not the agent.** My own calls and a context-free
subagent's shared `db36c857` throughout 18/09. Any analysis that treats a session key as one
conversation, one agent or one task will merge unrelated work. This is the same gap C6 reports from
the other end, and it means C6 cannot be fixed by populating the existing column — a separate
per-conversation identifier is needed.

**`fields_touched` is empty on `neo_list` validation errors.** 18 production rows in this batch are
consequently undiagnosable: the row records that a list call was refused for a bad field, without
recording which field. Everything needed to answer that is in hand at the throw site —
`unknownFilterField` already carries the key and the available names.


- **Latency.** Production p50 309 ms, p90 685 ms — healthy. The tail is 9 `neo_batch` calls
  between 13 s and 23.4 s (max 23372 ms) during the bulk contact load. Nothing is broken;
  this is the current ceiling and worth watching if batch sizes grow.
- **Feedback rate.** 7 feedback rows over 8 production sessions is a good signal; 1 over 37
  experimental sessions is not. Worth deciding whether the client should emit feedback on
  session close rather than only when an agent chooses to.
- **`parent_required`** (2 rows, `neo_defaults` on `purchase-order/lines`) and
  **`stale_record`** (1 row, `neo_update` on `financial-account/account`) behaved correctly
  and need no change.

---

## Suggested order

Rewritten 18/09 after each item was probed against the running build. Five are closed, three are new,
and the ordering below is by what unblocks what — not by severity.

**Closed, no work left**

| | |
|---|---|
| C3, C7 | fixed 18/09, verified with context-free agents |
| M1, M4, M5, M6 | were already live before this review was written |
| C5 | could not be reproduced |

**1 — errors that mislead: C9, C11, then C10 and C12.**
C9 first — it is the only item that can make an agent tell a user something was done when nothing
was. C11 next, because an error naming the wrong field sends the caller to correct an input that was
never the problem. C10 and C12 are the quieter half of the same family: a refusal that does not name
its field, and an empty result that does not say why it is empty. All four cost an agent calls it
cannot get back, and three of them were found by agents that had no idea they were being measured.

**On C9 specifically.**
First because it is the only item that can make an agent tell a user something was done when nothing
was. Everything else costs calls or clarity; this one costs correctness. Needs an instance with real
payments to close.

**2 — `docs` returns the same corpus whatever the topic (D3), then D1 + D2.**
In this order and not the other: documentation an agent cannot retrieve is not documentation. D1's
content is already known (`organization/information.yourCompanyDocumentImage`), so once retrieval
works it is a short write-up.

**3 — the create path: M9, C8, M8, M10.**
One story, four rows. `searchKey` is demanded and discarded (M9), mandatory validation runs before
the hook that fills the field (C8), `serverDefaulted` does not predict whether the value is applied
(M8), and the same column answers to two names (M10). Settle the intended `serverDefaulted`
semantics first; the rest follow from it. M10 also releases the per-path key selection C7 left in
`BusinessPartnerHandler`.

**4 — invokability that tells the truth: M2, M7.**
Both are an action advertised as reachable that is not, and both cost an agent ten-plus calls to
discover. M2 needs the process class checked when invokability is decided; M7 needs the discarded
actions to name the one that does the job.

**5 — the rest: C1, C2, C4, M3, M11, C6.**
C1, C2 and C4 still have no verification against the current build. M3 is a genuine capability gap,
not a defect. M11 and C6 could not be tested blind — an expired session cannot be forced on demand,
and C6 is about production rows. C6 additionally cannot be closed by filling the existing column; see
the telemetry note on `session_key`.

**Read-path parity is not in this list.** The 80 tab-backed entities whose `afterHandle` runs over
REST and not over MCP (recorded under C3) is a behaviour change across most of the API. It belongs to
the API alignment plan, with tests and a staged rollout, not to this batch.
