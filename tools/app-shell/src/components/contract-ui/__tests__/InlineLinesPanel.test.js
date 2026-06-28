import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'InlineLinesPanel.jsx'), 'utf8');

describe('InlineLinesPanel', () => {
  it('exports a forwardRef default component', () => {
    assert.match(src, /forwardRef\(function InlineLinesPanel/);
    assert.match(src, /export default InlineLinesPanel/);
  });

  it('declares the expected prop surface', () => {
    for (const prop of [
      'columns', 'data', 'entity', 'token', 'apiBaseUrl',
      'selectedRowId', 'isDocumentReadOnly',
      'onSelectionChange', 'onUpdateRow', 'onDeleteRow',
    ]) {
      assert.match(src, new RegExp(`\\b${prop}\\b`), `missing prop reference: ${prop}`);
    }
  });

  it('exposes flushPendingEdits and closeEditing through the imperative ref', () => {
    assert.match(src, /useImperativeHandle/);
    assert.match(src, /flushPendingEdits/);
    assert.match(src, /closeEditing/);
  });

  it('renders only pencil and trash hover-action icons', () => {
    for (const icon of ['Pencil', 'Trash2']) {
      assert.match(src, new RegExp(`\\b${icon}\\b`), `missing icon import/use: ${icon}`);
    }
    // Copy / Mail / More icons were removed; assert they are NOT imported.
    for (const removed of ['Copy', 'Mail', 'MoreHorizontal']) {
      assert.doesNotMatch(src, new RegExp(`\\b${removed}\\b`), `unexpected icon present: ${removed}`);
    }
  });

  it('wires pencil → handleEditClick and trash → handleDeleteClick', () => {
    assert.match(src, /aria-label=\{ui\('editLineTooltip'\)[^}]*\}\s*\n\s*title=\{ui\('editLineTooltip'\)[^}]*\}\s*\n\s*onClick=\{\(\)\s*=>\s*handleEditClick/);
    assert.match(src, /aria-label=\{ui\('deleteRowTooltip'\)[^}]*\}\s*\n\s*title=\{ui\('deleteRowTooltip'\)[^}]*\}\s*\n\s*onClick=\{\(\)\s*=>\s*handleDeleteClick/);
  });

  it('locks edit and delete actions when isDocumentReadOnly is true', () => {
    assert.match(src, /if \(isDocumentReadOnly\) return;/);
    assert.match(src, /isDocumentReadOnly && !isDocumentReadOnly|!isDocumentReadOnly/);
    // The edit handler must early-return on locked docs; same for delete.
    assert.match(src, /handleEditClick[\s\S]*?if \(isDocumentReadOnly\) return;/);
    assert.match(src, /handleDeleteClick[\s\S]*?if \(isDocumentReadOnly\) return;/);
  });

  it('only allows a single row in edit mode at a time', () => {
    // editingRowId is a scalar (not a Set/array), so toggling another row replaces the previous one.
    assert.match(src, /\[editingRowId, setEditingRowId\] = useState\(null\)/);
    assert.match(src, /setEditingRowId\(prev => \(prev === row\.id \? null : row\.id\)\)/);
  });

  it('autosaves on field commit via onUpdateRow', () => {
    assert.match(src, /commitField/);
    assert.match(src, /onUpdateRow\?\.\(row, col\.key, effectiveValue/);
  });

  it('emits a deduplicated success toast after each inline save', () => {
    // Per-row id so editing several cells of the same row collapses into one
    // rolling toast instead of stacking a fresh one for every blur.
    assert.match(
      src,
      /toast\.success\(ui\('recordSaved'\), \{ id: `inline-save-\$\{row\.id\}` \}\)/,
      'commitField must fire toast.success with a per-row dedup id on successful PATCH',
    );
  });

  it('makes selector and search columns inline-editable via InlineSearchCombo', () => {
    const editableTypesMatch = src.match(/EDITABLE_TYPES = new Set\(\[([\s\S]+?)\]\)/);
    assert.ok(editableTypesMatch, 'EDITABLE_TYPES set not found');
    assert.match(editableTypesMatch[1], /'selector'/);
    assert.match(editableTypesMatch[1], /'search'/);
    // Imports the shared searchable combobox and builds the selector URL the same way DataTable does.
    assert.match(src, /import \{ InlineSearchCombo \} from '\.\/InlineSearchCombo\.jsx'/);
    assert.match(src, /selectors\/\$\{col\.column\}/);
    // Selector commits include the FK identifier so the local row label can refresh.
    assert.match(src, /onChange=\{\(id, label\) => onCommit\(id, \{ identifier: label \|\| '' \}\)\}/);
  });

  it('opens a lookup drawer for lookup/popup fields instead of the dropdown', () => {
    // The hard-wired ProductSearchDrawer import was replaced by the registry.
    assert.doesNotMatch(src, /import ProductSearchDrawer from '\.\/ProductSearchDrawer\.jsx'/);
    assert.match(src, /import \{ resolveLookupDrawer \} from '\.\/lookupDrawers\.js'/);
    assert.match(src, /function LookupTrigger\(/);
    assert.match(src, /if \(col\.lookup \|\| col\.popup\) \{/);
    // LookupTrigger resolves the per-window drawer via the registry by field.lookupDrawer
    // and renders it generically as <Drawer ... />.
    assert.match(src, /const Drawer = resolveLookupDrawer\(field\.lookupDrawer\)/);
    assert.match(src, /<Drawer\b/);
    // The drawer receives a localized title (lookupTitle → label → '').
    assert.match(src, /title=\{field\.lookupTitle \|\| field\.label \|\| ''\}/);
    // The drawer's onSelect must commit id, identifier, AND the full item so the parent
    // can extract the auxiliary values (product_PSTD, product_PLIM, …) that the callout
    // needs to compute the price.
    assert.match(src, /onSelect=\{\(item\) => \{[\s\S]*?onCommit\(id, \{ identifier: label, selectedItem: item \}\);/);
  });

  it('uses Figma design tokens (40px visible row, Inter font, #E8EAEF separator)', () => {
    assert.match(src, /rowHeight: 41/);
    assert.match(src, /'#E8EAEF'/);
    assert.match(src, /'#121217'/);
    assert.match(src, /Inter/);
  });

  it('lifts the row with a shadow on hover and while editing', () => {
    // Hover state: shadow + raised z-index so the shadow is not clipped by adjacent rows.
    assert.match(src, /hover:shadow-\[/);
    assert.match(src, /hover:z-10/);
    // Editing state preserves the same elevation so the actively edited row stays prominent.
    assert.match(src, /isEditing\s*\?\s*'shadow-\[[^']*\]\s+relative\s+z-20'/);
  });

  it('uses i18n hooks for tooltips and labels (no hardcoded English)', () => {
    assert.match(src, /useUI/);
    assert.match(src, /useLabel/);
    assert.match(src, /useLocale/);
    assert.match(src, /resolveColumnLabel/);
  });

  it('supports onEditRow prop — dispatches to caller instead of opening inline edit', () => {
    // When onEditRow is provided the pencil routes through it (e.g. to open a modal).
    assert.match(src, /onEditRow/);
    assert.match(src, /onEditRow\(row\)/);
  });

  it('supports onRowClick prop — row body click fires the handler', () => {
    assert.match(src, /onRowClick/);
    assert.match(src, /onRowClick\(row\)/);
  });

  it('includes enum and select in EDITABLE_TYPES', () => {
    const editableTypesMatch = src.match(/EDITABLE_TYPES = new Set\(\[([\s\S]+?)\]\)/);
    assert.ok(editableTypesMatch, 'EDITABLE_TYPES set not found');
    assert.match(editableTypesMatch[1], /'enum'/);
    assert.match(editableTypesMatch[1], /'select'/);
  });

  it('renders a native <select> for enum/select columns in edit mode', () => {
    assert.match(src, /col\.type === 'enum' \|\| col\.type === 'select'/);
    assert.match(src, /<select/);
    assert.match(src, /col\.enumLabels/);
  });

  it('always reserves a 160px action slot in the header when there is no amount column', () => {
    // trailingColumn is null when the last column is not an amount type.
    // reserveActionSlot ensures the header row and body rows always have the same
    // rightmost 160px slot so columns never shift on hover.
    assert.match(src, /reserveActionSlot/);
    assert.match(src, /trailingColumn\s*==\s*null/);
  });

  it('imports linesColumnWidth helper for consistent column sizing', () => {
    assert.match(src, /import \{ columnFlex \} from '@\/lib\/linesColumnWidth\.js'/);
  });

  it('exposes clearSelection through the imperative ref', () => {
    assert.match(src, /clearSelection/);
    assert.match(src, /useImperativeHandle/);
  });

  it('emits onSelectionChange when checkbox state changes', () => {
    assert.match(src, /onSelectionChange\?\.\(/);
  });

  it('right-aligns numeric column headers via NUMERIC_TYPES conditionals', () => {
    assert.match(src, /NUMERIC_TYPES\.has\(col\.type\) \? 'flex-end' : 'flex-start'/);
    assert.match(src, /NUMERIC_TYPES\.has\(col\.type\) \? 'right' : 'left'/);
  });
});
