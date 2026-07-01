# Cross-Domain Plan — ETP-3504 Sonar cleanup

## Context
Behavior-preserving SonarQube refactors that happen to touch two domains in one change. They are grouped only because Sonar reported them together; there is no shared code or behavioral coupling between the two files.

## Domains
- `platform-change` — `tools/app-shell/src/pages/OAuth2ClientsPage.jsx` (extracted a nested ternary into guard clauses inside an IIFE).
- `window:assets` — `tools/app-shell/src/windows/custom/assets/AssetsAmortizationPanel.jsx` (extracted a nested ternary into a `renderBody()` helper).

## Tests
- `node --test tools/app-shell/test/OAuth2ClientsPage.test.js` → 17/17 pass.
- `AssetsAmortizationPanel`: no unit test exists; verified innocuous via esbuild parse + manual diff review (no hook-order, i18n, or branch changes).
- Whole change validated with `/innocuous-check` → verdict INNOCUOUS for all hunks.

## Rollback
Pure frontend refactor — no data migration, no NEO push, no schema/contract change. Roll back with `git revert` of this single commit (the two .jsx files revert together with this plan).
