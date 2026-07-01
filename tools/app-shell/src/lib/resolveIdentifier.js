/**
 * Resolve the display value for a field in a data row.
 *
 * NEO API returns FK fields as two separate properties:
 *   row.fieldName           → raw UUID
 *   row.fieldName$_identifier → human-readable name
 *
 * Mock data uses objects: row.fieldName = { id, name }
 *
 * This helper checks both formats and falls back to the raw value.
 */

// Translates English C_DocType names to Spanish display labels.
// These are stable Etendo system names — not user data.
const DOC_TYPE_LABELS = {
  'ar invoice': 'Factura',
  'ar invoice indirect': 'Factura',
  'ar credit memo': 'Nota de crédito',
  'return material sales invoice': 'Factura de devolución',
  'es return material sales invoice': 'Factura de devolución',
  'ap invoice': 'Factura de compra',
  'ap credit memo': 'Nota de crédito de compra',
  'return material receipt': 'Factura de devolución de compra',
};

const DOC_TYPE_FIELDS = new Set(['cDocTypeTargetId', 'transactionDocument', 'documentType']);

/** Returns true when a field key carries a C_DocType reference that should be translated. */
export function isDocTypeField(key) {
  return DOC_TYPE_FIELDS.has(key);
}

/** Translates a raw C_DocType.Name (English) to its Spanish display label. */
export function resolveDocTypeName(name) {
  if (name == null) return name;
  return DOC_TYPE_LABELS[name.toLowerCase()] ?? name;
}

export function resolveIdentifier(row, key) {
  if (!row || key == null) return undefined;
  const identifier = row[`${key}$_identifier`];
  if (identifier != null) {
    if (DOC_TYPE_FIELDS.has(key)) {
      const translated = DOC_TYPE_LABELS[identifier.toLowerCase()];
      if (translated) return translated;
    }
    return identifier;
  }
  const raw = row[key];
  if (raw && typeof raw === 'object' && raw.name) return raw.name;
  return raw;
}
