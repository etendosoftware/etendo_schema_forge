# Agentic write exposure — which specs may be written, and how to declare it

**When to read this:** you are deciding whether an MCP agent (or the React UI) should be
able to **mutate** a window's data, or you are triaging a ticket where an agent wrote to
something it had no business writing to — a monitor, a log, a dashboard, a report.

**The rule (ETP-4254):** a spec or entity qualifies for **write** exposure only where an
agent can execute a **transactional business action** — create, modify or complete a
business document. **Monitors, logs, dashboards and reports do not qualify.** They exist to
*observe* state that some other transactional flow produced; letting an agent POST into them
fabricates history rather than performing business.

Before ETP-4254 the pipeline could not express this. `populateWindowSpec` took a single
`includeAllMethods` boolean and `neo-delta.js` hardcoded all-`Y`, so **every** entity of
**every** spec was pushed to `ETGO_SF_ENTITY` with all six HTTP methods enabled — a window
declared `readOnly` in `decisions.json` was read-only in the UI and wide open on the API.

> Anchors below are `file:line`, verified 2026-08-04 (ETP-4254). `Neo*`/`Mcp*` files are in
> `com.etendoerp.go/src/com/etendoerp/go/{schemaforge,mcp}/`; `cli/` files are in
> `schema_forge_core`.

---

## 1. The qualification test

Ask, per **entity** (not per window — see the mixed case in §3):

| Question | If yes |
|---|---|
| Does a user or agent perform a business transaction here (create/edit/complete a document, register a payment, move stock)? | **Write qualifies.** Leave the entity undeclared, or declare the exact verbs it needs. |
| Is this a record of something that already happened — a submission log, an audit trail, a sync result, a status snapshot? | **No write.** Declare it read-only. |
| Is it a dashboard/KPI/report projection, or a DB **view**? | **No write.** A view often accepts a `PUT` and silently writes nothing, which is worse than a `405`. |
| Does a real caller (UI component, handler, integration) actually issue a mutation against it *today*? | **Grep before you decide.** A live caller is the only thing that justifies keeping a verb on an otherwise read-only spec. |

The last row is not optional. `decisions.json` cannot see the frontend; the only way to know
whether turning `PUT` off breaks a user flow is to search for the caller. Search
`tools/app-shell/src` for the spec name *and* for each entity name, and check the `method:`
of every hit.

---

## 2. How to declare it

Two entity keys. The canonical key reference is the **Entity HTTP Methods** section of
`schema_forge_core/docs/decisions-reference.md`; this repo's mirrored copy
([`../decisions-reference.md`](../decisions-reference.md)) does not carry that section yet —
sync it when the core change is published.

```json
{
  "window": { "readOnly": true },
  "entities": {
    "log":             { },                                   // inherits the window → GET + GETBYID
    "acknowledgement": { "readOnly": false },                 // opts OUT → all six methods
    "header":          { "methods": ["GET", "GETBYID", "PUT", "PATCH"] }
  }
}
```

**Precedence:** `entities.<e>.methods` → `entities.<e>.readOnly` → `window.readOnly` →
default (all six enabled).

**Invariants**

- `GET` and `GETBYID` are **always** granted. An empty or write-only `methods` array still
  resolves to `["GET","GETBYID"]` — an entity with no read access is the pre-ETP-4254
  `includeAllMethods=false` bug, not a feature. Enforced in the resolver
  (`cli/src/lib/entity-methods.js`), not by convention at the call sites.
- **Declaring nothing changes nothing.** Every existing spec keeps all six methods, so this
  is opt-in per window.
- `readOnly: false` on an entity is a **real value**, not "absent" — it is the escape hatch
  that re-opens one entity of an otherwise read-only window.
- Method tokens are case- and separator-insensitive: `getById`, `GET_BY_ID`, `GETBYID`.

**Then regenerate.** The flags are read off the contract, so editing `decisions.json` and
pushing without regenerating leaves the old flags in the DB. Validator rule **F21** blocks
exactly that — see [`docs/pipeline-validator-reference.md`](../pipeline-validator-reference.md).

