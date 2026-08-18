// --- Mocks (before imports) ---

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
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
import WarehouseTransactionsTable from '../WarehouseTransactionsTable.jsx';
import { useWarehouseStock } from '../useWarehouseStock';

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

  it('navigates to the correct route when the document link is clicked', () => {
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
    render(<WarehouseTransactionsTable {...defaultProps} />);
    fireEvent.click(screen.getByText('1000042'));
    expect(mockNavigate).toHaveBeenCalledWith('/return-material-receipt/HDR-123');
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
    render(<WarehouseTransactionsTable {...defaultProps} />);
    // canNavigate only checks presence of both fields, not map membership —
    // an unrecognized-but-present window key still renders a clickable link.
    fireEvent.click(screen.getByText('FUT-0001'));
    expect(mockNavigate).toHaveBeenCalledWith('/some-future-window-key/HDR-FUTURE');
    // and the type label still falls back correctly since the key isn't in WINDOW_TYPE_KEY_MAP
    expect(screen.getByText('movTypeMovementTo')).toBeInTheDocument();
  });
});
