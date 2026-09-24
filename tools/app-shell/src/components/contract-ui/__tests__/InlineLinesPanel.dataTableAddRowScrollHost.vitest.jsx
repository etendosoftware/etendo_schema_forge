/**
 * Combined-mount regression suite for ETP-5133 (QA point #3, "add-row
 * scroll-sync") — the real bug in this rejection cycle.
 *
 * The generated `*LineTable` wrapper mounts `InlineLinesPanel` (saved rows,
 * owner of the ONE horizontal scroll via its `overflow-x-auto` body) and
 * `DataTable` (`hideHeader`/`hideDataRows`, `linesLayout: 'inlineEditable'`,
 * the add-row form) as SIBLINGS, not parent/child — same shape covered for
 * the balance-footer regression in
 * InlineLinesPanel.dataTableBalanceFooterCombined.vitest.jsx:
 *
 *   <InlineLinesPanel ref={ref} columns={columns} {...props} addRow={undefined} />
 *   <DataTable columns={columns} filters={filters} {...props} hideHeader hideDataRows />
 *
 * Before this fix, DataTable's add-row rendered its own independent
 * `<table>` — a second, separately-scrolled element that went out of sync
 * with InlineLinesPanel's saved rows on any window with enough columns to
 * need horizontal scroll. `lib/linesScrollHost.js` fixes this: while the
 * add-row form is active, InlineLinesPanel registers a real DOM anchor
 * (`inline-add-row-host`) INSIDE its own scroll body, and DataTable's add-row
 * portals its `<table>` there via `useLinesScrollHost`.
 *
 * This file mounts both components together (no generated wrapper involved)
 * and asserts the add-row's rendered DOM is a genuine descendant of
 * InlineLinesPanel's scroll-host container — this is the actual observable
 * behavior QA reported as broken, not just "some registry function got
 * called". It also covers the documented fallback: no sibling host
 * registered → DataTable still renders its add-row standalone, unchanged.
 */
