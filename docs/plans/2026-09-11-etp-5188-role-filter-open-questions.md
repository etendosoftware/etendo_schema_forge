# ETP-5188 — Role filter on Users window: analysis and findings

Jira: https://etendoproject.atlassian.net/browse/ETP-5188
Status: **implementation complete, live-verified (including post-`main`-merge
regression check on 2026-09-16) — ready for Review → QA → Docs.** See
[Final implementation](#final-implementation-2026-09-16) at the bottom for the
shipped design; everything above it is the investigation history that led
there (kept for the record, several conclusions below were later revised —
follow the final section, not the inline "Conclusion" notes in each point).

## Bug summary

Navigating from the "Roles" page to the "Usuarios" (Users) window with a role
prefilter (click a role card, e.g. "Finanzas") surfaces problems in the role
filter component. The user re-scoped the original 5 points on 2026-09-14 (see
below); this document reflects the current, narrowed scope, each point
live-verified against `localhost:3100` via Playwright MCP.

## Key structural fact

"Roles" is **not** a Schema Forge generated window — no `artifacts/roles/`
exists. It's a hand-built page:
- `tools/app-shell/src/pages/RolesOverviewPage.jsx`
- `tools/app-shell/src/pages/roles/RoleSummaryCard.jsx`
- `tools/app-shell/src/pages/roles/useRolesOverviewData.js`

"Usuarios" **is** a Schema Forge window (`artifacts/user/`), but the "Rol"
filter is not declared in `decisions.json` — it's entirely custom code:
- `tools/app-shell/src/windows/custom/user/UserHeaderTable.jsx`
- `tools/app-shell/src/windows/custom/user/RoleFilterControl.jsx`
- `tools/app-shell/src/windows/custom/user/RoleChipsCell.jsx`

## Point-by-point findings (2026-09-14, live-verified)

### Point 1 — Active filter chip shows raw role ID instead of name

**REOPENED 2026-09-16 — confirmed real, reproducible bug. The 2026-09-14
"RESOLVED" correction below was itself wrong** (a false negative from testing
against `go.experimental.etendo.cloud`, where the mismatch below happens to
not manifest — coincidence in that tenant's data, not a working mechanism).

**Root cause, confirmed via live network inspection on localhost:3100
(2026-09-16):** `SFRolesOverview` (used by `RoleSummaryCard.jsx` to build the
Roles-page cards AND the `?role=<id>` navigation) and `SFSystemRoleTemplates`
(used by `RoleFilterControl`/`useUserRoleGridData`/`useRolesCatalog` to build
the label catalog and to filter via the `assignments` map) return **two
different ids for the same logical role**:

| Source | "Finance" role id |
|---|---|
| `SFRolesOverview` (`/sws/neo/rolesoverview`) | `127AE77FE2994067B7FE6495FC21D51E` |
| `SFSystemRoleTemplates` (`/sws/neo/systemroletemplates`) | `B88A34B5D1874F8685FA6F3C3A609412` |

Clicking the "Finanzas" card navigates to `/user?role=127AE77FE2994067B7FE6495FC21D51E`
(the `SFRolesOverview` id) — but `RoleFilterControl`'s `roles`/`labelFor` and
`UserHeaderTable`'s `assignments` map are both keyed on the
`SFSystemRoleTemplates` id space. The `SFRolesOverview` id has no entry in
either, so: the chip falls back to the raw id (no name to resolve), and the
`filteredData` membership check (`assignments[userId].includes(roleFilter)`)
never matches anything, even for a user who genuinely holds that role — hence
"Sin registros aún" despite the Roles page correctly reporting 1 user.

**`RoleSummaryCard.jsx`'s own doc comment — "the same id space `RoleFilterControl`
already filters by" — is factually wrong** whenever a tenant's `SFRolesOverview`
and `SFSystemRoleTemplates` ids for the same role don't coincide (as on this
local environment). This was never actually verified when written; it happened
to hold on `go.experimental.etendo.cloud`'s data, which is why testing there
gave a false all-clear.

**Not caused or touched by the ETP-5188 Points 2/3/4/5 fix** (verified: none of
that diff touches `RoleSummaryCard.jsx`, `rolesApi.js`, or either fetch
function) — this is a pre-existing, independent bug in the id-matching between
the two webhooks, coincidentally masked wherever the two id spaces happen to
line up.

**Fix options (need a product/scope decision, not yet chosen):**
1. Change `RoleSummaryCard.jsx` to navigate using the `SFSystemRoleTemplates` id
   instead of the `SFRolesOverview` id — only viable if `SFRolesOverview`'s
   response can be made to expose (or already secretly carries) a link to the
   corresponding template id; today's response has no such field.
2. Match the two catalogs by role **name** on the frontend (fragile: breaks if
   a tenant renames a role, or if two roles share a display name) to build an
   id-translation table between the two spaces.
3. Backend fix in `com.etendoerp.go`: make `SFRolesOverview` and
   `SFSystemRoleTemplates` agree on one id per role (real fix, but cross-repo
   and likely a separate ticket/subtask).

Previous incorrect note (kept for the record, superseded by the above):
~~RESOLVED — earlier "still broken" finding in this doc was a false positive
caused by thin local seed data, corrected 2026-09-14.~~

Initial local test (localhost:3100, 3 seed users) seemed to show a real bug:
clicking "Finanzas" produced a raw-UUID chip and an empty result set, while
"Administrador" worked correctly — which read as an id-scheme mismatch
between `SFRolesOverview` (tenant-scoped ids, used by `RoleSummaryCard`
navigation) and the template+admin catalog `useUserRoleGridData` builds for
`RoleFilterControl`.

The user then live-tested the same flow on `go.experimental.etendo.cloud`
(richer dataset, 75 users) and got the correct result: chip labeled
"Finanzas", and the grid correctly showing every user actually holding that
role (several with multiple role chips). Re-reading the code confirms this
is expected:
- The non-admin filter branch in `UserHeaderTable.jsx`'s `filteredData`
  matches against the bulk `assignments` map (`SFUserRoleAssignments`,
  real `AD_Role_Inheritance`-backed role composition) — **not**
  `Default_Ad_Role_ID`.
- `RoleSummaryCard.jsx`'s own doc comment explicitly asserts it navigates
  in "the same id space `RoleFilterControl` already filters by" — this is a
  deliberate, documented invariant, not an accident.
- My local "Finance Tester" seed user had `Default_Ad_Role_ID = Finanzas`
  but no real composed-role assignment — which is exactly why its own
  "Roles" chip column already showed "—" even *before* filtering. The Roles
  page's "1 Usuarios" count for Finanzas almost certainly comes from a
  different source (`SFRolesOverview`'s own count) than what
  `SFUserRoleAssignments` exposes, so the two disagreed locally for reasons
  unrelated to this filter's code — a local data-seeding gap, not a product
  bug. `RoleFilterControl.jsx:46-55`, `RoleSummaryCard.jsx:22-37`,
  `RoleChipsCell.jsx:89-127`, `UserHeaderTable.jsx` (`filteredData`).

**Conclusion:** no code fix needed for Point 1. Treat as verified-working
based on the experimental live check with real data.

### Point 2 — "Todos los roles" quick filter mispositioned

**Confirmed still broken**, matches the user's screenshot comparison to
Purchase/Sales Invoice ("Todos los estados" sits immediately left of the
"Filtros" button in the same toolbar row).

Live snapshot on `/user`: "Filtros" lives in the top toolbar row alongside
"Ordenar por" / "Actualizar" / "Nuevo usuario". "Todos los roles" renders in
a **separate lower region**, directly above the table — not in the toolbar
row at all.

**Root cause (confirmed):** `UserHeaderTable` renders `RoleFilterControl`
inside its own wrapper div (the region that also holds the table), not
inside `ListView`'s main toolbar row (`ListFilterBarSection`) where
`AdvancedFilterBuilder`'s "Filtros" trigger and Purchase/Sales Invoice's
"Todos los estados" both live. `UserHeaderTable.jsx:216-222` vs
`ListView.jsx` toolbar row.

**Fix direction:** move `RoleFilterControl` out of `UserHeaderTable`'s own
markup and into the toolbar row `ListView` renders, immediately to the left
of the "Filtros" button — mirroring how Purchase/Sales Invoice's own quick
status filter is wired. Needs to find how the invoice window injects its
quick filter into that exact toolbar slot and replicate the same mechanism
for Users' role quick filter.

### Point 3 — "Rol por Defecto" appears in advanced filter's field list

**Confirmed still present**, user's instruction is simply to remove it.

Live test: opening "Filtros" → field-selector combobox lists: Nombre, Correo
electrónico, Activo, **"Rol por Defecto"**. Confirmed present.

**Root cause:** `UserHeaderTable`'s custom `roleColumn` declares
`column: 'Default_Ad_Role_ID'`, `filterMode: 'identifier'` (added in ETP-4906,
`UserHeaderTable.jsx` — see commit `5644ee5fa`, deliberate at the time: the
comment there says `filterMode: 'identifier'` was added specifically "to
restore the identifier picker in the advanced filter"). This makes the field
show up in `AdvancedFilterBuilder`'s field list as "Rol por Defecto" (the
column's native AD label, since `labelOverrides` set on
`UserHeaderTable`/`useUserRoleGridData` don't reach `ListView`'s separate
`AdvancedFilterBuilder` instance — `ListView.jsx:394,460-463`).

**Fix per user's explicit instruction:** simply remove this column from the
advanced-filter's field list — do not silently keep exposing
`Default_Ad_Role_ID` there. Simplest correct fix: drop `filterMode:
'identifier'` from `roleColumn` (or otherwise exclude it from
`filterColumns`) so `isFilterableColumn` no longer offers it. This is
independent from point 5 (a new dedicated "Rol"/"Sin rol" filter, not this
FK).

### Point 4 — No partial search / autocomplete in Filtros avanzados → campo Rol

**Not a regression — the underlying picker/search already works, but is
gated behind an operator choice that isn't obvious.** User's QA (Valeria)
specifically means the search box inside "Filtros avanzados" → campo Rol
(confirmed via clarifying question), not the "Todos los roles" quick filter.

Live test: field = "Rol por Defecto", operator = **"Contiene"** (the
default/first-listed operator) → renders a **plain text input**, no
autocomplete. This is very likely what Valeria tried and judged as "missing".

But operator = **"Es"** (or "No es") → renders a **"Seleccionar valor"**
button that opens a **"Selector de Rol por Defecto"** dialog with a live
"Buscar" search box. Typing "Fin" live-filtered the option list down to just
"Finance" — full server-backed search/autocomplete works correctly under
this operator.

**Git-history check (per user's explicit request to check for a
regression):** traced `AdvancedFilterBuilder.jsx`'s `TEXTUAL_IDENT_OPS`
constant (the thing that keeps `iContains`/`Contiene` on plain text instead
of the picker) back through history in both `schema_forge_core` and this
repo's pre-split history. It was introduced **at the same time** the whole
`AdvancedFilterBuilder.jsx` component was created (`ETP-3788`, "Improve
filtering", 2026-04-24) — the component never had a version where "Contiene"
opened the picker. The Rol field itself (`filterMode: 'identifier'`) was
wired in later by `ETP-4906` (2026-08-14), and its own commit message
explicitly documents `filterMode: 'identifier'` as being added *specifically
to enable* the picker — always under the array-mode operators, same as every
other identifier field in the app. **No commit removes search from this
screen; it never behaved differently.** Valeria's "existía y desapareció" is
most likely a mix-up with a different filter (the quick-filter
"Todos los roles" dropdown, which indeed has never had search — see Point 2's
component, `DistinctValuesFilter`) or a UX discoverability issue, not a
regression in this component.

**Conclusion / fix direction:** this is a genuine UX bug (the working search
is hidden behind "Es"/"No es", while the default/most-obvious operator
"Contiene" looks broken), not a backend regression. Candidate fixes to weigh
with the user:
  - Make "Es" (or a dedicated "Rol" quick affordance) the default/first
    operator offered for this field, so the picker is what people find first, or
  - Keep operators as-is but make the picker's existence more discoverable.

This should probably be addressed together with Point 3's removal and
Point 5's new option, since all three touch the same field/UI area.

### Point 5 — No "Sin rol" option

**Confirmed: genuinely new, not a regression** (per user's own framing).
No sentinel "none" value exists anywhere in the identifier picker or filter
list today. Orphaned i18n keys already exist and are unused: `noRoleAssigned`,
`noRolesAssigned`, `noRole` (`es_ES.json:17675,17677,20075`) — suggests this
was planned once but never finished.

**Fix direction:** add a synthetic "Sin rol" sentinel option, most likely via
the existing `isNull` operator already listed for identifier mode
(`AdvancedFilterBuilder.jsx:46`) — i.e. surface "Sin rol" as a friendly
preset that maps to `Default_Ad_Role_ID IS NULL` (or, if Point 1's fix moves
this to real N:M role membership, to "no rows in `AD_User_Roles`"). Needs a
decision on which role concept this new field/option should represent (see
Open Questions below), since it's tied to Points 1 and 3.

## Scope is now frontend-only (updated after Point 1 correction)

With Point 1 confirmed working (no backend/id-catalog fix needed), the
remaining work is entirely frontend, entirely inside
`tools/app-shell/src/windows/custom/user/` +
`schema_forge_core`'s `AdvancedFilterBuilder.jsx`/`gridQuery.js`. No
`com.etendoerp.go` change and no new `NeoHandler` are needed for any of the
4 remaining points.

**Role concept for Point 5's "Sin rol":** should reuse the exact same
`assignments` map (`SFUserRoleAssignments`, via `useUserRoleGridData`) that
Points 1/2 already filter by — i.e. "Sin rol" = a user with no entries in
`assignments` (and not the admin role either), not a
`Default_Ad_Role_ID IS NULL` check. This keeps one single, already-correct
role concept across the whole feature instead of introducing a second,
FK-based one just for this new option.

## Proposed delivery

Single delivery under ETP-5188 (no phasing needed now that everything is
frontend-only and low-risk):
- Point 2 — move "Todos los roles" into the main toolbar row, left of "Filtros".
- Point 3 — remove "Rol por Defecto" from the advanced-filter field list.
- Point 4 — UX fix so the existing working picker isn't hidden behind a
  non-obvious operator choice.
- Point 5 — add "Sin rol" as a new quick-filter/advanced-filter option, built
  on the existing `assignments` map (see above), not `Default_Ad_Role_ID`.

## Next step

Investigation complete and live-verified (including the Point 1 correction
above, live-confirmed by the user on `go.experimental.etendo.cloud`).
Waiting on the user to confirm this single-delivery scope (Points 2, 3, 4,
5) before dispatching Developer.

---

## Final implementation (2026-09-16)

Scope grew twice after the section above was written: the user later pasted
the full verbatim Jira ticket (adding three concrete Casos de Prueba — CP-1,
CP-2, CP-3 — that require a real "Rol" field **inside** Filtros avanzados,
not just the quick filter), and Point 1 was reopened and root-caused as a
genuine bug (not "no fix needed" as concluded above). This section is the
authoritative final state.

### Point 1 — final resolution: data migration, not a code fix

Confirmed root cause (see the 2026-09-16 REOPENED note on Point 1 above): a
tenant that hasn't migrated off its legacy per-client role rows has its own
"Finance"/etc. role reported by `SFRolesOverview` (`roleSource: "tenant"`)
under a **different id** than the fixed system-template id
`SFSystemRoleTemplates`/the Users-grid catalog index by. Not a Schema Forge
or Etendo Go product bug — a per-tenant data-migration gap, already covered
by two existing tenant data-fixes:

- `cli/src/data-fixes/sql/20260826T120000Z__R26-tenant-owner-and-personal-role-retrofit.sql`
- `cli/src/data-fixes/sql/...R27-deactivate-r16-duplicate-roles.sql`

R26 has a documented exclusion (`isReusablePersonalRole`): a user whose
current default role is exclusively assigned to them (0/1 `AD_User_Roles`
rows) is treated as already-reusable and skipped — exactly the shape of a
lone test user, so R26 alone did not fix the local "Finance Tester" seed.
Fixed for that tenant by: nulling `Default_Ad_Role_ID` for the affected user,
then composing the system Finance template via the "Asignar roles" UI (which
mints a genuine new personal role, `UserRoleCompositionService`), then
letting R27 deactivate the now-zero-usage legacy role. Verified via SQL
before/after and via the live grid (chip now shows "Finanzas", filter now
returns the user).

**No frontend or backend code change was needed or made for Point 1.** Any
tenant still on the legacy per-client role shape needs the same data-fix
run (`make data-fixes CLIENT=<id> FIX=R26,R27`), independent of this PR.

### Points 2 + 3 + 4 — toolbar position, remove FK field, fix hidden search

- **Point 2**: `RoleFilterControl` moved out of `UserHeaderTable`'s own
  markup into `ListView`'s toolbar row via a new `Table.ToolbarQuickFilter`
  static-property convention (mirrors `AssignTemplateRolesControl.inlineInHeaderCard`).
  New file `RoleQuickFilterToolbarSlot.jsx` owns the `role` URL-param
  read/write; `UserHeaderTable`'s own `filteredData` now reads the same
  param live (was a one-time mount initializer).
- **Point 3**: `roleColumn` (`Default_Ad_Role_ID`) now `filterable: false` —
  no longer offered in the advanced-filter field list.
- **Point 4**: superseded by CP-1/CP-2 below — rather than just making the
  existing picker more discoverable, a **new dedicated "Rol" field** was
  added to Filtros avanzados (`roleFilterColumn`, `filterOnly: true`,
  `filterMode: 'enumLabel'`), decoupled entirely from the removed FK field.

### CP-1 / CP-2 / CP-3 — the new "Rol" advanced-filter field

New synthetic column `roleFilterColumn` in `UserHeaderTable.jsx`:
`filterMode: 'enumLabel'`, `filterOnly: true` (renders in the filter builder
only, never as a real grid column — new generic `filterOnly` flag consumed
by `isLineGridColumn()` in `linesColumnWidth.js`), `enumLabels` built from
the roles catalog (`buildRoleEnumLabels`) plus a `NO_ROLE_FILTER_VALUE`
sentinel labeled "Sin rol" (CP-3).

Because NEO Headless's generic `criteria=` mechanism cannot express a
collection-valued relation (`aDUserRolesList.role.id` — confirmed via a live
500 on localhost:3100), this field bypasses `criteria=` entirely:

- New per-column hook `col.toQueryParams` (symmetric to `col.buildCriteria`),
  consumed by new `extractQueryParamConditions()` in `gridQuery.js`: strips
  any condition whose column declares `toQueryParams` out of the array that
  goes into `buildAdvancedFilterCriteria`, translating it into a raw
  query-string segment appended by `ListView.jsx` instead. Confirmed
  byte-identical no-op for every window that doesn't declare `toQueryParams`
  (spot-checked live against Purchase Invoice's "Contacto" filter — CP
  "does this affect other windows?" question, answered: **no, isolated to
  Users' new Rol field**).
- Backend: `UserRoleAssignmentHandler.java` (`@Named("user")`) gained
  `applyRoleFilter()`, reading three new query params and injecting a raw
  HQL predicate via the existing `NeoCrudHelper.NEO_WHERE_PARAM` (`_neoWhere`)
  mechanism (no bind-parameter support there, so role ids are
  regex-validated — `^[A-Fa-f0-9]{32}$` — and inlined as HQL literals):
  - `RoleIds=<id,id,...>` — matches users whose `Default_Ad_Role_ID` is
    directly one of the ids, OR whose default role composes one of them via
    an active `AD_Role_Inheritance` row (CP-2: this is what makes partial
    search / multi-role composition work correctly).
  - `NoRole=true` — matches users with no active `AD_Role_Inheritance` row
    off their default role (and who aren't the client-admin role) — CP-3.
  - `RoleFilterNegate=true` — wraps the whole OR'd predicate in HQL
    `not (...)`, reusing the same two predicates above instead of inventing
    new query semantics. This is what makes all 4 advanced-filter operators
    work uniformly:

    | Operator | Query params |
    |---|---|
    | Es | `RoleIds=` and/or `NoRole=true` |
    | No es | same + `RoleFilterNegate=true` |
    | Está vacío | `NoRole=true` |
    | No está vacío | `NoRole=true&RoleFilterNegate=true` |

### Live verification performed (2026-09-15/16, localhost:3100)

- CP-1: chip/label resolution for a composed multi-role user (Finance
  Tester → "Finanzas Ventas" chips) — correct.
- CP-2: partial search "Fin" → "Finanzas" inside the Rol advanced-filter
  picker — correct (falls back cleanly to the `enumLabels` catalog since the
  backend `_distinct` call 400s for this synthetic field — expected,
  documented `DistinctEnumPicker` fallback behavior, not a bug).
- CP-3: "Sin rol" filters correctly to users with zero role composition.
- All 4 operators individually: "Es" (single + multi-select), "No es"
  (single-role negation, admin negation, multi-select negation, combined
  sentinel+role negation — hand-predicted `NOT(Sin rol OR Finanzas)` →
  GOAdmin-only, empirically confirmed exactly), "Está vacío", "No está
  vacío" — all passing.
- Cross-window isolation: Purchase Invoice's own advanced filter (a window
  that does not declare `toQueryParams`) produces a byte-identical
  `criteria=` request before/after this change.
- **Post-`main`-merge regression check (2026-09-16)**, after updating
  `feature/ETP-5188` to be current with `origin/main` (branch-target changed
  from `develop` to `main` mid-flight — see git history): re-verified on
  `localhost:3100` — "Rol" field still present with all 4 operators, "Rol =
  Finanzas" still correctly returns exactly 1 result, value-picker fallback
  catalog still renders (Sin rol, Finanzas, Ventas, Compras, Inventario,
  Administrador), and the "Todos los roles" quick filter still sits
  correctly in the toolbar row with working search. No regressions from the
  merge (`etendo_schema_forge`: clean fast-forward `f10677cbb..6e1644f69`,
  158 files, zero conflicts on the 6 files touched by this work;
  `com.etendoerp.go`: no update needed, `feature/ETP-5188` was already
  content-identical to `origin/main`).

### Files changed (final, uncommitted — left for human review per instruction)

`etendo_schema_forge`:
- `tools/app-shell/src/components/contract-ui/ListView.jsx`
- `tools/app-shell/src/lib/gridQuery.js`
- `tools/app-shell/src/lib/linesColumnWidth.js`
- `tools/app-shell/src/windows/custom/user/RoleChipsCell.jsx`
- `tools/app-shell/src/windows/custom/user/RoleFilterControl.jsx`
- `tools/app-shell/src/windows/custom/user/UserHeaderTable.jsx`
- `tools/app-shell/src/windows/custom/user/RoleQuickFilterToolbarSlot.jsx` (new)

`com.etendoerp.go`:
- `src/com/etendoerp/go/schemaforge/handlers/UserRoleAssignmentHandler.java`

### Next step

Per the user's explicit sequencing: merge → corroborate → **Review, QA,
Docs**. The corroboration step is done (see above) — proceed to Review
(Alex) next.
