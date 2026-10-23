// @covers tools/app-shell/src/components/contract-ui/InlineSearchCombo.jsx
// InlineSearchCombo server-search pagination (ETP-4975) — mirrors
// CreatableSearchSelect-pagination.vitest.jsx's coverage for the header selector,
// applied to the inline grid combo (used for line-level FK fields such as an
// invoice line's Impuesto). No existing InlineSearchCombo test broke when this
// landed (confirmed by the developer) — this file adds the missing coverage.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron" />,
  // A committed value renders the chip, which draws an X (clear); reopening marks the current
  // option with a Check. Both must exist on the mock or the render throws (ETP-5846).
  X: () => <span data-testid="x-icon" />,
  Check: () => <span data-testid="check-icon" />,
}));
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
  // A COMMITTED value renders the chip, not the input (ETP-4600), so query, don't get: the
  // ETP-5846 cases below render with a value and enter edit mode through the chip.
  const input = screen.queryByTestId('inline-add-field-tax');
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

// ---------------------------------------------------------------------------
// ETP-5846 — resolving the CURRENT selection when it is not on a loaded page.
//
// A line cell's committed value can be any row of a catalog that pages 50 at a
// time. Reopening the dropdown used to load page 0 only, so a value beyond row
// 50 was simply not in the list and nothing pointed at it. The combo already
// holds the value's LABEL (from the caller's `$_identifier`), so it resolves the
// row with the same selector endpoint using that label as `q` — same
// `selectorContext`, so an id the caller's context forbids simply never comes
// back.
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — current-selection resolution off the loaded page (ETP-5846)', () => {
  // The suites below assign `global.fetch` DIRECTLY (the file's existing pattern).
  // `vi.restoreAllMocks()` only restores spies created with `vi.spyOn`, so it does NOT undo a
  // direct assignment — without an explicit restore the mocked fetch leaks into the next suite.
  const originalFetch = global.fetch;
  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  function committedCombo(overrides = {}) {
    // `value` is committed -> the combo renders a chip; enter edit mode through it.
    return renderCombo({ value: 'tax-77', displayLabel: 'IVA 4%', options: [], clearOnType: false, ...overrides });
  }

  async function openViaChip() {
    fireEvent.click(screen.getByTestId('inline-add-field-tax-chip'));
    return screen.findByTestId('inline-add-field-tax');
  }

  it('asks the same selector for the committed label when the id is absent from page 0, and marks the row it gets back', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(makePage(0, 5)))                                     // page 0: no tax-77
      .mockResolvedValueOnce(jsonOk([{ id: 'tax-77', name: 'IVA 4%' }]));                 // resolution by label

    await committedCombo();
    await openViaChip();

    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-tax-77')).toBeInTheDocument());

    const resolutionUrl = global.fetch.mock.calls[1][0];
    expect(resolutionUrl).toContain('q=IVA+4%25');
    expect(resolutionUrl).toContain('limit=20');
    // It is a LOOKUP, not a page: it must not claim an offset that "load more" would reuse.
    expect(resolutionUrl).toContain('offset=0');
    // The resolved row is identified as the current selection.
    expect(screen.getByTestId('inline-add-option-tax-tax-77')).toHaveAttribute('aria-selected', 'true');
    // And it did not appear twice.
    expect(screen.getAllByTestId('inline-add-option-tax-tax-77')).toHaveLength(1);
  });

  it('pins ONLY the id-equal row when the label search also returns a look-alike (substring match)', async () => {
    // `q=IVA 4%` is a LIKE '%iva 4%%' match, so "IVA 4% Recargo" can come back first.
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(makePage(0, 5)))
      .mockResolvedValueOnce(jsonOk([
        { id: 'tax-recargo', name: 'IVA 4% Recargo' },
        { id: 'tax-77', name: 'IVA 4%' },
      ]));

    await committedCombo();
    await openViaChip();

    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-tax-77')).toBeInTheDocument());
    // The look-alike is NOT the committed value, so it must never carry the current-selection marker.
    expect(screen.queryByTestId('inline-add-option-tax-tax-recargo')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^inline-add-option-tax-tax-/)).toHaveLength(1);
    expect(screen.getByTestId('inline-add-option-tax-tax-77')).toHaveAttribute('aria-selected', 'true');
  });

  it('issues NO resolution request when the committed id is already on the loaded page (no duplicate row)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(jsonOk([
      { id: 'tax-1', name: 'IVA 21%' },
      { id: 'tax-77', name: 'IVA 4%' },
      { id: 'tax-2', name: 'IVA 10%' },
    ]));

    await committedCombo();
    await openViaChip();

    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-tax-77')).toHaveAttribute('aria-selected', 'true'));
    // Exactly one request: the id was already there.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('inline-add-option-tax-tax-77')).toHaveLength(1);
    expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(3);
  });

  it('does not disturb the list pagination, and resolves the current selection once per open even as pages land', async () => {
    const page0 = makePage(0, 50); // full page -> hasMore stays true
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))
      .mockResolvedValueOnce(jsonOk([{ id: 'tax-77', name: 'IVA 4%' }]))
      // Page 1 lands for real and still does not contain the committed id.
      .mockResolvedValueOnce(jsonOk(makePage(50, 50)))
      .mockResolvedValue(jsonOk([]));

    await committedCombo();
    await openViaChip();

    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-tax-77')).toBeInTheDocument());

    // The panel now holds page 0 (50) plus the resolved row.
    expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(51);

    const panel = screen.getByTestId('inline-add-options-tax');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);

    // "Load more" still asks for offset=50 — the resolved row did not shift the offset.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    expect(global.fetch.mock.calls[2][0]).toContain('offset=50');

    // Page 1 is appended; the resolved row stays pinned and marked, and the label lookup is NOT
    // repeated just because `serverResults` changed.
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(101));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId('inline-add-option-tax-tax-77')).toHaveAttribute('aria-selected', 'true');
    const lookups = global.fetch.mock.calls.filter(([url]) => url.includes('q='));
    expect(lookups).toHaveLength(1);
  });

  // The lookup is a LOOKUP, not a page: it must happen ONCE per open, no matter how many pages
  // the user scrolls through afterwards. Every "load more" changes `serverResults`, so without an
  // explicit guard the `q=<label>` request re-fires on each page append (and again when the
  // lookup resolved nothing) — extra traffic on every scroll, contradicting the documented
  // "one lookup per open" contract.
  it('resolves the current selection ONCE per open, no matter how many pages are appended', async () => {
    const page0 = makePage(0, 50); // full page -> hasMore stays true
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))                                       // page 0 on open
      .mockResolvedValueOnce(jsonOk([{ id: 'tax-77', name: 'IVA 4%' }]))          // the resolution
      .mockResolvedValueOnce(jsonOk(makePage(50, 50)))                             // "load more" page 1
      .mockResolvedValueOnce(jsonOk(makePage(100, 50)));                          // "load more" page 2

    await committedCombo();
    await openViaChip();

    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-tax-77')).toBeInTheDocument());

    const panel = screen.getByTestId('inline-add-options-tax');

    // Scroll twice, letting each page actually LAND.
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    setScrollGeometry(panel, { scrollHeight: 2000, clientHeight: 500, scrollTop: 1950 });
    fireEvent.scroll(panel);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));

    // Exactly ONE resolution request, despite two page appends.
    const resolutionCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('q=IVA+4%25'));
    expect(resolutionCalls).toHaveLength(1);

    // The other three calls are the list's own pages (offset 0, 50 and 100).
    const listCalls = global.fetch.mock.calls.filter(([url]) => !String(url).includes('q='));
    expect(listCalls).toHaveLength(3);
    expect(listCalls[1][0]).toContain('offset=50');
    expect(listCalls[2][0]).toContain('offset=100');

    // The resolved row is still marked, and still appears exactly once.
    expect(screen.getByTestId('inline-add-option-tax-tax-77')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('inline-add-option-tax-tax-77')).toHaveLength(1);
  });

  it('does not re-resolve the current selection when the lookup found nothing', async () => {
    // The lookup resolved NOTHING (the selector context forbids the id). The attempt still counts:
    // re-firing it on every page append would be pure waste.
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(makePage(0, 50)))     // page 0 on open (no tax-77)
      .mockResolvedValueOnce(jsonOk(makePage(900, 2)))    // the resolution: nothing matches
      .mockResolvedValueOnce(jsonOk(makePage(50, 50)));    // "load more" page 1

    await committedCombo();
    await openViaChip();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    const panel = screen.getByTestId('inline-add-options-tax');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));

    const resolutionCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('q=IVA+4%25'));
    expect(resolutionCalls).toHaveLength(1);
  });

  it('resolves the current selection again after the combo was closed and reopened', async () => {
    // The "one lookup per open" guard must be scoped to ONE open: closing ends it, and the next
    // open of the same cell resolves again (the row was dropped when the panel unmounted).
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(makePage(0, 5)))                              // page 0 on open
      .mockResolvedValueOnce(jsonOk([{ id: 'tax-77', name: 'IVA 4%' }]))          // the resolution
      .mockResolvedValueOnce(jsonOk(makePage(0, 5)))                              // page 0 on reopen
      .mockResolvedValueOnce(jsonOk([{ id: 'tax-77', name: 'IVA 4%' }]));         // the resolution again

    await committedCombo();
    await openViaChip();
    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-tax-77')).toBeInTheDocument());

    // Close the panel (the combo closes on blur) and reopen it through the chip.
    fireEvent.blur(screen.getByTestId('inline-add-field-tax'));
    await waitFor(() => expect(screen.queryByTestId('inline-add-options-tax')).not.toBeInTheDocument(), { timeout: 2000 });

    fireEvent.click(screen.getByTestId('inline-add-field-tax-chip'));
    await screen.findByTestId('inline-add-field-tax');

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    const resolutionCalls = global.fetch.mock.calls.filter(([url]) => String(url).includes('q=IVA+4%25'));
    expect(resolutionCalls).toHaveLength(2);
    expect(screen.getByTestId('inline-add-option-tax-tax-77')).toHaveAttribute('aria-selected', 'true');
  });

  it('abandons an in-flight resolution when the user starts typing a new search', async () => {
    let resolveCurrent;
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(makePage(0, 5)))                                     // page 0 on open
      .mockReturnValueOnce(new Promise((resolve) => { resolveCurrent = resolve; }))     // resolution, pending
      .mockResolvedValueOnce(jsonOk([{ id: 'tax-recargo', name: 'IVA 4% Recargo' }]));     // the typed search

    await committedCombo();
    const input = await openViaChip();

    // User types before the resolution lands -> new search generation.
    fireEvent.change(input, { target: { value: 'Recargo' } });
    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-tax-recargo')).toBeInTheDocument());

    // The abandoned resolution finally answers. It must not resurface the previous selection.
    resolveCurrent(await jsonOk([{ id: 'tax-77', name: 'IVA 4%' }]));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Only the typed search's own result is on offer; the previous selection is nowhere.
    expect(screen.queryByTestId('inline-add-option-tax-tax-77')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(1);
    expect(screen.queryByTestId('inline-add-options-tax').querySelector('[aria-selected="true"]')).toBeNull();
  });

  it('pins nothing when the label search returns no id-equal row (an id the selector context forbids stays unpinned)', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(makePage(0, 3)))
      .mockResolvedValueOnce(jsonOk(makePage(900, 2))); // nothing matches the committed id

    await committedCombo();
    await openViaChip();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    // Only page 0's own rows are on offer.
    expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(3);
    expect(screen.queryByTestId(/inline-add-option-tax-.*-selected-indicator/)).not.toBeInTheDocument();
  });
});
