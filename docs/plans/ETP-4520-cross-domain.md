# Cross-Domain Plan: ETP-4520 — Role-based window access + field visibility (Roles & Users Phase 5)

Handoff source: `santo_roles_handoff_phase5.md` (session root). Epic: ETP-3504. Design doc: [Roles y Usuarios](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5042438147/Roles+y+Usuarios) §4.2–§4.4. Test plan: Group 10 (TC-32–37).

## Scope (dominios)

This phase touches **three repos on the shared `feature/ETP-4520` branch convention** (mirrors `feature/ETP-XXXX` → `epic/ETP-3504` in all three — confirmed via `git branch -a` in `schema_forge_core`, which has its own `epic/ETP-3504`):

| Domain | Repo | What changes |
|---|---|---|
| New capability column | `com.etendoerp.go` | `AD_Role.EM_ETGO_Show_Acct_Fields` boolean extension column, exposed on the classic Role window/tab |
| New tier + capability endpoint | `com.etendoerp.go` | `GET /webhooks/SFWindowAccessMap` webhook, role→window tier map + capability flags in one call |
| Part A — window-level access rendering | `schema_forge_core` | `AuthContext` + `useWindowAccess` hook, Grid/Form read-only rendering, route guard — generic, applies to every generated window |
| Part B — field-level capability visibility | `schema_forge_core` | New `decisions.json` field property `visibleWhenCapability`, generator support in Grid columns + `DetailView`'s `statusPills` renderer |
| Pilot application | `etendo_schema_forge` (this repo) | `visibleWhenCapability: "showAccountingFields"` on the `posted` field, both `sales-invoice` and `purchase-invoice` |
| ETP-4530 — FA edit tabs (folded in) | `com.etendoerp.go` + `etendo_schema_forge` | Gate the *already-built* "Cuentas contables" tab in `EditAccountModal.jsx` behind the capability flag via `useHasCapability()` directly (custom window, not decisions.json-driven) — see the correction note in §5 below, the backend/tab themselves already exist |

**Checkbox UI, corrected 2026-07-22:** the checkbox is **Classic-only for this MVP** — toggleable from the standard `AD_Role` window/tab in Etendo Classic only. There is no existing or planned GO-app screen to surface it in: ETP-4512 only assigns *which role a user has* (no role-attribute fields at all), and ETP-4513's "Roles" view is intentionally locked (no create/edit/delete, "próximamente" notice — a prior confirmed decision, see the Roles y usuarios Test Plan TC-23). Extending either would be new scope on a different ticket, not part of ETP-4520.

**Explicitly excluded from this flag:** ETP-4529 (dimension visibility) and ETP-4531 (accounting-date independence) — both apply to every user regardless of role, confirmed by the user; they are not touched by this phase.

## Why cross-domain changes are necessary

The handoff doc (`ETP-4520`, scoped originally to `schema_forge_core` alone) assumed the access-tier mapping from Phase 1 (ETP-4509) was already exposed to the frontend. Investigation of `docs/neo-headless.md` in `com.etendoerp.go` shows access is only enforced **reactively**, per-request (`NeoAccessHelper.hasWindowAccess()`, 403 on denied writes) — no endpoint hands the frontend "your tier for window X" proactively. The doc's own §8 note confirms this gap is "tracked separately as ETP-4520" — i.e., this ticket. Building Part A's read-only rendering and route guard is impossible without this contract, so the endpoint is now in scope here rather than a silent assumption.

Splitting the endpoint into a separate ticket/session would mean dispatching `schema_forge_core` generator work against a guessed contract — exactly the kind of rework the handoff doc's own dependency note (§Dependencies) warns against ("don't finalize the frontend access-level contract before ETP-4509 is done, or it'll need rework"). Folding it in keeps the contract and its only consumer in the same review cycle.

**Why capability-based, not role-name-based:** the original Part B design checked the field's `visibleToRoles: string[]` against `selectedRole.name` directly — an arbitrary string match. The user redirected this: field/tab visibility for accounting data should be driven by a real `AD_Role` attribute (a checkbox a functional consultant or client admin can toggle per role), not a hardcoded role name. This also makes the mechanism reusable for ETP-4530's FA tabs without inventing a second name-matching scheme, and avoids breaking if a tenant renames or duplicates a "Finance"-equivalent role.

