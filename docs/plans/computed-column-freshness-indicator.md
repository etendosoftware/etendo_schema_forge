# Proposal — Computed-column freshness indicator (clock icon + tooltip)

**Status:** proposal · **Task:** ETP-4603 (follow-up) · **Author:** Forge

## 1. Goal

Some columns are **stored computed columns** (EPL-1807): their value is materialized on
`M_Product` and refreshed out-of-band by the background queue drain
(`StoredColumnQueueProcessor`, scheduled every 5 min — see
`docs/plans/product-price-stock-stored-computed-columns.md`). Because the refresh is deferred, the
displayed value can lag reality by up to a few minutes.

We want the UI to tell the user this, unobtrusively:

- A small **clock icon** next to the **column header in the list** of every such column.
  (Scope decision: **list only** — not the form label, not KPI/detail views, for now.)
- On hover/focus, a **tooltip**: *"This value is computed in the background and may take a few
  minutes to refresh."* (Wording decision: **"a few minutes"**, not a literal "5 minutes" — the
  drain interval is config and may change.)

**Key design decision (per user):** this is **auto-detected from AD metadata**, NOT declared by hand
in `decisions.json`. We already know a column is a deferred stored-computed column by reading its
computation configuration — the indicator must "just appear" on those columns with zero per-window
configuration. A `decisions.json` override is offered only as an escape hatch (§7).

## 2. The metadata signal (what "just appears")

Each `AD_COLUMN` carries three attributes populated by EPL-1807 (verified on the eTGO product
columns, `com.etendoerp.go/src-db/database/sourcedata/AD_COLUMN.xml`):

| Attribute | eTGO value | Reference values |
|---|---|---|
| `COMPUTATION_MODE` | `S` | `N` = None · `V` = Virtual (SQL) · `S` = **Stored Computed** |
| `REFRESH_MODE` | `S` | `M` = Manual · `S` = Synchronous · `Q` = Queued |
| `COMPUTATION_FUNCTION` | `etgo_product_purchase_price` | the SQL function name |

Detection rule (the honest, precise signal):

> **A column shows the freshness indicator when `COMPUTATION_MODE = 'S'` (Stored Computed).**

Rationale:
- `V` (Virtual/SQL) columns are computed **on read** → never stale → **no** icon.
- `N` columns are not computed → no icon.
- `S` (Stored) columns are **materialized** and refreshed out-of-band (triggers + queue drain) →
  can be stale → **icon**.

`REFRESH_MODE` refines only the **tooltip wording**, not the show/hide decision:
- `Q` (Queued) → "…may take up to a few minutes to refresh." (the async-drain case)
- `S` (Synchronous) → cross-table dependencies still flow through the queue drain on PostgreSQL, and
  Oracle forces every stored column onto the async `'Q'` drain
  (`StoredColumnRecomputer.java:51-52`), so the same "background refresh" wording applies.
- `M` (Manual) → "…is refreshed manually." (future-proofing; none exist today)

## 3. Data flow — where the flag is born and where it dies

```
AD_COLUMN (COMPUTATION_MODE, REFRESH_MODE, COMPUTATION_FUNCTION)
   │  ← NEW: extractor pulls these 3 attrs
   ▼
schema-raw.json  (field carries computedMode / refreshMode)
   │  ← resolve-curated passes through
   ▼
contract.json    field →  "computed": { "mode": "stored", "refresh": "queued" }   ← emitted only when mode='stored'
   │  ← generate-contract emits the hint (truthy-only, no noise)
   ▼
app-shell (DataTable header + EntityForm label)  → <Clock/> + <Tooltip/>
```

### Contract field shape (new, additive)

Emit a compact object, only when the column is stored-computed (mirrors the truthy-only convention of
`badge`, `statusBar`, etc. in `generate-contract.js` `BASIC_FIELD_HINTS`):

```json
{
  "name": "eTGOStock",
  "apiKey": "eTGOStock",
  "visibility": "readOnly",
  "grid": true,
  "computed": { "mode": "stored", "refresh": "queued" }
}
```

Absent on every non-computed field → zero contract churn for the 99% case.

## 4. Changes by layer

> **Repo split note (`docs/repo-topology.md`):** the extractor and the generators live in
> `schema_forge_core` (published as `@etendosoftware/schema-forge-cli`); the React shell lives in
> `app-shell-core`. So most of this lands in the core repo + a package bump. This functional repo
> only re-runs `make regen` to pick up the new contract field. Files below are named at their core
> source locations.

### 4a. Extractor — `cli/src/extract-from-db.js` (core)
Add `COMPUTATION_MODE`, `REFRESH_MODE`, `COMPUTATION_FUNCTION` to the `AD_COLUMN` SELECT and carry
them into each raw field (e.g. `field.computedMode`, `field.refreshMode`). No behavior change for
non-computed columns (`COMPUTATION_MODE='N'`).

### 4b. Generator — `cli/src/generate-contract.js` (core)
Derive and emit the `computed` hint:
```js
if (f.computedMode === 'S') {
  out.computed = { mode: 'stored', refresh: mapRefresh(f.refreshMode) }; // Q→queued, S→synchronous, M→manual
}
```
`resolve-curated.js` passes the raw attrs through unchanged; the `decisions.json` override (§7) is
applied here.

