# ETP-4121 — Cross-domain plan

**Feature:** Manual bank-statement creation (header + lines, no file) for the
`financial-account` window — the "Crear extracto" modal plus its backend
`?action=create` endpoint.

This PR is approved as cross-domain because a single window feature
unavoidably touches two shared areas: the i18n catalog and the shared data-hook
layer. The change is small and inseparable from the window feature.

## Domains touched

### `window:financial-account` (primary)
The feature itself — the modal, its sub-components and wiring:
- `windows/custom/financial-account/ManualStatementModal.jsx` (new) — header + editable lines + live totals + split save button.
- `windows/custom/financial-account/LookupPicker.jsx` (new) — shared text-input + search dropdown picker (portalled), reused by this window's modals.
- `windows/custom/financial-account/formFields.jsx` (new) — shared field primitives (`FieldRow`, `inputClass`).
- `windows/custom/financial-account/StatementsToolbar.jsx` — import button becomes a split-button (▾ → "Create manually").
- `windows/custom/financial-account/ImportedStatementsTab.jsx` — wires the modal + `reload` on success.
- `windows/custom/financial-account/NewMovementDialog.jsx` — refactored to consume the extracted `LookupPicker` / `formFields` (no behaviour change).
- `docs/generated-custom-windows/financial-account.md` — window guide updated.

### `app-shell-core` (shared i18n)
- `packages/app-shell-core/src/locales/en_US.json`, `es_ES.json` — new `financeAccountStatementsManual*` keys (en/es parity). There is no per-window locale file; window i18n strings live in the shared catalog by design, so any window that adds strings touches this domain.

### `platform-change` (shared hooks)
- `tools/app-shell/src/hooks/useCreateStatement.js` (+ test) — a window-specific data hook placed in the shared `src/hooks/` directory, following the existing convention (`useStatementImport`, `useStatementPreview`, `useBankStatements`, `useCreateMovement` all live there). It only POSTs to `bank-statements?action=create` and is consumed solely by this window.

## Tests

- **Frontend (Vitest):**
  - `ManualStatementModal.vitest.jsx` — render, add-lines CTA, commit/edit/remove lines, validation (missing name / no usable line), save-and-process payload, save-as-draft (`process=false`), backend-error path.
  - `LookupPicker.vitest.jsx` — dropdown open/select, search icon, value init + clear-on-edit, loading hint, empty state.
  - `StatementsToolbar.vitest.jsx` — split-button menu open + `onManualClick`.
  - `ImportedStatementsTab.vitest.jsx` — manual modal open + `reload` on success.
  - `useCreateStatement.vitest.jsx` — POST URL/body/headers, busy flag, HTTP/network error handling.
  - Full `financial-account` suite is green (274 tests) and `LookupPicker.jsx` is ~97% line-covered.
- **Backend (JUnit, com.etendoerp.go):** `BankStatementsHandlerTest` — `?action=create` validation branches (reflection), happy path (persists statement + lines, maps BP/GL-item FKs, processes), account-not-found 400, and save-as-draft skips processing.

## Rollback

The feature is purely additive and gated behind a new modal + a new endpoint
action; nothing else changes behaviour.

- **Frontend:** revert the schema_forge feature commits on `feature/ETP-4121`. The split-button falls back to the plain "Import statement" button; the new i18n keys become unused (harmless) and can be dropped with the revert. The `LookupPicker`/`formFields` extraction in `NewMovementDialog` is behaviour-preserving, so reverting it restores the inline versions with no functional difference.
- **Backend:** revert the `com.etendoerp.go` commit; `?action=create` simply stops being routed (returns 405), the existing list/lines/import/preview actions are untouched. No DB schema change is involved (uses existing `FIN_BankStatement` / `FIN_BankStatementLine`).
