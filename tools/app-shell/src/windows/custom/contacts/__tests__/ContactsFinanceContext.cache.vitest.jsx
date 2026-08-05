/**
 * ETP-4564 [SEC T01 3/3] — cache behavior for the Contacts finance KPIs
 * (bp-stats / bp-trend). Asserts request counts per endpoint so amplification is
 * measured directly. Runs under both dev profiles:
 *   cd tools/app-shell && npx vitest run src/windows/custom/contacts/__tests__/ContactsFinanceContext.cache.vitest.jsx
 *   cd tools/app-shell && LOCAL_CORE=1 npx vitest run src/windows/custom/contacts/__tests__/ContactsFinanceContext.cache.vitest.jsx
 *
 * Every AuthProvider opts out of the cookie-session restore (`restoreSession={null}`):
 * these tests exercise the query cache, not the auth restore, and the default
 * restore flow would otherwise clobber the `token` from `initialSession` via
 * the mocked fetch, flipping DataProvider's identity scope and clearing the
 * shared cache mid-test.
 */
vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, createMemoryAuthStorage } from '@etendosoftware/app-shell-core/auth';
import { DataProvider, createQueryCache } from '@etendosoftware/app-shell-core/data';
import {
  ContactsFinanceProvider,
  useContactsFinance,
  useSyncFinanceRecordId,
} from '../ContactsFinanceContext';

const API = '/api/sws/neo/contacts';

function makeFetch() {
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] || 0) + 1; };
  const fetchMock = vi.fn(async (url) => {
    const kind = url.includes('/bp-stats') ? 'bp-stats' : url.includes('/bp-trend') ? 'bp-trend' : 'other';
    const id = new URL(url, 'http://x').searchParams.get('businessPartnerId') || '?';
    bump(`${kind}:${id}`);
    const data = kind === 'bp-trend' ? { labels: ['a'], revenue: [1], expenses: [0] } : [{ key: 'k', value: 1 }];
    return { ok: true, json: async () => ({ response: { data } }) };
  });
  return { fetchMock, counts };
}

let captured = null;
function FinanceProbe({ recordId }) {
  const ctx = useContactsFinance();
  captured = ctx;
  useSyncFinanceRecordId(recordId);
  return <span data-testid="stats">{ctx.stats === null ? 'null' : 'loaded'}</span>;
}

function renderFinance(recordId, cache) {
  const session = { token: 'tok', selectedRole: { id: 'r1' }, selectedOrg: { id: 'o1' } };
  return render(
    <AuthProvider storage={createMemoryAuthStorage(session)} initialSession={session} restoreSession={null}>
      <DataProvider cache={cache}>
        <ContactsFinanceProvider token="tok" apiBaseUrl={API}>
          <FinanceProbe recordId={recordId} />
        </ContactsFinanceProvider>
      </DataProvider>
    </AuthProvider>,
  );
}

describe('ContactsFinanceContext — shared cache (ETP-4564)', () => {
  let cache;
  beforeEach(() => { cache = createQueryCache(); captured = null; });
  afterEach(() => { vi.restoreAllMocks(); });

  it('reopening the same contact within freshness does not repeat the KPI requests', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderFinance('BP1', cache);
    await waitFor(() => expect(screen.getByTestId('stats').textContent).toBe('loaded'));
    expect(counts['bp-stats:BP1']).toBe(1);
    expect(counts['bp-trend:BP1']).toBe(1);
    a.unmount();

    renderFinance('BP1', cache); // reopen — shared cache
    await waitFor(() => expect(screen.getByTestId('stats').textContent).toBe('loaded'));
    expect(counts['bp-stats:BP1']).toBe(1); // reused, no second request
    expect(counts['bp-trend:BP1']).toBe(1);
  });

  it('a different contact uses a distinct key and fetches its own KPIs', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderFinance('BP1', cache);
    await waitFor(() => expect(counts['bp-stats:BP1']).toBe(1));
    a.unmount();
    renderFinance('BP2', cache);
    await waitFor(() => expect(counts['bp-stats:BP2']).toBe(1));
    expect(counts['bp-stats:BP1']).toBe(1); // untouched
  });

  it('refresh() forces a new KPI request even when cached', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    renderFinance('BP1', cache);
    await waitFor(() => expect(counts['bp-stats:BP1']).toBe(1));

    await act(async () => { captured.refresh(); });
    await waitFor(() => expect(counts['bp-stats:BP1']).toBe(2));
  });

  it('invalidating bp-stats makes the next open refetch it (mutation hook)', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    const a = renderFinance('BP1', cache);
    await waitFor(() => expect(counts['bp-stats:BP1']).toBe(1));
    a.unmount();

    // A finance mutation would call this to force KPI revalidation.
    act(() => { cache.invalidate({ entity: 'bp-stats' }); });

    renderFinance('BP1', cache);
    await waitFor(() => expect(counts['bp-stats:BP1']).toBe(2)); // refetched
    expect(counts['bp-trend:BP1']).toBe(1); // trend untouched by the targeted invalidation
  });

  it('KPI data cannot leak across organizations (scope isolation)', async () => {
    const { fetchMock, counts } = makeFetch();
    globalThis.fetch = fetchMock;

    // org o1
    const a = render(
      <AuthProvider storage={createMemoryAuthStorage({ token: 'tok', selectedOrg: { id: 'o1' } })} initialSession={{ token: 'tok', selectedOrg: { id: 'o1' } }} restoreSession={null}>
        <DataProvider cache={cache}>
          <ContactsFinanceProvider token="tok" apiBaseUrl={API}><FinanceProbe recordId="BP1" /></ContactsFinanceProvider>
        </DataProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(counts['bp-stats:BP1']).toBe(1));
    a.unmount();

    // same contact, org o2 → distinct key → refetch (no leak)
    render(
      <AuthProvider storage={createMemoryAuthStorage({ token: 'tok', selectedOrg: { id: 'o2' } })} initialSession={{ token: 'tok', selectedOrg: { id: 'o2' } }} restoreSession={null}>
        <DataProvider cache={cache}>
          <ContactsFinanceProvider token="tok" apiBaseUrl={API}><FinanceProbe recordId="BP1" /></ContactsFinanceProvider>
        </DataProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(counts['bp-stats:BP1']).toBe(2));
  });
});
