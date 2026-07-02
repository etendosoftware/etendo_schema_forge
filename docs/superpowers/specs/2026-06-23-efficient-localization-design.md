# Efficient Localization — Build-Time Sliced Labels

**Status:** Design (approved direction)
**Date:** 2026-06-23
**Author:** Forge (brainstorming session)
**Scope:** `tools/app-shell`, `packages/app-shell-core`, `cli/src` (pipeline)

## Problem

The frontend ships two static locale dictionaries (`en_US.json`, `es_ES.json`),
~600KB each, loaded **eagerly** via `import.meta.glob('../locales/*.json', { eager: true })`
in `LocaleProvider.jsx`. Both locales are bundled into the JS even though only one is
active, and the **entire** dictionary (8000+ keys) is parsed and held in React context
even though a given window uses ~22 field labels.

Primary goal: **reduce client weight at boot.**

### Measured weight (en_US.json, 608,663 bytes total)

| Section | Bytes | % | Entries |
|---|---|---|---|
| `fields` | 350,484 | 57.6% | 3398 |
| `genericLabels` | 186,756 | 30.7% | 3647 |
| `tabs` | 25,726 | 4.2% | 533 |
| `menus` | 22,429 | 3.7% | 419 |
| `windows` | 17,086 | 2.8% | 305 |
| `ui` | 3,223 | 0.5% | 75 |
| `statuses` | 2,872 | 0.5% | 60 |

### Key findings (verified)

1. **`fields` is sliceable per window.** `contract.json` carries the AD column key on
   every field (`{"name":"businessPartner","column":"C_BPartner_ID"}`). The union of all
   columns used across the 63 windows is **685 of 3398** — i.e. ~80% of field labels are
   never referenced by any window. Average per window: **22 fields** (median 14, max 119).
2. **Field `description` is dead weight in the client.** No component reads
   `dictionary.fields[x].description`; `resolveLabel` reads only `.label`. Descriptions
   account for **123,636 bytes** (~20% of the whole file).
3. **`genericLabels` cannot be sliced.** Besides 1371 static `ui('literal')` calls there
   are many dynamic `ui(variable)` calls (`ui(cfg.labelKey)`, `ui(col.labelKey)`,
   `ui(a.label)`, …). Static analysis cannot determine which keys a window uses, so
   slicing would drop keys needed at runtime. `genericLabels` stays in the shared core.
4. **Windows are already lazy code-split.** `tools/app-shell/src/windows/registry.js`
   maps each window to `() => import('@generated/<win>/...')`. Importing a per-window
   label slice inside the generated chunk lets Vite code-split it automatically — it
   loads exactly when the window loads, no new fetch infrastructure required.
5. **`contract.json` is build-time only.** It is consumed by the generators, not fetched
   at runtime. The runtime fetches data (`/sws/neo/<spec>/data`), selectors, attachments,
   widgets — never the contract structure. So labels cannot piggyback on a runtime
   contract fetch (there is none); the build-time slice is the right hook.

## Goal

Boot from **~1.2MB (both locales, all sections, eager)** to **~190KB (active locale,
core only: no `fields`, no `description`, no duplicate locale)**, with each window
streaming its ~22 field labels (a few KB, both locales) inside its existing lazy chunk.

≈ **6x reduction at boot.** Floor is `genericLabels` (~187KB/locale), which is loaded
lazily for the active locale only.

## Non-Goals

- Reducing `genericLabels` (dynamic keys make it unsafe to prune/slice). It remains the
  core floor. A future runtime key-tracking allowlist could attack it — out of scope here.
- Server-side / NEO label endpoints. Rejected: the frontend has no runtime contract
  fetch to embed labels in, and this design reuses existing static JSON instead.
- Changing `extract-labels.js` or the locale source-of-truth structure.

## Architecture

### A. Source of truth (unchanged)

`cli/src/extract-labels.js` keeps producing `en_US.json` / `es_ES.json` exactly as today.
These are the **input** to the slicer. Section structure, extraction queries, and the AD
`_trl` sourcing are untouched.

### B. Slicer — `cli/src/slice-labels.js` (new build step)

