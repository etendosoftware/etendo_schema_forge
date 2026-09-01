// ETP-5112 regression (bug 1) — the price-list product-price inline edit must send the
// row's `updated` optimistic-locking token.
//
// ETP-5073 made the backend require the token of the record AS IT WAS READ; only
// `useEntity` remembered one, so every panel that reads with `apiFetch` directly — this one
// — patched without it and got 400 `missing_updated`. The fix is central, in
// `@etendosoftware/app-shell-core` (`auth/api.js` harvests the token from every GET, keyed
// by entity AND id, and injects it into the write that follows), so nothing in this screen
// changed. What is pinned here is the screen's half of the contract: it reads its lines
// through `apiFetch` at a path whose (entity, id) matches the write.
//
// ALL rows of the list read are harvested, not just row 0 — the row a user edits in a grid
// is rarely the first one, which is what the second test covers.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  neoResponse, bodyOf, writeCalls, resetRecordVersionsForTests,
} from '@/test/realApiFetch.js';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
}));

// Same stub as the neighbouring suite: exposes one "edit" button per row that calls the
// component's real `onUpdateRow` handler.
vi.mock('@/components/contract-ui', () => ({
  InlineLinesPanel: (props) => (
    <div data-testid="inline-lines-panel">
      {props.data?.map((row) => (
        <button
          key={row.id}
          data-testid={`edit-listPrice-${row.id}`}
          onClick={() => props.onUpdateRow(row, 'listPrice', '99')}>
          edit
        </button>
      ))}
    </div>
  ),
}));

import PriceListProductPrices from '../PriceListProductPrices.jsx';

const VERSION_ID = 'ver-1';
const ROW_1 = { id: 'pp-1', product: 'prod-1', standardPrice: 10, listPrice: 12, updated: 'PP1-TOKEN' };
const ROW_2 = { id: 'pp-2', product: 'prod-2', standardPrice: 20, listPrice: 25, updated: 'PP2-TOKEN' };

const defaultProps = {
  recordId: 'rec-1',
  data: { id: 'rec-1', priceListVersion: VERSION_ID },
  token: 'test-token',
  apiBaseUrl: 'http://localhost/sws/neo/price-list',
  editing: true,
};

function installFetch(rows) {
  globalThis.fetch = vi.fn((url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    if (method === 'GET' && url.includes('/productPrice?parentId=')) return Promise.resolve(neoResponse(rows));
    return Promise.resolve(neoResponse([]));
  });
  return globalThis.fetch;
}

beforeEach(() => {
  resetRecordVersionsForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PriceListProductPrices — updated token (ETP-5112)', () => {
  it('sends the line updated token it read, on the inline price PATCH', async () => {
    const fetchMock = installFetch([ROW_1, ROW_2]);
    const user = userEvent.setup();
    render(<PriceListProductPrices {...defaultProps} />);

    await screen.findByTestId('edit-listPrice-pp-1');
    await user.click(screen.getByTestId('edit-listPrice-pp-1'));

    await waitFor(() => expect(writeCalls(fetchMock)).toHaveLength(1));

    const [call] = writeCalls(fetchMock);
    expect(call[0]).toContain('/productPrice/pp-1');
    const body = bodyOf(call);
    expect(body.updated).toBe(ROW_1.updated);
    expect(body.listPrice).toBe(99);
  });

  it('sends the SECOND row token when the second row is the one edited', async () => {
    const fetchMock = installFetch([ROW_1, ROW_2]);
    const user = userEvent.setup();
    render(<PriceListProductPrices {...defaultProps} />);

    await screen.findByTestId('edit-listPrice-pp-2');
    await user.click(screen.getByTestId('edit-listPrice-pp-2'));

    await waitFor(() => expect(writeCalls(fetchMock)).toHaveLength(1));

    const [call] = writeCalls(fetchMock);
    expect(call[0]).toContain('/productPrice/pp-2');
    expect(bodyOf(call).updated).toBe(ROW_2.updated);
  });
});
