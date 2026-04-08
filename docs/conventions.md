# Schema Forge — Edge Case Conventions

Decisions from the AB-4 alignment session. These conventions apply to all CLI tools, extractors, validators, and generators.

## 1. System field without derivation

A field with `visibility: system` MUST have a `derivation` defined. If missing, the schema validator emits an **error** (blocks generation).

```json
// INVALID — will fail validation
{ "name": "createdBy", "visibility": "system" }

// VALID
{ "name": "createdBy", "visibility": "system", "derivation": { "type": "fromConfig", "source": "currentUser" } }
```

## 2. Rule with missing Java class

If a rule references a Java class that doesn't exist in the source, include it in the catalog with `"status": "missing_class"`. The human reviewer decides what to do.

```json
{
  "name": "SL_Order_Legacy",
  "class": "org.openbravo.erpCommon.ad_callouts.SL_Order_Legacy",
  "status": "missing_class"
}
```

## 3. Auto-classifier confidence

The auto-classifier assigns `confidence: "high" | "medium" | "low"` based on how certain it is of its decision. The human reviewer can use this to prioritize review (e.g., review low-confidence first).

```json
{
  "name": "SL_Order_Amt",
  "decision": "keep",
  "confidence": "high"
}
```

## 4. Error handling in CLI tools

CLI tools **fail fast**: throw on error, write to stderr, exit code 1. No partial results, no accumulating errors.

```
$ node cli/extract-fields.js --window 143
ERROR: Column AD_Column.foo does not exist
(exit code 1)
```

## 5. DB access pattern

Shared connection helper. A single reusable module (`db.js` or equivalent) that all CLI tools import.

## 6. Null handling in extracted metadata

Omit the key entirely. If a field has no displayLogic, the key does not appear in the JSON.

```json
// CORRECT — no displayLogic key
{ "name": "DocumentNo", "visibility": "readOnly" }

// WRONG
{ "name": "DocumentNo", "visibility": "readOnly", "displayLogic": null }
```

## 7. Callout registered in AD but class not in classpath

Same treatment as convention 2: `"status": "missing_class"`. Applies to callouts, processes, and any rule type.

## 8. DisplayLogic with legacy JS syntax

Extract as-is. The AI will interpret and translate it during generation. No special marking needed.

```json
{
  "displayLogic": "@OrderType@='SO' & eval(someOldExpression)"
}
```

## 9. DefaultValue format

Extract raw without differentiating SQL vs variable format. The string is stored as-is.

```json
{ "defaultValue": "SELECT COALESCE(MAX(line),0)+10 FROM C_OrderLine WHERE C_Order_ID=@C_Order_ID@" }
{ "defaultValue": "@DateOrdered@" }
```

## 10. Tab pointing to a view

Extract normally and mark with `"tableType": "view"`. At the Java/OBDal level a view behaves the same as a table.

```json
{
  "tab": "Order Line",
  "table": "C_OrderLine_v",
  "tableType": "view"
}
```

## 11. DisplayLogic in AD_Field AND in rule catalog

Both apply. They are combined with AND logic — both conditions must be true for the field to display.

```json
{
  "name": "FreightAmt",
  "displayLogic": "@FreightCostRule@='F'",
  "catalogRule": "@IsLogistics@='Y'",
  "effectiveLogic": "@FreightCostRule@='F' & @IsLogistics@='Y'"
}
```

## 12. Computed field vs derivation.type=computed

They are **different concepts**:
- **Computed field**: a visibility concern — the field is `system` (hidden, auto-filled)
- **derivation.type: computed**: describes HOW the value is calculated

A field can be `visibility: system` with `derivation.type: fromParent` (not computed). A field can be `visibility: readOnly` with `derivation.type: computed` (visible but not editable).

```json
// system + fromParent (not computed)
{ "name": "client", "visibility": "system", "derivation": { "type": "fromConfig", "source": "currentClient" } }

// readOnly + computed
{ "name": "lineNetAmt", "visibility": "readOnly", "derivation": { "type": "computed", "formula": "qty * price" } }
```

## 14. Callout aux-value hook pattern in generated forms

When a callout returns aux fields (e.g., `SL_Inventory_Product` returning `_QTY` and `_UOM`), the
generated form must translate them to actual form fields via a custom component (see `docs/ui-customization.md`).

**Selector item field convention:**
- `_aux._UOM` / `_aux._QTY` — raw values (IDs). Fired as `product_UOM`, `product_QTY`.
- Top-level `item.uOM` — display name (e.g., `"Unit"`). Fired as `product_uOM` (camelCase suffix).

The `_` prefix (all-caps) vs lowercase distinction is significant: all-caps = ID, lowercase = display name.

**Standard hook template** (inside a custom component):

```jsx
const _rawOnChange = props.onChange;
// eslint-disable-next-line no-param-reassign
props = { ...props, onChange: (key, val, col) => {
  _rawOnChange?.(key, val, col);
  // Map _aux values → form fields
  if (key === 'product_QTY') _rawOnChange?.('bookQuantity', val);       // ID value from _aux
  else if (key === 'product_UOM') _rawOnChange?.('uOM', val);           // ID value from _aux
  // Map top-level display name → identifier for display without catalog lookup
  else if (key === 'product_uOM' || key === 'productuOM') _rawOnChange?.('uOM$_identifier', val);
} };
```

**Why `$_identifier`?** FK fields use two slots: `fieldName` (the DB ID) and `fieldName$_identifier`
(the display string). If only the ID is set and the catalog is empty, the UI shows the raw ID.
Capturing the display name from the selector item's top-level field avoids this.

**Why this is preserved on regeneration:** The hook lives in a custom component under `windows/custom/{window}/` which is never overwritten by the pipeline. The generated `*Page.jsx` imports it via a `decisions.json` config key (see `docs/ui-customization.md`).

## 13. Unique constraints naming

Include both Java field names and DB column names.

```json
{
  "uniqueConstraints": [
    {
      "field": "businessPartner",
      "column": "c_bpartner_id"
    }
  ]
}
```
