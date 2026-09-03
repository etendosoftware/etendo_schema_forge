// ETP-5112 regression (bug 1) — the billing-preferences discount editor must send the
// basic-discount record's `updated` optimistic-locking token on its PUT.
//
// ETP-5073 made the backend require the token of the record AS IT WAS READ; only
// `useEntity` remembered one, so every panel that reads with `apiFetch` directly — this one
// — wrote without it and got 400 `missing_updated`. The fix is central, in
// `@etendosoftware/app-shell-core` (`auth/api.js` harvests the token from every GET, keyed
// by entity AND id, and injects it into the write that follows), so nothing in this screen
// changed. What is pinned here is the screen's half: the discount record is read as a
// collection (`/basicDiscount?parentId=…`) and written by id (`/basicDiscount/{id}`), two
// different path SHAPES that must still resolve to the same entity bucket — which is the
// case `entityFromPath` exists for.
//
// The real `createApiFetch` is deliberately not stubbed — see `@/test/realApiFetch.js`.

vi.mock('@/i18n', () => ({ useUI: () => (k) => k }));

vi.mock('@/components/contract-ui', () => ({
  EntityForm: () => <div data-testid="entity-form" />,
}));

vi.mock('lucide-react', () => {
  const isReserved = (prop) => typeof prop !== 'string' || prop === 'then' || prop === '__esModule';
  return new Proxy({}, {
    has: (_t, prop) => !isReserved(prop),
    get: (_t, prop) => (isReserved(prop) ? undefined : () => <span />),
  });
});

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  jsonResponse, neoResponse, bodyOf, writeCalls, resetRecordVersionsForTests,
} from '@/test/realApiFetch.js';
import BillingPreferencesForm from '../BillingPreferencesForm';

const BP_ID = 'bp-1';
const DISCOUNT_RECORD_ID = 'bd-1';
const DISCOUNT_TOKEN = 'BASIC-DISCOUNT-TOKEN-0001';

const defaultProps = {
  data: { id: BP_ID, customer: true, vendor: false },
  api: {},
  token: 'test-token',
  apiBaseUrl: '/sws/neo/contacts',
  onChange: vi.fn(),
};

function installFetch({ discountRecord } = {}) {
  globalThis.fetch = vi.fn((rawUrl, init = {}) => {
    const url = String(rawUrl);
    const method = String(init.method || 'GET').toUpperCase();
    if (method === 'GET' && url.includes('/basicDiscount/selectors/')) {
      // Selector catalog — a bare `{ items: [...] }` payload, not a NEO record envelope.
      return Promise.resolve(jsonResponse({
        items: [{ id: 'disc-a', label: 'Discount A' }, { id: 'disc-b', label: 'Discount B' }],
      }));
    }
    if (method === 'GET' && url.includes('/basicDiscount?parentId=')) {
      return Promise.resolve(neoResponse(discountRecord ? [discountRecord] : []));
    }
    return Promise.resolve(neoResponse([{ id: DISCOUNT_RECORD_ID, discount: 'disc-b' }]));
  });
  return globalThis.fetch;
}

const existingDiscount = {
  id: DISCOUNT_RECORD_ID,
  discount: 'disc-a',
  lineNo: 10,
  updated: DISCOUNT_TOKEN,
};

/** The discount `<select>` is the only combobox this form renders. */
async function discountSelect() {
  return waitFor(() => {
    const select = screen.getByRole('combobox');
    // Options land only after the selector catalog resolves.
    expect(select.querySelectorAll('option').length).toBeGreaterThan(1);
    return select;
  });
}

beforeEach(() => {
  resetRecordVersionsForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BillingPreferencesForm — updated token (ETP-5112)', () => {
  it('sends the discount record token it read, on the PUT that changes the discount', async () => {
    const fetchMock = installFetch({ discountRecord: existingDiscount });
    render(<BillingPreferencesForm {...defaultProps} />);

    const select = await discountSelect();
    fireEvent.change(select, { target: { value: 'disc-b' } });

    await waitFor(() => expect(writeCalls(fetchMock)).toHaveLength(1));

    const [call] = writeCalls(fetchMock);
    expect(call[0]).toContain(`/basicDiscount/${DISCOUNT_RECORD_ID}`);
    const body = bodyOf(call);
    // The list read (`/basicDiscount?parentId=…`) and the write (`/basicDiscount/{id}`)
    // present different path tails; both must key into the same `basicDiscount` bucket.
    expect(body.updated).toBe(DISCOUNT_TOKEN);
    expect(body.discount).toBe('disc-b');
  });

  // The token is only ever attached to an UPDATE of a record that was read. A create has no
  // prior version, and injecting one there would be meaningless at best.
  it('does not attach a token to the POST that creates a first discount record', async () => {
    const fetchMock = installFetch({ discountRecord: null });
    render(<BillingPreferencesForm {...defaultProps} />);

    const select = await discountSelect();
    fireEvent.change(select, { target: { value: 'disc-b' } });

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(([, o]) => o?.method === 'POST');
      expect(posts).toHaveLength(1);
    });

    const post = fetchMock.mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(post[1].body)).not.toHaveProperty('updated');
  });
});
