// InlineSearchCombo server-search pagination (ETP-4975) — mirrors
// CreatableSearchSelect-pagination.vitest.jsx's coverage for the header selector,
// applied to the inline grid combo (used for line-level FK fields such as an
// invoice line's Impuesto). No existing InlineSearchCombo test broke when this
// landed (confirmed by the developer) — this file adds the missing coverage.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('lucide-react', () => ({ ChevronDown: () => <span data-testid="chevron" /> }));
vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url, params) => {
    const qs = new URLSearchParams(params).toString();
    return qs ? `${url}?${qs}` : url;
  },
}));
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import InlineSearchCombo from '../InlineSearchCombo.jsx';

const FIELD = { key: 'tax' };

function makePage(startId, count) {
  return Array.from({ length: count }, (_, i) => ({ id: String(startId + i), name: `Item-${startId + i}` }));
}

function jsonOk(items) {
  return Promise.resolve({ ok: true, json: async () => ({ items }) });
}

function setScrollGeometry(panel, { scrollHeight, clientHeight, scrollTop }) {
  Object.defineProperty(panel, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(panel, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(panel, 'scrollTop', { value: scrollTop, configurable: true });
}

function renderCombo(overrides = {}) {
  const onChange = vi.fn();
  const props = {
    field: FIELD,
    value: '',
    options: [], // local catalog fallback only kicks in without a selectorUrl — irrelevant here
    onChange,
    placeholder: 'Search tax',
    clearOnType: true,
    selectorUrl: '/api/selectors/tax',
    selectorContext: {},
    token: 'test-token',
    ...overrides,
  };
  const result = render(<InlineSearchCombo {...props} />);
  const input = screen.getByTestId('inline-add-field-tax');
  return { ...result, input, onChange };
}

describe('InlineSearchCombo — serverSearch pagination (ETP-4975)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends explicit limit=50&offset=0 on the initial page load (focus, empty query)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(jsonOk(makePage(0, 5)));
    const { input } = renderCombo();

    fireEvent.focus(input);
    // Offset-0 fetches are debounced 300ms even on focus/open (fetchServerResults's own rule).
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 50 });

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('limit=50');
    expect(url).toContain('offset=0');
  });

  it('sends explicit limit=50&offset=0 on a typed search too (a search is a fresh page 0, not a continuation)', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(makePage(0, 5)))
      .mockResolvedValueOnce(jsonOk([{ id: '1', name: 'Match' }]));

    const { input } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1), { timeout: 1000, interval: 50 });

    fireEvent.change(input, { target: { value: 'Ma' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 50 });

    const [url] = global.fetch.mock.calls[1];
    expect(url).toContain('limit=50');
    expect(url).toContain('offset=0');
    expect(url).toContain('q=Ma');
  });

  it('scrolling near the bottom fetches the next page at offset = items loaded so far, and APPENDS (not replaces)', async () => {
    const page0 = makePage(0, 50); // full page -> hasMore stays true
    const page1 = makePage(50, 10); // short page -> hasMore flips false
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))
      .mockResolvedValueOnce(jsonOk(page1));

    const { input } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(50), { timeout: 1000, interval: 50 });

    const panel = screen.getByTestId('inline-add-options-tax');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [url] = global.fetch.mock.calls[1];
    expect(url).toContain('offset=50');
    expect(url).toContain('limit=50');

    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(60));
    expect(screen.getByTestId('inline-add-option-tax-0')).toBeInTheDocument();
    expect(screen.getByTestId('inline-add-option-tax-59')).toBeInTheDocument();
  });

  it('does not fetch another page when the scroll position is far from the bottom', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(jsonOk(makePage(0, 50)));
    const { input } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(50), { timeout: 1000, interval: 50 });

    const panel = screen.getByTestId('inline-add-options-tax');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 0 }); // far from bottom
    global.fetch.mockClear();
    fireEvent.scroll(panel);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('a new typed query resets pagination to offset 0 and REPLACES the list, discarding the previously loaded pages', async () => {
    const page0 = makePage(0, 50);
    const searchResults = [{ id: '999', name: 'OnlyMatch' }];
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))
      .mockResolvedValueOnce(jsonOk(searchResults));

    const { input } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(50), { timeout: 1000, interval: 50 });

    fireEvent.change(input, { target: { value: 'On' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 50 });

    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(1));
    expect(screen.getByTestId('inline-add-option-tax-999')).toBeInTheDocument();
    expect(screen.queryByTestId('inline-add-option-tax-0')).not.toBeInTheDocument();
  });

  it('shows a "loading" footer indicator while another page might exist, and hides it once the last (short) page is loaded', async () => {
    const page0 = makePage(0, 50); // full page -> hasMore true
    const page1 = makePage(50, 10); // short page -> hasMore false
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))
      .mockResolvedValueOnce(jsonOk(page1));

    const { input } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(50), { timeout: 1000, interval: 50 });

    expect(screen.getByText('loading')).toBeInTheDocument();

    const panel = screen.getByTestId('inline-add-options-tax');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);

    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(60));
    expect(screen.queryByText('loading')).not.toBeInTheDocument();
  });

  it('does not trigger a second fetch for a second scroll event while the "load more" request is still in flight', async () => {
    let resolveSecondPage;
    const page0 = makePage(0, 50);
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecondPage = resolve; }));

    const { input } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(50), { timeout: 1000, interval: 50 });

    const panel = screen.getByTestId('inline-add-options-tax');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    fireEvent.scroll(panel);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    resolveSecondPage(await jsonOk(makePage(50, 10)));
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(60));
  });

  // QA (ETP-4975) — mirrors the identical gap in CreatableSearchSelect.jsx
  // (CreatableSearchSelect-pagination.vitest.jsx's equivalent test): fetchServerResults's guard
  // `if (offset > 0 && (!hasMoreRef.current || fetchInFlightRef.current)) return;` only blocks a
  // SECOND offset>0 (scroll) call while one is in flight — an offset=0 call (a brand-new typed
  // search) is never gated on fetchInFlightRef, so it fires even while a scroll-triggered "load
  // more" for the OLD query is still pending. The onChange handler does null out `serverResults`
  // synchronously before the new debounced fetch runs, but that only prevents a momentary flash —
  // it does NOT stop the stale offset>0 `.then()` from resolving later and appending onto
  // whatever `serverResults` holds BY THEN (the new search's own results, once its 300ms debounce
  // fires and resolves first).
  it('BUG: a new search typed while a scroll-triggered "load more" for the OLD query is still in flight lets the stale page corrupt the new search results once it resolves', async () => {
    const page0 = makePage(0, 50); // full page -> hasMore true
    let resolveScrollFetch;
    const searchResults = [{ id: '999', name: 'OnlyMatch' }];

    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))                                              // #1 initial load
      .mockReturnValueOnce(new Promise((resolve) => { resolveScrollFetch = resolve; }))   // #2 scroll (offset=50), stays pending
      .mockResolvedValueOnce(jsonOk(searchResults));                                      // #3 new search (offset=0)

    const { input } = renderCombo();
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(50), { timeout: 1000, interval: 50 });

    const panel = screen.getByTestId('inline-add-options-tax');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2)); // scroll fetch started, still pending

    // User types a brand-new search WHILE the scroll ("load more") fetch is still in flight.
    fireEvent.change(input, { target: { value: 'On' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 50 });
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(1));
    expect(screen.getByTestId('inline-add-option-tax-999')).toBeInTheDocument();

    // The stale scroll-page fetch (for the OLD, now-discarded query) finally resolves.
    resolveScrollFetch(await jsonOk(makePage(50, 10)));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // EXPECTED (correct behavior): a discarded query's page must never resurface once a newer
    // search has replaced it. FAILS today — the stale page gets appended onto the new search's
    // single result.
    expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(1);
    expect(screen.queryByTestId('inline-add-option-tax-50')).not.toBeInTheDocument();
  });
});
