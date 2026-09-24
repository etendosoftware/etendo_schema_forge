/**
 * ETP-5281 — `hasDimensionsPanel` must ask "are any dimension FIELDS actually
 * visible", not "does a `dimensionsPanel` COLUMN exist in `columns`".
 *
 * Before this fix, `DataTable.jsx`'s gate was:
 *   columns.some(c => c.type === 'dimensionsPanel')
 * while `InlineLinesPanel.jsx`'s own gate (driving its real saved-row chevron)
 * was:
 *   visibleDimensionFields.length > 0   // dimensionFields filtered by hiddenColumns
 *
 * A tenant with every GL dimension field hidden (no dimensions configured) still
 * declares the `dimensionsPanel` column in the contract with a non-empty
 * `dimensionFields` array — only every entry is individually hidden via
 * `hiddenColumns`. In that shape, InlineLinesPanel correctly renders NO chevron
 * for its saved rows, but DataTable's old gate still saw `columns.some(...)` as
 * true and kept reserving a 44px leading chevron slot for the add-row — a
 * PERMANENT (not transient) 44px misalignment between the add-row and every
 * saved row above it. This is the real cause behind QA's "se agrega un espacio
 * que desfasa todas las líneas" complaint (ETP-5133 QA rejection).
 *
 * The fix makes DataTable mirror InlineLinesPanel's exact predicate:
 *   (dimensionsPanelColumn?.dimensionFields ?? []).some(f => !hiddenColumns.includes(f.key))
 *
 * This suite renders BOTH real components (not just the extracted
 * `renderLinesColgroup` helper — see DataTable.linesColgroupChevron.vitest.jsx
 * for that lower-level suite) with the exact same `columns`/`hiddenColumns`
 * pair, and asserts they agree on whether the leading chevron slot exists —
 * in both directions: all dimension fields hidden (no chevron anywhere), and
 * at least one visible (chevron reserved everywhere).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { DataTable } from '../DataTable.jsx';
import InlineLinesPanel, { CHECKBOX_COLUMN_WIDTH, CHEVRON_COLUMN_WIDTH } from '../InlineLinesPanel.jsx';

vi.mock('react-dom', () => ({ createPortal: (c) => c }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/i18n', () => ({
  useLabel: () => () => '',
  useUI: () => (k) => k,
  useLocale: () => 'en_US',
  useMenuLabel: () => (k) => k,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (u) => u }));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: (catalogs, entity, field) => catalogs?.[field.key] || [],
}));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'bg-gray-400',
  getStatusTone: () => 'neutral',
  statusLabel: (s) => s,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (d, f) => d?.[f] }));
vi.mock('@/lib/resolveColumnLabel.js', () => ({ resolveColumnLabel: (c) => c.label }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => String(v) }));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({ applyCalloutUpdates: vi.fn() }));
vi.mock('../InlineSearchCombo.jsx', () => ({
  InlineSearchCombo: ({ field }) => <span data-testid={`inline-combo-${field.key}`} />,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <span data-testid="selector-input" />,
  default: () => null,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
// Real predicate (not an always-true stub) — the exclusion of `dimensionsPanel`
// from the grid-column set is orthogonal to (and must not be confused with)
// the hiddenColumns-driven gate under test here.
vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnMinWidthPx: () => 100,
  columnFlex: () => '1 0 100px',
  isLineGridColumn: (col) => col?.type !== 'dimensionsPanel',
}));

const DIMENSIONS_COLUMN = {
  key: 'dimensions',
  type: 'dimensionsPanel',
  label: 'Dimensions',
  dimensionFields: [
    { key: 'project', label: 'Project', type: 'string' },
    { key: 'costCenter', label: 'Cost Center', type: 'string' },
  ],
};

const PRODUCT_COLUMN = { key: 'product', label: 'Product', type: 'string' };

// The header strip's leading control, in DOM order: the [chevron placeholder]?
// then the [checkbox wrapper]. Reads back the first child's own inline width so
// this suite doesn't depend on where the Checkbox component happens to place
// its own aria-label internally.
function firstHeaderControlWidthPx() {
  const row = screen.getByTestId('column-header-product').parentElement;
  const firstChild = row.children[0];
  return firstChild.getAttribute('style')?.match(/width:\s*(\d+)px/)?.[1] ?? null;
}

function renderInlineLinesPanel({ hiddenColumns }) {
  return render(
    <InlineLinesPanel
      columns={[PRODUCT_COLUMN, DIMENSIONS_COLUMN]}
      data={[{ id: 'r1', product: 'Widget' }]}
      hiddenColumns={hiddenColumns}
      entity="lines"
      token="test"
      apiBaseUrl="/api"
      selectorContext={{}}
      onSelectionChange={vi.fn()}
      onUpdateRow={vi.fn().mockResolvedValue()}
      onDeleteRow={vi.fn().mockResolvedValue()}
    />,
  );
}

function renderDataTableAddRow({ hiddenColumns }) {
  return render(
    <DataTable
      columns={[PRODUCT_COLUMN, DIMENSIONS_COLUMN]}
      data={[]}
      hiddenColumns={hiddenColumns}
      addRow={{
        active: true,
        fields: [{ key: 'product', label: 'Product', type: 'string' }],
        onAdd: vi.fn(),
        onCancel: vi.fn(),
        catalogs: {},
      }}
      selectable
      hideHeader
      hideDataRows
      linesLayout="inlineEditable"
    />,
  );
}

describe('DataTable/InlineLinesPanel agreement on hasDimensionsPanel (ETP-5281)', () => {
  it('reserves NO chevron anywhere when every dimension field is hidden — DataTable and InlineLinesPanel agree', () => {
    const allHidden = ['project', 'costCenter'];

    renderInlineLinesPanel({ hiddenColumns: allHidden });
    // Saved rows render no expand-chevron toggle...
    expect(screen.queryByTestId('dimensions-panel-toggle')).not.toBeInTheDocument();
    // ...and the header strip reserves no leading 44px chevron placeholder
    // either — its first leading control is the 40px checkbox wrapper.
    expect(firstHeaderControlWidthPx()).toBe(String(CHECKBOX_COLUMN_WIDTH));

    renderDataTableAddRow({ hiddenColumns: allHidden });
    const addRow = screen.getByTestId('inline-add-row');
    const cells = addRow.querySelectorAll('td');
    // Before the fix this suite regresses against, cells[0] was the aria-hidden
    // CHEVRON_COLUMN_WIDTH placeholder even with every dimension field hidden.
    expect(cells[0].style.width).not.toBe(`${CHEVRON_COLUMN_WIDTH}px`);
  });

  it('reserves the SAME chevron slot everywhere when at least one dimension field is visible', () => {
    const oneVisible = ['costCenter']; // project stays visible

    renderInlineLinesPanel({ hiddenColumns: oneVisible });
    expect(screen.getByTestId('dimensions-panel-toggle')).toBeInTheDocument();
    expect(firstHeaderControlWidthPx()).toBe(String(CHEVRON_COLUMN_WIDTH));

    renderDataTableAddRow({ hiddenColumns: oneVisible });
    const addRow = screen.getByTestId('inline-add-row');
    const cells = addRow.querySelectorAll('td');
    expect(cells[0]).toHaveAttribute('aria-hidden', 'true');
    expect(cells[0].style.width).toBe(`${CHEVRON_COLUMN_WIDTH}px`);
  });

  it('still reserves the chevron in both renderers when NO hiddenColumns are declared at all (control case)', () => {
    renderInlineLinesPanel({ hiddenColumns: [] });
    expect(screen.getByTestId('dimensions-panel-toggle')).toBeInTheDocument();
    expect(firstHeaderControlWidthPx()).toBe(String(CHEVRON_COLUMN_WIDTH));

    renderDataTableAddRow({ hiddenColumns: [] });
    const addRow = screen.getByTestId('inline-add-row');
    const cells = addRow.querySelectorAll('td');
    expect(cells[0]).toHaveAttribute('aria-hidden', 'true');
    expect(cells[0].style.width).toBe(`${CHEVRON_COLUMN_WIDTH}px`);
  });
});
