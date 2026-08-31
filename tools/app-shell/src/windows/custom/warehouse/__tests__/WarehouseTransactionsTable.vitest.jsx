// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
  // useClientSort (wired in for AC2) pulls the active locale from here.
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('../useWarehouseStock', () => ({
  useWarehouseStock: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  Loader2: (props) => <span data-testid="loader" {...props} />,
  ArrowUpDown: (props) => <span data-testid="icon-sort" {...props} />,
  ArrowUp: (props) => <span data-testid="icon-up" {...props} />,
  ArrowDown: (props) => <span data-testid="icon-down" {...props} />,
  ArrowUpRight: (props) => <span data-testid="icon-arrow-up-right" {...props} />,
}));

// --- Import under test ---

import { render, screen, fireEvent } from '@testing-library/react';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import WarehouseTransactionsTable from '../WarehouseTransactionsTable.jsx';
import { useWarehouseStock } from '../useWarehouseStock';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Helpers ---

const defaultProps = {
  parentId: 'wh-1',
  token: 'test-token',
  apiBaseUrl: '/sws/neo/warehouse',
  onCount: vi.fn(),
};

// --- Tests ---

describe('WarehouseTransactionsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    useWarehouseStock.mockReturnValue({ loading: true, error: null, transactions: null });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('warehouseLoadingTransactions')).toBeInTheDocument();
  });

  it('shows error state', () => {
    useWarehouseStock.mockReturnValue({ loading: false, error: 'Network error', transactions: null });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText(/warehouseTransactionsError/)).toBeInTheDocument();
  });

  it('shows empty state when no transactions', () => {
    useWarehouseStock.mockReturnValue({ loading: false, error: null, transactions: [] });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('warehouseNoTransactions')).toBeInTheDocument();
  });

  it('renders table with transactions', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          'product$_identifier': 'Widget A',
          movementType: 'V+',
          movementQuantity: 10,
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('Widget A')).toBeInTheDocument();
  });

  it('calls onCount with transaction count', () => {
    useWarehouseStock.mockReturnValue({ loading: false, error: null, transactions: [{ id: 'tx-1', movementDate: '2025-01-15', movementQuantity: 5 }] });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(defaultProps.onCount).toHaveBeenCalledWith(1);
  });

  it('renders column headers', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [{ id: 'tx-1', movementDate: '2025-01-15', movementQuantity: 5 }],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('warehouseDate')).toBeInTheDocument();
    expect(screen.getByText('warehouseProduct')).toBeInTheDocument();
    expect(screen.getByText('warehouseType')).toBeInTheDocument();
    expect(screen.getByText('warehouseQty')).toBeInTheDocument();
  });

  it('resolves customer return label from etgoDocWindow even when movementType matches a shipment code (ETP-4864 regression)', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'C-',
          etgoDocWindow: 'return-material-receipt',
          movementQuantity: -5,
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('movTypeCustomerReturn')).toBeInTheDocument();
    expect(screen.queryByText('movTypeCustomerShipment')).not.toBeInTheDocument();
  });

  it('resolves customer shipment label from etgoDocWindow for a normal shipment', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'C-',
          etgoDocWindow: 'goods-shipment',
          movementQuantity: 5,
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('movTypeCustomerShipment')).toBeInTheDocument();
  });

  it('resolves vendor return label from etgoDocWindow', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'V+',
          etgoDocWindow: 'return-to-vendor-shipment',
          movementQuantity: -3,
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('movTypeVendorReturn')).toBeInTheDocument();
    expect(screen.queryByText('movTypeVendorReceipt')).not.toBeInTheDocument();
  });

  it('falls back to movementType-based label when etgoDocWindow is absent (e.g. goods-movements)', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'M+',
          movementQuantity: 7,
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('movTypeMovementTo')).toBeInTheDocument();
  });

  it('falls back to movementType-based label when etgoDocWindow is unrecognized', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'M+',
          etgoDocWindow: 'physical-inventory',
          movementQuantity: 7,
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('movTypeMovementTo')).toBeInTheDocument();
  });

  it('prefers the translated TYPE_KEY_MAP label over the raw movementType$_identifier (ETP-4864 precedence regression)', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'M+',
          'movementType$_identifier': 'Movement To',
          movementQuantity: 7,
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('movTypeMovementTo')).toBeInTheDocument();
    expect(screen.queryByText('Movement To')).not.toBeInTheDocument();
  });

  it('prefers the translated TYPE_KEY_MAP label over the raw identifier for a second code (D-)', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'D-',
          'movementType$_identifier': 'Internal Consumption',
          movementQuantity: -2,
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('movTypeInternalConsumption')).toBeInTheDocument();
    expect(screen.queryByText('Internal Consumption')).not.toBeInTheDocument();
  });

  it('falls back to the raw movementType$_identifier when the code is not in TYPE_KEY_MAP', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'X+',
          'movementType$_identifier': 'Unknown Movement',
          movementQuantity: 1,
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('Unknown Movement')).toBeInTheDocument();
  });

  // --- ETP-4864 QA gap-fill: navigation + document-label edge cases ---

  it('opens the document in a new tab via window.open when the document link is clicked (AC3)', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'C-',
          etgoDocWindow: 'return-material-receipt',
          etgoDocHeaderId: 'HDR-123',
          etgoDocLabel: '1000042',
          movementQuantity: -5,
        },
      ],
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    render(<WarehouseTransactionsTable {...defaultProps} />);
    fireEvent.click(screen.getByText('1000042'));
    expect(openSpy).toHaveBeenCalledWith(
      `${window.location.origin}/return-material-receipt/HDR-123`,
      '_blank',
      'noopener,noreferrer',
    );
    openSpy.mockRestore();
  });

  it('renders the document as plain text (no link) when etgoDocHeaderId is missing even though etgoDocWindow and a label are present', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'C-',
          etgoDocWindow: 'goods-shipment',
          // etgoDocHeaderId intentionally absent
          etgoDocLabel: '1000050',
          movementQuantity: 5,
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('1000050')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-arrow-up-right')).not.toBeInTheDocument();
  });

  it('renders the document as plain text (no link) when etgoDocWindow is missing even though etgoDocHeaderId and a label are present', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'M+',
          // etgoDocWindow intentionally absent (e.g. goods-movements, production)
          etgoDocHeaderId: 'HDR-999',
          etgoDocLabel: '1000060',
          movementQuantity: 3,
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(screen.getByText('1000060')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-arrow-up-right')).not.toBeInTheDocument();
  });

  it('renders a dash placeholder when no document label can be resolved at all', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'D-',
          movementQuantity: -1,
          // no etgoDocLabel, no *_identifier fallbacks
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    // the document cell falls back to '—'; date/qty cells don't use it so this
    // assertion targets the row rendering without a link, not a specific cell count.
    expect(screen.queryByTestId('icon-arrow-up-right')).not.toBeInTheDocument();
  });

  it('renders an empty type cell (no crash) when movementType and its identifier are both absent', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementQuantity: 2,
          // movementType, movementType$_identifier, etgoDocWindow all absent
        },
      ],
    });
    expect(() => render(<WarehouseTransactionsTable {...defaultProps} />)).not.toThrow();
  });

  it('does not crash and shows no link when both etgoDocWindow and etgoDocHeaderId are present but the window key is unrecognized', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'M+',
          etgoDocWindow: 'some-future-window-key',
          etgoDocHeaderId: 'HDR-FUTURE',
          etgoDocLabel: 'FUT-0001',
          movementQuantity: 4,
        },
      ],
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    render(<WarehouseTransactionsTable {...defaultProps} />);
    // canNavigate only checks presence of both fields, not map membership —
    // an unrecognized-but-present window key still renders a clickable link.
    fireEvent.click(screen.getByText('FUT-0001'));
    expect(openSpy).toHaveBeenCalledWith(
      `${window.location.origin}/some-future-window-key/HDR-FUTURE`,
      '_blank',
      'noopener,noreferrer',
    );
    // and the type label still falls back correctly since the key isn't in WINDOW_TYPE_KEY_MAP
    expect(screen.getByText('movTypeMovementTo')).toBeInTheDocument();
    openSpy.mockRestore();
  });

  // ETP-5083 review fix: the new-tab URL must include the deployment's router base
  // (Tomcat context path + /web/<module>), not just window.location.origin — see
  // deploymentBasePath.js's getRouterBase(). Under jsdom's default root pathname this
  // base is '', which is why the two tests above (asserting a bare origin-prefixed URL)
  // keep passing unchanged; this test forces a non-root pathname to prove the prefix is
  // actually applied.
  it('includes the deployment router base in the new-tab URL under a non-root deployment (ETP-5083 review fix)', () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, pathname: '/etendo/web/com.etendoerp.go/warehouse/wh-1' },
      writable: true,
      configurable: true,
    });

    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 'tx-1',
          movementDate: '2025-01-15',
          movementType: 'C-',
          etgoDocWindow: 'return-material-receipt',
          etgoDocHeaderId: 'HDR-123',
          etgoDocLabel: '1000042',
          movementQuantity: -5,
        },
      ],
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {});
    try {
      render(<WarehouseTransactionsTable {...defaultProps} />);
      fireEvent.click(screen.getByText('1000042'));
      expect(openSpy).toHaveBeenCalledWith(
        `${window.location.origin}/etendo/web/com.etendoerp.go/return-material-receipt/HDR-123`,
        '_blank',
        'noopener,noreferrer',
      );
    } finally {
      openSpy.mockRestore();
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    }
  });

  // ETP-5083: document navigation moved from same-tab react-router (`useNavigate`) to
  // `window.open` in a new tab. This file deliberately carries NO `vi.mock('react-router-dom',
  // ...)` — asserted here via a source read rather than a runtime mock, since a stray mock for a
  // module the component no longer imports would silently stop being a meaningful guard the
  // moment someone re-adds a react-router import for an unrelated reason.
  it('no longer imports react-router-dom (navigation is window.open, not same-tab routing)', () => {
    const src = readFileSync(join(__dirname, '..', 'WarehouseTransactionsTable.jsx'), 'utf8');
    assert.doesNotMatch(src, /react-router-dom/);
    assert.doesNotMatch(src, /useNavigate/);
  });
});

