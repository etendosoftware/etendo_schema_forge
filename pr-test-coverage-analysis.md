# PR Test Coverage Analysis

Analysis date: 2026-04-24

Scope: last 10 pull requests observed with `gh pr list --state all --limit 10` in `etendosoftware/etendo_schema_forge`.

Excluded as non-task PRs:

- #418 `Epic ETP-3504: Sync develop into epic`: automated sync PR, no changed files.
- #417 `Freeze epic into develop.`: aggregate/rollup PR, not an isolated task PR.

Task PRs evaluated: #420, #419, #416, #415, #414, #413, #412, #411.

Important CI note: the observed `.github/workflows/test.yml` runs only:

```bash
node --test 'cli/test/*.test.js'
npm run build --workspace=tools/app-shell
```

Therefore, many tests added under `tools/app-shell/src/**/__tests__` or `artifacts/**/__tests__` exist in PR diffs, but are not executed by the main observed test workflow. `make test` also runs `tools/app-shell/src/lib/__tests__/*.test.js`, but it still does not execute every component/custom-window test found in these PRs.

## Summary

| PR | Task | Tests added/modified? | Executed by observed CI? | Coverage assessment |
|---:|---|---|---|---|
| #420 | Reactivate action + bulk completion | No | Not applicable | Poor |
| #419 | Invoice PDF logo/identity + clone quotation | Yes | Partial/no: CLI no; build only compiles | Low-medium |
| #416 | Create-contact modal person/company behavior | No | Not applicable | Poor |
| #415 | E2E tests for Physical Inventory | Yes | Not in `test.yml`; requires E2E target | Good smoke/E2E, limited by mocks |
| #414 | Partner address picker with inline creation | Yes | Not observed | Low-medium |
| #413 | Under Evaluation state in Sales Quotation | Yes | Partial: CLI generator test yes; modal test no | Medium-low |
| #412 | Contacts person/company toggle | No | Not applicable | Poor |
| #411 | `forceCalloutFields` / callout override | Yes | Partial: CLI yes; lib test not in `test.yml`, yes in `make test` | Good core coverage, incomplete integration |

## PR details

### #420 — Feature ETP-3846: Add Reactivate action & Bulk Completion

Observed relevant changes:

- New `useDocumentAction` hook.
- New `documentAction` support in `DetailView`.
- New bulk actions for Sales Order and Purchase Order.
- Generator changes in `cli/src/generate-frontend.js`.
- Documentation updates for Sales Order and UI customization.

Tests added/modified: none observed.

Observed checks:

- `test`: pass.
- `validate`: pass.
- `sfqg`: pass.
- `architecture-check`, `core-approval`, and `window-doc-freshness`: failing in the observed state.

Assessment: poor coverage.

This is critical behavior: it reactivates documents, executes bulk actions, handles partial failures, and refreshes records/UI state. The PR has no direct tests for the new behavior.

Uncovered risks:

- `useDocumentAction.execute()` with HTTP errors, non-JSON payloads, missing `recordId`, or missing `docAction`.
- `DetailView` success/error feedback and record refresh after document action.
- Bulk action with mixed `DR`/`CO` selections.
- Bulk action with partial backend failures.
- Confirm modal opening through `draftMode.onConfirm` and global events.
- Sales Order and Purchase Order bulk action implementations can drift because they are near-duplicates.

Recommendations:

- Add unit tests for `useDocumentAction`.
- Add generator tests for `documentAction`, `labelKey`, `successKey`, and handler precedence (`documentAction > columnName > onClick`).
- Extract a shared bulk document-action helper/component or test both order implementations explicitly.
- Add at least one E2E/manual automated flow for successful reactivation and one backend error case.

### #419 — Feature ETP-3836: Add company logo and identity to invoice PDF

Observed relevant changes:

- `useInvoicePdf.js` adds logo, session defaults, issuer organization, and a rewritten template/CSS.
- Sales Quotation gets clone actions in the topbar and custom wrapper.
- Session defaults are documented.