**Why ETP-4530 is folded in now, but not ETP-4529/4531:** all three already have empty `feature/ETP-4529`/`4530`/`4531` worktrees in `com.etendoerp.go` (and `4530` also in `schema_forge_core` + `etendo_schema_forge`) from a prior session, last touched 2026-07-19, zero commits ahead of epic. Of the three, only ETP-4530 is role-gated (per the user's explicit instruction) — dimension visibility (4529) and accounting-date independence (4531) apply to every user and stay out of this phase's scope entirely.

## Architecture

### 0. `com.etendoerp.go` — new `AD_Role` capability column
- Extension column on the core `AD_Role` table, added via a `com.etendoerp.go` AD module change (module DB prefix `ETGO`, confirmed from `AD_MODULE_DBPREFIX.xml`) — physical name `EM_ETGO_Show_Acct_Fields`, boolean (`Yes/No` reference), default `N`.
- **IDs generated via `make uuid` for this plan** (do not regenerate — reuse these): `AD_Column_ID = A0F2D12B5B4A48C2855EE73E3E93E274`, `AD_Field_ID (classic Role tab) = 98C71197D0744EED96856A497E49F159`.
- Label: EN "Show Accounting Fields" / ES "Mostrar campos contables". Help text should reference that it gates the `posted` status pill and the FA edit "Cuentas contables" tab.
- Exposed as a real field on the classic Role window/tab in Etendo Classic (via `/etendo:alter-db` + `/etendo:window` skills, or direct AD webhook calls per `docs/etendo-webhooks` conventions) — toggleable like any other role attribute. **Classic-only for this MVP** — no GO-app screen exists to surface it in (see the correction note under "Scope" above).
- `AD_Role.is_client_admin` (the existing admin-bypass column) is confirmed **core** Etendo, not a `com.etendoerp.go` extension — this new column follows the correct `EM_<prefix>_` convention instead of assuming another core column exists.

### 1. `com.etendoerp.go` — `SFWindowAccessMap` webhook
- Pattern: same family as `SFListMenu` (§8 of `neo-headless.md`) — a webhook, not a NEO servlet route.
- `GET /webhooks/SFWindowAccessMap` → `{"windowAccess": {"<AD_Window_ID>": "none"|"read-only"|"full", ...}, "capabilities": {"showAccountingFields": true|false}}` — both fetched in the same call since both are role-scoped and both are needed at the same lifecycle moment (role selection).
- Tier resolution reuses `NeoAccessHelper.hasWindowAccess()`'s existing order (§7.3 of `neo-headless.md`): admin/`is_client_admin` bypass → every window `"full"`, every capability `true`; no role → `{}`/`{}`; otherwise per-window, `IsReadWrite=true` → `"full"`, `IsReadWrite=false` → `"read-only"`; `capabilities.showAccountingFields` reads directly off `AD_Role.EM_ETGO_Show_Acct_Fields` for the resolved role.
- Fetched **once**, at role-selection time (same lifecycle moment the frontend already fetches `selectedRole.orgList`), not per-window-per-navigation — batches the whole map like `SFListMenu` batches the whole menu tree.

### 2. `schema_forge_core` — Part A
- `AuthContext` (`packages/app-shell-core/src/auth/AuthContext.jsx`) gains `windowAccess` and `capabilities`, populated alongside `selectedRole` at role selection.
- New shared hooks: `useWindowAccess(windowId)` → `"none" | "read-only" | "full"`; `useHasCapability(key)` → `boolean` (admin bypass baked in server-side, so the frontend hook just reads the fetched map — no client-side admin-name matching needed anymore).
- Consumed generically by generated Grid + Form components (never per-window generated-file patches, per this repo's Generated Files Policy):
  - `"read-only"` → all fields render readOnly, hide Save/Create/Delete/bulk-action buttons, disable "Nuevo".
  - `"none"` → route guard blocks the render before any data fetch (closes the direct-URL-nav gap `neo-headless.md` §8 explicitly flags as out of scope for `SFListMenu`).
  - `"full"` → unaffected, current behavior.

### 3. `schema_forge_core` — Part B
- New `decisions.json` field property: **`visibleWhenCapability: string`** — a capability key (e.g. `"showAccountingFields"`) matching a key in the `capabilities` map from the new endpoint. Replaces the earlier role-name-array design — see "Why capability-based, not role-name-based" above.
- Declared **once**, on the field definition. Two generator call sites must both honor it (both currently render `posted` unconditionally today):
  1. Grid column/badge emission.
  2. `DetailView.jsx`'s `statusPills` rendering (`renderStatusPillBadge` / `renderEmbeddedStatusPill`) — looks up the referenced field's `visibleWhenCapability` rather than duplicating the property on the `statusPills` array entry itself.
- Runtime check calls `useHasCapability(field.visibleWhenCapability)` — no more string-matching against `selectedRole.name`; the admin bypass is now resolved server-side (any capability key resolves `true` for an admin/`is_client_admin` role), so `tools/app-shell/src/hooks/useSurveyEngine.js`'s `isAdminRole()` pattern is no longer the model here (that hook can stay as-is for its own unrelated use, but Part B does not reuse it).
- Field is **omitted entirely** from both surfaces when the capability resolves `false` (not disabled/hidden via CSS).

### 4. `etendo_schema_forge` — pilot
- `visibleWhenCapability: "showAccountingFields"` added to the `posted` field's definition on **both** `sales-invoice/decisions.json` and `purchase-invoice/decisions.json` — both already carry the field (`statusPills` + grid badge) and both already flag it with the identical pending-enforcement note, so doing both together clears the debt in one pass instead of leaving one window inconsistent with the other (same rationale as the `ETP-4408` precedent for symmetric sibling windows).
- "Grid + Form" from the ticket's AC is **already structurally satisfied** — `posted` renders in Grid (field-level `badge` config) and Form (window-level `statusPills` → `DetailView`'s status-pill badge) independently of the field's own `form:false`. Part B's capability gate is the only missing piece; no `form:true` change needed.
- Full Window Change Integrity Protocol after: `make regen ONLY=sales-invoice,purchase-invoice`, contract-integrity check, generated import-path check, `addLineFields` check (N/A here, no lines entity change).

### 5. ETP-4530 — FA edit tabs (folded in) — **corrected 2026-07-22: already built, not greenfield**
- **Verified 2026-07-22 (superseding the earlier "no tabs / exclude:true" premise, which was stale):** ETP-4530 was already fully built end-to-end in a prior session and merged into `epic/ETP-3504`, on both sides:
  - Backend: `FinancialAccountAccountingHandler` (`@Named("financialAccountAccountingHandler")` in `com.etendoerp.go`) already exposes `fINAssetAcct`/`fINTransitoryAcct` (GET+PUT) on the `accountingConfiguration` entity (`artifacts/financial-account/decisions.json` lines 134-163) — 6 commits, all merged.
  - Frontend: `EditAccountModal.jsx` already has the full tab — `EDIT_TAB_ACCOUNTING` trigger + `AccountingConfigurationSection` (asset/transitory account selectors, ledger-not-configured empty state) — present in the main checkout today, not just a feature branch.
- **What's actually left, folded into ETP-4520:** wrap the *existing* `EDIT_TAB_ACCOUNTING` tab trigger + `TabsContent` with `useHasCapability("showAccountingFields")` so the tab is omitted entirely (not just disabled) for roles without the capability. This is a small additive change to already-working code, not new tab construction.
- Because `financial-account` is a custom window, this gate is **not** decisions.json-driven — it's a direct call in the hand-written component. This is the second (and, for this MVP, last) consumer of the capability hook alongside Part B's generic field mechanism.
- No backend changes needed for this piece — the NeoHandler exposure is unaffected; only frontend rendering is gated.
- Reuse the existing `feature/ETP-4530` worktree in `etendo_schema_forge` (already has the tab code merged via epic, so start from `feature/ETP-4520` or rebase — check which base has the current `EditAccountModal.jsx` before choosing).

## Acceptance criteria (from the handoff doc, expanded)

- [ ] Read-only window access → all fields readOnly in Grid + Form, create/edit/delete hidden/disabled.
- [ ] Full window access → normal, fully-editable UI (baseline unaffected).
- [ ] No window access + direct URL nav → blocked/redirected, no data shown.
- [ ] Verified against at least one read-only window per role (Facturas de venta for Finance, Productos for Sales, Inventario for Purchasing).
- [ ] `AD_Role.EM_ETGO_Show_Acct_Fields` exists and is toggleable from the classic Role window (Classic-only for this MVP — no GO-app screen exists to surface it in).
- [ ] `posted` field visible (Grid + Form) when `showAccountingFields` resolves true; absent entirely otherwise, on both `sales-invoice` and `purchase-invoice`.
- [ ] "Cuentas contables" tab in `EditAccountModal.jsx` (financial-account) renders only when `showAccountingFields` resolves true; `Cuenta bancaria`/`Cuenta transitoria` correctly read/write through the new NeoHandler exposure when visible.
- [ ] ETP-4529/4531 behavior unchanged — dimension visibility and accounting-date independence remain universal, not gated by this flag.
- [ ] `decisions.json` schema change (`visibleWhenCapability`) documented so other fields/tabs can adopt it later.

## Rollback plan

1. Revert the `feature/ETP-4520` merge commit in each of the three repos independently. The only schema change is the new `AD_Role` column (additive, default `N`) — no data migration/backfill needed to roll back; existing roles simply lose the checkbox and default back to "not shown."
2. If only the `com.etendoerp.go` endpoint needs rollback: reverting it alone regresses Part A to no proactive tier (frontend falls back to whatever default `useWindowAccess`/`useHasCapability` resolve an absent/erroring fetch to — must default to `"none"`/`false` fail-closed; **the Developer agent must decide and document this fail-closed default explicitly, since a fail-open default would silently reopen the direct-URL-nav gap this ticket closes, and would also silently reveal `posted`/the FA tab to every role**).
3. Part B's `visibleWhenCapability` is additive and per-field — reverting just the pilot's `decisions.json` change restores the field to universally visible without touching the generator.
4. ETP-4530's NeoHandler exposure and tab can be reverted independently of the capability mechanism itself (the fields simply go back to `exclude: true` / no tab).

## Tests

- `schema_forge_core`: unit tests for `useWindowAccess` + `useHasCapability`, generator tests for Grid/Form omission and `statusPills` capability-gating, route-guard component test.
- `com.etendoerp.go`: JUnit for the new webhook mirroring `SFListMenuTest`'s style (role-based filtering, no-role → empty map, admin bypass → full-access + all-capabilities-true map), plus a test for the new `AD_Role` column's default and the NeoHandler exposure of `Cuenta bancaria`/`Cuenta transitoria`.
- `etendo_schema_forge`: `make validate-pipeline` 0 violations for both invoice windows after regen; `EditAccountModal` tests for tab visibility (capability true/false); manual/E2E verification per the linked Confluence Test Plan Group 10 (TC-32–37) plus Groups 15–17 (TC-90–108) for the ETP-4530 slice.

## Dispatch plan

1. **AD_Role column + Java endpoint + ETP-4530 NeoHandler** (`com.etendoerp.go`) — no existing Forge team persona owns backend Java in this pipeline; build via the `/etendo:java`/`/etendo:alter-db`/`/etendo:window` skills or a general-purpose agent briefed with the `NeoHandler`/webhook pattern from `docs/neo-headless-extensibility.md`. Reuse the existing empty `feature/ETP-4530` worktree for the NeoHandler piece; use `feature/ETP-4520` (new) for the column + webhook.
2. **Part A + Part B** (`schema_forge_core`) — Schema Forge Developer persona, worktree on `feature/ETP-4520` off `epic/ETP-3504` in the sibling `schema_forge_core` checkout. Check whether the existing empty `feature/ETP-4530` worktree there is actually needed (per architecture §5 note) or can be abandoned in favor of `feature/ETP-4520`.
3. **Pilot + ETP-4530 tab gate** (`etendo_schema_forge`) — per memory (`project-accounting-followups-etp-3504`), gating the existing FA tab is Developer territory (calls a hook directly in custom component code) — Schema Forge Developer persona. The `posted` pilot itself (pure decisions.json edit + regen) is Window Agent territory and can run separately once Part B is consumable.
4. No GO-app UI work needed for the checkbox itself — Classic-only for this MVP (see correction note above).
5. Publish note: this is a new capability, not a bugfix — `packages/schema-forge-core/package.json` needs a **manual minor bump** in the `schema_forge_core` PR (patch-only is automatic on merge to `main` per `release.yml`; minor/major is not).
6. Pipeline order: DEV (all workstreams; AD column + endpoint first since everything else depends on its contract) → REVIEW → QA → DOCS, per this repo's standard phases. Reject cycles return to DEV, max 3 per phase.