```bash
make regen ONLY=<window>                 # decisions → contract → generated
make regen ONLY=<window> PUSH_TO_NEO=1   # …and push to ETGO_SF_*
./gradlew export.database                # in Etendo root — or the config dies on rebuild
```

---

## 3. Worked example — `monitor-verifactu` (the mixed case)

The four fiscal monitors were the ETP-4254 targets. Three are uniformly read-only and need a
single line:

| Window | Declaration | Result |
|---|---|---|
| `conversion-rate-downloader-log` | `window.readOnly: true` | 1 entity, `GET`+`GETBYID` |
| `sii-monitor` | `window.readOnly: true` | 11 entities, `GET`+`GETBYID` |
| `tbai-facturas-enviadas` | `window.readOnly: true` | 2 entities, `GET`+`GETBYID` |

`monitor-verifactu` is **not** uniform. It is a monitor — but one of its five entities is the
UI's only way to mark an invoice for *subsanación*, and that write is a genuine business
action performed through a `NeoHandler`. So the window is declared read-only and that one
entity is pinned with an explicit allowlist:

```json
{
  "window": { "category": "monitor", "name": "Monitor Verifactu", "attachments": false, "readOnly": true },
  "entities": {
    "facturasParcialmenteAceptadas": {
      "javaQualifier": "mark-subsanation-handler",
      "methods": ["GET", "GETBYID", "PUT", "PATCH"]
    },
    "facturasInválidas": { "javaQualifier": "correct-invoice-handler" }
  }
}
```

Resolved `ETGO_SF_ENTITY` flags:

| Entity | ISGET | ISGETBYID | ISPOST | ISPUT | ISPATCH | ISDELETE | Why |
|---|---|---|---|---|---|---|---|
| `facturasParcialmenteAceptadas` | Y | Y | **N** | **Y** | **Y** | **N** | `VfSolveErrorModal.jsx:78-85` issues `PUT /monitor-verifactu/facturasParcialmenteAceptadas/{id}` with `{"isSubsanation": true}`, served by `mark-subsanation-handler`. Turning `PUT` off would kill that flow with a `405`. Nothing creates or deletes these rows from the UI, so `POST`/`DELETE` stay off. |
| `facturasInválidas` | Y | Y | N | N | N | N | Its `correct-invoice-handler` is reached through the **action** path (`POST …/action/Correct_Invoice`), which is **not** gated by these flags — see §4. `VfSolveErrorModal.jsx:70-76` documents why: the backing table is a **view**, so a plain `PUT` returns `200` and writes nothing. |
| `cabeceraDeEmisor` | Y | Y | N | N | N | N | Emitter header projection. Only ever read. |
| `facturasRechazadas` | Y | Y | N | N | N | N | Status projection, read via `fetchProblems()`. No writer. |
| `facturasAceptadas` | Y | Y | N | N | N | N | Status projection, read via `fetchCorrect()`. No writer. |

Evidence for the three "no writer" rows: the only mutation calls anywhere under
`tools/app-shell/src/windows/custom/fiscal-monitor/` that target this spec are the two in
`VfSolveErrorModal.jsx` above. Every other access goes through `apiFetch(...)` with no
`method` option — i.e. `GET` (`VerifactuMonitorSection.jsx:61-78`). The `PUT`s in
`ContactDetailModal.jsx:259,266` target `businessPartner` and the invoice specs, not the
monitor. `useFiscalStatus.js` and `useFiscalMonitor.js` are read-only consumers.

**Only the deviating entity needs a key.** `crud.<entity>.methods` is emitted on the contract
only when the resolved set differs from the window-level default, so a plain
`window.readOnly: true` window produces no per-entity keys at all — and the one entity that
deviates is pinned explicitly.

---

## 4. The flags gate CRUD only — not actions, processes, callouts, selectors or defaults