Tests added/modified:

- `artifacts/sales-quotation/custom/__tests__/QuotationTopbarActions.test.js`
- `tools/app-shell/src/windows/custom/sales-quotation/__tests__/index.test.js`
- `tools/app-shell/src/windows/custom/shared/__tests__/useInvoicePdf.test.js`

Test quality:

- Most tests are source-text assertions using `readFileSync` and `assert.match`.
- They verify that certain strings/imports exist, not that behavior works.
- PDF tests cover presence of `/session`, `yourCompanyDocumentImageId`, `companyLogoDataUrl`, and company identity fields, but do not exercise fetch behavior or template output with real inputs.
- Clone tests verify wiring by regex, but do not validate modal behavior, clone success, navigation, close behavior, or backend errors.

CI:

- These tests are not in `cli/test/*.test.js`.
- The app-shell build provides compilation/import coverage only.

Assessment: low-medium coverage.

The PR has test intent, but most tests are structural and fragile rather than behavioral.

Recommendations:

- Extract pure functions from `useInvoicePdf` for invoice data preparation and test them with real input objects.
- Mock `fetch` to cover session defaults, image present/absent, image errors, and incomplete organization data.
- Add coverage for line sorting by ERP `lineNo`, which appears in the commits but is not directly covered by the observed tests.
- Test clone navigation and failure behavior through a functional component test or isolated helper.

### #416 — Feature ETP-3799: Align create-contact modal with contact type behavior

Observed relevant changes:

- `CreateContactModal` adds `person/company` mode.
- New `buildPersonName` logic.
- Dynamic header fields, required fields, progress fields, and person-specific validation.
- `EntityCreationModal` adds `titleRightContent`, `headerContent`, and `validate` support.
- The previous close button in the title area was replaced by `titleRightContent`; this can affect modal close UX unless another close affordance exists.

Tests added/modified: none observed.

Assessment: poor coverage.

This PR changes domain behavior and validation, but has no direct tests.

Uncovered risks:

- Person contact without first/last name should fail validation.
- Person contact with first or last name should construct the expected fallback display name.
- Company contact should require legal name.
- Payload should not send company `name` for person mode unless intentionally derived by backend.
- Payload should not send person first/last fields for company mode unless intended.
- `EntityCreationModal.validate` should block save and show an error.
- Modal close behavior may regress because the title close button was changed.

Recommendations:

- Extract and test `buildPersonName`, payload construction, required fields, and progress fields by contact type.
- Add tests for `EntityCreationModal.validate` behavior.
- Add a UI-level smoke test for switching person/company mode and closing the modal.

### #415 — Feature ETP-3585: Add E2E tests for Physical Inventory window

Observed relevant changes:

- New `e2e/tests/flows/physical-inventory.mocked.spec.js`.
- Updated E2E helpers in `auth.js` and `selectors.js`.
- Mock mode intercepts `/sws/*` calls.

Tests added:

- List view title and New button.
- Sortable column headers.
- New form required fields.
- Lines tab columns.
- Cancel returns to list.
- Add line opens inline row.
- `forceCalloutFields` regression: product selection overwrites user-typed `userCount`.

CI:

- The observed `test.yml` workflow does not run Playwright E2E tests.
- Makefile has `test-e2e`, `test-e2e-headless`, and related targets, but they are not part of the main observed workflow.

Assessment: good E2E smoke/regression coverage, limited by mocks.

Strengths:

- Covers real UI navigation.
- Covers the critical `forceCalloutFields` regression path.
- Provides reusable helpers.

Limitations:

- Uses synthetic intercepts for `/sws/*`, so it does not validate real backend contracts.
- Does not cover final inventory/line save payloads.
- Does not cover callout errors or empty selector results.
- Does not run automatically in the observed main CI workflow.

Recommendations:

