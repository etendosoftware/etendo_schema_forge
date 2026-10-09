// @covers tools/app-shell/src/components/contract-ui/SelectorInput.jsx
// @covers tools/app-shell/src/lib/selectorRevalidation.js
/**
 * SelectorInput — first-page revalidation on reopen.
 *
 * The line dimension selectors (Cost Center / Project in the GL journal "Dimensiones contables"
 * row) stay mounted for the whole document and used to load their options only on the FIRST
 * open, so a cost center deactivated meanwhile stayed listed (ETP-5681). A failed page was also
 * cached as "no options".
 *
 * A separate file from SelectorInput.cache.vitest.jsx on purpose: it mocks
 * `useOptionalDataCache` with a FIXED scope (module mocks are file-wide). Under a real
 * AuthProvider the scope's `authRevision` bumps asynchronously after mount and re-keys the cache,
 * which makes exact request counts depend on timing.
 */
import React from 'react';
import { render, waitFor, act } from '@testing-library/react';

const harness = vi.hoisted(() => ({ open: true, dataCache: null }));

vi.mock('@/i18n', () => ({ useUI: () => (k) => k }));
vi.mock('@/lib/buildUrlWithParams.js', () => ({ buildUrlWithParams: (url) => url }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('lucide-react', () => ({ Loader2: () => <span />, ChevronDown: () => <span /> }));
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => (url, opts) => globalThis.fetch(url, opts),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectTrigger: React.forwardRef(({ children, ...rest }, ref) => <button ref={ref} {...rest}>{children}</button>),
  SelectValue: ({ placeholder }) => <span>{placeholder}</span>,
  // `harness.open` lets a test close and reopen the dropdown on a STILL-MOUNTED selector: the
  // callback ref fires again when the content remounts, as with Radix.
  SelectContent: React.forwardRef(({ children }, ref) => (harness.open ? <div ref={ref}>{children}</div> : null)),
  SelectItem: ({ children, value }) => <div data-value={value}>{children}</div>,
}));
vi.mock('@etendosoftware/app-shell-core/data', async (importOriginal) => ({
  ...(await importOriginal()),
  useOptionalDataCache: () => harness.dataCache,
}));

import { createQueryCache } from '@etendosoftware/app-shell-core/data';
import { SELECTOR_REVALIDATE_AFTER_MS, needsSelectorRevalidation } from '@/lib/selectorRevalidation.js';
import { SelectorInput } from '../SelectorInput.jsx';

const URL = '/api/gLJournalLine/selectors/C_Costcenter_ID';
const field = { key: 'costCenter', label: 'Cost Center', column: 'C_Costcenter_ID', required: false };
const SCOPE = { auth: 'tok', client: 'c1', role: 'r1', org: 'o1', authRevision: 0 };

const page = (...labels) => ({ ok: true, json: async () => ({ items: labels.map((label, i) => ({ id: String(i + 1), label })) }) });

/** Answers the queued responses in order (the last one repeats). */
function queue(...responses) {
  globalThis.fetch = vi.fn(async () => (responses.length > 1 ? responses.shift() : responses[0]));
  return globalThis.fetch;
}

function useCache(cache) {
  harness.dataCache = cache ? { cache, scope: SCOPE, catalogStaleTime: 5 * 60_000 } : null;
}

const tree = () => (
  <SelectorInput
    entityName="gLJournalLine" field={field} value="" displayValue="" onChange={vi.fn()}
    catalogs={{}} resolvedLabel="Cost Center" selectorUrl={URL} selectorContext={{ AD_Org_ID: 'o1' }} token="tok"
  />
);

async function reopen(view) {
  harness.open = false;
  view.rerender(tree());
  harness.open = true;
  view.rerender(tree());
  await act(async () => {});
}

