/**
 * DataTable — `balanceFooter` totals row in its hidden add-row-only companion
 * mode (ETP-5210 follow-up to "Fix totals row order when add-row is active").
 *
 * Covers the regression guard on the DataTable side: when this instance is
 * InlineLinesPanel's hidden companion table (`hideHeader && hideDataRows`,
 * see the generated `*LineTable` wrapper's `addRow?.active` branch) and a
 * `balanceFooter` is configured, the totals row (rendered via the exported
 * `renderBalanceFooterRow`/`buildLineCellStyle` from InlineLinesPanel.jsx)
 * must land AFTER the add-row form's own rendered rows in DOM order — never
 * before or interleaved with them. This is the actual bug that shipped:
 * the row used to render between the saved lines and the add-row form.
 *
 * Combined-mount scenarios (both InlineLinesPanel and this DataTable side by
 * side, mirroring the real generated wrapper) live in
 * InlineLinesPanel.dataTableBalanceFooterCombined.vitest.jsx.
 */
import { render, screen } from '@testing-library/react';
import { DataTable } from '../DataTable.jsx';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: () => 'bg-gray-400',
  getStatusGridPillClass: () => '',
  getStatusPillClass: () => '',
  getStatusTone: () => 'neutral',
  statusLabel: (raw) => raw,
}));
vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => <span data-testid="status-tag">{label || status}</span>,
}));
vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label }) => <span>{label}</span>,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[`${key}$_identifier`] ?? row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label ?? col.key,
}));
vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val) => (val != null ? String(val) : ''),
}));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <div data-testid="selector-input" />,
}));

// Deliberately does NOT mock @/lib/linesColumnWidth.js — same rationale as
// InlineLinesPanel.balanceFooter.vitest.jsx: the totals row must reuse the
// REAL per-column columnFlex(), not a constant stub.

const COLUMNS = [
  { key: 'account', label: 'Cuenta', type: 'string' },
  { key: 'amtSourceDr', label: 'Débito', type: 'amount' },
  { key: 'amtSourceCr', label: 'Crédito', type: 'amount' },
];

const BALANCE_FOOTER = {
  debitField: 'amtSourceDr',
  creditField: 'amtSourceCr',
  debitTotal: '100,00 €',
  creditTotal: '0,00 €',
};

function renderAddRowCompanion(props = {}) {
  return render(
    <DataTable
      columns={COLUMNS}
      data={[]}
      addRow={{ active: true, fields: COLUMNS, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
      selectable={false}
      hideHeader
      hideDataRows
      {...props}
    />,
  );
}

describe('DataTable — add-row companion mode renders balanceFooter after the add-row (ETP-5210)', () => {
  it('renders the totals row when hideHeader+hideDataRows+addRow.active+balanceFooter', () => {
    renderAddRowCompanion({ balanceFooter: BALANCE_FOOTER });
    expect(screen.getByTestId('balance-footer-row')).toBeInTheDocument();
  });

  it('positions the totals row AFTER the add-row form in DOM order (the actual regression guard)', () => {
    renderAddRowCompanion({ balanceFooter: BALANCE_FOOTER });
    const addRow = screen.getByTestId('inline-add-row');
    const footer = screen.getByTestId('balance-footer-row');
    // DOCUMENT_POSITION_FOLLOWING on the addRow→footer comparison means footer
    // comes AFTER addRow in the document — not just "present somewhere".
    const position = addRow.compareDocumentPosition(footer);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(position & Node.DOCUMENT_POSITION_PRECEDING).toBeFalsy();
  });

  it('renders no totals row when balanceFooter is absent (backwards compatibility)', () => {
    renderAddRowCompanion();
    expect(screen.queryByTestId('balance-footer-row')).not.toBeInTheDocument();
  });

  it('renders no totals row when addRow is not active, even with balanceFooter set', () => {
    render(
      <DataTable
        columns={COLUMNS}
        data={[]}
        addRow={{ active: false, fields: COLUMNS, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
        balanceFooter={BALANCE_FOOTER}
        selectable={false}
        hideHeader
        hideDataRows
      />,
    );
    expect(screen.queryByTestId('balance-footer-row')).not.toBeInTheDocument();
  });
});
