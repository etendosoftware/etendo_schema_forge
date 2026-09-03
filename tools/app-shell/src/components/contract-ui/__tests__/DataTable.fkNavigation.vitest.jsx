/**
 * ETP-5075 — click-through navigation on read-only FK cells (DataTable).
 *
 * Covers renderCellValue()'s wrap-at-dispatch fk-link behavior:
 *   1. Registry hit + navigate prop passed → wraps the cell in `fk-link-*`, click calls navigate
 *      and does NOT also trigger the row-level onNavigate (stopPropagation guarantee).
 *   2. Column NOT in the registry → plain cell rendering, no link.
 *   3. Registry hit but no `navigate` prop → plain cell rendering (fails closed).
 *
 * Non-regression surface: DataTable renders in every window's list view.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[key + '$_identifier'] ?? row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({
  resolveColumnLabel: (col) => col.label ?? col.key,
}));
vi.mock('../ProductSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../ProductStockSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div data-testid="selector-input" /> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DataTable } from '../DataTable.jsx';

// C_InvoiceLine_ID is a real registry entry: idField 'invoiceHeaderId' → 'purchase-invoice'.
const REGISTERED_COLUMN = { key: 'invoiceLine', label: 'Invoice Line', type: 'string', column: 'C_InvoiceLine_ID' };
// No fkNavigation entry — the non-regression case.
const UNREGISTERED_COLUMN = { key: 'partner', label: 'Partner', type: 'string', column: 'C_BPartner_ID' };

function renderTable(columns, data, extra = {}) {
  return render(<DataTable columns={columns} data={data} selectable={false} {...extra} />);
}

describe('DataTable — ETP-5075 FK click-through navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('wraps the cell in an fk-link button and calls navigate with the resolved route on click', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    renderTable(
      [REGISTERED_COLUMN],
      [{ id: '1', invoiceLine: 'INV-LINE-1', invoiceHeaderId: 'HDR-123' }],
      { navigate },
    );

    const link = screen.getByTestId('fk-link-invoiceLine');
    expect(link).toBeInTheDocument();
    expect(link.tagName).toBe('BUTTON');

    await user.click(link);
    expect(navigate).toHaveBeenCalledWith('/purchase-invoice/HDR-123');
  });

  it('stopPropagation guarantee: clicking the cell link does NOT also fire the row-level onNavigate', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const onNavigate = vi.fn();
    renderTable(
      [REGISTERED_COLUMN],
      [{ id: '1', invoiceLine: 'INV-LINE-1', invoiceHeaderId: 'HDR-123' }],
      { navigate, onNavigate },
    );

    await user.click(screen.getByTestId('fk-link-invoiceLine'));

    expect(navigate).toHaveBeenCalledWith('/purchase-invoice/HDR-123');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('clicking the row (outside the link) still fires the row-level onNavigate', async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const onNavigate = vi.fn();
    renderTable(
      [REGISTERED_COLUMN],
      [{ id: '1', invoiceLine: 'INV-LINE-1', invoiceHeaderId: 'HDR-123' }],
      { navigate, onNavigate },
    );

    await user.click(screen.getByTestId('row-1'));

    expect(onNavigate).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('renders a plain (non-link) cell when the column is not in the registry, even with navigate passed', () => {
    const navigate = vi.fn();
    renderTable(
      [UNREGISTERED_COLUMN],
      [{ id: '1', partner: 'Acme Corp' }],
      { navigate },
    );

    expect(screen.queryByTestId('fk-link-partner')).not.toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders a plain (non-link) cell when the registry resolves but no navigate prop is passed (fails closed)', () => {
    renderTable(
      [REGISTERED_COLUMN],
      [{ id: '1', invoiceLine: 'INV-LINE-1', invoiceHeaderId: 'HDR-123' }],
      // no navigate prop — mirrors DataTable being deliberately Router-agnostic
    );

    expect(screen.queryByTestId('fk-link-invoiceLine')).not.toBeInTheDocument();
    expect(screen.getByText('INV-LINE-1')).toBeInTheDocument();
  });

  it('renders a plain (non-link) cell when the registry column resolves but the injected id is missing (fails closed)', () => {
    const navigate = vi.fn();
    renderTable(
      [REGISTERED_COLUMN],
      // no invoiceHeaderId on the row at all — mirrors the handler not being deployed yet
      [{ id: '1', invoiceLine: 'INV-LINE-1' }],
      { navigate },
    );

    expect(screen.queryByTestId('fk-link-invoiceLine')).not.toBeInTheDocument();
    expect(screen.getByText('INV-LINE-1')).toBeInTheDocument();
  });
});
