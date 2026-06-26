# ETP-4300 — Efficient Localization: build-time sliced labels + CI/pre-push validation — Design

- **Jira:** [ETP-4300](https://etendoproject.atlassian.net/browse/ETP-4300) — *Efficient localization: build-time sliced labels + CI/pre-push validation*
- **Parent / relates:** Accounting-GO epic ETP-3504. Sibling tickets ETP-4304 (selector values in GO language) and ETP-4306 (backend `AD_Message` in GO language) cover the **backend** language-resolution bug; this ticket is **frontend/build only** and does not touch Java or runtime language resolution.
- **Branch:** `feature/ETP-4300`
- **Date:** 2026-06-23
- **Status:** Reviewed (Crisol — *Approved with nits*); review findings incorporated. Ready for implementation (Phase 1).

---

## 1. Goal & Scope

The frontend ships **both** locale dictionaries (`en_US.json`, `es_ES.json`) into the **same eager boot chunk**, even though only one locale is active and a given window uses ~22 field labels out of 3398. This design slices field labels per window at build time and loads only the active locale's shared "core" at boot, so the boot payload drops sharply while every public i18n hook keeps the same API.

### Goal

Cut the translation weight forced into the boot chunk from **both full dictionaries** down to **one locale's core only (no `fields`, no field `description`)**, with each window streaming its ~22 field labels inside its already-lazy window chunk. The ticket targets a boot reduction of **~1.2 MB → ~190 KB (≈6×)**.

### In scope

1. New build-time slicer `cli/src/slice-labels.js`, wired into `make regen`, that emits a per-window, label-only, bilingual slice.
2. A lazily-loaded, active-locale-only `core.<locale>.json` (everything except `fields`).
3. A `WindowLabelsProvider` + an extended `resolveLabel` chain that merges the window slice. Public hooks (`useLabel` / `useUI` / `useMenuLabel`) stay **unchanged**.
4. Drop field `.description` (dead weight, no consumer) from what ships to the client.
5. A new pipeline-validator rule (see §6 — **F18**, not "F11"; F1–F17 already exist) plus pre-commit / pre-push / CI integration.

### Out of scope

- **Backend language resolution** (`NeoSelectorService`, `AD_Message` translation) — that is ETP-4304 / ETP-4306.
- **Persisting the user's GO language in the DB / `/sws/neo/session`** — a separate epic item. The active locale here is still chosen exactly as today (`localStorage 'schema-forge-locale'`, default `es_ES`).
- `genericLabels` slicing — it has dynamic `ui(variable)` lookups and **cannot** be sliced; it stays in core.

---

## 2. Baseline (measured 2026-06-26 on `epic/ETP-3504`)

> Full reproduction commands and the before/after comparison checklist live in `ETP-4300-baseline.md` (repo root).

| Metric | Today |
|---|---:|
| `en_US.json` | 726,309 B raw / 147,733 B gzip |
| `es_ES.json` | 766,771 B raw / 158,198 B gzip |
| **Both dictionaries** | **~1.42 MB raw / ~299 KB gzip** |
| `fields` section | 57% (en) / 56% (es) of each file; ~160 KB gzip combined |
| field `.description` (dead weight) | ~232 KB raw combined |
| Main eager chunk `index-*.js` | ~2.93 MB raw / ~821 KB gzip |

**Smoking gun:** the production main chunk contains *both* `Business Partner` (en) **and** `Tercero` (es) **and** the `genericLabels` key — i.e. both full locales travel together at boot. Root cause is one line:

```js
// packages/app-shell-core/src/i18n/LocaleProvider.jsx
const localeModules = import.meta.glob('../locales/*.json', { eager: true });
```

`eager: true` inlines every matched JSON into the boot graph regardless of the active locale.

---

## 3. Current architecture (how i18n works today)

**Canonical package:** all i18n lives in `packages/app-shell-core/src/i18n/`. `tools/app-shell/src/i18n/*` only re-exports `@etendosoftware/app-shell-core/i18n`. **All changes in this design land in `app-shell-core`.**

```
App.jsx
  useLocaleState()  →  [locale, setLocale]   (localStorage 'schema-forge-locale', default es_ES)
      │
      ▼
LocaleProvider(locale)                         ← eager-globs BOTH locales, picks active in memory
      │  context = { dictionary, locale, setLocale }
      ├── useLabel(overrides)   → resolveLabel(dict, column, overrides)  → dict.fields[column].label   ★ SLICEABLE
      ├── useUI()               → dict.genericLabels[key]                                              core
      ├── useMenuLabel()        → dict.ui | menus | windows | tabs | genericLabels                     core
      ├── resolveUI()           → dict.genericLabels[key]                                              core
      └── lib/statusBadge.js    → dict.statuses[code] + dict.genericLabels[key]                        core
```

Which hook reads which section is the whole basis for the split:

| Section | Read by | Sliceable? |
|---|---|---|
| `fields` | **only** `useLabel` / `resolveLabel` | **Yes** — per window, keyed by AD column |
| `genericLabels` | `useUI`, `resolveUI`, `useMenuLabel` | No (dynamic keys) → **core** |
| `ui`, `menus`, `windows`, `tabs` | `useMenuLabel` | No → **core** |
| `statuses` | `tools/app-shell/src/lib/statusBadge.js` (also reads `genericLabels`) | No → **core** |

Today's resolution chain (`resolveLabel.js`):

```js
langOverrides?.[column] ?? dictionary?.fields?.[column]?.label ?? null
```

**Windows are already lazy code-split.** `registry.js` maps each slug to `() => import('@generated/<win>/generated/web/<win>/index.jsx')`, so Vite emits one chunk per window. Anything that window statically imports (e.g. a generated `labels.js`) rides along **inside that same lazy chunk** — this is the hook that makes per-window slicing free.

**The slice key already exists.** Each `contract.json` entity field carries its AD column under `field.column` (e.g. `header.DocumentNo`). Union across `header` + `lines` (+ any sub-entities) = the exact set `useLabel` can ask for. Example — `sales-order`: header 18 + lines 10 = 28 columns.

**The manifest schema already exists — but is not emitted for real windows yet.** `generated/.manifest.json` is defined as `{ contractChecksum, contractVersion, generatedAt, generator, files }` and rule **F2** is written against it, **but** today only the 3 validator fixtures ship one — `generate-frontend.js` does not emit it for real artifacts, so F2 currently returns `skipped(... "enforced after P2 generator patch")` (`validate-pipeline.js:198`). We extend this manifest with `labelsChecksum`. **Dependency:** F18 enforcement and the `labelsChecksum` both ride on building that real-window manifest emitter — it must land (the P2 generator patch) before F18 can flip from shadow to blocking.

---

## 4. Proposed design (Approach G — build-time sliced labels)

### 4.1 Per-window slice — `slice-labels.js`

A new generator `cli/src/slice-labels.js`, run inside `make regen` (orchestrated by `cli/src/regen-all.js`). The source of truth `extract-labels.js` is **unchanged** — the slicer is a pure transform over already-extracted JSON, **no DB access**, so it is safe in offline CI.

For each window:
1. Read `artifacts/<win>/contract.json`; collect `field.column` across **all** entities (header + lines + sub-entities).
2. From the two full locale dictionaries, pick only those columns' `label` (drop `description`).
3. Emit `artifacts/<win>/generated/web/<win>/labels.js`:

```js
// AUTO-GENERATED by slice-labels.js — do not edit.
export default {
  en_US: { DocumentNo: "Document No.", C_BPartner_ID: "Business Partner", /* ~22 keys */ },
  es_ES: { DocumentNo: "Nº de documento", C_BPartner_ID: "Tercero", /* ~22 keys */ },
};
```

It is a `.js` module (not JSON) so Vite tree-shakes/code-splits it into the window chunk and the active branch can be picked without bundling the inactive locale's `fields`.

4. Write `labelsChecksum` into `artifacts/<win>/generated/.manifest.json` = `sha256(sorted columns + their en_US/es_ES label text)`.

A `--check` mode recomputes every window's slice in memory and fails (non-zero) if any committed `labels.js` / checksum is stale or missing — for pre-push and CI.

### 4.2 Shared core — `core.<locale>.json`

Per locale, a `core.<locale>.json` = the full dictionary **minus `fields`** (keeps `genericLabels`, `ui`, `menus`, `windows`, `tabs`, `statuses`). Proposed location: `packages/app-shell-core/src/locales/generated/core.<locale>.json` (generated, git-tracked, validated by checksum).

> **Integration note (verified):** `cli/src/regen-all.js → runAllPipelines` is a **per-window loop** (`runPipeline` per window). The per-window `labels.js` belongs *inside* that loop, but `core.<locale>.json` is **global (one per locale)** and must be emitted **once, after the loop**, in `main`/`runAllPipelines`. This core-emit step must run **even with `ONLY=<window>` or `SKIP_EXTRACT=1`** (core is global and must not go stale when only one window is regenerated). The slicer is a pure transform over the committed locale JSONs, so `--skip-extract` is safe — it does not need the DB.

`LocaleProvider` stops eager-globbing the monolith and instead dynamically imports the active locale's core only:

```js
// active-locale only, NOT eager
const coreModules = import.meta.glob('../locales/generated/core.*.json');
const dictionary = await coreModules[`../locales/generated/core.${locale}.json`]();
```

The provider gains a short async/Suspense boundary at boot (load core for the active locale) — design detail to confirm in §8.

### 4.3 `WindowLabelsProvider` + extended `resolveLabel`

A new provider supplies that window's slice via context:

```jsx
import windowLabels from './labels.js';
<WindowLabelsProvider slice={windowLabels}>{/* window subtree */}</WindowLabelsProvider>
```

**Mount at the route/registry loader boundary, NOT strictly inside the generated `index.jsx`.** (verified) `registry.js` resolves `customLoaders > windowLoaders`, and many in-scope windows (`sales-order`, `purchase-order`, `sales-invoice`, …) load a **custom** `index.jsx` that renders `useLabel` consumers as **siblings of** `GeneratedApp` (e.g. `ListView`, `CloneOrderModal`, shared line tables). If the provider wrapped only `GeneratedApp`, those siblings would fall outside the slice context (tolerable in Phase 2 via monolith fallback, broken in Phase 3). Wrapping at the loader boundary guarantees the whole window subtree — generated *and* custom — sees the slice. The slice file to import is still chosen by slug, so the loader can resolve `@generated/<slug>/.../labels.js` uniformly.

`resolveLabel` gains the slice as a new, higher-priority source than the monolith:

```js
// new chain
langOverrides?.[column]
  ?? windowSlice?.[locale]?.[column]      // ← per-window slice (rides the lazy chunk)
  ?? dictionary?.fields?.[column]?.label  // ← monolith fallback (removed in Phase 3)
  ?? null
```

`useLabel` reads the window slice from `WindowLabelsContext` and threads it into `resolveLabel`. **Public hook signatures do not change** — a window not yet wrapped in `WindowLabelsProvider` simply has an empty slice and falls through to the monolith, which is exactly what enables a window-by-window rollout.

### 4.4 Drop `.description`

`extract-labels.js` still extracts `description` (harmless server-side), but neither the per-window slice nor `core.*` carry it. No runtime consumer reads `field.description` (only `.label`), so this removes ~232 KB raw with zero behavior change.

---

## 5. Data flow (after)

```
extract-labels.js (DB, unchanged) ──▶ locales/en_US.json + es_ES.json  (full, source of truth)
                                              │
                    make regen ──▶ slice-labels.js  (offline transform, no DB)
                                              ├─▶ artifacts/<win>/generated/web/<win>/labels.js   {en_US,es_ES} label-only
                                              ├─▶ artifacts/<win>/generated/.manifest.json         + labelsChecksum
                                              └─▶ packages/app-shell-core/src/locales/generated/core.<locale>.json

Runtime boot:  LocaleProvider → dynamic import core.<active>.json   (1 locale, no fields)
Window open:   registry lazy import window chunk → labels.js (its ~22 fields) → WindowLabelsProvider → useLabel
```

---

## 6. Validation & automation

> ⚠️ **Rule numbering correction:** the ticket text says rule "F11", but `validate-pipeline.js` already defines **F1–F17** (F11 is `rowQuickActions`). The new rule must be **F18**. The canonical rule list is `docs/pipeline-validator-reference.md` — *if a rule is not documented there, it does not exist.*

### F18 — sliced-labels integrity

**As built (v1, this PR).** `ruleF18` in `cli/src/validate-pipeline.js`, modeled on **F16** (deterministic regenerate-and-compare), NOT on a stored checksum — this is simpler, robust, and sidesteps depending on a manifest field that no real-window emitter writes yet:

- Reproduces the expected slice from the committed `contract.json` columns × the locale dictionaries using the slicer's own pure functions (`collectWindowColumns` → `sliceLabels` → `labelsModuleSource`, imported from `slice-labels.js`, so the rule and the generator can never disagree), and compares to the committed `labels.js`.
- **BLOCK** if the committed `labels.js` differs from that reproduction (slice is stale vs current contract columns or locale label text).
- **SKIP** when `labels.js` is absent — the **shadow-rollout** state (cf. F1/F2 returning `skipped(...)`). Since Phase 1 commits tooling only (no slices), F18 skips on every window today; it starts blocking organically as slices land. api-only/backend-only windows have no UI chunk, hence no `labels.js`, so they skip automatically — no explicit allowlist needed in v1.
- The locale dictionaries are loaded **once** per run (`loadLocaleDicts(root)`, threaded like `registryContent`); a `_locales` option allows test injection. If the locales dir is unavailable, F18 skips.
- **Not** an F18 concern: translation-coverage gaps (rendered columns with no dictionary label). The Phase-1 slicer showed ~35 windows hit this (GO-native CRM/PM windows, add-on `EM_*` columns) — a **pre-existing gap**, out of scope for ETP-4300, surfaced by `slice-labels.js --check` / `make regen` output, not the validator. F18 stays purely about slice↔source consistency.

**Deferred to Phase 2/3** (when slices are committed and the runtime consumes them):
- Flip from skip → **BLOCK on missing `labels.js`** for registered windows, with the `apiOnlyWindows` exclusion (`sii-config`, `tbai-config`, `verifactu-config`, `sii-monitor`, `monitor-verifactu`, `tbai-facturas-enviadas`).
- **Core-drift** check: `core.<locale>.json` ≠ `(full locale − fields)`.
- **Shared-label-set** coverage assertion (see §8), so cross-window shared-modal columns can never be dropped by Phase 3.

Fixtures under `cli/test/fixtures/pipeline-validator/` + tests in `cli/test/validate-pipeline.test.js`; F18 documented in `docs/pipeline-validator-reference.md` (canonical).

### Integration points

| Hook | What runs | File |
|---|---|---|
| **Manual** | `make validate-pipeline` (F18 included) | — |
| **pre-commit** | `validate-pipeline --staged` (F18); extend fast-path grep to also trip on `labels.js` and `locales/*.json` | `.githooks/pre-commit` |
| **pre-push** | `slice-labels.js --check` over all windows, next to `make regen-check` | `.githooks/pre-push` |
| **CI** | F18 in `pipeline-validate.yml`; `slice-labels --check` in `offline-regen-check.yml` (offline, no DB) | `.github/workflows/` |

---

## 7. Rollout (3 phases, feature-flagged)

A build-time flag (e.g. `VITE_SLICED_LABELS`) switches `LocaleProvider` between the current eager-monolith path and the new lazy-core path, so we de-risk incrementally.

1. **Phase 1 — generate, flag off.** Land `slice-labels.js`, the per-window `labels.js`, `core.*`, F18 (shadow). `LocaleProvider` still eager. **No behavior or bundle change** — purely additive; validates the slicer end-to-end.
2. **Phase 2 — lazy core + provider, window by window.** Flip the flag; mount `WindowLabelsProvider` per window via the generator. The monolith `fields` remains as fallback for not-yet-migrated windows.
3. **Phase 3 — drop the monolith.** Once all windows are migrated, stop shipping `fields` + `description` in the bundled dictionary; the slice becomes the sole source. Flip F18 to blocking.

---

## 8. Risks & open questions

- **[MAJOR — must resolve before Phase 3] Cross-window shared components resolve columns OUTSIDE the host window's contract.** Verified case: `LocationEditorModal.jsx` calls `t('IsShipTo')` / `t('IsBillTo')` — columns present **only in the `contacts` contract** — yet the modal is reached generically (via `CreatableSearchSelect` / `PartnerAddressPicker`) from nearly every document window. The per-window slice (built from that window's contract union) will **not** contain those columns. The failure mode is *not* a blank label: generic consumers fall back as `t(col) ?? field.label ?? field.key` (e.g. `SummaryBar.jsx:20`, `EntityForm.jsx:1227`, `AdvancedFilterBuilder.jsx:193`), so on a slice miss they degrade to the contract's **raw AD English label** — a silent Spanish→English regression. *Mitigation (REQUIRED):* introduce a **shared/global label set** — the columns used by shared modals/components (partner-location fields, etc.) — that is always merged into `core.*` (or a single shared slice loaded with core). F18 must assert this set is covered (see §6). Audit `useLabel(` / `resolveLabel(` / `t(` call sites in shared components to seed the set before Phase 3.
- **Boot async boundary — decision.** Moving core to a dynamic import adds an `await` at boot. **Decision:** load inside `LocaleProvider` and **render-through with an empty dict** (`{}`) until the core resolves — existing consumers already tolerate a missing dict by echoing the key (`useUI`, `statusBadge`), so first paint is not blocked and no Suspense fallback is needed. On import failure, log and keep the empty-dict render (keys shown) rather than crashing the shell. Pre-warm the active locale's core with a `<link rel="modulepreload">` so the await is effectively free on a warm load.
- **`labelOverrides`** from `decisions.json` already flow through `useLabel(overrides)` and stay highest-priority — unaffected, but include in tests.
- **Generated-file policy.** `labels.js` lives under `artifacts/*/generated/` — it is an output; never hand-edit (CLAUDE.md). The generator/`slice-labels.js` is the only writer.
- **Location/naming** of `core.*.json` and the flag name are proposals — confirm before Phase 1.
- **`statuses`** is consumed by the non-hook `statusBadge.js`; it must stay in core (it does, per the split).