Runs after contracts are generated. For each window:

1. Read `artifacts/<win>/contract.json` → collect every `field.column` across all
   entities (header, lines, subtabs).
2. From each locale dictionary, take **only** `fields[column].label` (drop `.description`).
3. Emit `artifacts/<win>/generated/web/<win>/labels.js`:

```js
// @sf-generated — do not edit; produced by cli/src/slice-labels.js
export default {
  en_US: { C_BPartner_ID: "Business Partner", DocumentNo: "Document No.", /* ~22 */ },
  es_ES: { C_BPartner_ID: "Tercero", DocumentNo: "Nº documento", /* ~22 */ },
};
```

Both locales are emitted because the active locale is a runtime value and `import` is
static. ~22 fields × 2 locales = a few KB, riding inside the window's lazy chunk.

Columns present in the contract but absent from a locale are omitted with a logged
warning (never fabricated).

The slicer is wired into `make regen` (after `generate-contract`, alongside
`generate-frontend`), so the normal iterative loop keeps `labels.js` fresh
automatically — agents never hand-maintain it. It also runs standalone:

```bash
node cli/src/slice-labels.js --window sales-order   # regenerate one window's slice
node cli/src/slice-labels.js                         # all windows
node cli/src/slice-labels.js --check                 # CI/hook mode: regenerate in
                                                      # memory, diff vs committed files,
                                                      # exit 1 on drift (no writes)
```

### C. Core dictionary (boot payload)

New `core.<locale>.json` = `genericLabels + ui + menus + windows + tabs + statuses`
(everything **except** `fields`). `LocaleProvider` changes from eager glob to a dynamic
`import()` of the **active locale's** core only:

```js
// before: import.meta.glob('../locales/*.json', { eager: true })  → both locales bundled
// after:  const core = await import(`../locales/core.${locale}.json`)  → active locale, separate chunk
```

### D. Per-window merge — `WindowLabelsProvider`

The generated `index.jsx` imports its `labels.js` and wraps the window. The provider
exposes the active locale's field slice. `resolveLabel`'s chain is extended:

```
labelOverrides[locale][col]  →  windowFieldsSlice[col]  →  null
```

(The old `dictionary.fields[col]` step disappears because `fields` is no longer in core;
callers already fall back to the contract `rawLabel`.)

Public hook APIs (`useLabel`, `useUI`, `useMenuLabel`) are unchanged. Generic components
(`EntityForm`, `DataTable`) are unchanged.

## Data Flow (runtime)

```
Boot:
  AppShellRuntime → LocaleProvider(locale="es_ES")
    → import(`core.es_ES.json`)            [1 fetch, Vite content-hash cached]
    → context = { core dict, locale }

Open window "sales-order":
  registry.js → import(window chunk)        [already happens today]
    chunk bundles labels.js (en+es, few KB)
  index.jsx → WindowLabelsProvider value={labels[locale]}
  EntityForm/DataTable → useLabel('C_BPartner_ID')
    → resolveLabel: window slice → label    ✓

Language switch (es → en):
  setLocale("en_US")
    → core: import(`core.en_US.json`)        [1 fetch first time, cached after]
    → field slice: already in memory (both locales in chunk) → instant swap ✓
```

Field-label language switch is **instant** (both locales already shipped in the chunk).
Core does one fetch the first time per language.

## Error Handling / Edge Cases

- **Missing slice / column** → `resolveLabel` returns `null`; caller falls back to the
  contract `rawLabel` (existing `t('X') || 'Fallback'` pattern). No break.
- **Core fails to load** → `LocaleProvider` falls back to `{}`; `ui(key)` returns the key
  (current `resolveUI` behavior). Degraded but functional.
- **Column in contract but absent from locale** → slicer omits + warns.
- **Custom windows** (`tools/app-shell/src/windows/custom/*`, e.g. contacts, product)
  lack a standard contract → receive an empty/partial slice and rely on core + fallbacks.
  Must be listed explicitly in the slicer config.
- **`labelOverrides` from `decisions.json`** → still win first in the chain. Unchanged.