describe('SelectorInput — first page revalidation on reopen (ETP-5681)', () => {
  afterEach(() => {
    harness.open = true;
    harness.dataCache = null;
    vi.restoreAllMocks();
  });

  it('reopening after the revalidation window refetches and drops a deactivated option', async () => {
    const fetchMock = queue(page('Centro A', 'Centro inactivo'), page('Centro A'));
    useCache(createQueryCache());

    const view = render(tree());
    await waitFor(() => expect(view.getByText('Centro inactivo')).toBeInTheDocument());

    const later = Date.now() + SELECTOR_REVALIDATE_AFTER_MS + 1;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    await reopen(view);
    await waitFor(() => expect(view.queryByText('Centro inactivo')).not.toBeInTheDocument());
    expect(view.getByText('Centro A')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a page cached by an earlier mount is shown at once and revalidated once in the background', async () => {
    const fetchMock = queue(page('Centro A', 'Centro inactivo'), page('Centro A'));
    useCache(createQueryCache());

    const first = render(tree());
    await waitFor(() => expect(first.getByText('Centro inactivo')).toBeInTheDocument());
    first.unmount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Still inside the 5-minute catalog window, but past the revalidation age.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + SELECTOR_REVALIDATE_AFTER_MS + 1);

    const second = render(tree());
    // The cached page is on screen before the revalidation settles...
    await waitFor(() => expect(second.getByText('Centro inactivo')).toBeInTheDocument());
    // ...then the background revalidation replaces it.
    await waitFor(() => expect(second.queryByText('Centro inactivo')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reopening within the revalidation window reuses the loaded options (no request)', async () => {
    const fetchMock = queue(page('Centro A'));
    useCache(createQueryCache());

    const view = render(tree());
    await waitFor(() => expect(view.getByText('Centro A')).toBeInTheDocument());
    await reopen(view);
    expect(view.getByText('Centro A')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reopening after the page was invalidated (a write elsewhere) refetches at once', async () => {
    const fetchMock = queue(page('Centro A', 'Centro inactivo'), page('Centro A'));
    const cache = createQueryCache();
    useCache(cache);

    const view = render(tree());
    await waitFor(() => expect(view.getByText('Centro inactivo')).toBeInTheDocument());
    cache.invalidate({ entity: 'selector' });

    await reopen(view);
    await waitFor(() => expect(view.queryByText('Centro inactivo')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reopening after the cache entry is gone (cleared on a session change) refetches', async () => {
    const fetchMock = queue(page('Centro A', 'Centro inactivo'), page('Centro A'));
    const cache = createQueryCache();
    useCache(cache);

    const view = render(tree());
    await waitFor(() => expect(view.getByText('Centro inactivo')).toBeInTheDocument());
    cache.clear();

    await reopen(view);
    await waitFor(() => expect(view.queryByText('Centro inactivo')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('without a DataProvider, reopening within the window does not refetch', async () => {
    const fetchMock = queue(page('Centro A'));
    useCache(null);

    const view = render(tree());
    await waitFor(() => expect(view.getByText('Centro A')).toBeInTheDocument());
    await reopen(view);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed first page is not cached: the next mount fetches again', async () => {
    const fetchMock = queue({ ok: false, status: 500, json: async () => ({}) }, page('Centro A'));
    useCache(createQueryCache());

    const first = render(tree());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {});
    first.unmount();

    const second = render(tree());
    await waitFor(() => expect(second.getByText('Centro A')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('needsSelectorRevalidation', () => {
  const now = 1_000_000;
  it.each([
    ['no entry', null, true],
    ['an invalidated entry', { stale: true, updatedAt: now }, true],
    ['an entry exactly at the window', { stale: false, updatedAt: now - SELECTOR_REVALIDATE_AFTER_MS }, true],
    ['an entry just inside the window', { stale: false, updatedAt: now - SELECTOR_REVALIDATE_AFTER_MS + 1 }, false],
    ['a fresh entry', { stale: false, updatedAt: now }, false],
  ])('%s → %s', (_label, entry, expected) => {
    expect(needsSelectorRevalidation(entry, now)).toBe(expected);
  });
});
