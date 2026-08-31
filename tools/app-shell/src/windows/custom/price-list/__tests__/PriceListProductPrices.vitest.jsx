/**
 * Integration render test for PriceListProductPrices.
 * Renders the real component with mocked dependencies.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
  useLabel: () => (key) => key,
}));

// Stub InlineLinesPanel — heavy component with its own tests.
vi.mock('@/components/contract-ui', () => ({
  InlineLinesPanel: (props) => (
    <div
      data-testid="inline-lines-panel"
      data-entity={props.entity}
      data-readonly={props.isDocumentReadOnly}
      data-has-delete-handler={String(!!props.onDeleteRow)}
    >
      {props.data?.map((row) => (
        <div key={row.id} data-testid={`row-${row.id}`} data-list-price={row.listPrice}>
          {row['product$_identifier'] || row.product}
          <button
            data-testid={`edit-listPrice-${row.id}`}
            onClick={() => props.onUpdateRow(row, 'listPrice', '99')}
          >
            edit
          </button>
        </div>
      ))}
    </div>
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
      expect(screen.getByTestId('inline-lines-panel')).toBeInTheDocument();
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

  it('renders InlineLinesPanel with loaded lines', async () => {
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

  it('marks InlineLinesPanel read-only when not editing', async () => {
    render(<PriceListProductPrices {...defaultProps} editing={false} />);
    await waitFor(() => {
      expect(screen.getByTestId('inline-lines-panel')).toHaveAttribute('data-readonly', 'true');
    });
  });

  it('autosaves an inline field edit via PATCH', async () => {
    const user = userEvent.setup();
    render(<PriceListProductPrices {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-listPrice-pp-1')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('edit-listPrice-pp-1'));
    await waitFor(() => {
      const patchCall = globalThis.fetch.mock.calls.find(c => c[1]?.method === 'PATCH');
      expect(patchCall).toBeTruthy();
      expect(patchCall[0]).toContain('/productPrice/pp-1');
      expect(JSON.parse(patchCall[1].body)).toEqual({ listPrice: 99 });
    });
  });

  // The server response wins over the client-typed value (NEO Headless may
  // round/normalize the stored amount) — mirrors DetailView's inline-edit handler.
  it('uses the server-returned value over the client-typed one after a PATCH', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: {
            data: [
              { id: 'pp-1', product: 'prod-1', 'product$_identifier': 'Widget', standardPrice: 10, listPrice: 12 },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'pp-1', listPrice: 99.5 }] } }),
      });
    render(<PriceListProductPrices {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('edit-listPrice-pp-1')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('edit-listPrice-pp-1'));
    await waitFor(() => {
      expect(screen.getByTestId('row-pp-1')).toHaveAttribute('data-list-price', '99.5');
    });
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

  it('does not fetch when token is missing — inverted: the cookie carries the session', async () => {
    render(
      <PriceListProductPrices
        {...defaultProps}
        token={null}
      />,
    );
    // Should not call fetch
    await waitFor(() => {
    // ETP-4576 — inverted on purpose: under the cookie scheme the client holds no token,
    // so the request MUST still go out. The old expectation encoded the guard that made
    // this call silently disappear for every authenticated user.
      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });

  // ETP-4592: lines cannot be deleted from this tab (products are added to a
  // tariff from the product record itself, not removed here).
  it('does not wire a delete handler into InlineLinesPanel', async () => {
    render(<PriceListProductPrices {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('inline-lines-panel')).toHaveAttribute('data-has-delete-handler', 'false');
    });
  });

  it('renders a scoped style hiding InlineLinesPanel\'s row-delete icon', async () => {
    const { container } = render(<PriceListProductPrices {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('inline-lines-panel')).toBeInTheDocument();
    });
    const styleTag = container.querySelector('style');
    expect(styleTag).toBeTruthy();
    expect(styleTag.textContent).toContain('.price-list-lines');
    expect(styleTag.textContent).toContain('display: none');
  });

  // ETP-4592: products are added to a tariff from the product record itself —
  // there is no "add product" action from this tab anymore.
  it('does not render an add-product button', async () => {
    render(<PriceListProductPrices {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('inline-lines-panel')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('add-line-button')).toBeNull();
    expect(screen.queryByTestId('data-table')).toBeNull();
  });
});
