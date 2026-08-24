# ETP-3861 — Global search: record search + removable per-window scope

**Status:** DRAFT — evolving during design discussion. Not approved, not started.
**Jira:** ETP-3861 (Historia, Defined) · origin: ETP-3785, DA-21
**Repos touched:** `etendo_schema_forge` (UI), `com.etendoerp.go` (NEO endpoint)

---

## 1. Problem

The global search bar navigates to **windows/modules only**. It cannot find a
record. The per-window magnifier removed in ETP-3785 was never restored, so
there is no way to search scoped to the window you are standing in.

## 2. Target behaviour (as agreed)

1. The top-bar search is a **real input**; typing opens a **panel anchored
   directly below it** (Figma), showing matching records live as you type.
2. A **`Buscar en` section** at the top of the panel carries a **removable pill**
   with the active scope, pre-seeded with the current window when one is open.
3. A **`Filtrar ventanas`** pill opens a checkbox list so **several** windows can
   be searched at once (D6). Clearing the pill widens the search to everything.
4. Results are grouped — `Ventanas` plus one group per entity — each with a
   **count badge**; selecting a record row navigates straight to its detail view.
5. A **`Búsquedas recientes`** section lists the user's last terms (D9).
6. A footer shows `↑ ↓ Navegar · ↵ Abrir · ESC Cerrar`.
7. Window/module search (today's behaviour) must keep working.

8. A **"See all results"** row at the foot of the panel leads to a full results
   page (D3).

**Out of scope:** the `Sugerencias` section (D7-rev, §12) and the per-row `⋮`
kebab (D8).

## 3. Current state (verified in code)

| Piece | File | Today |
|---|---|---|
| Top-bar search | `layout/TopBar/TopBar.jsx` | A `<button>` dispatching a synthetic ⌘K. **Stays as-is — out of scope.** |
| Palette | `components/CommandPalette.jsx` | `CommandDialog` (centered modal), iterates static `menu.json`, `navigate('/'+name)` |
| Window context | `components/CurrentWindowContext.jsx` | Already publishes `{spec, tabTitle, ...}` for the active route → the scope chip's data source |
| Menu search API | `GET /sws/neo/listmenu?q=` (§4.10) | Exists server-side; the palette does not use it |
| Fuzzy match API | `GET /sws/neo/simsearch` (§4.9) | See §4 — the engine we will build on |
| `simSearch` in `ListView` | `ListView.jsx:1292` | **Not user-facing search.** Feeds `ImportDialog` only, to resolve CSV cells to real records |

**UX reference: GitHub's search.** Specifically: *the removable label that scopes
the search to the entity of the window you are standing in.* It is **not** about
adopting GitHub's `key:value` query syntax — see D1 below.

> **Correction:** an earlier draft claimed simsearch was "already used in ListView"
> as a search feature. It is not — it is CSV import value-resolution. The engine
> is nonetheless a good fit; identifier-column-only matching is accepted.

## 4. The simsearch engine — verified contract

`NeoSimSearchEndpoint.java` → `SimSearch.handleSimSearch(term, entityName, qtyResults, minSimPercent)`

- **`entityName` is a single entity, required.** Unresolvable → `422`.
- **`items` is the *terms* axis, not the entities axis.** The endpoint loops the
  array calling `handleSimSearch` once per term against *the same* entity,
  returning `item_0`, `item_1`, …
- ⇒ **N entities = N calls.** The entity fan-out must happen **server-side in our
  new endpoint**, so the browser issues one request per keystroke, not N.
- Each match returns **`id`, `name`, `similarity_percent`** — the `id` is exactly
  what we need to route to the record's detail view.
- Matching is on the entity's **identifier columns** (accepted as sufficient).
- Security: filtered by `OBContext.getEntityAccessChecker()` — a role only
  matches entities it can already read. Unchanged by our endpoint.

### 4.1 Two internal execution paths — and the one we knowingly take
`handleSimSearch` picks between:
- `searchEntitiesIndexed(...)` — the **pg_trgm GIN** path, fast. Requires an
  *expression* index per identifier column, e.g.
  `gin (upper(name) gin_trgm_ops)` — the predicate is `upper(t.<col>) % upper(:term)`,
  so an index on the bare column is unusable. Detection is a text match on
  `pg_indexes.indexdef` (`ilike '%trgm_ops%'` and `ilike '%(<col>)%'`), which a
  plain single-column index also fails, so the fast path would not even be tried.
- fallback HQL `where etcotp_sim_search(:tableName, p.id, :searchTerm) > :minPct`
  — a **per-row function call**, i.e. a full scan per entity.

Chosen by `allColumnsHaveTrgmIndex()` (memoized in `TRGM_INDEX_CACHE`).

**⇒ DECISION (D5): we ship on the fallback path and create no indexes and no
triggers.** Accepted knowingly: few tenants, small datasets. Optimization is
deferred and will be done backend-side by other means, not by adding DB objects
in this task. See D5 and §11.

---

## 4bis. Figma review (Alexandra) — deltas against this plan

Screenshots + exported CSS reviewed 2026-08-24. **The design contradicts D4 and
widens the scope.** Facts observed, before any decision:

**Panel placement — conflicts with D4.** The panel is *anchored below the search
bar*, not a centered modal:
`position:absolute; top:59px; left:calc(50% - 454px/2 - 4px); width:454px; height:364px;`
`top:59px` sits directly under the 62px top bar. The bar itself becomes a **real
input**: a caret is visible and the microphone is replaced by an **✕ clear**
affordance once focused.

**"Buscar en" — two pills, and the scope is multi-select.**
- `Todas las ventanas ✕` — removable pill (its `close` icon is rendered).
- `Filtrar ventanas` — opens a **checkbox list** (Contactos, Factura de venta,
  Factura de compra, Pedido de venta, …). ⇒ **the user can select several
  entities at once**, which `scope=<single specName>` (D1) cannot express.

**Two sections that do not exist in this plan:**
- **Búsquedas recientes** — clock icon, term, entity badge, `⋮` kebab per row.
  Needs persistence (store + eviction policy: unspecified).
- **Sugerencias** — sparkle icon, e.g. "Facturas vencidas este mes", "Contactos
  sin actividad 90d". Saved/smart queries, not record search. Potentially a
  feature of its own.

**Results state (screenshot 4):** groups carry a **count badge** — `Ventanas (1)`,
then a group titled with the entity `Pedido de venta (3)`. Window rows have a
leading icon; record rows do not. The right-hand badge is the **entity name** in
Recientes/Sugerencias but a **document number** in results — an inconsistency to
confirm with design.

**Footer:** `↑ ↓ Navegar · ↵ Abrir · ESC Cerrar`. Cheap, and cmdk gives us the
key handling already.

**Absent from the Figma but required by the ticket:**
- The *standing-inside-a-window* state — every screenshot shows the default
  `Todas las ventanas`, never the pill pre-seeded with the current window.
- A distinct per-window magnifier. The scope pills appear to be its replacement,
  but this is inference, not a drawn state — confirm with Alexandra (O1).
- **"See all results" (D3) does not appear anywhere in the design.**

**Design tokens** (from the exported CSS, for the implementation): panel radius
8px; pill `background:#F5F7F9; border-radius:360px; padding:4px 8px`; section
separators `1px solid #E8EAEF`; footer bar `#F5F7F9`; text `#121217` (primary) /
`#3F3F50` (secondary) / `#555B6D` (placeholder); icons `#828FA3`; Inter 14/20 and
12/16; search bar `392x40, radius 200px`.

---

## 5. Design

### 5.1 Search descriptor — where the criteria live
Per **CLAUDE.md**, anything that must survive a pipeline re-run belongs in
`decisions.json`:

```jsonc
// artifacts/<window>/decisions.json
"window": {
  "search": {
    "enabled": true,
    "entity": "BusinessPartner",   // AD entity handed to simsearch
    "label": "Contactos",          // chip text (i18n key or AD label)
    "route": "/contacts/:id"       // how to navigate to a hit
  }
}
```

`generate-contract.js` copies it into `contract.json`; `push-to-neo.js` pushes it
so the server owns the registry and role access is applied automatically.
No per-field list is needed — simsearch uses identifier columns (§4).

### 5.2 Backend — `GET /sws/neo/search`
New NEO **pseudo-spec bridge** (`NeoGoWebhookBridge`, per neo-headless.md
§4.10–4.11): bearer token only, no `SMFWHE_DEFINEDWEBHOOK_ROLE` grant that
`update.database` would wipe.

```
GET /sws/neo/search?q=<term>&scope=<specName>[,<specName>...]&limit=8
```

- **No `scope`** → server loops every spec with `search.enabled`, one
  `handleSimSearch` per entity, merges and ranks by `similarity_percent`, caps
  per entity and overall.
- **With `scope`** → only the listed specs (**comma-separated, multi-valued**,
  per D6). Same loop, smaller set.
- Response:
  `{ results: [{ specName, entityName, id, title, badge, route, score }], truncated: bool }`
- `truncated` tells the UI whether "See all results" has more to show.

### 5.3 Frontend

**A. Anchored popover, cmdk retained (D4-rev).** The centered `<Dialog>` is
replaced by a **`Popover` anchored to the search bar** (`top:59px`, 454px wide),
and the top bar's `<button>` becomes a real `<input>` with an ✕-clear.
Everything else stays: `Command`, `CommandInput`, `CommandList`, `CommandGroup`,
`CommandItem`, and cmdk's ↑ ↓ ↵ ESC handling. Only the container changes.

**B. "Buscar en" scope section (D1-rev, D6).** A dedicated section at the top of
the panel — *not* pills inside the input, as the Figma places them in their own
`Buscar en` block:

- A **removable pill** carrying the active scope, **pre-seeded with the current
  window** when one is open (from `CurrentWindowContext.spec` — the state the
  Figma does not draw). **When nothing is scoped there is no pill at all** (D11),
  only the `Filtrar ventanas` control.
- A **`Filtrar ventanas` pill** opening a **checkbox list** of searchable
  windows, so **several entities can be selected at once**.

Scope is **multi-valued** and travels as a separate parameter — never as parsed
query syntax:

```
"Buscar en"
  [Contactos ✕]   [Filtrar ventanas ▾]  ☑ Contactos
                                         ☐ Factura de venta
                                         ☑ Factura de compra

→ GET /neo/search?q=juan&scope=contacts,purchase-invoice
```

**C. `useGlobalSearch(term, scope)`** — debounced, aborts in-flight requests,
merges `listmenu?q=` (windows) + `/neo/search` (records) into grouped results.

**D. Results list** — a `Ventanas` group plus **one group per entity**, each
header carrying a **count badge** (`Ventanas (1)`, `Pedido de venta (3)`).
Keyboard navigable via cmdk; a record row navigates to its `route`. Window rows
carry a leading icon, record rows do not. Each record row shows its identifying
code in a right-hand badge (D12).

**E. `Búsquedas recientes`** — clock icon, term, entity badge. Backed by
`localStorage` (D9): key `sf.recentSearches`, `{term, specName, label, ts}`,
cap ~10, oldest evicted. No `⋮` kebab (D8).

**F. Shortcut footer** — `↑ ↓ Navegar · ↵ Abrir · ESC Cerrar` on a `#F5F7F9`
bar. cmdk already handles the keys; this only renders them.

**G. Full results page (D3).** New route `/search?q=&scope=`: a plain ranked
list, grouped by entity, paginated, carrying the same scope state, with no
filters or sorting of its own. Kept deliberately simple — it is expected to be
improved in a later pass. Reached from a **"See all results"** row at the foot
of the panel.

**H. i18n** — every new string in **both** `en_US.json` and `es_ES.json`.

---

## 6. Work breakdown

### Part 1 — Global record search
| # | Task | Repo |
|---|---|---|
| 1.1 | `window.search` block in the decisions schema + `resolve-curated` passthrough | forge |
| 1.2 | Emit `search` into `contract.json` + push in `push-to-neo.js` | forge |
| 1.3 | `GET /sws/neo/search` bridge: server-side entity fan-out over `handleSimSearch`, merge + rank + cap | go |
| 1.4 | `useGlobalSearch` hook (debounce, abort, merge windows+records) | forge |
| 1.5 | Move cmdk from `Dialog` to a `Popover` anchored to the bar; top-bar `<button>` → `<input>` + ✕ clear | forge |
| 1.6 | Result groups (Ventanas + one per entity) with **count badges** + right-hand badge (D12); navigate-to-record | forge |
| 1.7 | Shortcut footer `↑ ↓ Navegar · ↵ Abrir · ESC Cerrar` | forge |
| 1.8 | Declare `window.search` for the **seven** D2-rev specs | forge |

### Part 2 — Removable per-window scope
| # | Task | Repo |
|---|---|---|
| 2.1 | `Buscar en` section: scope pill, rendered only when scoped (D11) | forge |
| 2.2 | `Filtrar ventanas` pill + checkbox list (**multi-select**, D6) | forge |
| 2.3 | Seed scope from `CurrentWindowContext`; re-query on change/clear | forge |
| 2.4 | Multi-valued `scope=` plumbed through hook → endpoint | forge / go |
| 2.5 | i18n keys in both locales | forge |

### Part 3 — "See all results" page (D3, confirmed)
| # | Task | Repo |
|---|---|---|
| 3.1 | `limit`/offset support on `/sws/neo/search` | go |
| 3.2 | `/search` route + page shell | forge |
| 3.3 | Paginated/grouped full results, scope state reused | forge |
| 3.4 | "See all results" row at the foot of the panel, linking to `/search` | forge |

### Part 4 — Búsquedas recientes (D7-rev, D9)
| # | Task | Repo |
|---|---|---|
| 4.1 | `Búsquedas recientes`: `localStorage` store (D9), render, eviction | forge |

> `Sugerencias` is **not** in this task — see D7-rev and §12.

### Cross-cutting
| # | Task |
|---|---|
| X.1 | Vitest: hook merge/debounce/abort, scope pill + checkbox list, result groups, recientes store |
| X.2 | Playwright (mocked, per `docs/e2e-testing-guide.md`): type → record → detail; scoped vs unscoped; see-all-results |
| X.3 | JUnit for `/neo/search`: access filtering, fan-out cap, empty `q`, unknown scope |
| X.4 | Docs: `ui-customization.md`, `decisions-reference.md`, `neo-headless.md` §4.x |

## 7. Sequencing
```
1.1 → 1.2 → 1.3 ─┬→ 1.4 → 1.5 → 1.6 → 1.7 → 1.8   (Part 1 — shippable alone)
                 ├→ 2.1 → 2.2 → 2.3 → 2.4 → 2.5   (Part 2 — scope)
                 ├→ 3.1 → 3.2 → 3.3 → 3.4         (Part 3 — "ver todos")
                 └→ 4.1                            (Part 4 — recientes)

4.1 depends only on 1.5 (the panel), not on the endpoint.
Sugerencias ...................................... SEPARATE JIRA (D7-rev, §12)
```
No blocking prerequisite: the index audit that used to gate this is gone (D5).
1.5 (popover + input) is now on Part 1's critical path.

## 8. Risks
- **R1 — Fan-out latency: ACCEPTED, not mitigated by indexing (D5).** Each
  keystroke is **~7** full scans (D2-rev, §4.1). Accepted on the grounds of few tenants and
  small datasets. Still cheap to bound client-side, and we do: debounce,
  minimum term length, per-entity cap, abort in-flight requests. Revisit
  backend-side when data volume grows — tracked as accepted debt (§11).
- **R2 — Route derivation.** A record hit needs a working detail URL per window;
  a wrong `route` is a dead result. Mitigation: validate via a pipeline rule.
- **R3 — Regressing window search.** Mitigation: X.2 covers the existing path first.
- ~~**R4** Figma unresolved for magnifier placement~~ → resolved by D10.

## 9. Decisions taken

- **D0 — Registry location.** Served by NEO, not bundled client-side, so role
  and entity access apply automatically.
- **D1 (rev. after Figma) — Scope representation.** A removable **pill in a
  dedicated `Buscar en` section** (not inside the input), with the scope carried
  as a separate `scope=` request parameter. *Not* a GitHub-like `entity:contacts`
  text token — no query parsing, no syntax for the user to learn. The GitHub
  reference is about the removable label, not the syntax.
- **D2 (rev. after Figma) — Iteration-1 specs.** Sales and purchase are
  **separate specs**, as the Figma's checkbox list shows. Seven in total:
  `contacts`, `sales-invoice`, `purchase-invoice`, `sales-order`,
  `purchase-order`, `product`, `goods-shipment`. ⇒ **~7 `handleSimSearch` calls
  per keystroke** on the full-scan path (D5) — the client-side bounds in R1 carry
  more weight than at five.
- **D3 (confirmed) — "See all results" is in.** It leads to a **new page**,
  built deliberately simple in this iteration and improved later: a plain ranked
  list at `/search` (grouped by entity, paginated, same scope state). Its own
  filtering and sorting stay deferred to a separate task.
- **D4 (rev. after Figma) — Search surface.** ~~Reuse the `CommandDialog`, do not
  touch the top bar.~~ The design anchors the panel to the bar, so: **keep cmdk's
  primitives and keyboard handling, swap the centered `Dialog` for a `Popover`
  anchored to the bar, and turn the top-bar `<button>` into a real `<input>`.**
  The component and its a11y/keyboard behaviour survive; only the container and
  the trigger change.
- **D5 — No DB optimization in this task.** No trigram indexes, no triggers, no
  new DB objects. We ship on `SimSearch`'s full-scan fallback path and accept the
  cost: few tenants, little data. Optimization will be done backend-side later by
  other means. This keeps the task out of data-fix / `update.database`
  distribution territory entirely.

- **D6 — Scope is multi-valued.** The `Filtrar ventanas` checkbox list lets the
  user search several entities at once. `scope=` becomes comma-separated. The
  server-side fan-out already loops entities, so the incremental cost is small.
- **D7 (rev.) — Figma sections adopted, minus Sugerencias.** In: **Búsquedas
  recientes**, the **shortcut footer**, the **per-group count badges**.
  **Out: `Sugerencias` → deferred to its own Jira task.** Two reasons, and the
  second is the important one:
  1. Its source was never defined by the design (the old O2).
  2. **It would duplicate a filter the window already offers.** A row like
     "Facturas vencidas este mes" is a preset filter, and the windows already
     have a filter panel + `AdvancedFilterBuilder` that expresses exactly that.
     Whether a second entry point to it is *useful* is a product question worth
     evaluating on its own, not a given.
  **And it does not match what this search is for:** the search bar exists to
  find *one particular record*, not to browse a filtered set.
- **D8 — Row kebab `⋮` omitted.** The Figma draws it on every row but never
  defines its actions. Not rendered in this iteration; documented as a known
  divergence from the design rather than guessed at.
- **D12 — Right-hand badge.** Record result rows → the record's identifying
  code (`documentNo`, falling back to `searchKey`). Recientes rows → the window
  name. Different by design, because only the results list has a group header
  naming the entity. The per-spec `search` descriptor therefore needs a
  **`badgeField`** alongside `titleField`.
- **D10 — No per-window magnifier.** The `Buscar en` scope pills are what
  restores per-window search; no separate magnifier icon is added to the top bar.
- **D11 — Unscoped state has no pill.** A pill appears only when a scope is
  active. Searching all windows renders no pill, just `Filtrar ventanas`.
- **D9 — `Búsquedas recientes` persist in `localStorage`.** Key
  `sf.recentSearches`, entries `{term, specName, label, ts}`, cap ~10, oldest
  evicted. No backend work. Accepted trade-off: not portable across browsers or
  devices.

## 10. Still open
- ~~**O1** per-window magnifier~~ → **decided (D10): there is none.** The
  `Buscar en` pills *are* the per-window scoping mechanism the ticket asks to
  restore. No separate magnifier icon is added to the top bar.
- **O2** The right-hand badge is the **entity name** in Recientes/Sugerencias but
  a **document number** in results. Intentional, or a design slip?
- ~~**O2** right-hand badge inconsistency~~ → **decided (D12).** In a **record
  result** row the badge shows the record's **identifying code** — document
  number where the entity has one, `searchKey` otherwise (Products, Contacts).
  The group header already names the entity, so repeating it per row would be
  redundant. In **Búsquedas recientes** the badge keeps showing the **window
  name**, because there is no group header there to carry it.
- ~~**O3** `Todas las ventanas ✕` semantics~~ → **decided (D11): searching every
  window means NO pill at all.** The pill is rendered only when a scope is
  active; clearing it returns to the unscoped state, which shows just the
  `Filtrar ventanas` control. The Figma's `Todas las ventanas ✕` pill is not
  built as drawn.

## 11. Accepted debt

**Search fan-out runs on a full-scan path (D5).** Five entities × a per-row
`etcotp_sim_search` call, per keystroke. Explicitly accepted by the product owner
on the grounds of low tenant count and small datasets; not a review finding.

- **Trigger to revisit:** noticeable input latency, or the first tenant with a
  large `c_bpartner` / `c_invoice`.
- **Intended fix:** backend-side, not by adding indexes/triggers in this task.
- **Bounded client-side meanwhile:** debounce, minimum term length, per-entity
  result cap, in-flight abort.
- **Follow-up:** register against the feature flag per the `feature-debt` policy
  when the flag for this feature is created.

## 12. Deferred to a separate Jira task

**`Sugerencias` section (D7-rev).** The ✨ rows in the Figma — "Facturas vencidas
este mes", "Contactos sin actividad 90d", "Pedidos pendiente de envío".

- **Why deferred, not dropped:** the design draws it, so it is a real design
  intent; it just is not *this* task's job.
- **What must be settled first:** whether a preset-filter shortcut in the search
  panel adds anything over the window's own filter panel /
  `AdvancedFilterBuilder`, which already expresses these queries. That is a
  product call, not an implementation detail.
- **Likely shape if approved:** a label + a target window + a filter, navigating
  to the window with the filter pre-applied — cheap *if* window filters prove to
  be URL-serializable (`ListView.splitFilterParts` reads `criteria` from a
  querystring, so this looks plausible but was not verified).
- **Panel impact:** none. The panel's section layout leaves room for it, so
  adding it later is additive.
