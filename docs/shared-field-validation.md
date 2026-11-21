# Shared field validation (ETP-4557)

Record forms (create and edit), inline grid add/edit and the CSV import review queue all decide
validity with the same declarative engine, `@etendosoftware/app-shell-core/lib/validation`
(ETP-4556, documented in `schema_forge_core/docs/validation-engine.md`).

## Where each flow calls it

| Flow | Entry point |
|------|-------------|
| Form save gate | `useEntity.getCoreFieldViolation` → `lib/coreValidation.js#getFirstViolation` |
| Form blur | `EntityForm.validateNumericOnBlur` → `getFieldError` (inline via `onFieldError`) |
| Grid add-row / inline edit | `DataTable`, `InlineLinesPanel` → `getFieldError` |
| Import pre-validation and review-queue re-validation | `validateRow({ emailTargets, fieldConstraints, fieldIdentities })` |
| Backend structured errors | `useEntity.handleSaveErrorResponse`, `inlineLineUpdateHandlers` → `mapBackendFieldErrors` / `structuredBackendMessage` |

The same value therefore returns the same engine code (`MAX_LENGTH`, `INVALID_FORMAT`, …) in every
flow. Codes map to the shared i18n keys `fieldMaxLengthError`, `fieldMinLengthError`,
`fieldMinValueError`, `fieldMaxValueError`, `sendModalInvalidEmail`, `phoneInvalidChars`,
`websiteInsecureUrl` and `fieldInvalidValue`.

## Native control attributes
`getNativeInputProps(field, error)` returns `maxLength`, `min`, `max` (declared `validation` first,
flat config second), `inputMode` (`email` / `tel` / `url`) and, when an error is set, `aria-invalid`
and `aria-describedby` (the message element is `error-<key>-msg`). `type` already comes from the
contract through `EntityForm.getInputType`.

## Compatibility policy
- **Create:** every registered visible, editable field is validated.
- **Edit:** only fields changed this session, and a value equal to the loaded record's is skipped, so
  an untouched legacy-invalid value never blocks an unrelated edit. A changed invalid value always
  blocks.
- **Grid cells:** an unchanged cell is skipped; a changed one is always validated.
- Read-only / hidden fields are skipped. Optional empty values are valid. Contracts without a
  `validation` object use only the flat `maxLength` / `min` that generated forms carry.
- Flat `max` stays a silent clamp; only a declared `validation.maximum` blocks.
- Email/website/phone formats are inferred from the field name (engine compat adapter, TEMPORARY)
  identically in form, grid and import; an explicit `format` wins.
- The website rule (domain-shaped host, https) now lives in the engine, not in an adapter copy.
- Import now uses the engine email pattern: a value such as `a@b.c` (one-letter TLD) is rejected.
- Length is decided by the contract's declared `maxLength` in every flow. The Contacts text-length
  table (`contactsFieldValidation.js`) only applies to a field whose contract declares no length;
  its unsafe-character and tax-id checks are unchanged. The Contacts artifact now declares
  `etgoPhone.validation.maxLength: 15` (set in `decisions.json`), so a 16-character phone fails
  with `MAX_LENGTH` in the form, the grid and import.
- Failed responses: structured codes map to localized inline/field messages; any other message that
  looks like SQL, a stack trace or another internal detail is replaced by `backendGenericError`
  (`extractErrorMessage` wraps every caller). Ordinary business messages keep their translation path.
- Blur: `EntityForm` shows the inline error through `setFieldError` (`useEntity`) and clears it on a
  valid non-empty value; the save gate sets and the next edit clears the same entry.
- `isEmailField` / `isWebsiteField` / `isPhoneField` are deprecated; remove them once contracts
  declare `format`.

## Bulk operations
The bulk actions (post, unpost, print, clone, delete in `SelectionToolbar`, `BulkDocumentAction`,
`ListView`) send record ids and action names, not field values, so they do not use the field
contract and are not wired to the validator.
