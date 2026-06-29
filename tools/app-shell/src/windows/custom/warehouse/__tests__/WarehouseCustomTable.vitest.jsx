// --- Mocks (before imports) ---

vi.mock('@/components/contract-ui', () => ({
  DataTable: ({ columns, data, ...rest }) => {
    // Render each column's render fn for every row so their code paths execute.
    // The ctx object mirrors what the real DataTable passes to render(row, ctx).
    const ctx = { token: rest.token ?? 'test-token', apiBaseUrl: rest.apiBaseUrl ?? '/api' };
    return (
      <div data-testid="DataTable__stub">
        {(data ?? []).map((row) =>
          columns.map((col) => (
            <div key={`${row.id}-${col.key}`} data-testid={`col-${col.key}-${row.id}`}>
              {col.render ? col.render(row, ctx) : null}
            </div>
          )),
        )}
      </div>
    );
  },
}));

// --- Imports ---

import { render, screen, waitFor } from '@testing-library/react';
import WarehouseCustomTable from '../WarehouseCustomTable.jsx';

// --- Helpers ---

function makeFetchOk(json) {
  return Promise.resolve({ ok: true, json: async () => json });
}

function makeFetchNotOk() {
  return Promise.resolve({ ok: false });
}

const BASE_PROPS = {
  token: 'tok-abc',
  apiBaseUrl: '/sws/neo',
};

// --- Tests ---

