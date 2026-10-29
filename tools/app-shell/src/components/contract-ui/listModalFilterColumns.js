// Column metadata for the list-modal advanced filter ("Filtros" → "Filtro por condicionales").
// Plain module, no React. Moved out of ListModalWindow.jsx (ETP-5978) so it can be tested alone.
import { NUMERIC_FIELD_TYPES } from '@/lib/numericFieldTypes.js';

function isFk(col) {
  return col.type === 'selector' || col.type === 'foreignKey'
    || col.inputMode === 'selector' || col.inputMode === 'search';
}

function isBooleanColumn(col) {
  return col.type === 'boolean' || col.type === 'checkbox' || col.cellType === 'toggle' || col.toggle === true;
}

// Fields a declared toolbar dropdown already filters (`toolbarFilters[].field`, or its `key`).
function toolbarCoveredFields(toolbarFilters) {
  return new Set((toolbarFilters ?? []).map((f) => f?.field ?? f?.key).filter(Boolean));
}

/**
 * One filter column for a grid column / modal field, typed for the builder:
 *  - FK / selector → `selector`: the value-list picker (resolveFilterMode → 'identifier'), which
 *    offers the distinct id / identifier pairs of the rows and matches on the FK id;
 *  - boolean / checkbox / toggle → `boolean`: the Sí / No picker (booleanLabel mode), worded by
 *    the column's `badgeLabels` when it has them, and matched by `applyConditions`'s
 *    BOOLEAN_OPERATORS whatever the row's shape (true / 'Y');
 *  - enum / status with labels → `enum`; numeric or percent → `number`; anything else → `string`.
 */
function toFilterColumn(col, label) {
  if (isFk(col)) return { key: col.key, column: col.column, label, type: 'selector' };
  if (isBooleanColumn(col)) {
    return { key: col.key, column: col.column, label, type: 'boolean', badgeLabels: col.badgeLabels };
  }
  if (col.enumLabels && (col.type === 'enum' || col.type === 'status')) {
    return { key: col.key, label, type: 'enum', enumLabels: col.enumLabels };
  }
  // ETP-5107 — unified with DataTable.jsx / InlineLinesPanel.jsx via the shared set.
  if (col.cellType === 'percent' || NUMERIC_FIELD_TYPES.has(col.type)) {
    return { key: col.key, label, type: 'number' };
  }
  return { key: col.key, label, type: 'string' };
}

/**
 * The advanced filter offers EVERY entity column — the union of grid columns AND modal fields —
 * so columns hidden from the grid (e.g. pattern, contact, dimensions) are still filterable. Grid
 * columns win on a duplicate key (richer cell metadata / gridLabelKey).
 *
 * A boolean column is offered too, EXCEPT when a declared toolbar dropdown already filters that
 * field (match-rule's `active` behind "Todas las reglas") — two controls for one field would only
 * disagree. Before ETP-5978 every boolean was dropped, so a window with no such dropdown
 * (payment-term's "Siguiente día hábil", "Por defecto") could not filter by them at all.
 *
 * @param {Array<object>} columns  grid column descriptors
 * @param {Array<object>} fields   modal field descriptors
 * @param {Function} ui      useUI resolver
 * @param {Function} tMenu   useMenuLabel resolver
 * @param {Function} [tLabel] useLabel resolver (window field labels), may return null
 * @param {Array<{ key: string, field?: string }>} [toolbarFilters] `templateConfig.toolbarFilters`
 * @returns {Array<object>} AdvancedFilterBuilder columns
 */
export function buildFilterColumns(columns, fields, ui, tMenu, tLabel, toolbarFilters) {
  const byKey = new Map();
  for (const f of (fields ?? [])) if (f?.key) byKey.set(f.key, f);
  for (const c of (columns ?? [])) if (c?.key) byKey.set(c.key, c);

  const covered = toolbarCoveredFields(toolbarFilters);
  const resolveLabel = (col) => (col.labelKey ? ui(col.labelKey) : null)
    ?? (tLabel ? tLabel(col.column) : null) ?? tMenu(col.label) ?? col.label ?? col.key;

  return [...byKey.values()]
    .filter((col) => !(isBooleanColumn(col) && covered.has(col.key)))
    .map((col) => toFilterColumn(col, resolveLabel(col)));
}
