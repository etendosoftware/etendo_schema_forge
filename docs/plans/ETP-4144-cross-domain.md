# ETP-4144 — Cross-domain plan

**Feature:** VIES validation toast on Business Partner save and automatic tax key
(NOI) assignment when the BP address country changes to an EU/non-ES country in
Etendo GO.

This PR is approved as cross-domain because the feature forms a single cohesive
flow that cannot be split: the backend injects `messages` into the save response,
`useEntity.js` reads them to show the toast, `LocationEditorModal` does the same
for address saves, and the contacts artifact is regenerated to include the VIES
status field. All three domains must land together or the feature is broken.

## Domains touched

### `platform-change` — `useEntity.js` generic `backendMessages` handler
Adds a generic mechanism to `handleSave` that reads `data?.messages` from any
save response and shows typed toasts (success / warning / error / info). Falls
back to the default success toast when no messages are present. This is a
platform-level change that benefits all windows, not just contacts.

- `tools/app-shell/src/hooks/useEntity.js`
- `tools/app-shell/src/hooks/__tests__/useEntity.coverage.vitest.jsx`
- `tools/app-shell/src/components/contract-ui/DetailView.jsx` — wires `onParentRefresh` so the BP header refetches after an address save
- `tools/app-shell/src/components/contract-ui/EntityForm.jsx` — read-only Select fields render as disabled Input

### `shared-custom-capability` — `LocationEditorModal` address toast
The shared address editor modal reads `response.data[0].messages` (PUT) and
`newRecord.messages` (POST) from the address save response and calls
`showBackendMessages` to display the VIES / tax-key notification.

- `tools/app-shell/src/windows/custom/shared/LocationEditorModal.jsx`
- `tools/app-shell/src/windows/custom/shared/__tests__/LocationEditorModal.vitest.jsx`

### `window:contacts` — artifact regeneration
Contacts window artifacts are regenerated to include the `oBTIKVIESStatus` and
`oBTIKTaxIDKey` fields that drive the toast logic.

- `artifacts/contacts/contract.json`
- `artifacts/contacts/contract.mcp.json`
- `artifacts/contacts/decisions.json`
- `artifacts/contacts/generated/web/contacts/`

## Tests

- 9 Vitest tests in `useEntity.coverage.vitest.jsx` cover the `backendMessages` path (all toast types, empty array, missing field)
- 7 Vitest tests in `LocationEditorModal.vitest.jsx` cover `showBackendMessages` for PUT and POST address saves

## Rollback

Remove the `backendMessages` block from `useEntity.js` (revert to always calling
`showSaveSuccessToast`) and revert `LocationEditorModal.jsx` to not call
`showBackendMessages`. No DB migration needed.