### 4c. List header — `app-shell-core` `components/contract-ui/DataTable.jsx` → `renderColumnHeaderCell()`
Wrap the label with the adornment when `col.computed?.mode === 'stored'`:
```jsx
<span className="inline-flex items-center gap-1">
  {colLabel}
  <ComputedFreshnessHint computed={col.computed} />
</span>
```

### 4d. Form label — OUT OF SCOPE
The form field label is intentionally **not** adorned in this iteration (scope decision: list only).
`EntityForm.jsx` is left untouched. Easy to extend later: the same `ComputedFreshnessHint` component
drops next to `{label}` (~line 581) guarded by `f.computed?.mode === 'stored'`.

### 4e. New shared component — `ComputedFreshnessHint`
One small, generic component (built from primitives that already exist — no new deps):
```jsx
import { Clock } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useUI } from '@/hooks';

export function ComputedFreshnessHint({ computed }) {
  const ui = useUI();
  if (computed?.mode !== 'stored') return null;
  const key = computed.refresh === 'manual'
    ? 'computedFreshnessManual'
    : 'computedFreshnessQueued';
  return (
    <TooltipProvider>
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span tabIndex={0} aria-label={ui('computedFreshnessAria')} className="cursor-help text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{ui(key)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```
Accessibility: `tabIndex={0}` + `aria-label` so the hint is reachable by keyboard and screen readers,
not mouse-only.

## 5. i18n (mandatory — both locales)

Add to `tools/app-shell/src/locales/en_US.json` **and** `es_ES.json`:

```jsonc
// en_US
"computedFreshnessQueued":  "This value is computed in the background and may take a few minutes to refresh.",
"computedFreshnessManual":  "This value is computed and is refreshed manually.",
"computedFreshnessAria":    "Computed value — may be delayed"
```
```jsonc
// es_ES
"computedFreshnessQueued":  "Este valor se calcula en segundo plano y puede tardar unos minutos en actualizarse.",
"computedFreshnessManual":  "Este valor se calcula y se actualiza manualmente.",
"computedFreshnessAria":    "Valor calculado — puede estar desactualizado"
```

## 6. UX detail
- Icon: `lucide-react` `Clock`, `h-3.5 w-3.5`, muted foreground so it reads as secondary metadata,
  not an error/warning.
- Placement: right of the label, `gap-1`. In the list header it sits before the sort arrow.
- No layout shift: it's inline, tiny, and only rendered on the (few) stored columns.

## 7. Optional `decisions.json` override (escape hatch, not the default)

Auto-detection covers every case. For the rare need to force-hide (or force-show) the hint on a
specific window without touching AD, allow a per-field override that `generate-contract.js` honors:

```json
"eTGOStock": {
  "visibility": "readOnly",
  "grid": true,
  "computedHint": false   // force-hide even though AD says stored-computed
}
```
Precedence: `decisions.computedHint` (if present) wins over the auto-detected value. Documented in
`docs/decisions-reference.md`. Default (key absent) = fully automatic.

## 8. Testing
- **Generator (core, Vitest):** field with `computedMode='S'` + `refreshMode='Q'` → contract carries
  `computed:{mode:'stored',refresh:'queued'}`; `V`/`N` → no `computed` key; `computedHint:false`
  override suppresses it. (Delegate to Tester.)
- **Component (Vitest + RTL):** `ComputedFreshnessHint` renders the clock only for `mode:'stored'`,
  shows the correct i18n string per `refresh`, and is keyboard-focusable.
- **E2E (Playwright, mocked):** product **list header** for Stock shows the clock; hover reveals the
  tooltip text. (Form is out of scope — no form assertion.) Follow `docs/e2e-testing-guide.md`.
- **Pipeline validator:** `make validate-pipeline --scope=product` stays clean (additive field only).

## 9. Rollout
1. Core: extractor + generator + `ComputedFreshnessHint` + DataTable/EntityForm wiring + i18n +
   tests → publish `@etendosoftware/schema-forge-cli` and `app-shell-core`, bump here.
2. Here: `make regen ONLY=product SKIP_EXTRACT=1` (or full regen to re-extract) → the three eTGO
   columns pick up `computed` automatically → verify contract → deploy UI.
3. Docs: this plan → `docs/plans/completed/…`; add the `computedHint` override row to
   `docs/decisions-reference.md`; note the auto-indicator in
   `docs/generated-custom-windows/product.md`.

## 10. Effort
- Core (extractor + generator + component + tests): ~0.5–1 day.
- Wiring + i18n + this repo's regen/verify: ~0.5 day.
- Net: **~1–1.5 days**, entirely additive, no migration, no `decisions.json` churn for existing
  windows.

## Decisions (resolved)
1. **Tooltip wording** — ✅ "a few minutes" (not a literal "5 minutes"); the drain interval is config.
2. **Icon** — ✅ `Clock` (neutral, least alarming).
3. **Scope** — ✅ **list only**; form label and KPI/detail views deferred.
