# CSV Import — Contract-Driven Field Validations

**Status:** Draft - pending stakeholder approval
**Date:** 2026-07-14
**Branch:** feature/ETP-4447 (current working branch; a dedicated feature branch/Jira
may be created via the Clerk workflow when implementation starts)
**Owner:** Schema Forge
**Jira:** TBD (pending creation)
**Repos:** `etendosoftware/schema_forge_core` (engine + generator) and
`etendosoftware/etendo_schema_forge` (Contacts window artifact + consumption)

## 1. Problem

The CSV import engine validates almost nothing client-side today. Of all the
validation-relevant metadata that already exists on entity fields in
`contract.json` (`required`, `type` ∈ `{enum, amount, date, integer, decimal,
foreignKey, string, ...}`, `enumValues`, `reference`), only **`required`** is
automatically consumed by the import pipeline. Everything else is either:

- **hand-authored per field** in each window's `decisions.json` (`isEmail`,
  `matchEntity`), or
- **not validated at all**, and only discovered when the row reaches the
  backend `/batch` endpoint and fails with a raw server error.

Two real, documented consequences of this gap:

1. `C_BPartner.Value` (search key) has a real 40-char AD column constraint.
   This was discovered only via a live server 500 ("Value too long. Length
   48, maximum allowed 40"), and is currently worked around by **silently
   truncating** the value in code
   (`contactsImportDescriptor.js:47`: `.slice(0, 40)`) — the user never sees
   that their data was cut.
2. `oBTIKTaxIDKey` is a real `type: "enum"` field with a documented
   `enumValues` array in the contract, but the CSV import path ignores it
   entirely and hardcodes a single default
   (`contactsImportDescriptor.js:28`: `DEFAULT_TAX_ID_KEY = '1'`) instead of
   accepting and validating a CSV column against the enum.

**The ask:** extend the import engine so that as much of this validation as
possible is **derived automatically from the contract**, not hand-written per
window — mirroring how `required` already works today, generalized to the
richer type vocabulary that already exists in every generated `contract.json`.

## 2. Current State

Verified against the code on `feature/ETP-4447` (2026-07-14).

### 2.1 Repo topology

The actual CSV import engine and UI live in the sibling repo
`schema_forge_core`, published as the npm package
`@etendosoftware/app-shell-core` and consumed here as a dependency. This repo
(`etendo_schema_forge`) only holds the Contacts window's `decisions.json` /
`contract.json` artifacts and the window-specific composite descriptor
(`tools/app-shell/src/windows/custom/contacts/contactsImportDescriptor.js`).
Any change to the engine itself requires editing, testing, and publishing
`schema_forge_core`, then bumping the dependency here.

### 2.2 Validation logic today (`validateRows.js`, `schema_forge_core`)

```js
export function validateRow(row, { requiredTargets = [], emailTargets = [], fkTargets = [], fkResolutions = new Map() }) {
  // requiredTargets → "Required field is missing."
  // emailTargets    → EMAIL_RE test → "Not a valid email address."
  // fkTargets       → fkResolutions status !== 'auto-resolved' → "could not be matched..."
}
```

`ImportDialog.jsx` derives these option arrays straight from `config.fields`
(lines 64-78):

- `required` — **already contract-derived**, backfilled by
  `generate-contract.js` from the entity field's own `required` flag.
- `isEmail` — **hand-authored per field** in `decisions.json` (no `type:
  "email"` exists in the contract's type vocabulary today, so it can't be
  inferred).
- `matchEntity` presence — **hand-authored per field** in `decisions.json`
  (an earlier attempt to derive FK-ness from a generic contract flag was
  abandoned because `generate-contract.js` never emits one — see the code
  comment at `ImportDialog.jsx:66-76`).

### 2.3 The merge point (`generate-contract.js:424-451`, `schema_forge_core`)

```js
if (win.import?.fields) {
  const allFields = Object.values(entities).flatMap((e) => e.fields);
  win.import.fields = win.import.fields.map((f) => {
    const match = allFields.find((ef) => ef.name === f.target);
    if (!match) {
      if (f.label) return { required: false, type: 'string', ...f };
      throw new Error(`window.import.fields references unknown field "${f.target}"`);
    }
    return { ...f, label: f.label ?? match.label, required: !!match.required, type: match.type, reference: match.reference };
  });
}
```

This backfill only copies `label` / `required` / `type` / `reference` from
the matched entity field onto the import field. It never copies
`enumValues`, and there is no length/pattern concept in the contract at all
today — a full-repo grep of every `artifacts/*/contract.json` confirms there
is **no `maxLength`/`pattern`/`min`/`max` key anywhere**. Capturing it would
require extending the DB extractor (`extract-from-db.js`, `schema_forge_core`)
to read `AD_Column.FieldLength`, which it does not do today.

### 2.4 Type vocabulary already present in contracts

Scanned across all `artifacts/*/contract.json` in this repo: `amount,
boolean, button, date, dateTime, decimal, enum, foreignKey, image, integer,
list, number, price, productAttribute, quantity, string, text, textarea`.
`enumValues` is already present and populated on `enum` fields (e.g.
`oBTIKTaxIDKey` carries 7 real options). None of this is consumed by import
validation today.

### 2.5 What stays unchanged by this proposal

The review-queue inline edit control
(`ImportReviewQueue.jsx:601`) is a plain, always-text `<Input>` regardless of
field type — enum/date/amount/foreignKey all get the same text box today
(FK-mismatch fields are the one exception, via `FkMismatchCell`). This
proposal does **not** change that; see §8.

## 3. Proposal

Make the CSV import engine's client-side validation **generic and
contract-driven**, so that any window with `window.import` enabled gains
enum, numeric, date, and max-length validation automatically from its
`contract.json` — with no per-window `decisions.json` authoring required for
the common case, exactly as `required` already works. Contacts is the first
and motivating consumer, not the scope boundary.

Numeric and date parsing must tolerate the locale formats real Spanish-
speaking users will actually type or export from Excel (comma-decimal
numbers, day-first dates), falling back to the standard/ISO format when the
locale-first parse doesn't apply.

The review queue's inline edit control remains a plain text input in this
iteration — only the validation **messages** are new; no new input widgets.

## 4. Architecture & Domain Boundaries

| # | Repo / domain | Content |
|---|---|---|
| 1 | `schema_forge_core` — extractor | `extract-from-db.js`: capture `AD_Column.FieldLength` into raw entity-field metadata |
| 2 | `schema_forge_core` — generator | `generate-contract.js`: extend the import-field backfill (§2.3) to also copy `enumValues` (when `type === 'enum'`) and `maxLength` (new) onto each import field |
| 3 | `schema_forge_core` — engine | `validateRows.js`: generic dispatch by `type` (enum / numeric / date / maxLength), plus two new pure, locale-tolerant parser helpers |
| 4 | `schema_forge_core` — UI wiring | `ImportDialog.jsx`: derive the new option arrays from `config.fields` (mirrors the existing pattern at lines 64-78) and pass them to `validateRow` |
| 5 | `etendo_schema_forge` — window | Bump the `@etendosoftware/app-shell-core` dependency, regenerate the Contacts artifact (`make regen ONLY=contacts`), verify the new metadata flows into `contract.json`, remove the now-redundant silent-truncation workaround |

No window-name conditionals anywhere — behavior differences come only from
each field's `type`/`enumValues`/`maxLength` in the contract. `decisions.json`
remains the override surface: a window can still hand-author `isEmail` /
`matchEntity` as today; nothing in this proposal requires new
`decisions.json` keys for the common case.

## 5. Data Model Changes

### 5.1 `extract-from-db.js` (schema_forge_core)

Capture `AD_Column.FieldLength` alongside the existing per-field extraction,
so it is available to the generator as raw schema data.

### 5.2 `generate-contract.js` (schema_forge_core)

Extend the backfill at lines 424-451 so each `window.import.fields` entry
also receives:

- `enumValues` — copied from `match.enumValues` when `match.type === 'enum'`
- `maxLength` — copied from `match.maxLength` (new, sourced from §5.1) when
  present; absent when the extractor didn't capture a length for that column
  (no false positives)

`type`/`reference` are already copied today and need no changes — the
validator dispatches on the existing `type` string.

## 6. Validation Engine Changes (`validateRows.js`, schema_forge_core)

Generalize `validateRow` to dispatch by field `type`, in addition to the
existing `required` / `isEmail` / `matchEntity` checks:

| `type` | New check | Error message (example) |
|---|---|---|
| `enum` | value must be an exact match against `enumValues` | "Value not among the allowed options: X, Y, Z" |
| `integer`, `decimal`, `amount`, `number`, `quantity`, `price` | parses as a valid number via the locale-tolerant numeric parser (§7) | "Not a valid number" |
| `date`, `dateTime` | parses as a valid calendar date via the locale-tolerant date parser (§7) | "Not a valid date" |
| `string`, `text`, `textarea` with a `maxLength` present | value length ≤ `maxLength` | "Exceeds maximum length of 40 characters" |

`ImportDialog.jsx` derives `enumTargets` / `numericTargets` / `dateTargets` /
`maxLengthByTarget` from `config.fields`, the same way it already derives
`requiredTargets` / `emailTargets` / `fkColumns` (lines 64-78), and passes
them into `validateRow`. Because `validateRow` is the single shared entry
point already used for both the pre-send pass and the review queue's inline
re-validate/retry, every new check applies at both stages with no additional
wiring.

### 6.1 Deferred / explicitly out of scope

- `boolean`, `list`, `productAttribute`, `image` — no CSV representation
  convention decided yet; left unvalidated in v1 rather than guessing a
  convention.
- `validationRule` (SQL-based AD combo/callout rules) — these are
  context-dependent SQL fragments meant for server-side evaluation; not
  usable client-side without a SQL/context evaluator, out of scope here.

## 7. Locale-Tolerant Parsing Rules

Both parsers are pure, independently unit-testable functions.

**Numbers:** trim whitespace, then:
1. If the value contains a comma, treat it as the decimal separator and
   strip any `.`/` ` as thousands separators (es-AR/es-ES convention, e.g.
   `"1.234,56"` → `1234.56`). If the result parses as a finite number,
   accept it.
2. Otherwise, parse as-is with a standard decimal-point convention (handles
   `"1234.56"` and `"1234"`).
3. If neither produces a finite number, the field fails validation.

**Dates:** attempt, in order:
1. Day-first explicit patterns (`dd/mm/yyyy`, `dd-mm-yyyy`) via regex —
   deliberately not `Date.parse()`, whose day/month assumption is ambiguous
   and locale-dependent.
2. ISO 8601 (`yyyy-mm-dd`).
3. If neither matches or the parsed date is not a valid calendar date
   (e.g. `31/13/2026`), the field fails validation.

## 8. Frontend Scope Boundaries (v1)

- **No type-aware input controls.** The review queue's inline edit stays a
  plain `<Input>` for every field type (matches current behavior — see §2.5).
  Only the validation messages are new.
- **No new backend validation.** `/batch` remains the authoritative source
  of truth; this is proactive client-side UX only, same split already
  established for the rest of the import pipeline (backend validates on
  send regardless of what the client checked).

## 9. Contacts Window Regeneration (etendo_schema_forge)

Once `schema_forge_core` publishes the new package version:

1. Bump the `@etendosoftware/app-shell-core` dependency in this repo.
2. Re-run extraction (the new `AD_Column.FieldLength` metadata requires a
   fresh DB extract, not just a decisions/contract regen) and
   `make regen ONLY=contacts`.
3. Verify `contract.json` now carries `enumValues` on `oBTIKTaxIDKey`'s
   import field and `maxLength` on `name`/searchKey-backed fields.
4. Replace the silent-truncation workaround in
   `contactsImportDescriptor.js:47` (`.slice(0, 40)`) with the new
   maxLength validation — an oversized value should surface as a review-queue
   error the user can fix, not be silently cut.
5. Reassess `contactsImportDescriptor.js:28`'s hardcoded
   `DEFAULT_TAX_ID_KEY` now that a real enum column is CSV-importable and
   validated; keep it only as the fallback default when the CSV omits the
   column.

## 10. Required Edge Cases / Test Plan

1. Enum field, CSV value not in `enumValues` → validation error listing the
   allowed values.
2. Enum field, CSV value exact-matches an allowed value → passes (exact
   match against `enumValues` values, not display labels — no
   case-folding/accent-normalization in v1).
3. Numeric field, es-AR formatted value (`"1.234,56"`) → parses correctly.
4. Numeric field, en-US/standard formatted value (`"1234.56"`) → parses
   correctly.
5. Numeric field, non-numeric garbage → validation error, row blocked from
   send.
6. Date field, day-first (`"31/12/2026"`) → parses as 2026-12-31.
7. Date field, ISO (`"2026-12-31"`) → parses correctly.
8. Date field, invalid under both patterns (`"13/13/2026"`) → validation
   error.
9. String field with `maxLength: 40`, CSV value of 48 chars → validation
   error showing the max length; value is **not** silently truncated
   (regression test replacing the current `.slice(0, 40)` workaround).
10. Field with no `maxLength` captured (extractor didn't return one) → no
    length check applied, no false positives.
11. Existing `required` / `isEmail` / `matchEntity` behavior unchanged
    (regression coverage).
12. A window other than Contacts with `window.import` enabled picks up enum/
    numeric/date/maxLength validation automatically after a contract
    regeneration, with zero `decisions.json` changes — the proof that this
    is a generic engine capability, not a Contacts-specific patch.

## 11. Documentation Updates

- `schema_forge_core/docs/superpowers/specs/2026-07-06-csv-import-design.md`
  — document the new validation coverage.
- `schema_forge_core/docs/feedback.md` — close/update the 2026-07-08
  searchKey-length entry once the silent-truncation workaround is replaced
  by real validation.
- `docs/decisions-reference.md` (this repo) — note that import field
  metadata (`required`, `type`, `enumValues`, `maxLength`) is now
  auto-derived from the contract; `isEmail`/`matchEntity` remain manual
  per-field flags.
- `docs/generated-custom-windows/contacts.md` — describe the new validation
  messages users will see during CSV import.

## 12. Rollout

1. `schema_forge_core`: extend `extract-from-db.js` (capture `FieldLength`).
2. `schema_forge_core`: extend `generate-contract.js`'s import backfill
   (`enumValues`, `maxLength`).
3. `schema_forge_core`: extend `validateRows.js` (generic type dispatch +
   locale-tolerant parsers) with unit tests.
4. `schema_forge_core`: wire `ImportDialog.jsx` to derive and pass the new
   option arrays.
5. Publish the new `@etendosoftware/app-shell-core` version.
6. `etendo_schema_forge`: bump the dependency, re-extract + regenerate the
   Contacts window, verify the contract backfill, remove the searchKey
   truncation workaround.
7. Update the docs in §11.
8. Manual/e2e pass: import a CSV with intentionally invalid enum / numeric /
   date / oversized-searchKey rows against Contacts; confirm the review
   queue flags each before send.

## 13. Resolved Decisions (stakeholder, 2026-07-14)

1. **Generic engine scope.** Applies to every window with `window.import`
   enabled; Contacts is the first consumer, not the boundary.
2. **v1 validation coverage includes `maxLength`.** In addition to enum and
   numeric/date format, length validation is in scope — it requires
   extending `extract-from-db.js` to capture `AD_Column.FieldLength`, which
   this proposal accepts as necessary work to close the documented
   searchKey-truncation gap.
3. **No type-aware inputs in v1.** The review queue's inline edit stays a
   plain text `<Input>`; only validation messages are added.
4. **Both repos in the same cycle.** `schema_forge_core` engine work and its
   consumption/regeneration in `etendo_schema_forge` (Contacts) ship
   together, not as separately scheduled efforts.
5. **Locale-tolerant numeric/date parsing.** Accepts es-AR/es-ES formats
   (comma-decimal, day-first dates) first, falling back to ISO/standard
   format.

## 14. Recommendation

Approve. This is a low-risk, purely additive client-side change — the
backend `/batch` endpoint remains the authoritative validator and is
untouched. It closes a real, already-documented production gap (the
searchKey silent-truncation workaround and the ignored tax-ID enum) with a
generic mechanism that requires no per-window code, extending the same
"auto-derived from contract" principle already proven out for `required`.
The main cost is the cross-repo dependency: `schema_forge_core` must ship
and publish first before Contacts (or any other window) can consume the new
metadata.
