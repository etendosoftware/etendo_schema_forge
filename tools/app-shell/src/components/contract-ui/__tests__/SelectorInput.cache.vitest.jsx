/**
 * ETP-4564 [SEC T01 3/3] — SelectorInput option caching by selector URL +
 * normalized dependency context (+ page offset). Runs under both dev profiles.
 *
 * The mocked Radix SelectContent renders its children (and fires the ref
 * callback) on mount, so the first page load triggers on render — no click.
 *
 * AuthProvider opts out of the cookie-session restore (`restoreSession={null}`):
 * these tests exercise the query cache, not the auth restore, and the default
 * restore flow would otherwise clobber the `token` from `initialSession` via
 * the mocked fetch, flipping DataProvider's identity scope and clearing the
 * shared cache mid-test.
 */
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useUI: () => (k) => k }));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('lucide-react', () => ({ Loader2: () => <span />, ChevronDown: () => <span /> }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectTrigger: React.forwardRef(({ children, ...rest }, ref) => <button ref={ref} {...rest}>{children}</button>),
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  SelectContent: React.forwardRef(({ children }, ref) => <div ref={ref}>{children}</div>),
  SelectItem: ({ children, value }) => <div data-value={value}>{children}</div>,
}));

import { AuthProvider, createMemoryAuthStorage } from '@etendosoftware/app-shell-core/auth';
import { DataProvider, createQueryCache } from '@etendosoftware/app-shell-core/data';
import { SelectorInput } from '../SelectorInput.jsx';

const URL = '/api/header/selectors/C_BPartner_ID';
const field = { key: 'bp', label: 'Partner', column: 'C_BPartner_ID', required: false };

function makeFetch() {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ items: [{ id: '1', label: 'One' }] }) }));
  return { fetchMock };
}

function renderSel(cache, selectorContext) {
  const session = { token: 'tok', selectedOrg: { id: 'o1' } };
  return render(
    <AuthProvider storage={createMemoryAuthStorage(session)} initialSession={session} restoreSession={null}>
      <DataProvider cache={cache}>
        <SelectorInput
          entityName="header" field={field} value="" displayValue="" onChange={vi.fn()}
          catalogs={{}} resolvedLabel="Partner" selectorUrl={URL} selectorContext={selectorContext} token="tok"
        />
      </DataProvider>
    </AuthProvider>,
  );
}

describe('SelectorInput — option caching (ETP-4564)', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reuses cached options for an identical URL + normalized context (dedup)', async () => {
    const { fetchMock } = makeFetch();
    globalThis.fetch = fetchMock;
    const cache = createQueryCache();

    const a = renderSel(cache, { AD_Org_ID: 'o1' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    a.unmount();

    renderSel(cache, { AD_Org_ID: 'o1' }); // identical context → reuse
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1); // no second request
  });

  it('a changed selector dependency uses a distinct key and fetches new options', async () => {
    const { fetchMock } = makeFetch();
    globalThis.fetch = fetchMock;
    const cache = createQueryCache();

    const a = renderSel(cache, { AD_Org_ID: 'o1', FIN_ISRECEIPT: 'Y' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    a.unmount();

    renderSel(cache, { AD_Org_ID: 'o1', FIN_ISRECEIPT: 'N' }); // different dependency
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); // distinct key → new fetch
  });
});