## Testing

- **Slicer unit** (`cli/test/slice-labels.test.js`): contract with N columns → slice
  contains exactly those keys, no `description`, both locales.
- **es/en contract test**: every `es_ES` slice mirrors the `en_US` slice (same key set).
  Replaces/complements the current monolithic `es_ES-contract.test.js`.
- **`resolveLabel`**: extended chain (slice before fallback). Cases: slice hit, miss →
  null, override wins.
- **Regression**: existing Playwright E2E must pass unchanged (proves labels still
  resolve).

## Automation & Validation (auto-maintained + enforced)

Two halves, mirroring the existing F1/F2 source-hash pattern (`contract.checksum` vs
`generated/.manifest.json.contractChecksum`):

### 1. Auto-maintenance (the tool keeps it current)

`slice-labels.js` is part of `make regen` (§B), so any window change regenerates its
`labels.js` and refreshes the manifest in the same loop. No manual upkeep. The
`core.<locale>.json` files are regenerated from the monolith whenever locales change
(part of `make regen` and the labels build step).

### 2. Staleness enforcement — validator rule F11

A slice can go stale via **two** independent inputs, so the manifest stores a checksum
covering both:

- the **contract columns** the window uses (already captured by `contract.checksum`), and
- the **source locale label text** for those columns (so a re-run of `extract-labels.js`
  that changes a label string also invalidates the slice).

`generated/.manifest.json` gains `labelsChecksum = sha256(sorted contract columns +
their label values across all locales)`. **F11** recomputes the expected checksum from
the current `contract.json` + current locale dictionaries and compares:

- mismatch → **BLOCK** "labels.js is stale vs contract/locales — run `make regen` (or
  `node cli/src/slice-labels.js --window <name>`)".
- registry window with a contract but **no** `labels.js` → **BLOCK** (missing slice).
- `core.<locale>.json` checksum drift vs source monolith → **BLOCK**.

Implement in `cli/src/validate-pipeline.js`, add fixtures under
`cli/test/fixtures/pipeline-validator/`, tests in `cli/test/validate-pipeline.test.js`,
and **document F11 in `docs/pipeline-validator-reference.md`** (canonical — a rule that
isn't there doesn't exist).

### 3. Hook & CI wiring

| Gate | What runs | Catches |
|---|---|---|
| **pre-commit** (`.githooks/pre-commit`) | `validate-pipeline.js --staged` (F11) | committing a stale/missing slice. Extend the fast-path grep to also trigger on staged `**/labels.js`, `packages/app-shell-core/src/locales/*.json`, and `cli/src/slice-labels.js`. |
| **pre-push** (`.githooks/pre-push`) | `node cli/src/slice-labels.js --check` (all windows), next to the existing offline `make regen-check` | any drift across the whole repo before push, even in unstaged-then-committed paths. |
| **CI** | F11 in `pipeline-validate.yml`; a `slice-labels --check` step in `offline-regen-check.yml` (offline — slicing reads committed JSON, no DB) | drift on PRs. Shadow-mode first (annotate), then blocking, consistent with the existing P3 rollout. |

`git commit --no-verify` remains the documented WIP bypass; never on epic-branch PRs.

## Migration / Rollout

1. Generate slicer output + `core.*` files; keep `LocaleProvider` eager (flag off) — no
   behavior change.
2. Enable lazy core + `WindowLabelsProvider` window by window.
3. Once all windows migrated, drop `fields` and `description` from the bundled monolith.
4. Keep the monolith only as the slicer's intermediate artifact (or remove if unused).

## Open Questions

- Confirm the exact set of custom windows that need explicit slicer entries (relevant
  list: contacts, product, product-category, goods-shipment, return-material-receipt).
- `core.<locale>.json` is a generated artifact (it carries a checksum for F11). Confirm
  its on-disk location (alongside the slicer output vs. `packages/app-shell-core/src/locales/`).
- Whether `windows`/`tabs`/`menus` (used by `useMenuLabel` across the whole app via the
  sidebar/nav) genuinely all belong in core, or a subset is also lazy-loadable later.
