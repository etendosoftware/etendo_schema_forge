# Design — Global tab ordering (`tabOrder` as a cross-group sort key) (ETP-4415)

- **Date:** 2026-08-04
- **Jira:** ETP-4415 (epic ETP-3504 — Etendo Next), relates to ETP-4402, deferred item in ETP-4565
- **Author:** Forge session
- **Status:** Design approved, not yet implemented

## Problem

`buildInitialTabs()` (`tools/app-shell/src/components/contract-ui/DetailView.jsx:807-834`)
builds the detail view's tab strip by concatenating three groups in a **fixed, non-configurable
order**:

```
secondaryTabs (AD/classic tabs)  →  lines tab  →  custom tabs (customPanelTabs, attachments, extraTabs, relatedDocuments)
```

Each group has its own, incompatible ordering mechanism:

1. `secondaryTabs` — sorted **among themselves** by `tabOrder` (`decisions.json →
   window.secondaryTabs.<tab>.tabOrder`), resolved at **generation time** in
   `resolveSecondaryTabDefs` (`schema_forge_core/cli/src/generate-frontend.js:1843`, sort at
   line 1879). The resolved order is baked into the generated `secondaryTabs` prop array;
   `tabOrder` itself is discarded and never reaches the runtime component.
2. The **lines tab** — positioned by `window.detailTabIndex`, a splice index into the
   secondaryTabs array (`insertLinesTab`, `tools/app-shell/src/components/contract-ui/
   detailViewHelpers.jsx:447-454`). No value → `unshift` (front of the list).
3. **Custom tabs** (`customPanelTabs`, `attachments`, `relatedDocuments`, `extraTabs`) — always
   appended **after** groups 1 and 2, in a fixed emission order
   (`getCustomTabItems`, `generate-frontend.js:1380-1399`). `tabOrder` is not read at all here.

**Consequence:** a classic tab can never render after a custom tab. Concretely (verified against
current `decisions.json` for both windows — the ticket's original body described Producto as
using a separate `customTabsAfterBottom: true` strip, but that is **stale**; neither window sets
`customTabsAfterBottom` today, so both hit the same underlying problem):
- **Producto** (`artifacts/product`) — Contabilidad (`secondaryTabs.accounting`) renders in the
  same unified strip as Precio (`customPanelTabs.pricing`) and Attachments, but always **first**,
  because group 1 always precedes group 3.
- **Activo** (`artifacts/assets`) — Contabilidad (`secondaryTabs.assetAcct`) renders first in the
  unified strip, before Plan de amortización (`customPanelTabs.amortizationPlan`) and Attachments,
  for the same reason.

Only `placement: 'tab'` items in the `customTabs` prop enter this strip at all (filtered into the
internal `tabCustomTabs` in `DetailView.jsx:2669`) — `customPanelTabs`, `extraTabs`, and
`attachments` all set `placement: 'tab'` (`generate-frontend.js:1380-1399`, `pushAttachmentsTab`
at line 1316-1323), but the `related` (relatedDocuments) item does not, so it never participates
in this strip today regardless of this ticket (see "Out of scope").

ETP-4402 left both windows "as is" rather than force a fix, precisely because of this limit.
ETP-4565 explicitly deferred its own Producto tab-order item to this ticket.

## Decisions (locked during brainstorming, 2026-08-04)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Default-tab side effect | **Document only** — no new `defaultTab` key | `activeTab` stays `useState(0)`; whichever tab a window's sort puts first opens by default. This only changes for windows that opt into reordering. Adding a decoupled `defaultTab` key is unscoped extra surface (YAGNI) until a concrete window needs the default tab to differ from the first-rendered one. |
| `customTabsAfterBottom` + `tabOrder` | **Incompatible — validate/warn** | When `customTabsAfterBottom: true`, custom tabs render in a separate strip below `bottomSection`, entirely outside the sorted array — any `tabOrder` on them is a silent no-op. A new pipeline-validator rule makes this visible instead of a footgun. |
| Window rollout | **Both Producto and Activo, in this ticket** | Producto matches the ticket's own acceptance test. Activo's fix is a one-line `tabOrder` value once the mechanism exists — no reason to split it into a follow-up (unlike ETP-4610, which was split from ETP-4529 for an unrelated UX reason). |
| Where the sort runs | **Runtime, inside `buildInitialTabs()`** (not at generation time) | Matches the platform team's Aug-4 proposal. Keeps ALL positioning logic in one place; the generator's job becomes "pass `tabOrder` through unchanged" for every group instead of doing group-specific sorting. |
| `relatedDocuments` per-item `tabOrder` | **Out of scope for this ticket** | Its `getCustomTabItems` entry never sets `placement: 'tab'` (`generate-frontend.js:1382-1384`), so it already renders outside `tabCustomTabs`/`buildInitialTabs` entirely today, not merely lacking a `tabOrder` slot. It's also a plain boolean in `decisions.json` with no per-item config object. Neither Producto nor Activo use it. Bringing it into the sorted strip is a fast follow-up if a real window needs it — not speculative generality now. |

