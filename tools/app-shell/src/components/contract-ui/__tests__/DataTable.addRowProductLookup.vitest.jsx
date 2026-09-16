/**
 * Regression pin: WHICH descriptor decides the add-row product control.
 *
 * `windows/custom/shared/InvoiceLinesTable.jsx:43` declares the product COLUMN as
 * `{ key: 'product', type: 'selector', lookup: true }`, which reads as though sales/purchase
 * invoices used a different control from orders and shipments. They do not. `DataTable`'s
 * inline add-row resolves its control from `addRow.fields` (`fieldMap[col.key]`, see
 * `renderInlineAddCell`) — i.e. from the generated `addLineFields.entry` descriptor, where the
 * product field is `{ type: 'search', lookup: true }` — and never from the `columns` array,
 * which only drives the READ-ONLY grid rendering. So the add-row shows the same lookup button
 * and the same product drawer in every document window.
 *
 * That distinction is load-bearing for ETP-5254: the "create product" affordance rides on the
 * drawer the LOOKUP field opens, so a reader who trusts the `columns` entry would wrongly
 * conclude invoices are out of scope. The last test here nails the consequence.
 *
 * Unlike its sibling DataTable suites, this spec deliberately does NOT stub
 * ProductSearchDrawer — the assertion is precisely that the real drawer opens.
 */
import { render, screen, waitFor } from '@testing-library/react';
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
vi.mock('@/components/ui/tag', () => ({ Tag: ({ label }) => <span>{label}</span> }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (row, key) => row?.[`${key}$_identifier`] ?? row?.[key] ?? '',
}));
vi.mock('@/lib/resolveColumnLabel.js', () => ({ resolveColumnLabel: (col) => col.label ?? col.key }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (val) => (val != null ? String(val) : '') }));
vi.mock('@/lib/applyCalloutUpdates.js', () => ({
  applyCalloutUpdates: (prev, updates) => ({ ...prev, ...updates }),
}));
// The stock variant is irrelevant here and pulls its own chrome — stub it, keep the default one real.
vi.mock('../ProductStockSearchDrawer.jsx', () => ({ default: () => null }));
vi.mock('../SelectorInput.jsx', () => ({ SelectorInput: () => <div data-testid="selector-input" /> }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DataTable } from '../DataTable.jsx';

const API_BASE_URL = '/sws/neo/sales-invoice';
const ENTITY = 'lines';

// Exactly what `InvoiceLinesTable` declares for the grid: `type: 'selector'`.
const INVOICE_COLUMNS = [
  { key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product', lookup: true },
  { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'number', label: 'Qty' },
];

// Exactly what the generated `addLineFields.entry` declares: `type: 'search', lookup: true`.
const ENTRY_FIELDS = [
  { key: 'product', column: 'M_Product_ID', type: 'search', lookup: true, label: 'Product', required: true },
  { key: 'invoicedQuantity', column: 'QtyInvoiced', type: 'number', label: 'Qty', defaultValue: 1 },
];

function renderAddRow(fields = ENTRY_FIELDS) {
  return render(
    <DataTable
      apiBaseUrl={API_BASE_URL}
      entity={ENTITY}
      columns={INVOICE_COLUMNS}
      data={[]}
      token="test-token"
      addRow={{ active: true, fields, onAdd: vi.fn(() => Promise.resolve(true)), onCancel: vi.fn(), catalogs: {} }}
      selectable={false}
    />,
  );
}

describe('DataTable add-row — the product control comes from addRow.fields, not columns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('/image/')) return Promise.resolve({ ok: false });
      if (String(url).includes('/product/product')) {
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: [], hasMore: false }) });
    });
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders the lookup BUTTON even though the column declares type "selector"', () => {
    renderAddRow();
    const control = screen.getByTestId('inline-add-field-product');
    // A lookup field renders a <button> that opens a drawer. The `selector` branch would
    // have rendered an InlineSearchCombo <input> with its own options listbox instead.
    expect(control.tagName).toBe('BUTTON');
    expect(screen.queryByTestId('inline-add-options-product')).not.toBeInTheDocument();
    // Nothing picked yet — the button's text is its placeholder, flagged for readers.
    expect(control).toHaveAttribute('data-placeholder');
  });

  it('opens the product search drawer when the lookup button is clicked', async () => {
    const user = userEvent.setup();
    renderAddRow();
    expect(screen.queryByTestId('product-search-drawer')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('inline-add-field-product'));

    expect(await screen.findByTestId('product-search-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('product-search-input')).toBeInTheDocument();
  });

  it('builds the drawer selector URL from the field column (AD name M_Product_ID)', async () => {
    const user = userEvent.setup();
    renderAddRow();
    await user.click(screen.getByTestId('inline-add-field-product'));

    await waitFor(() => {
      const called = globalThis.fetch.mock.calls.map(([url]) => String(url));
      expect(called.some(u => u.includes(`${API_BASE_URL}/${ENTITY}/selectors/M_Product_ID`))).toBe(true);
    });
  });

  it('writes the picked product back into the add-row as its display identifier', async () => {
    const user = userEvent.setup();
    globalThis.fetch.mockImplementation((url) => {
      if (String(url).includes('/image/')) return Promise.resolve({ ok: false });
      if (String(url).includes('/product/product')) {
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [{ id: 'p1', label: 'Agua mineral', searchKey: 'AGUA', _aux: { _PSTD: '1.20' } }],
          hasMore: false,
        }),
      });
    });
    renderAddRow();
    await user.click(screen.getByTestId('inline-add-field-product'));
    await screen.findByText('Agua mineral');

    await user.click(screen.getByText('Agua mineral'));

    // The drawer commits after a 120 ms highlight delay, then the button shows the label.
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-field-product')).toHaveTextContent('Agua mineral');
    });
    expect(screen.getByTestId('inline-add-field-product')).not.toHaveAttribute('data-placeholder');
  });

  it('falls back to the selector combo when the add-row entry itself is not a lookup', async () => {
    // Same `columns` array — only the addRow descriptor changed. This is the control that
    // proves the branch is decided by `addRow.fields` and nothing else.
    renderAddRow([{ key: 'product', column: 'M_Product_ID', type: 'selector', label: 'Product' }]);

    const control = screen.getByTestId('inline-add-field-product');
    expect(control.tagName).toBe('INPUT');

    // The selector branch is a typeahead combo over its own inline options listbox — it can
    // never open the product drawer, which is what the lookup branch above exists for.
    expect(control).toHaveAttribute('aria-controls', 'inline-options-product');
    expect(screen.queryByTestId('product-search-drawer')).not.toBeInTheDocument();
  });

  it('offers the ETP-5254 create-product row inside the drawer for an invoice spec', async () => {
    // The consequence of the fact above: because invoices reach the SAME lookup drawer, the
    // inline creation affordance is available there too (sales-invoice is allowlisted).
    const user = userEvent.setup();
    renderAddRow();
    await user.click(screen.getByTestId('inline-add-field-product'));

    expect(await screen.findByTestId('product-search-create')).toBeInTheDocument();
  });
});