This is the single most important thing to understand before declaring a window read-only:
**a read-only declaration does not disable business processes.**

`NeoRequestRouter.handleWindowSpecRequest` dispatches sub-endpoints **before** it reaches
CRUD:

```
NeoRequestRouter.java:191   subEndpointDispatcher.handleWindowSubEndpoint(...)   ← actions, selectors,
                                                                                  evaluate-display,
                                                                                  callout, defaults
NeoRequestRouter.java:195   crudHandler.handleWindowEntityCrud(...)             ← the gate lives here
NeoCrudHandler.java:125     if (!NeoMethodPolicy.isMethodEnabled(entity, method)) → 405
```

So on a fully read-only entity these all keep working:

- `POST /{spec}/{entity}/{id}/action/{Process}` — button/action processes
- `/{spec}/{entity}/callout/{field}`, `/selectors/{field}`, `/defaults`, `/evaluate-display`

`facturasInválidas` is the proof: `POST …/facturasInválidas/{id}/action/Correct_Invoice`
still corrects an invoice with every mutation flag set to `N`. If a process must also be
blocked, that is a different mechanism (preconditions / role access), not this one.

**Two paths that *are* gated, and both were closed by ETP-4254:**

| Path | Gate | Note |
|---|---|---|
| REST CRUD | `NeoCrudHandler.java:125` | `405 "<METHOD> not enabled for <entity>"` |
| MCP write tools (`neo_create`/`neo_update`/`neo_delete`) | `McpToolRouterSupport.requireMethodEnabled` (`:202-210`) | Explained refusal naming the enabled methods, not a bare code |
| `/batch` and MCP `neo_batch` | `BatchService.java:457` | Entered the CRUD pipeline *after* the gate, so a read-only entity used to reject a direct `POST` with `405` while accepting the same create smuggled inside a batch. Closed. |

`neo_discover` reports `readOnly: true` for an entity that is readable and has no mutation
method (`NeoMethodPolicy.isReadOnly`, `:112`).

**Gate granularity caveat:** `isMethodEnabled` treats `GET` as enabled when **either**
`ISGET` (list) or `ISGETBYID` (single) is set — the two flags share one HTTP verb at the gate
(`NeoMethodPolicy.java:73-74`). You cannot use the flags to allow record reads while refusing
list reads; only a handler can make that distinction.

---

## 5. The flags are shared between the React UI and the MCP agent

There is **one** set of flags, and both consumers hit the same wall: turning a mutation off
returns `405` to the agent *and* to the browser. There is no "read-only for agents, writable
for the UI" setting.

Therefore: **always pair a read-only declaration with `window.readOnly`**, so the UI hides
the affordance instead of rendering a Save/Create/Delete button that `405`s on click.
`window.readOnly: true` derives `hideCreate: true` + `hideDelete: true` on the contract and
sets `readOnly` on `windowMeta`, which `DetailView` consumes as `windowReadOnly` to block
edit/save. Because `window.readOnly` is also the trigger for the API restriction, declaring
it gets both halves consistent by construction — the failure mode only appears if you restrict
methods per entity (`entities.<e>.methods`) on a window that is *not* declared `readOnly`.

For the four fiscal windows the UI question is moot in a second way: `sii-monitor`,
`monitor-verifactu` and `tbai-facturas-enviadas` are listed in `apiOnlyWindows`
(`tools/app-shell/src/windows/registry.js:178-185`) — they have a contract and a NEO spec but
are never loaded as standalone windows; `FiscalMonitorPage` fetches them directly. There is
no generated page a user can reach, so there is no button to hide.

---

## 6. What gets hidden from the catalog entirely — and why "no AD_Tab" is not enough

Separate from the method flags, ETP-4254 also replaced a hardcoded `"dashboard"` spec-name
literal with a data-driven rule for dropping a spec from the agentic catalog altogether
(`neo_discover`, the CRUD/action tool enums, `McpResourceProvider`). A type-`W` spec is
excluded only when it has **neither** surface — `isCatalogExcludedSpec`
(`McpToolRouterSupport.java`):