import { render, screen, within } from '@testing-library/react';
import InlineLinesPanel from '../InlineLinesPanel.jsx';
import { DataTable } from '../DataTable.jsx';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useLabel: () => () => '',
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
vi.mock('../InlineSearchCombo.jsx', () => ({
  InlineSearchCombo: ({ field, displayLabel }) => (
    <span data-testid={`inline-combo-${field.key}`}>{displayLabel}</span>
  ),
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <span data-testid="selector-input" />,
  default: () => null,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({
  default: () => null,
}));

const COLUMNS = [
  { key: 'account', label: 'Cuenta', type: 'string' },
  { key: 'amount', label: 'Importe', type: 'amount' },
];

const ROWS = [
  { id: 'L1', account: 'A1', 'account$_identifier': 'Caja', amount: '100' },
];

const inlineLinesPanelProps = {
  columns: COLUMNS,
  data: ROWS,
  entity: 'lines',
  token: 'test',
  apiBaseUrl: '/api',
  selectorContext: {},
  onSelectionChange: vi.fn(),
  onUpdateRow: vi.fn().mockResolvedValue(),
  onDeleteRow: vi.fn().mockResolvedValue(),
};

// Mirrors the generated *LineTable wrapper's `props.addRow?.active` branch
// exactly: InlineLinesPanel gets `lineFormActive` + `addRow={undefined}`, the
// sibling DataTable gets `hideHeader`/`hideDataRows`/`linesLayout:
// 'inlineEditable'` plus the real, active `addRow` — the combination that
// makes DataTable derive `ilpTrailing` true and attempt the scroll-host
// portal. Both share the SAME `entity` key, the registry's lookup key.
function renderCombinedAddRowActive() {
  return render(
    <>
      <InlineLinesPanel
        {...inlineLinesPanelProps}
        lineFormActive
        addRow={undefined}
      />
      <DataTable
        entity="lines"
        columns={COLUMNS}
        data={[]}
        addRow={{ active: true, fields: COLUMNS, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
        selectable={false}
        hideHeader
        hideDataRows
        linesLayout="inlineEditable"
      />
    </>,
  );
}

describe('Combined mount — add-row scroll-sync via linesScrollHost (ETP-5133)', () => {
  it('registers a scroll-host anchor inside InlineLinesPanel’s own scrollable body while the add-row form is active', () => {
    renderCombinedAddRowActive();
    const panel = within(screen.getByTestId('inline-lines-panel'));
    const host = panel.getByTestId('inline-add-row-host');
    expect(host).toBeInTheDocument();
  });

  it('portals the add-row table as a REAL descendant of the registered scroll-host node (the actual regression)', () => {
    renderCombinedAddRowActive();
    const host = within(screen.getByTestId('inline-lines-panel')).getByTestId('inline-add-row-host');
    const addRow = screen.getByTestId('inline-add-row');
    // contains() is true for both direct and nested descendants — exactly
    // what createPortal(content, host) produces (content wraps the <table>).
    expect(host.contains(addRow)).toBe(true);
  });

  it('does NOT leave the add-row table as a sibling outside the scroll-host (would mean the portal never fired)', () => {
    renderCombinedAddRowActive();
    const panel = screen.getByTestId('inline-lines-panel');
    const addRow = screen.getByTestId('inline-add-row');
    // The add-row must be reachable ONLY via the host (inside inline-lines-panel),
    // never as a following sibling of the panel in the document body.
    const position = panel.compareDocumentPosition(addRow);
    expect(position & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy();
  });

  it('unregisters the host (and falls back to standalone rendering) once the add-row form is no longer active', () => {
    const { rerender } = render(
      <>
        <InlineLinesPanel {...inlineLinesPanelProps} lineFormActive addRow={undefined} />
        <DataTable
          entity="lines"
          columns={COLUMNS}
          data={[]}
          addRow={{ active: true, fields: COLUMNS, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
          selectable={false}
          hideHeader
          hideDataRows
          linesLayout="inlineEditable"
        />
      </>,
    );
    expect(screen.getByTestId('inline-add-row-host')).toBeInTheDocument();

    rerender(
      <>
        <InlineLinesPanel {...inlineLinesPanelProps} lineFormActive={false} />
        <DataTable
          entity="lines"
          columns={COLUMNS}
          data={[]}
          addRow={{ active: false, fields: COLUMNS, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
          selectable={false}
          hideHeader
          hideDataRows
          linesLayout="inlineEditable"
        />
      </>,
    );
    expect(screen.queryByTestId('inline-add-row-host')).not.toBeInTheDocument();
    expect(screen.queryByTestId('inline-add-row')).not.toBeInTheDocument();
  });
});

describe('DataTable add-row — fallback when no scroll host is registered (ETP-5133)', () => {
  it('renders the add-row table standalone (in place, not portaled) when InlineLinesPanel is not mounted', () => {
    render(
      <DataTable
        entity="lines"
        columns={COLUMNS}
        data={[]}
        addRow={{ active: true, fields: COLUMNS, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
        selectable={false}
        hideHeader
        hideDataRows
        linesLayout="inlineEditable"
      />,
    );
    expect(screen.getByTestId('inline-add-row')).toBeInTheDocument();
  });

  it('renders the add-row table standalone when linesLayout is not inlineEditable, even with the same entity key', () => {
    // Guards against a false-positive portal firing purely off the shared
    // `entity` key without also requiring ilpTrailing (hideHeader &&
    // linesLayout === 'inlineEditable').
    render(
      <>
        <InlineLinesPanel {...inlineLinesPanelProps} lineFormActive addRow={undefined} />
        <DataTable
          entity="lines"
          columns={COLUMNS}
          data={[]}
          addRow={{ active: true, fields: COLUMNS, onAdd: vi.fn(), onCancel: vi.fn(), catalogs: {} }}
          selectable={false}
        />
      </>,
    );
    const panel = screen.getByTestId('inline-lines-panel');
    const addRow = screen.getByTestId('inline-add-row');
    expect(panel.contains(addRow)).toBe(false);
  });
});
