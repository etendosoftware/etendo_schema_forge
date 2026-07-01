/**
 * DataTable render coverage tests.
 *
 * Exercises branches NOT covered by DataTable.vitest.jsx or
 * DataTable.renderCellValue.vitest.jsx — focused on selection, inline-add,
 * readOnly mode, hidden columns, hover-row actions, date/enum formatting
 * paths, and clone buttons.
 */

import { render, screen, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Mocks ---

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));
vi.mock('@/lib/statusBadge.js', () => ({
  getStatusDotColor: (raw) => `dot-${raw ?? 'none'}`,
  statusLabel: (raw) => `lbl-${raw}`,
}));
vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ status, label }) => <span data-testid="status-tag">{label || status}</span>,
}));
vi.mock('@/components/ui/tag', () => ({
  Tag: ({ label, variant }) => <span data-testid="tag" data-variant={variant}>{label}</span>,
}));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key + '$_identifier'] ?? row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label ?? col.key,
}));
vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val, cur) => (val != null ? `${Number(val).toFixed(2)}${cur ? ` ${cur}` : ''}` : ''),
}));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
vi.mock('@/lib/linesColumnWidth.js', () => ({
  columnFlex: () => '1 0 100px',
  columnMinWidthPx: () => 100,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../InternalConsumptionProductSearchDrawer.jsx', () => ({
  default: () => null,
}));
vi.mock('../SelectorInput.jsx', () => ({
  SelectorInput: () => <div data-testid="selector-input" />,
}));
vi.mock('../InlineSearchCombo.jsx', () => ({
  InlineSearchCombo: ({ field }) => <span data-testid={`inline-combo-${field?.key}`} />,
}));
vi.mock('../RowQuickActions.jsx', () => ({
  default: ({ row }) => <span data-testid={`rqa-${row?.id}`} />,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { DataTable } from '../DataTable.jsx';

// --- Fixtures ---

const COLUMNS = [
  { key: 'docNo', label: 'Doc No', type: 'string' },
  { key: 'date', label: 'Date', type: 'date' },
  { key: 'total', label: 'Total', type: 'amount' },
  { key: 'status', label: 'Status', type: 'status' },
  { key: 'active', label: 'Active', type: 'boolean' },
];

const DATA = [
  { id: 'r1', docNo: 'SO-001', date: '2025-03-15', total: 150, status: 'DR', active: true, 'currency$_identifier': 'USD' },
  { id: 'r2', docNo: 'SO-002', date: '2025-06-01', total: 300, status: 'CO', active: false, 'currency$_identifier': 'USD' },
];

// ---- Tests ----

describe('DataTable — render coverage', () => {
  // --- Selection ---

  describe('selection', () => {
    const SCOLS = [{ key: 'n', label: 'N', type: 'string' }];
    const SDATA = [{ id: 'r1', n: 'a' }, { id: 'r2', n: 'b' }];

    it('select-all toggles all row checkboxes', async () => {
      const onSelectionChange = vi.fn();
      render(<DataTable columns={SCOLS} data={SDATA} onSelectionChange={onSelectionChange} />);
      const checkboxes = screen.getAllByRole('checkbox');
      await act(async () => { await userEvent.click(checkboxes[0]); });
      expect(onSelectionChange).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ id: 'r1' }),
        expect.objectContaining({ id: 'r2' }),
      ]));
    });

    it('toggling a single row checkbox calls onSelectionChange', async () => {
      const onSelectionChange = vi.fn();
      render(<DataTable columns={SCOLS} data={SDATA} onSelectionChange={onSelectionChange} />);
      const checkboxes = screen.getAllByRole('checkbox');
      await act(async () => { await userEvent.click(checkboxes[1]); });
      expect(onSelectionChange).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: 'r1' })]),
      );
    });

    it('isRowSelectable prevents selecting non-selectable rows', () => {
      render(<DataTable columns={SCOLS} data={SDATA} isRowSelectable={(row) => row.id === 'r1'} />);
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[2]).toBeDisabled();
    });
  });

  // --- Empty / loading states ---

  describe('empty and loading states', () => {
    it('shows empty state with filter hint when columnFilters are active', () => {
      const cols = [{ key: 'n', label: 'N', type: 'string' }];
      render(<DataTable columns={cols} data={[]} columnFilters={{ n: 'xyz' }} />);
      expect(screen.getByText('noMatchingRecords')).toBeInTheDocument();
    });

    it('renders skeleton rows when loading', () => {
      const cols = [{ key: 'n', label: 'N', type: 'string' }];
      const { container } = render(<DataTable columns={cols} data={[]} loading />);
      expect(container.querySelector('.space-y-2')).toBeInTheDocument();
    });
  });

  // --- Date cell formatting ---

  describe('date column', () => {
    it('renders formatted date for valid ISO date', () => {
      const cols = [{ key: 'date', label: 'Date', type: 'date' }];
      const rows = [{ id: 'd1', date: '2025-03-15' }];
      render(<DataTable columns={cols} data={rows} selectable={false} />);
      // The dateFormatter uses en-US locale → "03/15/2025"
      expect(screen.getByText('03/15/2025')).toBeInTheDocument();
    });

    it('renders em-dash for null date', () => {
      const cols = [{ key: 'date', label: 'Date', type: 'date' }];
      const rows = [{ id: 'd2', date: null }];
      render(<DataTable columns={cols} data={rows} selectable={false} />);
      expect(screen.getByText('\u2014')).toBeInTheDocument();
    });
  });

  // --- Enum column ---

  describe('enum column', () => {
    it('renders enum label via useMenuLabel', () => {
      const cols = [{ key: 'type', label: 'Type', type: 'enum', enumLabels: { SO: 'Sales Order' } }];
      const rows = [{ id: 'e1', type: 'SO' }];
      render(<DataTable columns={cols} data={rows} selectable={false} />);
      // useMenuLabel mock returns the key as-is, enumLabels maps SO → 'Sales Order'
      expect(screen.getByText('Sales Order')).toBeInTheDocument();
    });

    it('renders enum with dot display', () => {
      const cols = [{ key: 'type', label: 'Type', type: 'enum', display: 'dot', enumLabels: { DR: 'Draft' } }];
      const rows = [{ id: 'e2', type: 'DR' }];
      render(<DataTable columns={cols} data={rows} selectable={false} />);
      expect(screen.getByText('Draft')).toBeInTheDocument();
    });

    it('renders enum with Tag variant', () => {
      const cols = [{ key: 'type', label: 'Type', type: 'enum', enumLabels: { CO: 'Complete' }, enumVariants: { CO: 'green' } }];
      const rows = [{ id: 'e3', type: 'CO' }];
      render(<DataTable columns={cols} data={rows} selectable={false} />);
      const tag = screen.getByTestId('tag');
      expect(tag).toHaveAttribute('data-variant', 'green');
    });
  });

  // --- Boolean badge column ---

  describe('boolean badge column', () => {
    it('renders badge when col.badge is true', () => {
      const cols = [{ key: 'active', label: 'Active', type: 'boolean', badge: true }];
      const rows = [
        { id: 'b1', active: true },
        { id: 'b2', active: false },
      ];
      render(<DataTable columns={cols} data={rows} selectable={false} />);
      const tags = screen.getAllByTestId('tag');
      expect(tags).toHaveLength(2);
    });

    it('renders colored badge when col.badgeColors is set', () => {
      const cols = [{
        key: 'active', label: 'Active', type: 'boolean', badge: true,
        badgeColors: { true: 'bg-green-100 text-green-800', false: 'bg-red-100 text-red-800' },
      }];
      const rows = [{ id: 'b3', active: true }];
      render(<DataTable columns={cols} data={rows} selectable={false} />);
      // badgeColors path renders a <span> with custom classes, not a Tag
      expect(screen.getByText('statusComplete')).toBeInTheDocument();
    });
  });

  // --- Amount column with footer totals ---

  describe('footer totals', () => {
    it('renders sum of amount columns in footer', () => {
      const cols = [
        { key: 'total', label: 'Total', type: 'amount' },
      ];
      const rows = [
        { id: 'f1', total: 100, 'currency$_identifier': 'EUR' },
        { id: 'f2', total: 250, 'currency$_identifier': 'EUR' },
      ];
      render(<DataTable columns={cols} data={rows} selectable={false} showFooterTotals />);
      // 100 + 250 = 350 → formatAmount mock → "350.00 EUR"
      expect(screen.getByText('350.00 EUR')).toBeInTheDocument();
    });

    it('does not render footer when showFooterTotals is false', () => {
      const cols = [{ key: 'total', label: 'Total', type: 'amount' }];
      const rows = [{ id: 'f3', total: 42 }];
      const { container } = render(
        <DataTable columns={cols} data={rows} selectable={false} showFooterTotals={false} />,
      );
      expect(container.querySelector('tfoot')).toBeNull();
    });
  });

  // --- Hidden columns ---

  describe('hidden columns', () => {
    it('does not render columns listed in hiddenColumns', () => {
      const cols = [{ key: 'a', label: 'A', type: 'string' }, { key: 'b', label: 'B', type: 'string' }];
      const rows = [{ id: 'hc1', a: 'x', b: 'y' }];
      render(<DataTable columns={cols} data={rows} hiddenColumns={['b']} selectable={false} />);
      expect(screen.queryByTestId('column-header-b')).toBeNull();
    });
  });

  // --- Clone button ---

  describe('clone button', () => {
    it('renders clone button when onCloneRow is provided', () => {
      const cols = [{ key: 'n', label: 'N', type: 'string' }];
      const rows = [{ id: 'cl1', n: 'a' }, { id: 'cl2', n: 'b' }];
      render(<DataTable columns={cols} data={rows} onCloneRow={vi.fn()} selectable={false} />);
      expect(screen.getAllByLabelText('cloneOrderBtn')).toHaveLength(2);
    });
  });

  // --- Hover row actions ---

  describe('hover row actions', () => {
    it('renders pencil/trash in hoverRowActions, save/cancel when editing', () => {
      const cols = [{ key: 'n', label: 'N', type: 'string' }];
      const rows = [{ id: 'hr1', n: 'a' }, { id: 'hr2', n: 'b' }];
      const { unmount } = render(<DataTable columns={cols} data={rows} hoverRowActions onDeleteRow={vi.fn()} selectable={false} />);
      expect(screen.getAllByLabelText('edit')).toHaveLength(2);
      expect(screen.getAllByTestId(/^row-delete-/)).toHaveLength(2);
      unmount();

      render(<DataTable columns={cols} data={rows} hoverRowActions onDeleteRow={vi.fn()} editingRowId="hr1" onSaveRow={vi.fn()} onCancelEdit={vi.fn()} selectable={false} />);
      expect(screen.getByLabelText('save')).toBeInTheDocument();
      expect(screen.getByLabelText('cancel')).toBeInTheDocument();
    });
  });

  // --- RowQuickActions ---

  describe('row quick actions', () => {
    it('renders RowQuickActions when rowQuickActions.enabled is true', () => {
      const cols = [{ key: 'n', label: 'N', type: 'string' }];
      const rows = [{ id: 'rq1', n: 'a' }];
      render(<DataTable columns={cols} data={rows} rowQuickActions={{ enabled: true, onEdit: vi.fn() }} selectable={false} />);
      expect(screen.getByTestId('rqa-rq1')).toBeInTheDocument();
    });
  });

  // --- Inline add row ---

  describe('inline add row', () => {
    it('renders inline-add-row and hint when addRow.active is true', () => {
      const cols = [{ key: 'docNo', label: 'Doc No', type: 'string' }];
      const addRow = {
        active: true,
        fields: [{ key: 'docNo', label: 'Doc No', type: 'text', column: 'DocumentNo' }],
        onAdd: vi.fn(),
        onCancel: vi.fn(),
        catalogs: {},
      };
      render(<DataTable columns={cols} data={[]} addRow={addRow} selectable={false} />);
      expect(screen.getByTestId('inline-add-row')).toBeInTheDocument();
      expect(screen.getByText('inlineAddHint')).toBeInTheDocument();
    });
  });

  // --- Percent column ---

  describe('percent column', () => {
    it('renders percent bar for 0%, partial, and 100%', () => {
      const cols = [{ key: 'pct', label: 'Pct', type: 'percent' }];
      const rows = [{ id: 'p1', pct: 0 }, { id: 'p2', pct: 45 }, { id: 'p3', pct: 100 }];
      render(<DataTable columns={cols} data={rows} selectable={false} />);
      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getByText('45%')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  // --- Truncated fallback ---

  describe('long string truncation', () => {
    it('renders long string values without crashing', () => {
      const longStr = 'A'.repeat(35);
      const cols = [{ key: 'name', label: 'Name', type: 'string' }];
      const rows = [{ id: 't1', name: longStr }];
      render(<DataTable columns={cols} data={rows} selectable={false} />);
      expect(screen.getByText(longStr)).toBeInTheDocument();
    });
  });

  // --- Sort callback ---

  describe('sort column', () => {
    it('calls onSort when a sortable column header is clicked', async () => {
      const onSort = vi.fn();
      const cols = [{ key: 'name', label: 'Name', type: 'string' }];
      render(
        <DataTable columns={cols} data={[]} onSort={onSort} selectable={false} />,
      );
      const header = screen.getByText('Name');
      await act(async () => {
        await userEvent.click(header);
      });
      expect(onSort).toHaveBeenCalledWith('name');
    });

    it('renders sort indicator when sortColumn matches', () => {
      const cols = [{ key: 'name', label: 'Name', type: 'string' }];
      render(
        <DataTable
          columns={cols}
          data={[]}
          onSort={vi.fn()}
          sortColumn="name"
          sortDirection="asc"
          selectable={false}
        />,
      );
      expect(screen.getByText('\u25B2')).toBeInTheDocument();
    });
  });

  // --- onRowClick vs onNavigate vs onRowSelect ---

  describe('row click dispatch', () => {
    const RCOLS = [{ key: 'n', label: 'N', type: 'string' }];
    const RDATA = [{ id: 'r1', n: 'a' }];

    it('calls onRowClick when provided instead of onNavigate', async () => {
      const onRowClick = vi.fn();
      const onNavigate = vi.fn();
      render(<DataTable columns={RCOLS} data={RDATA} onRowClick={onRowClick} onNavigate={onNavigate} selectable={false} />);
      await act(async () => { await userEvent.click(screen.getByTestId('row-r1')); });
      expect(onRowClick).toHaveBeenCalledWith(RDATA[0]);
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('falls back to onRowSelect when neither onRowClick nor onNavigate', async () => {
      const onRowSelect = vi.fn();
      render(<DataTable columns={RCOLS} data={RDATA} onRowSelect={onRowSelect} selectable={false} />);
      await act(async () => { await userEvent.click(screen.getByTestId('row-r1')); });
      expect(onRowSelect).toHaveBeenCalledWith(RDATA[0]);
    });
  });

  // --- Row filter ---

  describe('rowFilter', () => {
    it('filters rows using the rowFilter predicate', () => {
      const cols = [{ key: 'total', label: 'Total', type: 'amount' }];
      const rows = [{ id: 'r1', total: 10 }, { id: 'r2', total: 300 }];
      render(<DataTable columns={cols} data={rows} rowFilter={(row) => row.total > 200} selectable={false} showFooterTotals={false} />);
      expect(screen.queryByTestId('row-r1')).toBeNull();
      expect(screen.getByTestId('row-r2')).toBeInTheDocument();
    });
  });

  // ---------- NEW: additional coverage for uncovered DataTable branches ----------

  // --- Status cell rendering ---

  describe('status column', () => {
    it('renders StatusTag for status type column', () => {
      const cols = [{ key: 'status', label: 'Status', type: 'status' }];
      const rows = [{ id: 's1', status: 'DR' }];
      render(<DataTable columns={cols} data={rows} selectable={false} />);
      expect(screen.getByTestId('status-tag')).toBeInTheDocument();
    });

    it('renders status with dot display', () => {
      const cols = [{ key: 'status', label: 'Status', type: 'status', display: 'dot' }];
      const rows = [{ id: 's2', status: 'CO' }];
      render(<DataTable columns={cols} data={rows} selectable={false} />);
      // statusLabel mock returns "lbl-CO"
      expect(screen.getByText('lbl-CO')).toBeInTheDocument();
    });
  });

  // --- Custom render column ---

  describe('custom render column', () => {
    it('calls col.render function for custom columns', () => {
      const cols = [{
        key: 'custom',
        label: 'Custom',
        type: 'string',
        render: (row) => <span data-testid="custom-render">{row.id}</span>,
      }];
      const rows = [{ id: 'cr1' }];
      render(<DataTable columns={cols} data={rows} selectable={false} />);
      expect(screen.getByTestId('custom-render')).toBeInTheDocument();
    });
  });

  // --- Boolean toggle column ---

  describe('boolean toggle column', () => {
    it('renders Switch for boolean column with toggle: true', () => {
      const cols = [{ key: 'active', label: 'Active', type: 'boolean', toggle: true }];
      const rows = [{ id: 'bt1', active: true }];
      render(
        <DataTable columns={cols} data={rows} selectable={false} apiBaseUrl="/api" entity="header" token="tok" />,
      );
      expect(screen.getByRole('switch')).toBeInTheDocument();
    });
  });
});