describe('WarehouseCustomTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------ columns

  describe('column render — name', () => {
    it('renders the warehouse name bold', async () => {
      globalThis.fetch.mockImplementation(() => makeFetchOk({ response: { data: [] } }));

      render(
        <WarehouseCustomTable
          {...BASE_PROPS}
          data={[{ id: 'wh-1', name: 'Main Warehouse', searchKey: null }]}
        />,
      );

      const cell = await screen.findByTestId('col-name-wh-1');
      expect(cell.querySelector('span')).toHaveClass('font-semibold');
      expect(cell).toHaveTextContent('Main Warehouse');
    });
  });

  describe('column render — searchKey', () => {
    it('renders the badge when searchKey is present', async () => {
      globalThis.fetch.mockImplementation(() => makeFetchOk({ response: { data: [] } }));

      render(
        <WarehouseCustomTable
          {...BASE_PROPS}
          data={[{ id: 'wh-2', name: 'WH', searchKey: 'WH-001' }]}
        />,
      );

      const cell = await screen.findByTestId('col-searchKey-wh-2');
      expect(cell).toHaveTextContent('WH-001');
      expect(cell.querySelector('span')).toHaveClass('rounded-lg');
    });

    it('renders — when searchKey is absent', async () => {
      globalThis.fetch.mockImplementation(() => makeFetchOk({ response: { data: [] } }));

      render(
        <WarehouseCustomTable
          {...BASE_PROPS}
          data={[{ id: 'wh-3', name: 'WH', searchKey: null }]}
        />,
      );

      const cell = await screen.findByTestId('col-searchKey-wh-3');
      expect(cell).toHaveTextContent('—');
    });
  });

  describe('column render — locationAddress', () => {
    it('renders $_identifier when present', async () => {
      globalThis.fetch.mockImplementation(() => makeFetchOk({ response: { data: [] } }));

      render(
        <WarehouseCustomTable
          {...BASE_PROPS}
          data={[
            {
              id: 'wh-4',
              name: 'WH',
              'locationAddress$_identifier': 'Main Street 1',
              locationAddress: 'raw-addr',
            },
          ]}
        />,
      );

      const cell = await screen.findByTestId('col-locationAddress-wh-4');
      expect(cell).toHaveTextContent('Main Street 1');
    });

    it('falls back to locationAddress when $_identifier is absent', async () => {
      globalThis.fetch.mockImplementation(() => makeFetchOk({ response: { data: [] } }));

      render(
        <WarehouseCustomTable
          {...BASE_PROPS}
          data={[{ id: 'wh-5', name: 'WH', locationAddress: 'raw-addr' }]}
        />,
      );

      const cell = await screen.findByTestId('col-locationAddress-wh-5');
      expect(cell).toHaveTextContent('raw-addr');
    });

    it('renders — when both address fields are absent', async () => {
      globalThis.fetch.mockImplementation(() => makeFetchOk({ response: { data: [] } }));

      render(
        <WarehouseCustomTable
          {...BASE_PROPS}
          data={[{ id: 'wh-6', name: 'WH' }]}
        />,
      );

      const cell = await screen.findByTestId('col-locationAddress-wh-6');
      expect(cell).toHaveTextContent('—');
    });
  });

  // ------------------------------------------------------------------ productCount cell

  describe('WarehouseProductCountCell via productCount column', () => {
    it('shows — while loading (count is undefined)', () => {
      // Fetch never resolves — count stays undefined
      globalThis.fetch.mockImplementation(() => new Promise(() => {}));

      render(
        <WarehouseCustomTable
          {...BASE_PROPS}
          data={[{ id: 'wh-10', name: 'WH' }]}
        />,
      );

      const cell = screen.getByTestId('col-productCount-wh-10');
      expect(cell).toHaveTextContent('—');
    });

    it('shows count when bins have products', async () => {
      const BIN_ID = 'bin-1';
      globalThis.fetch.mockImplementation((url) => {
        if (url.includes('storageBin')) {
          return makeFetchOk({ response: { data: [{ id: BIN_ID }] } });
        }
        if (url.includes('binContents')) {
          return makeFetchOk({
            response: {
              data: [
                { product: 'p1', 'product$_identifier': 'Widget', uOM: 'u1', quantityOnHand: 3, etgoValuation: 0 },
                { product: 'p2', 'product$_identifier': 'Gadget', uOM: 'u2', quantityOnHand: 5, etgoValuation: 0 },
              ],
            },
          });
        }
        return makeFetchNotOk();
      });

      render(
        <WarehouseCustomTable
          {...BASE_PROPS}
          data={[{ id: 'wh-11', name: 'WH' }]}
        />,
      );

      await waitFor(() => {
        const cell = screen.getByTestId('col-productCount-wh-11');
        expect(cell).toHaveTextContent('2');
      });
    });

    it('shows 0 when warehouse has no bins', async () => {
      globalThis.fetch.mockImplementation((url) => {
        if (url.includes('storageBin')) {
          return makeFetchOk({ response: { data: [] } });
        }
        return makeFetchNotOk();
      });

      render(
        <WarehouseCustomTable
          {...BASE_PROPS}
          data={[{ id: 'wh-12', name: 'WH' }]}
        />,
      );

      await waitFor(() => {
        const cell = screen.getByTestId('col-productCount-wh-12');
        expect(cell).toHaveTextContent('0');
      });
    });

    it('shows — when storageBin fetch fails (not ok)', async () => {
      globalThis.fetch.mockImplementation(() => makeFetchNotOk());

      render(
        <WarehouseCustomTable
          {...BASE_PROPS}
          data={[{ id: 'wh-13', name: 'WH' }]}
        />,
      );

      // null → stays "—"
      await waitFor(() => {
        const cell = screen.getByTestId('col-productCount-wh-13');
        expect(cell).toHaveTextContent('—');
      });
    });

    it('deduplicates in-flight requests for the same warehouse', async () => {
      const BIN_ID = 'bin-dedup';
      globalThis.fetch.mockImplementation((url) => {
        if (url.includes('storageBin')) {
          return makeFetchOk({ response: { data: [{ id: BIN_ID }] } });
        }
        if (url.includes('binContents')) {
          return makeFetchOk({
            response: {
              data: [
                { product: 'p1', 'product$_identifier': 'P1', uOM: 'u1', quantityOnHand: 1, etgoValuation: 0 },
              ],
            },
          });
        }
        return makeFetchNotOk();
      });

      // Two rows with SAME warehouse id — inFlightCounts must deduplicate
      render(
        <WarehouseCustomTable
          {...BASE_PROPS}
          data={[
            { id: 'wh-dedup', name: 'WH A' },
            { id: 'wh-dedup', name: 'WH B' },
          ]}
        />,
      );

      await waitFor(() => {
        // Both cells should show the same count
        const cells = screen.getAllByTestId('col-productCount-wh-dedup');
        cells.forEach((cell) => expect(cell).toHaveTextContent('1'));
      });

      // storageBin should only have been called once
      const storageBinCalls = globalThis.fetch.mock.calls.filter(([url]) =>
        url.includes('storageBin'),
      );
      expect(storageBinCalls.length).toBe(1);
    });

    it('shows — when row has no id', () => {
      globalThis.fetch.mockImplementation(() => makeFetchOk({ response: { data: [] } }));

      render(
        <WarehouseCustomTable
          {...BASE_PROPS}
          data={[{ id: undefined, name: 'Orphan' }]}
        />,
      );

      // Without row.id, useEffect is a no-op, count stays undefined → "—"
      const cell = screen.getByTestId('col-productCount-undefined');
      expect(cell).toHaveTextContent('—');
    });
  });

  // ------------------------------------------------------------------ wrapper

  describe('WarehouseCustomTable wrapper', () => {
    it('renders without crashing with empty data', () => {
      globalThis.fetch.mockImplementation(() => makeFetchOk({ response: { data: [] } }));
      render(<WarehouseCustomTable {...BASE_PROPS} data={[]} />);
      expect(screen.getByTestId('DataTable__stub')).toBeInTheDocument();
    });

    it('passes extra props through to DataTable', () => {
      globalThis.fetch.mockImplementation(() => makeFetchOk({ response: { data: [] } }));
      render(<WarehouseCustomTable {...BASE_PROPS} data={[]} className="extra-class" />);
      expect(screen.getByTestId('DataTable__stub')).toBeInTheDocument();
    });
  });
});
