# Field Visibility Types

Schema Forge classifies every field into one of four visibility types. This classification drives behavior across the entire pipeline: extraction, curation, contracts, NEO Headless configuration, and frontend rendering.

## Visibility Types

| Aspect | `editable` | `readOnly` | `system` | `discarded` |
|--------|-----------|------------|----------|-------------|
| **Purpose** | User-editable input field | Display-only, set by backend/callouts | Hidden from UI, but present in API (callouts/defaults can set it) | Ignored field, not used |
| **NEO `isIncluded`** | `Y` | `Y` | `Y` | `N` |
| **NEO `isReadOnly`** | `N` | `Y` | `Y` | `N` |
| **In frontend contract** | Yes | Yes | No | No |
| **In backend contract** | Yes | Yes | Yes | Yes |
| **Shown in grid (default)** | No | No | No | No |
| **Shown in form (default)** | Yes | Yes | No | No |
| **Searchable (default)** | No | No | No | No |
| **Accepted in POST (create)** | Yes | Yes | Yes | No |
| **Accepted in PATCH (update)** | Yes | No | No | No |
| **Returned in GET response** | Yes | Yes | Yes | No |
| **FK reference resolved** | Yes | Yes | No | No |
| **Section assignment** | Yes | Yes | No | No |
| **displayLogic/readOnlyLogic** | Yes | Yes | No | No |

## How Fields Get Classified

Classification happens during extraction (`extract-fields.js`) using a priority-based algorithm:

| Priority | Condition | Assigned Visibility |
|----------|-----------|-------------------|
| 0 | Field is inactive (`field_isactive = 'N'`) | `discarded` |
| 1 | Primary key column (`columnName = tableName + '_ID'`) | `system` |
| 2 | Known system column (in `system-columns.json`) | `system` |
| 3 | Audit column (Created, CreatedBy, Updated, UpdatedBy) | `system` |
| 4a | Not displayed + shown in status bar | `readOnly` |
| 4b | Not displayed (no status bar) | `system` |
| 5 | Read-only or not updateable in AD | `readOnly` |
| 6 | Everything else | `editable` |

## Overriding in decisions.json

Any field's visibility can be overridden in `decisions.json`:

```json
{
  "entities": {
    "header": {
      "fields": {
        "documentAction": { "visibility": "editable" },
        "documentType": { "visibility": "readOnly" },
        "someUnusedField": { "visibility": "discarded" }
      }
    }
  }
}
```

Decision overrides **always win**, even over discard patterns (e.g., rescuing an `EM_*` field).

## Defaults per Visibility

When no explicit `grid`, `form`, or `searchable` is set in decisions, these defaults apply:

| Visibility | `grid` | `form` | `searchable` |
|-----------|--------|--------|--------------|
| `editable` | false | true | false |
| `readOnly` | false | true | false |
| `system` | false | false | false |
| `discarded` | false | false | false |

These defaults can be overridden individually in decisions:
```json
"businessPartner": { "grid": true, "searchable": true }
```

## NEO Headless Behavior

### Write Filtering (NeoFieldFilter)

| Operation | Allowed Fields |
|-----------|---------------|
| **POST (create)** | `includedFields` — all fields with `isIncluded=Y` (editable + readOnly) |
| **PUT/PATCH (update)** | `writableFields` — only fields with `isIncluded=Y` AND `isReadOnly=N` (editable only) |
| **GET (read)** | `includedFields` — all fields with `isIncluded=Y` (editable + readOnly) |

This distinction is important: readOnly fields (like `documentType`, `transactionDocument`) carry values from callouts/defaults that are required for record creation, but should not be modifiable on existing records.

### Mandatory Defaults Injection

After filtering, `NeoDefaultsService.injectMandatoryDefaults()` fills in any mandatory columns missing from the body using AD_Column defaults and AD_Preference values. This only applies to fields **not already present** in the filtered body.

## Common Patterns

| Pattern | Visibility | Why |
|---------|-----------|-----|
| Business Partner | `editable` | User selects it |
| Document No | `readOnly` | Auto-generated sequence |
| Document Type | `system` | Set by callout, mandatory for save, hidden from UI |
| Transaction Document | `system` | Set by callout on BP selection, mandatory for save, hidden from UI |
| Document Status | `readOnly` | Backend-controlled workflow state, shown in UI |
| Document Action | `editable` | Process button field (Complete, Void, etc.) |
| Posted | `editable` | Process button field (accounting) |
| AD_Client_ID | `system` | Auto-derived from session, included in NEO but hidden |
| AD_Org_ID | `system` | Auto-derived from session, included in NEO but hidden |
| Created/Updated | `system` | Audit timestamps, included in NEO but hidden |
| EM_* columns | `discarded` (default) | Module extension columns, excluded from everything unless rescued |
| Inactive fields | `discarded` | Not used in this window, excluded from everything |
