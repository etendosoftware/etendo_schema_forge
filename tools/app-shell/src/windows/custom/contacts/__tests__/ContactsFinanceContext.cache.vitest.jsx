/**
 * ETP-4564 [SEC T01 3/3] — cache behavior for the Contacts finance KPIs
 * (bp-stats / bp-trend). Asserts request counts per endpoint so amplification is
 * measured directly. Run under LOCAL_CORE so @etendosoftware/app-shell-core
 * resolves the shared cache from local source:
 *   cd tools/app-shell && LOCAL_CORE=1 npx vitest run \
 *     src/windows/custom/contacts/__tests__/ContactsFinanceContext.cache.vitest.jsx
 */
// @covers tools/app-shell/src/windows/custom/contacts/ContactsFinanceContext.jsx
// Requests go through `useApiFetch` (docs/request-policy.md): mocked with one stable function.
// AuthProvider + DataProvider stay real — they own the cache scope under test.
const { mockApiFetch } = vi.hoisted(() => ({ mockApiFetch: vi.fn() }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

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
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (url) => {
    const kind = url.includes('/bp-stats') ? 'bp-stats' : url.includes('/bp-trend') ? 'bp-trend' : 'other';
    const params = new URL(url, 'http://x').searchParams;
    const id = params.get('businessPartnerId') || '?';
    bump(`${kind}:${id}`);
    if (params.has('months')) bump(`${kind}:${id}:m${params.get('months')}`);
    const data = kind === 'bp-trend' ? { labels: ['a'], revenue: [1], expenses: [0] } : [{ key: 'k', value: 1 }];
    return { ok: true, json: async () => ({ response: { data } }) };
  });
  return { counts };
}

let captured = null;
function FinanceProbe({ recordId }) {
  const ctx = useContactsFinance();
  captured = ctx;
  useSyncFinanceRecordId(recordId);
  return <span data-testid="stats">{ctx.stats === null ? 'null' : 'loaded'}</span>;
}

const statsLoaded = () => waitFor(() => expect(screen.getByTestId('stats').textContent).toBe('loaded'));
async function selectPeriod(period) {
  await act(async () => { captured.setPeriod(period); });
  await statsLoaded();
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
    const { counts } = makeFetch();

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
    const { counts } = makeFetch();

    const a = renderFinance('BP1', cache);
    await waitFor(() => expect(counts['bp-stats:BP1']).toBe(1));
    a.unmount();
    renderFinance('BP2', cache);
    await waitFor(() => expect(counts['bp-stats:BP2']).toBe(1));
    expect(counts['bp-stats:BP1']).toBe(1); // untouched
  });

  it('refresh() forces both KPI requests for the current period even when cached', async () => {
    const { counts } = makeFetch();

    renderFinance('BP1', cache);
    await waitFor(() => expect(counts['bp-stats:BP1']).toBe(1));
    await statsLoaded();
    await selectPeriod('6M');
    expect(counts['bp-stats:BP1:m6']).toBe(1);

    await act(async () => { captured.refresh(); });
    await waitFor(() => expect(counts['bp-stats:BP1:m6']).toBe(2));
    await waitFor(() => expect(counts['bp-trend:BP1']).toBe(2));
    expect(counts['bp-stats:BP1:m3']).toBe(1); // the inactive period is not forced
  });

  it('switching back to a period already loaded is served from the cache', async () => {
    const { counts } = makeFetch();

    renderFinance('BP1', cache);
    await statsLoaded();
    await selectPeriod('6M');
    await selectPeriod('3M');

    expect(counts['bp-stats:BP1:m3']).toBe(1);
    expect(counts['bp-stats:BP1:m6']).toBe(1);
  });

  it('invalidating bp-stats marks every period stale', async () => {
    const { counts } = makeFetch();

    renderFinance('BP1', cache);
    await statsLoaded();
    await selectPeriod('6M');

    act(() => { cache.invalidate({ entity: 'bp-stats' }); });

    await selectPeriod('3M');
    await waitFor(() => expect(counts['bp-stats:BP1:m3']).toBe(2));
    await selectPeriod('6M');
    await waitFor(() => expect(counts['bp-stats:BP1:m6']).toBe(2));
  });

  it('invalidating bp-stats makes the next open refetch it (mutation hook)', async () => {
    const { counts } = makeFetch();

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
    const { counts } = makeFetch();

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