---

## 9. Testing strategy

- **Unit (node/Vitest, `app-shell-core`):** extended `resolveLabel` chain (override > slice > monolith > null); `WindowLabelsProvider` context; `useLabel` reading the slice; locale switch still works.
- **CLI (`cli/test`):** `slice-labels.js` output for a fixture window (correct columns, both locales, no `description`); `--check` detects stale/missing; F18 fixtures (ok / stale / missing).
- **Build-size guard:** a test asserting the boot chunk no longer contains an inactive-locale marker (e.g. with app in `es_ES`, `Business Partner` must not be in the main chunk) — this is the automated form of the baseline "smoking gun".
- **E2E (Playwright):** switch locale, open a window (e.g. `sales-order`), assert field labels render in the active locale. Follow `docs/e2e-testing-guide.md`; delegate per CLAUDE.md testing rules.

---

## 10. File inventory (touch list)

| File | Change |
|---|---|
| `cli/src/slice-labels.js` | **new** — per-window slicer + `core.*` emitter + shared-set emit + `--check` |
| `cli/src/regen-all.js` | per-window `labels.js` inside the loop; **`core.*` + shared set emitted once after the loop** (also under `ONLY=`/`SKIP_EXTRACT=1`) |
| shared label set (location TBD, e.g. `cli/src/shared-label-columns.js`) | **new** — columns used by cross-window shared components, always merged into `core.*` |
| `packages/app-shell-core/src/i18n/LocaleProvider.jsx` | eager glob → lazy active-locale core import (flagged) |
| `packages/app-shell-core/src/i18n/resolveLabel.js` | add window-slice source to the chain |
| `packages/app-shell-core/src/i18n/useLabel.js` | read slice from `WindowLabelsContext` |
| `packages/app-shell-core/src/i18n/WindowLabelsProvider.jsx` | **new** provider + context |
| `packages/app-shell-core/src/i18n/index.js` | export `WindowLabelsProvider` |
| `cli/src/generate-frontend.js` | emit `import labels` for the window slice |
| `tools/app-shell/src/windows/registry.js` (or the route loader) | mount `<WindowLabelsProvider>` at the **loader boundary** so custom-window siblings of `GeneratedApp` are also covered |
| `packages/app-shell-core/src/locales/generated/core.<locale>.json` | **new** generated output |
| `artifacts/<win>/generated/web/<win>/labels.js` | **new** generated per window |
| `artifacts/<win>/generated/.manifest.json` | + `labelsChecksum` |
| `cli/src/validate-pipeline.js` | **new rule F18** |
| `cli/test/fixtures/pipeline-validator/*`, `cli/test/validate-pipeline.test.js` | F18 fixtures + tests |
| `docs/pipeline-validator-reference.md` | document F18 |
| `.githooks/pre-commit`, `.githooks/pre-push` | F18 + `slice-labels --check` |
| `.github/workflows/pipeline-validate.yml`, `offline-regen-check.yml` | CI wiring |
