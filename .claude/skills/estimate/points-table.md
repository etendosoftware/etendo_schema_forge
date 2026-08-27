# Estimation Points Table

> **This file is the tunable model for the `/estimate` skill.** Edit numbers here to improve
> estimates — the skill reads this at runtime and never hardcodes values. Keep this file in sync
> with reality using `calibration-log.md` (real estimate-vs-actual outcomes).
>
> **Scale:** Fibonacci (1, 2, 3, 5, 8, 13). Difficulty is non-linear — gaps grow on purpose.
> **Method:** sum base points of all components, then add risk percentages, then convert to hours.

---

## 1. Base item types (Fibonacci points)

Each row is one *unit of work*. A real task is usually several rows. When in doubt between two
values, pick the higher one for unfamiliar work and the lower one for work with precedent.

### UI — windows & views

| Item type | Pts | Notes |
|-----------|----:|-------|
| `list-view` | 5 | New list/grid view: columns, sorting, labels (ES/EN), menu entry |
| `detail-header-form` | 3 | Header form: fields, layout, readOnly logic, callouts |
| `lines-grid` | 5 | Child/lines entity grid with inline add/edit |
| `preview-panel` | 3 | Side preview panel (summary + tabs) |
| `pdf-preview` | 2 | Live PDF rendered in the preview panel |
| `related-documents` | 2 | Related-documents section (linked docs lookup + display) |
| `status-bar` | 1 | Declarative metric cards / status bar |
| `kpi-cards` | 2 | KPI cards above a list |
| `kanban-or-calendar-layout` | 5 | Non-standard layout type (kanban, calendar, gallery) |

### UI — interactions

| Item type | Pts | Notes |
|-----------|----:|-------|
| `import-from-document-modal` | 3 | Modal importing lines from a source document |
| `confirm-modal` | 2 | Confirmation modal, incl. replacing a native process button |
| `confirm-modal-with-branch` | 3 | Confirm modal with an optional secondary flow (e.g. "manage credit?") |
| `selector-lookup` | 2 | Custom selector / lookup field |
| `menu-actions` | 1 | Kebab menu items per status |

### UI — adapting what already exists (cheap; verify the precedent first)

> These are the **"don't build, adjust" rows**. Reach for them whenever a piece already exists in the
> AD schema, in a shared component, or in a native process — the work is *wiring/conditioning*, not
> construction. Picking a build-from-scratch row when one of these applies is the #2 cause of
> over-estimation (the #1 is missing components). **Always confirm the precedent** (read
> `schema-raw.json`, the existing component, or the native process) before scoring one of these.

| Item type | Pts | Notes |
|-----------|----:|-------|
| `surface-existing-field` | 1 | Expose/reposition an AD field that **already exists** (e.g. child tab → header). Verify in `schema-raw.json` first — NOT a new column, no `alter-db`. |
| `conditional-field-visibility` | 1 | Show/hide an existing field or section by a discriminator (doc type, status, flag) via display logic |
| `list-display-rule` | 1 | Per-row/per-type display rule on an **existing** list (negative total, hide an indicator, badge text). Display convention ≠ backend change. |
| `extend-shared-component` | 2 | Branch an **existing** shared component by a new variant (related-docs by type, list behaviour by type). Cheaper than the base row for that component. |
| `suppress-existing-behavior` | 1 | Conditionally hide/disable an existing flow (a popup, an indicator, an action) for some cases |
| `wire-native-process-button` | 1 | Surface an existing AD process / posting / Complete button on a new variant. The **process logic is reuse** — score only the wiring, not the logic. |
| `multi-variant-window-framework` | 5 | **First** time hosting N variants/doc-types under one **existing** window (variant selector + conditional wiring). The novelty is the framework; later variants get the second-mover discount. |

### Generation & backend (Etendo Go)

| Item type | Pts | Notes |
|-----------|----:|-------|
| `document-auto-generation` | 5 | Auto-create a linked document (e.g. invoice from shipment) with copied taxes/prices. **If the generating side (action/popup on the source doc) belongs to a sibling ticket, score 0 here** and count only the receiving side. |
| `java-handler` | 3 | A `NeoHandler` CDI bean (pre/post hook) for window-specific logic. **Only if the behaviour is NOT already done by a native process** — see the reuse warning below. |
| `java-handler-complex` | 5 | Handler with non-trivial business logic, stock movements, transactions |
| `stock-movement` | 3 | Physical inventory movement on confirm (partial qty support) |
| `webhook-config` | 2 | New webhook / NEO config push for a window |

> **⚠️ Reuse warning — "does the platform already do this?"** Before scoring any backend row, ask
> whether the behaviour is already delivered by an **existing native process** that NEO Headless
> reuses. The classic Etendo posting/Complete chain already handles, for free: accounting inversion
> (debit↔credit), payment-schedule generation, tax/VAT register inversion, and the balance/paid-state
> effects of completing a document. Callouts, display-logic evaluation, and validation-rule combo
> filters are likewise reused by the runtime. If the asked behaviour rides on one of these, it is
> **reuse → 0 pts** (at most a `wire-native-process-button`), NOT a `java-handler`. Treating a native
> posting effect as new backend is the single most expensive estimation error in this codebase.

### Config & pipeline