### Scope correction (found during brainstorming)

The ticket's Aug-4 update states the runtime component is `DetailView.jsx` "de `app-shell-core`"
(i.e. in `schema_forge_core`). Verified against current code: **it is not** — `buildInitialTabs`
only exists in `schema_forge`'s `tools/app-shell/src/components/contract-ui/DetailView.jsx`.
Only the generator (`generate-frontend.js`) is genuinely in `schema_forge_core`. This is
therefore a **two-repo change**. Both repos gate `/tools/app-shell/` and `/cli/` identically in
`CODEOWNERS` (`@sebastianbarrozo` / `@valenvivaldi`), so the review requirement the ticket
anticipated still applies — only the file's location was wrong.

## Architecture — the weighted sort

Every tab entry gets a `(weight, insertionIndex)` sort key inside `buildInitialTabs()`.
`insertionIndex` is the stable tiebreaker — JS `Array.prototype.sort` is stable (ES2019+), so
ties fall back to today's concatenation order. Defaults are chosen so that **a window
declaring no `tabOrder` anywhere renders identically to today**.

| Group | Default weight | Override |
|---|---|---|
| `secondaryTabs` | `tabOrder ?? 99` (unchanged default) | `window.secondaryTabs.<key>.tabOrder` |
| lines tab | `-1` when neither override is set (reproduces today's `unshift`-to-front) | new `window.detailTabOrder` (preferred, takes precedence); legacy `window.detailTabIndex` (deprecated alias — converted to an equivalent weight, see below) |
| `customPanelTabs` / `extraTabs` items | `999` (sorts after secondaries+lines, same as today) | per-item `tabOrder` on the entry |
| `attachments` (object form) | `999` | `attachments.tabOrder` |
| `relatedDocuments` | `999`, fixed | — (see "out of scope" above) |

Final tab list: `[...secondaryEntries, linesEntry, ...customEntries]` filtered to **visible**
tabs only (custom tabs can self-hide via `onVisibilityChange(false)` →
`customTabVisibility`, already handled at line 828 today — the filter must run before the sort,
not after, so a hidden tab's weight never affects tiebreak-by-index against a visible neighbor),
then `.sort((a, b) => a.weight - b.weight || a.insertionIndex - b.insertionIndex)`.

### `detailTabIndex` → weight conversion (backward compatibility)

`detailTabIndex` is a splice **position** within the (already generation-time-sorted)
`secondaryTabs` array — not a weight. To preserve exact current placement without requiring
every existing window to migrate:

- If `window.detailTabOrder` is set, use it directly as the weight (new preferred path — no
  conversion needed).
- Else if `window.detailTabIndex` is a valid number `N`, derive the lines tab's weight as
  `secondaryEntries[N]?.weight - 0.5` (sorts immediately before the tab currently occupying that
  splice position; if `N >= secondaryEntries.length`, use `secondaryEntries[last].weight + 0.5`
  to keep it at the end, matching today's splice-past-the-end no-op-into-push behavior).
- Else (neither set) → weight `-1`, matching today's default `unshift`.

This conversion runs **inside `buildInitialTabs()`**, using the `secondaryTabs` prop's
per-tab `tabOrder` (now passed through by the generator — see below), so no generator-side
index math is needed.

### `customTabsAfterBottom` incompatibility

New pipeline-validator rule **F21** (`schema_forge_core/cli/src/validate-pipeline.js`, fixtures
in `cli/test/fixtures/pipeline-validator/`, tests in `cli/test/validate-pipeline.test.js`):
flags any window where `window.customTabsAfterBottom === true` **and** any of
`customPanelTabs[].tabOrder`, `extraTabs[].tabOrder`, or `attachments.tabOrder` is set — those
tabs never enter the sorted array, so the `tabOrder` is a silent no-op. Documented as a new row
in this repo's `docs/pipeline-validator-reference.md` (the canonical rules table — a rule that
isn't there doesn't exist, per this repo's own policy).

## Changes by repo

### A) `schema_forge_core` — generator (requires publishing `@etendosoftware/schema-forge-cli`)

1. **`cli/src/generate-frontend.js` — `resolveSecondaryTabDefs`** (line 1843): add
   `tabOrder: cfg.tabOrder ?? 99` to the object returned per tab (currently computed only to
   sort, then discarded) so the resolved value reaches the generated `secondaryTabs` prop array
   and is visible to `buildInitialTabs()` at runtime.
2. **`cli/src/generate-frontend.js` — `getCustomTabItems`** (line 1380): read and emit
   `tabOrder` into each generated item literal for `customPanelTabs` entries, `extraTabs`
   entries, and the attachments tab (when `attachments` is the object form); default to `999`
   when absent so unmodified windows keep today's rendering.
3. **`cli/src/validate-pipeline.js`** — new rule F21 (see above).
4. **Generator tests / fixtures** — cover: `tabOrder` passthrough on `secondaryTabs` and each
   custom-tab group; F21 firing on `customTabsAfterBottom: true` + a custom `tabOrder`; F21
   staying quiet when `customTabsAfterBottom` is unset/false.

### B) `schema_forge` — runtime sort + window rollout (no publish; ships from this repo)

5. **`tools/app-shell/src/components/contract-ui/DetailView.jsx` — `buildInitialTabs()`**
   (lines 807-834): replace the fixed three-group concatenation with the single weighted sort
   described above, including the `detailTabIndex` → weight conversion and the
   visible-tabs-only filter run before sorting.
6. **`tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx` — `insertLinesTab`**
   (lines 447-454): superseded by the new weight-based placement; keep or retire depending on
   whether any call site still needs the old splice behavior once `buildInitialTabs` no longer
   calls it directly (implementation-time decision, not a design fork — behavior must stay
   identical either way).
7. **`artifacts/product/decisions.json`** — no `customTabsAfterBottom` change needed; it is
   already unset/`false` (verified in the generated `ProductPage.jsx`, no such prop is emitted
   today), so Precio/Attachments already share Contabilidad's strip. The only change is
   `secondaryTabs.accounting.tabOrder: 1000` (sorts Contabilidad after Precio/Attachments,
   whose custom-tab default weight is `999`). Then `make regen ONLY=product`.
8. **`artifacts/assets/decisions.json`** (the "Activo" window; spec name confirmed against the
   artifact directory, not guessed) — same fix, same reason:
   `secondaryTabs.assetAcct.tabOrder: 1000` (sorts Contabilidad after Plan de amortización/
   Attachments). Then `make regen ONLY=assets`.
9. **`docs/ui-customization.md`** and **`docs/decisions-reference.md`** — document
   `tabOrder` as a cross-group key (not just intra-`secondaryTabs`), `window.detailTabOrder`,
   the `detailTabIndex` deprecation, and the documented default-tab side effect.
10. **`docs/pipeline-validator-reference.md`** — add the F21 row.
11. **Tests (Vitest, delegated to Tester)** — `buildInitialTabs()` unit coverage: mixed-group
    sort, tie-break by insertion order, `detailTabIndex` conversion, hidden-tab exclusion before
    sort; regenerated-contract assertions for Producto and Activo (Contabilidad sorts last in
    both).

## Testing strategy

- **Core:** generator fixtures asserting `tabOrder` passthrough for every group, and F21
  fires/stays-quiet as specified above.
- **schema_forge:** Vitest for `buildInitialTabs()` covering the sort algorithm directly
  (cheaper and more precise than only asserting through full component render); assertions on
  the regenerated Producto/Activo contracts and generated JSX for tab order.
- **Manual acceptance test (per the ticket):** open Producto — Contabilidad renders after
  Precio and Attachments in the existing unified strip. Open Activo — Contabilidad renders
  last, after Plan de amortización and Attachments. Every other existing
  window (none of which declare `tabOrder` outside `secondaryTabs`) renders with **exactly**
  today's tab order and default active tab.

## Rollout

1. PR in `schema_forge_core` → publish `@etendosoftware/schema-forge-cli` → bump the version in
   this repo's `package.json`.
2. PR in `schema_forge` (`buildInitialTabs()` rewrite, Producto + Activo config, docs), built
   against the newly published CLI version. Regenerate both windows.
3. Both PRs require CODEOWNERS review (`@sebastianbarrozo` / `@valenvivaldi`) regardless of
   repo, per each repo's `CODEOWNERS` gating `/tools/app-shell/` and `/cli/`.

Work targets `feature/ETP-4415` in both repos, off `epic/ETP-3504` (not `main`).

## Out of scope

- Per-item `tabOrder` on `relatedDocuments` (no config-object shape to hang it on today).
- A `defaultTab` key decoupled from render order (documented side effect instead).
- Reordering any window other than Producto and Activo — no other window today declares
  `secondaryTabs` alongside `customPanelTabs`/`extraTabs`/an `attachments` object, so no other
  window is affected by this change.
- Backend / NEO Headless — this is purely a frontend rendering-order concern.