- Add a headless E2E job in CI, even if optional or nightly.
- Assert request payloads in intercepts where possible.
- Keep a real-backend smoke variant if an environment is available.

### #414 — Feature ETP-3662: Add partner address picker with inline creation

Observed relevant changes:

- New `CreatableSearchSelect`.
- New `PartnerAddressPicker`.
- `EntityForm` uses `PartnerAddressPicker` for `C_BPartner_Location_ID` fields.
- `LocationEditorModal.onSaved` now passes `newId` and `newName`.

Tests added:

- `tools/app-shell/src/components/contract-ui/__tests__/CreatableSearchSelect.test.js`
- `tools/app-shell/src/components/contract-ui/__tests__/PartnerAddressPicker.test.js`

Test quality:

- Tests are source-text/regex assertions.
- They cover the presence of props, imports, strings, and source patterns such as `field.dependsOn`, `Authorization`, `onCreateRequest`, `setRefreshKey`, `LocationEditorModal`, and `contactsApiBase`.
- They do not execute React, simulate users, or mock fetch.

Uncovered risks:

- Fetching and rendering options.
- Disabled/clear behavior when parent business partner is empty.
- Auto-selecting the first address when parent changes.
- Inline creation callback selecting the new address.
- Selector errors and empty states.
- `LocationEditorModal` response shape handling for `newId/newName`.

CI:

- These tests are not observed in the main workflow.

Assessment: low-medium coverage.

There are tests, but they mostly lock source shape rather than behavior. The component has meaningful state/effects/fetch behavior that is not exercised.

Recommendations:

- Extract and test pure helpers for `contactsApiBase`, option normalization, and disabled/clear/autoselect decisions.
- Add functional component tests with React Testing Library or equivalent.
- Include these tests in a CI-executed script if they are intended to be official coverage.

### #413 — Feature ETP-3836: Add Under Evaluation state to Sales Quotation

Observed relevant changes:

- New `SendToEvaluationModal`.
- `QuotationTopbarActions` separates Draft and Under Evaluation states.
- `QuotationConfirmModal` now assumes UE state.
- `cancel.visibleWhenStatus` becomes `["CO", "UE"]`.
- Generator changes export/import `api` to avoid duplication.
- Payment terms exposed in sales/purchase order/invoice artifacts.

Tests added/modified:

- `artifacts/sales-quotation/custom/__tests__/SendToEvaluationModal.test.js`
- `cli/test/generate-frontend.test.js`

Test quality:

- The CLI generator test is a real test and is executed by the observed workflow. It verifies importing `api` from the Page component and avoiding duplicate `const api` definitions.
- `SendToEvaluationModal.test.js` is source regex. It checks for strings like `action/DocAction`, `window.location.reload`, and `setError`, but does not execute the modal or mock fetch.

Uncovered risks:

- Draft state shows the “send to evaluation” action.
- UE state shows final confirm/create-document action.
- CO/UE cancel visibility works as intended.
- Backend DocAction errors are surfaced.
- Record/line fetch partial failure behavior.
- Loading state prevents double submit.

CI:

- CLI generator tests are executed.
- The modal regex test is not observed in the main workflow.

Assessment: medium-low coverage.

Generator coverage is good for the specific duplication bug. The business flow coverage is weak.

Recommendations:

- Add functional tests for `SendToEvaluationModal` with mocked fetch for success, backend error, partial initial fetch, and double-click/loading behavior.
- Add a composition test or E2E for the button rendered by `documentStatus`.

### #412 — Feature ETP-3660: Update Contacts Name translation labels

Observed relevant changes:

- Adds person/company toggle in Contacts.
- Adds custom contacts wrapper.
- Adds `ContactsProvider`, `ContactsBusinessPartnerForm`, and `ContactTypeToggle`.
- Excludes `name` for person mode and `etgoFirstname`/`etgoLastname` for company mode.
- Changes registry to load the custom Contacts window.
- Decisions add label overrides, first/last name fields, and `javaQualifier`.

