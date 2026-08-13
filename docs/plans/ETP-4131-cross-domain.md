# Cross-Domain Plan: ETP-4131 — Fiscal Monitor SII/Verifactu Error Resolution

## Scope (dominios)

This PR touches multiple components within the **fiscal** vertical:

| Domain | Files |
|---|---|
| `window:fiscal-monitor` | FiscalMonitorPage, ContactDetailModal, VfSolveErrorModal, VerifactuMonitorSection, useFiscalMonitor |
| `window:monitor-verifactu` | artifacts/monitor-verifactu (contract, decisions) |
| `window:fiscal-config` | OnboardingWizard, useFiscalConfig |
| `app-shell-core` | i18n locale keys (en_US.json, es_ES.json) |
| `shared-custom-capability` | LocationEditorModal (shared modal used by fiscal windows) |

All changed windows (`fiscal-config`, `fiscal-monitor`, `monitor-verifactu`) belong to the same `fiscal` vertical and are tightly coupled in the error-resolution flow introduced by this feature.

## Why cross-domain changes are necessary

The SII/Verifactu error resolution flow spans:
1. **fiscal-monitor**: new VfSolveErrorModal and ContactDetailModal for resolving sending errors
2. **monitor-verifactu**: pipeline artifact updates (contract/decisions) to expose subsanation fields
3. **fiscal-config**: onboarding wizard updates for fiscal configuration
4. **LocationEditorModal** (shared): used by ContactDetailModal to edit BP addresses inline

Splitting these into separate PRs would leave the feature in a broken intermediate state because the modal, the API contract, and the shared component are all part of the same user-facing flow.

## Rollback plan

If issues are detected after merge:
1. Revert this branch via `git revert` on the merge commit (single atomic revert)
2. The rollback restores all 4 domains simultaneously — no partial state risk
3. Monitoring: verify fiscal monitor tab loads without JS errors; check VF sending status table renders

## Tests

- Unit tests: `VfSolveErrorModal.test.js`, `ContactDetailModal.test.js`, `VerifactuMonitorSection.vitest.jsx`, `useFiscalMonitor.vitest.js`
- Vitest: `VfSolveErrorModal.vitest.jsx`, `VerifactuMonitorSection.vitest.jsx`
- E2E: manual validation via fiscal monitor tab (verifactu subsection)

## Follow-up: Correct_Invoice 403 fix (still ETP-4131, same two domains)

The `Correct_Invoice` action shipped by this feature had no entity-level
`javaQualifier`, so it fell through NEO's generic OBUIAPP bridge, which
enforces an `OBUIAPP_Process_Access` grant that was never configured — a
silent 403 for every non-System-Administrator role (subsanation was correctly
wired from the start, only the correction path was missing).

- `window:monitor-verifactu`: `artifacts/monitor-verifactu/decisions.json` now
  declares `entities.facturasInválidas.javaQualifier: correct-invoice-handler`
  (mirrors the existing `facturasParcialmenteAceptadas` override);
  `contract.json` and the generated JSX were regenerated via
  `resolve-curated.js --write`.
- `window:fiscal-monitor`: `docs/generated-custom-windows/fiscal-monitor.md`
  documents both VF resolve-error backend paths and the
  `decisions.json` → `push-to-neo.js` → `export.database` sequence required to
  apply an entity `javaQualifier` (hand-editing the Etendo Go sourcedata XML
  and running `export.database` alone does nothing — that direction only
  exports DB → XML).
- Matching Java handler (`CorrectInvoiceHandler`) committed on the sibling
  `feature/ETP-4391` branch in `com.etendoerp.go`.
- Verified against the live local DB: `etgo_sf_entity.java_qualifier` for
  `facturasInválidas` was empty before, `correct-invoice-handler` after
  `push-to-neo.js monitor-verifactu`. `validate-pipeline.js
  --scope=monitor-verifactu` — 0 violations. Confirmed working end-to-end by
  the reporting user after deploying the Java change.
- Rollback: revert this addendum's commit and re-run `push-to-neo.js
  monitor-verifactu` to clear the `javaQualifier`; the entity falls back to
  the original (403-blocked) behavior, not a new failure mode. Revert the
  sibling `com.etendoerp.go` commit together with it.
