import { render, screen } from '@testing-library/react';

// ETP-4543 (superseded by ETP-4529) — this test originally covered two
// ALWAYS-declared plain grid columns, 'project' and 'costcenter', toggled
// independently via `hiddenColumns`. ETP-4529 replaced that plain-column UX
// with the shared "Dimensiones contables" expand-row pattern (the same one
// Amortización already used — see DimensionsPanel.jsx / DimSummary /
// DimensionGrid): InvoiceLinesTable now declares a SINGLE `dimensionsPanel`
// column (key `'dimensions'`) built from `DIMENSION_FIELD_CANDIDATES_BASE`
// (`project`, `costcenter`), which is itself filtered by `hiddenColumns`
// before being handed to the panel, and the column is entirely omitted from
// `columns` when every candidate ends up hidden (see InvoiceLinesTable.jsx's
// `dimensionFields.length > 0` guard).
//
// `hiddenColumns` still arrives the same way DetailView always produced it —
// computed from `lineDisplayLogic.visibility` (see
// DetailView.lineHiddenColumns.vitest.jsx for that derivation) and forwarded
// through `<DetailTable hiddenColumns={lineHiddenColumns} />` →
// InvoiceLinesTable (`{...props}` spread) → InlineLinesPanel — only what it
// controls downstream has changed.
//
// This test mounts the REAL InvoiceLinesTable + REAL InlineLinesPanel (only
// their leaf UI dependencies are stubbed — icons, i18n, formatting helpers,
// the selector combo/lookup widgets used only in edit mode) and asserts,
// end to end (not just at the prop-plumbing level):
//   - by default, the `dimensions` column renders with both `project` and
//     `costcenter` candidates represented in the collapsed DimSummary badges;
//   - hiding one candidate (`hiddenColumns={['project']}`) removes only that
//     candidate's evidence from the panel, leaving the other intact;
//   - hiding every candidate omits the `dimensions` column (and its expand
//     chevron) entirely, per the `dimensionFields.length > 0` guard.

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => 'EUR',
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (v) => (v != null ? `${Number(v).toFixed(2)}` : '—'),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => {
    const idKey = `${key}$_identifier`;
    return row[idKey] || row[key] || '';
  },
}));

vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label || col.key,
}));

vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnFlex: () => '1 0 100px',
  columnMinWidthPx: () => 100,
}));

// Edit-mode-only widgets (never rendered by this read-mode test) — stubbed
// so importing the real InlineLinesPanel doesn't pull in their own deps.
vi.mock('@/components/contract-ui/InlineSearchCombo.jsx', () => ({
  InlineSearchCombo: () => <span data-testid="inline-combo-stub" />,
}));
vi.mock('@/components/contract-ui/SelectorInput.jsx', () => ({
  SelectorInput: () => <span data-testid="selector-input-stub" />,
}));
vi.mock('@/components/contract-ui/ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));

// Only the barrel's DataTable export is stubbed (unused by this
// linesLayout='inlineEditable' + addRow.active=false path) — InlineLinesPanel
// is imported for real so the hiddenColumns filtering under test is genuine.
vi.mock('@/components/contract-ui', async () => {
  const inlineMod = await vi.importActual('@/components/contract-ui/InlineLinesPanel.jsx');
  return {
    InlineLinesPanel: inlineMod.default,
    DataTable: () => <div data-testid="datatable-stub" />,
  };
});

import InvoiceLinesTable from '../InvoiceLinesTable.jsx';

const ROWS = [
  {
    id: 'L1',
    product: 'P1', 'product$_identifier': 'Widget',
    project: 'PRJ1', 'project$_identifier': 'Project Alpha',
    costcenter: 'CC1', 'costcenter$_identifier': 'HQ',
  },
];

function renderTable(props = {}) {
  return render(
    <InvoiceLinesTable
      data={ROWS}
      linesLayout="inlineEditable"
      addRow={{ active: false }}
      entity="sales-invoice-line"
      token="test"
      apiBaseUrl="/api"
      selectorContext={{}}
      onSelectionChange={vi.fn()}
      onUpdateRow={vi.fn().mockResolvedValue()}
      onDeleteRow={vi.fn().mockResolvedValue()}
      {...props}
    />,
  );
}

describe('InvoiceLinesTable — dimensionsPanel column visibility (ETP-4529, superseding ETP-4543)', () => {
  it('renders the dimensions column by default, with both project and costcenter represented in it', () => {
    renderTable();
    expect(screen.getByTestId('column-header-dimensions')).toBeInTheDocument();
    // Evidence both candidates are part of the panel: their identifiers surface
    // in the collapsed DimSummary badges (see DimensionsPanel.jsx's DimBadge).
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('HQ')).toBeInTheDocument();
  });

  it('excludes project from the dimensions panel when hiddenColumns includes "project", keeping costcenter', () => {
    renderTable({ hiddenColumns: ['project'] });
    // The column itself is still declared — costcenter remains a live candidate.
    expect(screen.getByTestId('column-header-dimensions')).toBeInTheDocument();
    expect(screen.queryByText('Project Alpha')).toBeNull();
    expect(screen.getByText('HQ')).toBeInTheDocument();
  });

  it('omits the dimensions column entirely when hiddenColumns hides every candidate', () => {
    renderTable({ hiddenColumns: ['project', 'costcenter'] });
    // dimensionFields.length === 0 → the column (and its expand chevron) is
    // dropped from `columns` altogether — not just emptied.
    expect(screen.queryByTestId('column-header-dimensions')).toBeNull();
    expect(screen.queryByTestId('dimensions-panel-toggle')).toBeNull();
    expect(screen.queryByText('Project Alpha')).toBeNull();
    expect(screen.queryByText('HQ')).toBeNull();
  });

  it('uses DataTable when linesLayout is not inlineEditable', () => {
    renderTable({ linesLayout: undefined, addRow: undefined });
    expect(screen.getByTestId('datatable-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('column-header-dimensions')).toBeNull();
  });
});
