# ETP-4246 — Cross-domain plan

**Feature:** General Ledger Configuration — onboard AD window `125`
(`Configuración contable`) as a `layoutType: custom` 4-tab editable window
(General · Valores por defecto · Dimensiones · Documentos), aligned to the
approved Figma (the earlier validation-checklist model was dropped for
simplicity — Figma wins). Adds two reusable platform `contract-ui` components
consumed by the window, shared i18n keys, a generator registration, and a
mocked E2E capture spec.

This PR is approved as cross-domain because the window cannot be delivered with
window-config alone: it required new shared platform components
(`AccountBadgeSelect`, `ToggleRow`), shared i18n keys, app-shell wiring
(`menu.json`, `registry.js`), and a generator registration — all consumed by the
single `general-ledger-configuration` window.

## Domains touched

### `generator-change`

- `cli/config/regen-windows.json` — register window `125`
  (`general-ledger-configuration`) so `make regen` processes it.

### `platform-change` (app-shell)

- `tools/app-shell/src/components/contract-ui/AccountBadgeSelect.jsx` — new shared
  searchable account selector rendering a `code · name` badge, with a `readOnly`
  mode; also exports `AccountBadge` (used for the read-only Documentos badges).
- `tools/app-shell/src/components/contract-ui/ToggleRow.jsx` — new shared switch +
  label + caption row with an optional `hint` node.
- `tools/app-shell/src/components/contract-ui/index.js` — export the two new
  components.
- `tools/app-shell/src/windows/registry.js` — register the custom window loader.
- `tools/app-shell/src/menu.json` — menu entry (Finanzas / `Tesorería`),
  kebab `general-ledger-configuration`.

### `app-shell-core`

- `packages/app-shell-core/src/locales/en_US.json`,
  `packages/app-shell-core/src/locales/es_ES.json` — 106 `glc.*` keys (section
  titles/subtitles, captions, unbacked-placeholder marker, status labels) plus
  reuse of existing generic keys (`saveChanges`, `required`, `selectAccount`,
  `search`, `noResultsFound`). Spanish authored as primary.

### `window:general-ledger-configuration`

- `artifacts/general-ledger-configuration/decisions.json` — window decisions
  (`layoutType: custom`, 4-tab field grouping, backed/`system`/`discarded`
  classification, `javaQualifier` on the General entity for the aggregate save
  handler).
- `artifacts/general-ledger-configuration/contract.json`, `contract.mcp.json`,
  `generated/web/general-ledger-configuration/*` — regenerated.
- `artifacts/general-ledger-configuration/figma-spec.md` — the canonical visual
  spec + locked field data-binding treatment (Figma MCP has no read access).
- `tools/app-shell/src/windows/custom/general-ledger-configuration/*` — the
  hand-written window (TabBar, 4 tab components, `SectionShell`, `Field`,
  `UnbackedHint`, `useGeneralLedgerConfig` hook, `mockCatalogs`). The save hook
  attempts a real aggregate `GET/POST` against NEO with a safe fallback to the
  seeded mock while the backend spec is greenfield.
- `docs/generated-custom-windows/general-ledger-configuration.md` — window guide.

### `e2e`

- `e2e/tests/flows/general-ledger-configuration.mocked.spec.js` — mocked capture
  spec that loads the window and screenshots each of the 4 tabs (light sanity
  asserts, no pixel-fidelity assertion). Seeds the Phase-4 acceptance suite.

### docs (`repo-infra` / `unknown`)

- `docs/generated-custom-windows/INDEX.md` — index entry for the new window.

> The multi-entity transactional save (NeoHandler) plus the `ETGO_SF_*` spec and
> `export.database` AD changes live in the sibling `com.etendoerp.go` repo on the
> same `feature/ETP-4246` branch (separate PR). The window currently runs against
> mock data with a real-backend fallback; persistence is wired there.

## Tests

- `e2e/tests/flows/general-ledger-configuration.mocked.spec.js` — mocked 4-tab
  render/capture, green (`--project=mocked`, 4/4).
- `npm run check:data-testid` — clean (no codemod modifications pending).
- `node cli/src/validate-pipeline.js --scope=general-ledger-configuration` —
  0 violations (2 F1/F2 skips, expected pre-P2-generator-patch).
- `make regen ONLY=general-ledger-configuration SKIP_EXTRACT=1` — regenerates
  with no DB hit / no push.
- app-shell `npm run build` (vite) — green; app-shell unit suite green.

## Rollback

- **window:general-ledger-configuration:** remove the window from
  `regen-windows.json`, `menu.json`, and `registry.js`; delete
  `artifacts/general-ledger-configuration/`, the custom window directory, and the
  window guide + INDEX entry. No other window depends on it.
- **platform-change:** `AccountBadgeSelect` and `ToggleRow` are new, additive
  components used only by this window; with the window removed they are unused.
  Revert the `contract-ui` commits and rebuild the bundle.
- **app-shell-core:** the `glc.*` i18n keys are additive; revert to remove.
- **generator-change:** removing the `regen-windows.json` entry is inert for all
  other windows.
- **backend (sibling `com.etendoerp.go`):** the NeoHandler / spec are greenfield
  and gated by the `javaQualifier`; with no spec pushed the frontend falls back
  to mock data. Revert the `com.etendoerp.go` commits and rebuild.
