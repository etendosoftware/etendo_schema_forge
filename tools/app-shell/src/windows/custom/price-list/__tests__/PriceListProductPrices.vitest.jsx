/**
 * Integration render test for PriceListProductPrices.
 * Renders the real component with mocked dependencies.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

// Stub DataTable — heavy component with its own tests
vi.mock('@/components/contract-ui', () => ({
  DataTable: (props) => (
    <div data-testid="data-table" data-entity={props.entity} data-loading={props.loading}>
      {props.data?.map((row) => (
        <div key={row.id} data-testid={`row-${row.id}`} onClick={() => props.onRowClick?.(row)}>
          {row['product$_identifier'] || row.product}
        </div>
      ))}
      {props.addRow?.active && (
        <div data-testid="add-row-form">add row form</div>
      )}
    </div>
  ),
}));

// Stub AddLineButton
vi.mock('@/components/ui/add-line-button', () => ({
  AddLineButton: ({ onClick, label }) => (
    <button data-testid="add-line-button" onClick={onClick}>
      {label}
    </button>
  ),
}));

import PriceListProductPrices from '../PriceListProductPrices.jsx';

describe('PriceListProductPrices', () => {
  const defaultProps = {
    recordId: 'rec-1',
    data: { id: 'rec-1', priceListVersion: 'ver-1' },
    token: 'test-token',
    apiBaseUrl: 'http://localhost/sws/neo/price-list',
    editing: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          data: [
            { id: 'pp-1', product: 'prod-1', 'product$_identifier': 'Widget', standardPrice: 10, listPrice: 12 },
            { id: 'pp-2', product: 'prod-2', 'product$_identifier': 'Gadget', standardPrice: 20, listPrice: 25 },
          ],
        },
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', async () => {
    render(<PriceListProductPrices {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });
  });

  it('shows save-first message when parentId is null', () => {
    render(
      <PriceListProductPrices
        {...defaultProps}
        recordId="new"
        data={{ id: null }}
      />,
    );
    expect(screen.getByText('priceListSaveFirst')).toBeInTheDocument();
  });

  it('loads product prices on mount', async () => {
    render(<PriceListProductPrices {...defaultProps} />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
    const urls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(urls.some(u => u.includes('productPrice'))).toBe(true);
  });

  it('renders DataTable with loaded lines', async () => {
    render(<PriceListProductPrices {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Widget')).toBeInTheDocument();
      expect(screen.getByText('Gadget')).toBeInTheDocument();
    });
  });

  it('shows no-version message when priceListVersion is null', async () => {
    render(
      <PriceListProductPrices
        {...defaultProps}
        data={{ id: 'rec-1', priceListVersion: null }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('priceListNoVersion')).toBeInTheDocument();
    });
  });

  it('renders add line button when editing and versionId exists', async () => {
    render(<PriceListProductPrices {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('add-line-button')).toBeInTheDocument();
    });
  });

  it('does not render add line button when not editing', async () => {
    render(<PriceListProductPrices {...defaultProps} editing={false} />);
    await waitFor(() => {
      expect(screen.getByTestId('data-table')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('add-line-button')).toBeNull();
  });

  it('opens side panel when a row is clicked', async () => {
    const user = userEvent.setup();
    render(<PriceListProductPrices {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('row-pp-1')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('row-pp-1'));
    // Side panel shows product label, unit price and list price labels
    expect(screen.getByText('priceDetail')).toBeInTheDocument();
  });

  it('shows error message when fetch fails', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Server error' }),
    });
    render(<PriceListProductPrices {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('does not fetch when token is missing', async () => {
    render(
      <PriceListProductPrices
        {...defaultProps}
        token={null}
      />,
    );
    // Should not call fetch
    await waitFor(() => {
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  it('shows confirm delete modal when delete button is clicked', async () => {
    const user = userEvent.setup();
    render(<PriceListProductPrices {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('row-pp-1')).toBeInTheDocument();
    });
    // Click row to open side panel
    await user.click(screen.getByTestId('row-pp-1'));
    // Find and click delete button
    const deleteButtons = screen.getAllByText('delete');
    const deleteBtn = deleteButtons[deleteButtons.length - 1];
    await user.click(deleteBtn);
    // Confirm modal should appear
    expect(screen.getByText('deleteRecord')).toBeInTheDocument();
    expect(screen.getByText('deleteConfirmMessage')).toBeInTheDocument();
  });
});