Tests added/modified: none observed.

Observed checks:

- `test`: pass.
- `architecture-check`: fail in the observed state.
- `core-approval`: fail in the observed state.

Assessment: poor coverage.

This PR changes UI behavior and contact-domain representation without direct tests.

Uncovered risks:

- Registry loads the custom Contacts window.
- `ContactsProvider` is required and `useContactsType` fails outside it.
- Toggle changes visible/excluded fields.
- Person excludes legal name.
- Company excludes first/last name.
- Backend payload/persistence works with `businessPartnerHandler`.
- English/Spanish labels are correct.

Recommendations:

- Add tests for field exclusion by type.
- Add a registry test confirming `contacts` loads the custom window.
- Add a render smoke test for the custom Contacts window.
- Add E2E or manual scripted evidence for creating both a person and a company.

### #411 — Feature ETP-3585: Add forceCalloutFields to allow callout results to win

Observed relevant changes:

- `forceCalloutFields` is propagated through curated/frontend contract/generator.
- New `applyCalloutUpdates` helper.
- `DetailView` uses the helper to apply callout updates.
- Physical Inventory decisions/contract uses `forceCalloutFields`.

Tests added:

- `cli/test/generate-contract.test.js`
- `cli/test/generate-frontend.test.js`
- `tools/app-shell/src/lib/__tests__/applyCalloutUpdates.test.js`

Test quality:

Strong coverage for the core logic:

- Preserves `forceCalloutFields` from schema to frontend contract.
- Omits empty arrays.
- Generator emits JSON arrays.
- Untouched fields receive callout updates.
- Touched fields are normally preserved.
- Forced fields overwrite touched values.
- Empty/null handling is covered.
- Trigger field always applies.
- Previous state is not mutated.
- Empty updates are handled.

Remaining gaps:

- No direct integration test that `DetailView` builds the forced field set correctly from the field triggering the callout.
- UI-level behavior is covered later by #415 E2E, but not in this PR alone.

CI:

- CLI tests are executed by the observed workflow.
- `applyCalloutUpdates.test.js` is not executed by `.github/workflows/test.yml`, but is executed by `make test` according to the observed Makefile.

Assessment: good core coverage, incomplete integration coverage.

This is the strongest-tested task PR in the set, especially when considered together with #415.

Recommendations:

- Align CI with `make test`, or add `tools/app-shell/src/lib/__tests__/*.test.js` to the workflow.
- Extract/test the `DetailView` forced-field set construction, or add a small integration test around callout application.

## Overall conclusions

Out of 8 task PRs:

- PRs with observed tests: #419, #415, #414, #413, #411.
- PRs with no observed tests: #420, #416, #412.

Only tests under `cli/test/*.test.js` are clearly executed by the main observed workflow. Many UI/custom-window tests are not wired into CI.

There is a strong pattern of source-regex tests for UI/custom components. Those can catch deleted imports or renamed strings, but they do not validate user behavior or state transitions.

Best-covered PRs:

- #411: strong pure logic and generator coverage, with edge cases.
- #415: useful E2E smoke/regression coverage, though not in the main observed CI and limited by mocks.

Most concerning PRs:

- #420: critical document action and bulk-processing behavior without tests.
- #416 and #412: person/company contact logic without tests.
- #414: complex fetch/state component covered only by source-text assertions.

## Cross-cutting recommendations

1. Update `.github/workflows/test.yml` to run `make test`, or explicitly include app-shell lib/component tests that the team considers official.
2. Decide whether tests under `tools/app-shell/src/components/**/__tests__` and `artifacts/**/__tests__` are official. If yes, wire them into CI.
3. Gradually replace source-regex tests with pure-helper tests or component interaction tests.
4. For window/document tasks, require at least:
   - one generator/contract test when Schema Forge behavior changes;
   - one pure logic or hook test when transformations/actions are added;
   - one E2E or scripted manual verification for critical user flows.
