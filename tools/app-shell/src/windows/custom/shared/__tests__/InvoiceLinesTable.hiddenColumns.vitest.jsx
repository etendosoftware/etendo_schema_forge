import { render, screen } from '@testing-library/react';

// ETP-4543 — end-to-end coverage for the Project/Cost Center columns
// InvoiceLinesTable declares (see InvoiceLinesTable.jsx, columns 'project'
// and 'costcenter'). These columns are ALWAYS declared (independent of
// decisions.json's `grid` flag); actual visibility is enforced dynamically
// via the `hiddenColumns` prop, which DetailView computes from
// `lineDisplayLogic.visibility` (see DetailView.lineHiddenColumns.vitest.jsx
// for that derivation) and forwards down through
// `<DetailTable hiddenColumns={lineHiddenColumns} />` → InvoiceLinesTable
// (`{...props}` spread) → InlineLinesPanel.
//
// This test mounts the REAL InvoiceLinesTable + REAL InlineLinesPanel (only
// their leaf UI dependencies are stubbed — icons, i18n, formatting helpers,
// the selector combo/lookup widgets used only in edit mode) and asserts that
// passing `hiddenColumns={['project']}` (the shape DetailView produces when
// evaluate-display resolves `visibility.project === false`) actually removes
// the Project column from the rendered grid, while `hiddenColumns={[]}` /
// omitting the key (the `visibility.project === true` / fail-open case)
// keeps it visible — end to end, not just at the prop-plumbing level.

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

describe('InvoiceLinesTable — dynamic project/costcenter column visibility (ETP-4543)', () => {
  it('renders the Project and Cost Center columns by default (visibility=true / key absent)', () => {
    renderTable();
    expect(screen.getByTestId('column-header-project')).toBeInTheDocument();
    expect(screen.getByTestId('column-header-costcenter')).toBeInTheDocument();
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('HQ')).toBeInTheDocument();
  });

  it('hides the Project column when hiddenColumns includes "project" (visibility.project=false)', () => {
    renderTable({ hiddenColumns: ['project'] });
    expect(screen.queryByTestId('column-header-project')).toBeNull();
    expect(screen.queryByText('Project Alpha')).toBeNull();
    // Cost Center is unaffected — only the explicitly-false key is hidden.
    expect(screen.getByTestId('column-header-costcenter')).toBeInTheDocument();
    expect(screen.getByText('HQ')).toBeInTheDocument();
  });

  it('hides the Cost Center column when hiddenColumns includes "costcenter"', () => {
    renderTable({ hiddenColumns: ['costcenter'] });
    expect(screen.queryByTestId('column-header-costcenter')).toBeNull();
    expect(screen.queryByText('HQ')).toBeNull();
    expect(screen.getByTestId('column-header-project')).toBeInTheDocument();
  });

  it('shows the Project column again once hiddenColumns no longer includes it (visibility.project=true)', () => {
    const { rerender } = renderTable({ hiddenColumns: ['project'] });
    expect(screen.queryByTestId('column-header-project')).toBeNull();

    rerender(
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
        hiddenColumns={[]}
      />,
    );
    expect(screen.getByTestId('column-header-project')).toBeInTheDocument();
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
  });

  it('uses DataTable (not InlineLinesPanel) when linesLayout is not inlineEditable', () => {
    renderTable({ linesLayout: undefined, addRow: undefined });
    expect(screen.getByTestId('datatable-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('column-header-project')).toBeNull();
  });
});