// --- AC1/AC2: default order + sortable column headers ---

describe('WarehouseTransactionsTable — sorting (ETP-5083)', () => {
  // Deliberately decorrelated across columns: the date-descending default order (t3, t2, t1)
  // does not match the ascending/descending order of any other column, so a passing assertion
  // on one column's order can't be a false positive carried over from another column or from
  // the default order.
  const TXNS = [
    {
      id: 't1',
      movementDate: '2025-01-05',
      'product$_identifier': 'Mango',
      movementType: 'V+',
      etgoDocLabel: 'D-030',
      movementQuantity: 40,
    },
    {
      id: 't2',
      movementDate: '2025-01-15',
      'product$_identifier': 'Apple',
      movementType: 'I+',
      etgoDocLabel: 'D-010',
      // Chosen so a lexicographic ("100" < "40" < "9") sort would order these DIFFERENTLY
      // than a numeric one — this is what proves qty sorts as a number, not a string.
      movementQuantity: 9,
    },
    {
      id: 't3',
      movementDate: '2025-01-25',
      'product$_identifier': 'Banana',
      movementType: 'I-',
      etgoDocLabel: 'D-020',
      movementQuantity: 100,
    },
  ];

  const productOrder = () =>
    [...document.querySelectorAll('tbody tr')].map((tr) => tr.children[3].textContent);
  const documentOrder = () =>
    [...document.querySelectorAll('tbody tr')].map((tr) => tr.children[2].textContent);
  const typeOrder = () =>
    [...document.querySelectorAll('tbody tr')].map((tr) => tr.children[1].textContent);
  const qtyOrder = () =>
    [...document.querySelectorAll('tbody tr')].map((tr) => tr.children[4].textContent.replace(/[^0-9+.-]/g, ''));

  beforeEach(() => {
    useWarehouseStock.mockReturnValue({ loading: false, error: null, transactions: TXNS });
  });

  it('AC1: defaults to movementDate descending (most recent first) with no user interaction', () => {
    render(<WarehouseTransactionsTable {...defaultProps} />);
    expect(productOrder()).toEqual(['Banana', 'Apple', 'Mango']); // t3 (25th), t2 (15th), t1 (5th)
    // The Date column is the active sort from the very first render — the rows already arrive
    // pre-sorted movementDate desc, so the header must show the ▼ that reflects that real order
    // (not "no sort", which would misrepresent an active, just-not-yet-clicked sort as none at
    // all). `initialSort: { key: 'date', direction: 'desc' }` (useClientSort) is what seeds this.
    expect(screen.getByTestId('column-header-sort-date').textContent).toContain('▼');
    // No OTHER header shows a direction arrow while only the seeded default is active.
    expect(screen.getByTestId('column-header-sort-product').textContent).not.toMatch(/[▲▼]/);
    expect(screen.getByTestId('column-header-sort-document').textContent).not.toMatch(/[▲▼]/);
    expect(screen.getByTestId('column-header-sort-type').textContent).not.toMatch(/[▲▼]/);
    expect(screen.getByTestId('column-header-sort-qty').textContent).not.toMatch(/[▲▼]/);
  });

  it('AC2: clicking the Date header cycles asc → desc → default, reordering by date each time', () => {
    render(<WarehouseTransactionsTable {...defaultProps} />);
    const dateHeader = screen.getByTestId('column-header-sort-date');

    fireEvent.click(dateHeader); // ascending: oldest first
    expect(productOrder()).toEqual(['Mango', 'Apple', 'Banana']); // t1, t2, t3
    expect(dateHeader.textContent).toContain('▲');

    fireEvent.click(dateHeader); // descending: newest first (same order as the default)
    expect(productOrder()).toEqual(['Banana', 'Apple', 'Mango']); // t3, t2, t1
    expect(dateHeader.textContent).toContain('▼');

    fireEvent.click(dateHeader); // back to default: no arrow, default order restored
    expect(productOrder()).toEqual(['Banana', 'Apple', 'Mango']);
    expect(dateHeader.textContent).not.toMatch(/[▲▼]/);
  });

  // ETP-5083: the Date header is seeded active (▼) on load, so its FIRST click must be a
  // one-shot jump straight to ▲ (a visible reorder) instead of following the normal
  // none→asc→desc→none cycle, which would land on "no sort" — the exact same order the rows
  // already start in, reading as a no-op click. This test walks the full sequence end-to-end,
  // including a 4th click, to prove the one-shot override fires exactly once: after the
  // override is consumed by click 1, clicks 2-4 follow the ORIGINAL unmodified cycle starting
  // from wherever click 1 left the state (asc), not a second jump.
  it('AC2/ETP-5083: full click sequence on Date — one-shot jump on click 1, normal cycle resumes after', () => {
    render(<WarehouseTransactionsTable {...defaultProps} />);
    const dateHeader = screen.getByTestId('column-header-sort-date');

    // Load: seeded desc, most-recent-first, no click yet.
    expect(dateHeader.textContent).toContain('▼');
    expect(productOrder()).toEqual(['Banana', 'Apple', 'Mango']); // t3, t2, t1

    // Click 1: one-shot override — jumps straight to ascending (oldest first), a real reorder.
    fireEvent.click(dateHeader);
    expect(dateHeader.textContent).toContain('▲');
    expect(productOrder()).toEqual(['Mango', 'Apple', 'Banana']); // t1, t2, t3

    // Click 2: normal cycle resumes — asc -> desc.
    fireEvent.click(dateHeader);
    expect(dateHeader.textContent).toContain('▼');
    expect(productOrder()).toEqual(['Banana', 'Apple', 'Mango']); // t3, t2, t1

    // Click 3: normal cycle — desc -> none (default order restored, no arrow).
    fireEvent.click(dateHeader);
    expect(dateHeader.textContent).not.toMatch(/[▲▼]/);
    expect(productOrder()).toEqual(['Banana', 'Apple', 'Mango']);

    // Click 4: normal cycle resumes from none -> asc, NOT another one-shot jump (which would
    // have gone straight to desc). Proves the override only ever fires once per mount.
    fireEvent.click(dateHeader);
    expect(dateHeader.textContent).toContain('▲');
    expect(productOrder()).toEqual(['Mango', 'Apple', 'Banana']); // t1, t2, t3
  });

  // ETP-5083: if the user's FIRST click ever lands on a DIFFERENT column than the seeded one,
  // that column must behave like a completely normal first click (straight to ascending, not
  // itself getting a one-shot jump-to-opposite — the override is keyed to `initialSort.key`
  // only). The seeded Date column must simultaneously lose its arrow (no longer the active
  // sort). And this click must CONSUME the one-shot grace period entirely: a later click back
  // on Date must follow the plain none->asc->desc->none cycle from "no sort", not fall back to
  // jumping to a direction.
  it('AC2/ETP-5083: first click on a different column consumes the one-shot grace period without using it', () => {
    render(<WarehouseTransactionsTable {...defaultProps} />);
    const dateHeader = screen.getByTestId('column-header-sort-date');
    const productHeader = screen.getByTestId('column-header-sort-product');

    expect(dateHeader.textContent).toContain('▼'); // seeded on load

    // First click ever lands on Product, not Date.
    fireEvent.click(productHeader);
    expect(productHeader.textContent).toContain('▲'); // normal first-click behavior: straight to asc
    expect(productOrder()).toEqual(['Apple', 'Banana', 'Mango']);
    expect(dateHeader.textContent).not.toMatch(/[▲▼]/); // Date is no longer the active sort

    // Grace period is spent. A later click on Date now follows the NORMAL cycle starting from
    // "no sort" (-> ascending), not a jump to a direction.
    fireEvent.click(dateHeader);
    expect(dateHeader.textContent).toContain('▲');
    expect(productOrder()).toEqual(['Mango', 'Apple', 'Banana']); // t1, t2, t3 — oldest first
    expect(productHeader.textContent).not.toMatch(/[▲▼]/); // Product no longer active
  });

  it('AC2: clicking the Product header cycles asc → desc → default, reordering alphabetically', () => {
    render(<WarehouseTransactionsTable {...defaultProps} />);
    const productHeader = screen.getByTestId('column-header-sort-product');

    fireEvent.click(productHeader); // ascending
    expect(productOrder()).toEqual(['Apple', 'Banana', 'Mango']);
    expect(productHeader.textContent).toContain('▲');

    fireEvent.click(productHeader); // descending
    expect(productOrder()).toEqual(['Mango', 'Banana', 'Apple']);
    expect(productHeader.textContent).toContain('▼');

    fireEvent.click(productHeader); // back to default (date descending)
    expect(productOrder()).toEqual(['Banana', 'Apple', 'Mango']);
    expect(productHeader.textContent).not.toMatch(/[▲▼]/);
  });

  it('AC2: clicking the Document header cycles asc → desc → default', () => {
    render(<WarehouseTransactionsTable {...defaultProps} />);
    const documentHeader = screen.getByTestId('column-header-sort-document');

    fireEvent.click(documentHeader); // ascending
    expect(documentOrder()).toEqual(['D-010', 'D-020', 'D-030']);
    expect(documentHeader.textContent).toContain('▲');

    fireEvent.click(documentHeader); // descending
    expect(documentOrder()).toEqual(['D-030', 'D-020', 'D-010']);
    expect(documentHeader.textContent).toContain('▼');

    fireEvent.click(documentHeader); // back to default (date descending)
    expect(documentOrder()).toEqual(['D-020', 'D-010', 'D-030']);
    expect(documentHeader.textContent).not.toMatch(/[▲▼]/);
  });

  it('AC2: clicking the Qty header sorts numerically, not lexicographically', () => {
    render(<WarehouseTransactionsTable {...defaultProps} />);
    const qtyHeader = screen.getByTestId('column-header-sort-qty');

    fireEvent.click(qtyHeader); // ascending: 9 < 40 < 100 numerically
    expect(qtyOrder()).toEqual(['+9', '+40', '+100']);
    expect(qtyHeader.textContent).toContain('▲');

    fireEvent.click(qtyHeader); // descending
    expect(qtyOrder()).toEqual(['+100', '+40', '+9']);
    expect(qtyHeader.textContent).toContain('▼');

    fireEvent.click(qtyHeader); // back to default (date descending: t3=100, t2=9, t1=40)
    expect(qtyOrder()).toEqual(['+100', '+9', '+40']);
    expect(qtyHeader.textContent).not.toMatch(/[▲▼]/);
  });

  it('AC2: sorting one column does not mark another column as active', () => {
    render(<WarehouseTransactionsTable {...defaultProps} />);
    fireEvent.click(screen.getByTestId('column-header-sort-product'));
    expect(screen.getByTestId('column-header-sort-product').textContent).toContain('▲');
    expect(screen.getByTestId('column-header-sort-date').textContent).not.toMatch(/[▲▼]/);
    expect(screen.getByTestId('column-header-sort-qty').textContent).not.toMatch(/[▲▼]/);
  });

  // Sentinel/QA gap-fill (ETP-5083): the Type column was never exercised through an actual
  // click cycle — only its header label presence was asserted elsewhere. TXNS' three movement
  // types resolve (via TYPE_KEY_MAP, no etgoDocWindow on any of these rows) to distinct,
  // alphabetically-decorrelated-from-date keys, so this proves the "type" accessor sorts on the
  // resolved/translated label, not on the raw movementType code.
  it('AC2: clicking the Type header cycles asc -> desc -> default, sorting by the resolved label', () => {
    render(<WarehouseTransactionsTable {...defaultProps} />);
    const typeHeader = screen.getByTestId('column-header-sort-type');

    fireEvent.click(typeHeader); // ascending: In < Out < Vendor (t2, t3, t1)
    expect(typeOrder()).toEqual(['movTypeInventoryIn', 'movTypeInventoryOut', 'movTypeVendorReceipt']);
    expect(typeHeader.textContent).toContain('▲');

    fireEvent.click(typeHeader); // descending
    expect(typeOrder()).toEqual(['movTypeVendorReceipt', 'movTypeInventoryOut', 'movTypeInventoryIn']);
    expect(typeHeader.textContent).toContain('▼');

    fireEvent.click(typeHeader); // back to default (date descending: t3, t2, t1)
    expect(typeOrder()).toEqual(['movTypeInventoryOut', 'movTypeInventoryIn', 'movTypeVendorReceipt']);
    expect(typeHeader.textContent).not.toMatch(/[▲▼]/);
  });

  // Sentinel/QA gap-fill (ETP-5083): a row missing `etgoDocWindow`/`etgoDocHeaderId` (the
  // `canNavigate` guard) must keep rendering its document as plain, non-clickable text even
  // while a DIFFERENT column is actively sorted — proving the guard and the sort machinery are
  // independent (sorting doesn't touch, and isn't broken by, a row that can't navigate).
  it('AC2: a non-navigable row keeps rendering plain document text while sorted by a different column', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        {
          id: 't1', movementDate: '2025-01-05', 'product$_identifier': 'Mango', movementType: 'M+',
          etgoDocLabel: 'D-030', etgoDocWindow: 'goods-shipment', etgoDocHeaderId: 'HDR-030', movementQuantity: 1,
        },
        {
          id: 't2', movementDate: '2025-01-15', 'product$_identifier': 'Apple', movementType: 'M+',
          etgoDocLabel: 'D-010', movementQuantity: 2, // has a label but no window/headerId -> not navigable
        },
        {
          id: 't3', movementDate: '2025-01-25', 'product$_identifier': 'Banana', movementType: 'M+',
          etgoDocLabel: 'D-020', etgoDocWindow: 'goods-shipment', etgoDocHeaderId: 'HDR-020', movementQuantity: 3,
        },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    fireEvent.click(screen.getByTestId('column-header-sort-product')); // sort by Product, not Document

    expect(productOrder()).toEqual(['Apple', 'Banana', 'Mango']);
    // D-010 (Apple/t2) is still plain text: present, but not inside the icon-bearing link.
    // (The mocked ArrowUpRight renders with the caller's own `data-testid` prop, which
    // overrides the mock's default via prop spread — see the existing convention used
    // throughout this file, e.g. 'icon-arrow-up-right' vs the literal id below.)
    expect(screen.getByText('D-010')).toBeInTheDocument();
    const links = screen.getAllByTestId('ArrowUpRight__4dd2db');
    expect(links).toHaveLength(2); // only t1 (D-030) and t3 (D-020) are navigable
  });

  // Sentinel/QA (ETP-5083) — BUG-1: `sortRows` (tools/app-shell/src/lib/clientSort.js) applies
  // `sign * compareCellValues(...)` uniformly, which also flips the blank-handling branches of
  // `compareCellValues` whenever direction is 'desc'. Its own doc comment promises blanks
  // "always sort LAST, in both directions", but under a descending sort a blank floats to the
  // TOP instead. This is pre-existing shared infrastructure (also used by the financial-account
  // detail tabs), not introduced by this PR's diff, but the Documento column makes it directly
  // observable in the Warehouse Transactions table this ticket ships: any warehouse with an
  // undocumented movement (e.g. a goods-movement or physical-inventory line with no linked
  // document) will show that row jump to the TOP when the user descending-sorts Documento,
  // burying the very transactions the sort was meant to surface. Assertions below encode the
  // SPEC (blank-last, both directions) per clientSort.js's own doc comment, so this test is
  // EXPECTED TO FAIL against the current implementation — see QA report BUG-1.
  it('BUG-1 (ETP-5083 QA): descending Documento sort should keep an undocumented row last, not float it to the top', () => {
    useWarehouseStock.mockReturnValue({
      loading: false,
      error: null,
      transactions: [
        { id: 't1', movementDate: '2025-01-05', 'product$_identifier': 'Mango', movementType: 'M+', etgoDocLabel: 'D-030', movementQuantity: 1 },
        { id: 't2', movementDate: '2025-01-15', 'product$_identifier': 'Apple', movementType: 'M+', movementQuantity: 2 }, // no document at all
        { id: 't3', movementDate: '2025-01-25', 'product$_identifier': 'Banana', movementType: 'M+', etgoDocLabel: 'D-020', movementQuantity: 3 },
      ],
    });
    render(<WarehouseTransactionsTable {...defaultProps} />);
    const documentHeader = screen.getByTestId('column-header-sort-document');

    fireEvent.click(documentHeader); // ascending: real labels ordered, blank last (this direction is correct today)
    expect(documentOrder()).toEqual(['D-020', 'D-030', '—']);

    fireEvent.click(documentHeader); // descending: real labels reverse, blank should STAY last
    expect(documentOrder()).toEqual(['D-030', 'D-020', '—']);
  });
});
