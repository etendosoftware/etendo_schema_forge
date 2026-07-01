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