| Condition | Predicate | Meaning |
|---|---|---|
| every included entity is handler-backed (no `AD_Tab`) | `isHandlerOnlySpec` | the generic CRUD path cannot serve it |
| no entity's handler declares `NeoHandler.servesActions()` | `NeoActionSurface` | there is no `/action` route either |

**Both are required, and the second one is the whole point.** The first condition alone matches
two specs, not one:

| Spec | Entities | Verdict |
|---|---|---|
| `dashboard` | 9 widget handlers, no AD_Tab, no actions | **excluded** — served by `neo_widget` |
| `not-posted-documents` | 1 tab-less entity, handler serves `post` / `bulk-post` | **kept** — that is a transactional business action |

Hiding `not-posted-documents` would have removed the ability to post unposted documents from
agents, because `hasSpecAccess` gates `neo_action` too (`McpToolRouter.java:1032`) — the exact
inverse of §1's rule, which says a transactional business action is precisely what *earns* write
exposure. The REST/React path is unaffected either way (`NeoRequestRouter` never consults
`hasSpecAccess`), so a mistake here is invisible in the UI and only shows up for agents.

`ETGO_SF_ENTITY` has no action metadata (its columns are the method flags, `AD_TAB_ID`,
`JAVA_QUALIFIER`, `PRECONDITIONS`, audit), so the handler is the only authority and declares
itself. **When you write a `NeoHandler` that answers `NeoEndpointType.ACTION`, override
`servesActions()` to return `true`.** The probe is fail-open (unregistered handler or CDI failure
→ keep the spec visible), so the failure mode is a spec that stays listed, never one that
silently disappears.

---

## 7. Known inconsistency worth recording — `warehouse` / `location`

The `location` entity of the `warehouse` spec is tab-less and fully owned by
`WarehouseLocationHandler` (`@Named("warehouseLocationHandler")`). Its committed
`ETGO_SF_ENTITY` row is `ISGET=N, ISGETBYID=Y, ISPOST=Y, ISPUT=Y, ISPATCH=N, ISDELETE=N`,
and the handler implements exactly `POST` (collection), `PUT /{id}` and `GET /{id}`,
answering everything else with `405 "Unsupported operation on location: <METHOD>"`
(`WarehouseLocationHandler.java:94`).

That looks aligned, and mostly is — but the flags are **per-verb** while the handler
discriminates **per verb *and* per path shape**. Two consequences:

- `POST /warehouse/location/{id}` (a record-level POST) passes the gate, because `ISPOST=Y`,
  and is then refused by the handler with `405 "Unsupported operation on location: POST"`.
  The metadata advertises a verb the handler will refuse in that shape.
- `ISGET=N` is decorative at the gate: a list `GET` is admitted anyway because `ISGETBYID=Y`
  satisfies the shared `GET` check (§4), and only the handler refuses it.

Record it, do not "fix" it by flipping flags — the flags cannot express verb+shape, and
`ISPOST=Y` is genuinely required for the collection `POST` that `LocationEditorModal`
(`saveMode="location"`) depends on. It is a documented limitation of the flag model, not a
misconfiguration of that row.

---

## See also

- `schema_forge_core/docs/decisions-reference.md` — Entity HTTP Methods (canonical; not yet
  mirrored into this repo's `docs/decisions-reference.md`).
- [`docs/pipeline-validator-reference.md`](../pipeline-validator-reference.md) — rule **F21**.
- [`mcp-field-flags-pipeline.md`](mcp-field-flags-pipeline.md) — the rest of the MCP-facing
  metadata (spec / entity / field level) and which knob owns each value.
- `docs/neo-headless-extensibility.md` — the `NeoHandler` pattern the `monitor-verifactu`
  writes go through.
- `{etendo_root}/modules/com.etendoerp.go/docs/neo-headless.md` §4.3 — the `405` HTTP contract.