| Item type | Pts | Notes |
|-----------|----:|-------|
| `classify-window` | 3 | `decisions.json` field/rule classification for one window |
| `decisions-tweak` | 1 | Small `decisions.json` change (a few fields) |
| `generator-change` | 5 | Change to a shared generator (`generate-*.js`, `resolve-curated.js`) — affects all windows |
| `callout-validation` | 2 | Callout or validation-rule logic on a field |

### Quality & cross-cutting

| Item type | Pts | Notes |
|-----------|----:|-------|
| `i18n-keys` | 1 | Add ES/EN keys for new strings |
| `unit-tests` | 2 | Vitest / Node unit tests for one component or module |
| `e2e-test` | 3 | One Playwright mocked E2E flow |
| `bugfix-small` | 1 | Localized fix, clear cause |
| `bugfix-medium` | 3 | Fix touching multiple files or unclear cause |
| `refactor-extract` | 2 | Extract a reusable component/helper (per target) |

---

## 2. Risk factors (additive percentages)

Mark every factor that applies, sum the percentages, apply **once** to the base point sum.
These are additive (not compounding) to keep the model interpretable. Only apply factors with a
real justification — do not stack speculatively.

| Factor | +% | Trigger |
|--------|---:|---------|
| `shared-component-refactor` | +30% | Touches shared `tools/app-shell/` components — will trip SonarQube duplication & architecture checks |
| `ci-quality-gates` | +20% | Expected battle with Vitest mocks, SonarQube, architecture-check before merge |
| `cross-window-dependency` | +30% | Depends on or must stay consistent with another window/task |
| `new-pattern-no-precedent` | +40% | First time building this kind of thing — no existing example to copy |
| `late-test-discovery` | +30% | Functional flow likely to surface bugs only during QA/manual testing |
| `external-backend-change` | +30% | Requires a coordinated change in `com.etendoerp.go` (Java) |
| `unclear-requirements` | +30% | Acceptance criteria fuzzy or likely to change mid-task |

---

## 2b. Reuse / discount factors (additive **negative** percentages)

> The model historically only *added* risk and never *subtracted* reuse — which is why a brand-new
> window and two adaptations of it can all land on the same flat number ("3/3/3"). That is an
> estimation smell: the **first** implementation of a pattern pays the framework cost; the **second+**
> copy it with deltas. Model that explicitly. Apply discounts with the same evidentiary discipline as
> risks — only with a concrete precedent named.

| Factor | % | Trigger |
|--------|---:|---------|
| `second-mover-reuse` | −40%…−60% | A prior/sibling task already built this pattern (e.g. the same feature on another window). This task copies it with domain deltas. Name the precedent. |
| `mature-scaffolding` | −20% | Adapting an **existing** window + infra (list, related-docs, side panel already there), not building a new one. |
| `behaviour-is-native-reuse` | −20%…−40% | A large share of the asked behaviour is delivered by an existing native process/component and only needs wiring (see the reuse warning in §1). |

**Avoid double-counting:** if you already scored a piece with a cheap "adapting-what-exists" row
(§1) *or* excluded it as a sibling-ticket's work, do **not** also discount it here. Discounts are for
the *whole-task character* (this is an Nth implementation / an adaptation), not for the same piece you
already scored cheaply.

---

## 3. Conversion & sizing

```
HOURS_PER_POINT = 1.0          # nominal; tune via calibration-log.md
```

```
net_factor   = 1 + Σ risk% (§2) + Σ discount% (§2b)     # discounts are negative
net_factor   = max(net_factor, 0.3)                      # floor: never discount below 30% of base
total_points = base_points × net_factor
hours        = total_points × HOURS_PER_POINT
```

The net factor can be **below 1** when a task is an adaptation/second-mover with little new risk — that
is correct and expected. The 0.3 floor stops compounded discounts from zeroing out real work
(integration, tests, review still cost something even for a pure copy).

### T-shirt size bands (for quick communication)

| Total points | Size | Rough calendar |
|-------------:|:----:|----------------|
| 1–2 | XS | a couple hours |
| 3–5 | S | ~half a day |
| 6–10 | M | ~1 day |
| 11–20 | L | 2–3 days |
| 21–34 | XL | most of a week |
| 35+ | XXL | **split the task** |

---

## 4. Worked example (anchor) — ETP-4033

> Kept here as the reference calibration. Full breakdown in `calibration-log.md`.

```
list-view (5) + detail-header-form (3) + lines-grid (5) + import-from-document-modal (3)
+ confirm-modal-with-branch (3) + document-auto-generation (5) + java-handler (3)
+ pdf-preview (2) + related-documents (2)              = 31 base points (full scope)

risk: shared-component-refactor (+30%) + ci-quality-gates (+20%)   = +50%
total = 31 × 1.5 ≈ 46 pts ... (overshoots; see calibration note)
```

> ⚠️ The raw sum above (46 pts ≈ 46h) **overshoots** the real 30.5h, because not every component
> was built from scratch (some reused the Sales Shipment pattern from ETP-4031). The original Jira
> estimate of 16h **undershot** by ignoring `document-auto-generation`, `java-handler`, and all
> risk. The honest estimate sits in between (~28–32 pts). This tension is exactly what calibration
> exists to resolve — see `calibration-log.md` for the tuning discussion.
