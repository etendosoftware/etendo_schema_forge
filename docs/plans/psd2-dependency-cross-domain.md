# Cross-domain plan — ETP-4121: PSD2 baseline alignment + financial-account contract-driven pilot

**Ticket:** ETP-4121 (branch) · **Type:** cross-domain (multi-window + generator + platform)
**Scope label:** `cross-domain-approved`

This branch bundles two mechanically-linked efforts that share the same ticket and the same
`feature/ETP-4121` branch. They are submitted as one cross-domain PR (rather than split) because the
financial-account pilot depends on the generator/locale changes, and the PSD2 rollout is the baseline
the pilot regenerates against. The domains and rollback below cover both.

## Effort A — PSD2 dependency rollout (baseline alignment)
`com.etendoerp.go` now declares the **PSD2** module as a dependency (`build.gradle`). The PSD2 module
adds the extension-model column `EM_Psd2_Generate_Bank_Payment` (a "Generate Bank Payment" process
button) to the shared `C_Order` / `C_Invoice` / `FIN_Payment` tables. Because Schema Forge extracts
windows from AD, that column now appears in **every window whose entity sits on those tables** — so
re-generating their contracts touches 10 windows at once. This is a single, mechanical
dependency-rollout change, not 10 independent feature changes.

- `EM_Psd2_Generate_Bank_Payment` is a backend-only **system field** in 9 windows (orphan column, no
  `AD_Field`): `payment-in`, `purchase-invoice`, `purchase-order`, `return-from-customer`,
  `return-to-vendor`, `sales-invoice`, `sales-order`, `sales-quotation`, `sii-monitor`. No UI change.
- In `payment-out` the PSD2 module ships a real `AD_Field`, so it surfaces as an editable header
  field (`psd2GenerateBankPayment`) with its own action endpoint.

## Effort B — financial-account contract-driven pilot
`financial-account` is a **custom** window (hand-written UI under `tools/app-shell/src/windows/custom/`
and `tools/app-shell/src/components/financial-accounts/`). The pilot makes its four grids read column
config from a new `contract.json` instead of hardcoded JSX, while keeping the bespoke structure. This
required:
- a **generator** change (`cli/src/generate-contract.js`): extend `convertLogicToJs` so AD readOnly
  expressions (`@Col@!''`, `@Col@!null`, `@Col@>0`) translate to valid JS, and bound the
  whitespace-normalization regexes to avoid a ReDoS hotspot;
- a **wiring-completeness** test exemption (`cli/test/wiring-completeness.test.js`) so a custom window
  that carries a `contract.json` for column config is not required to ship a generated page/mockData;
- an **app-shell-core** locale addition (`es_ES.json` / `en_US.json`): a full i18n pass on the New
  Movement wizard + shared amount/aria keys (no hardcoded user-facing strings);
- **platform** components under `tools/app-shell/src/components/financial-accounts/` that render the
  contract-driven columns.

## Domains touched (maps to the detected scopes)
- **window:financial-account** — `artifacts/financial-account/{contract,decisions}.json`, the custom
  React under `windows/custom/financial-account/`, and the window guide.
- **window:payment-in … sii-monitor** (10) — `contract.json` / `contract.mcp.json` /
  `generated/web/*` regenerated for the PSD2 column, plus each window guide noted.
- **generator-change** — `cli/src/generate-contract.js`, `cli/test/wiring-completeness.test.js`.
- **platform-change** — `tools/app-shell/src/components/financial-accounts/*` (contract-driven grid).
- **app-shell-core** — `packages/app-shell-core/src/locales/{es_ES,en_US}.json` (wizard i18n).
- **root-global-sensitive** — `cli/cache/ad-snapshot.json` refreshed so the offline regen check sees
  PSD2 (mechanically tied to Effort A; not editable by hand).
- **repo-infra** — this plan.
- **com.etendoerp.go** (sibling repo, lockstep) — `build.gradle` (PSD2 dependency),
  `ETGO_SF_FIELD.xml` + `ETGO_SF_ENTITY.xml` (new field rows + cascaded SEQNO via `export.database`).

## What it does NOT change
- No UI/behavior change from the PSD2 rollout: the column is `discarded`/system where it's an orphan
  and only `included` where PSD2 placed a real `AD_Field`. No new screens.
- The financial-account pilot keeps the window custom — no generated page is shipped or wired; the
  contract only drives column metadata. `artifacts/financial-account/generated/` stays untracked
  (same convention as the other custom windows `fiscal-config` / `fiscal-monitor`).

## Tests / verification
- `make regen-check FROM_CACHE=1 REGEN_CHECK_PREV_XML_DIR=../modules/com.etendoerp.go/src-db/database/sourcedata`
  → **32 OK / 0 FAIL** (predicted ETGO_SF XML matches the committed go sourcedata).
- DB verification: the `EM_Psd2*` `ETGO_SF_FIELD` rows exist after `PUSH_TO_NEO=1` (13 rows across the
  10 specs, `isincluded` Y/N matching classification).
- CLI tests (`node --test cli/test/*.test.js`) green incl. `contract-all` (12443/0,
  `readonlylogic-valid` for financial-account) and `generate-contract` (138/0); financial-account
  Vitest 327/0; Schema Forge Quality Gate **PASS** (0 regressions); window doc freshness cleared.
- The Offline Regeneration Check (CI) passes with the refreshed cache + exported XML committed
  together.

## Rollback
- **Effort A:** revert the PSD2 commit (10 contracts + `ad-snapshot.json`) and the com.etendoerp.go
  commit (`build.gradle` + `ETGO_SF_*.xml`). Both repos revert in lockstep on `feature/ETP-4121`;
  removing the dependency and restoring the prior cache returns the baseline to its pre-PSD2 state
  (config-only, no DB migration).
- **Effort B:** revert the financial-account commits. The grids fall back to their prior hardcoded
  columns; the generator change is additive (untranslatable expressions just become non-evaluable),
  so reverting it leaves other windows' contracts unchanged.
