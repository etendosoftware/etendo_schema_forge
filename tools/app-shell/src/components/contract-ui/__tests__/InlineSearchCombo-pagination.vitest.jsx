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
  Object.defineProperty(panel, 'scrollTop', { value: scrollTop, configurable: true, writable: true });
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

  // ETP-5903 — a full page 0 without the committed id first walks forward (up to 6 pages = 300
  // rows) looking for it in place; the ETP-5846 label lookup only runs once that walk is over.
  // `routedFetch` answers by URL (`offset`, or `q=` for the lookup) so the tests do not depend
  // on the order the requests are issued in.
  function routedFetch({ totalRows, lookup = [], hold = {} }) {
    return vi.fn((url) => {
      const params = new URL(String(url), 'http://test').searchParams;
      if (params.has('q')) return jsonOk(lookup);
      const offset = Number(params.get('offset') || 0);
      if (hold[offset]) return hold[offset];
      return jsonOk(makePage(offset, Math.max(0, Math.min(50, totalRows - offset))));
    });
  }
  const listOffsets = () => global.fetch.mock.calls
    .map(([url]) => new URL(String(url), 'http://test').searchParams)
    .filter((p) => !p.has('q'))
    .map((p) => Number(p.get('offset')));
  const lookupCalls = () => global.fetch.mock.calls.filter(([url]) => String(url).includes('q='));

  it('walks forward to the page that holds the committed value and shows it in place, with no lookup', async () => {
    global.fetch = routedFetch({ totalRows: 150 });

    await committedCombo({ value: '120', displayLabel: 'Item-120' });
    await openViaChip();

    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-120')).toHaveAttribute('aria-selected', 'true'));
    expect(listOffsets()).toEqual([0, 50, 100]);
    expect(lookupCalls()).toHaveLength(0);
    // In place: its neighbours are rendered and it is not pinned on top.
    expect(screen.getByTestId('inline-add-option-tax-119')).toBeInTheDocument();
    expect(screen.getByTestId('inline-add-option-tax-121')).toBeInTheDocument();
    expect(screen.getAllByTestId(/^inline-add-option-tax-/)[0]).toHaveAttribute('data-testid', 'inline-add-option-tax-0');
  });

  it('stops walking at the page cap, then pins the value through the label lookup — once per open', async () => {
    global.fetch = routedFetch({ totalRows: 1000, lookup: [{ id: 'tax-77', name: 'IVA 4%' }] });

    await committedCombo();
    await openViaChip();

    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-tax-77')).toHaveAttribute('aria-selected', 'true'));
    expect(listOffsets()).toEqual([0, 50, 100, 150, 200, 250]);
    expect(lookupCalls()).toHaveLength(1);
    // 300 walked rows plus the pinned one, on top.
    expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(301);
    expect(screen.getAllByTestId(/^inline-add-option-tax-/)[0]).toHaveAttribute('data-testid', 'inline-add-option-tax-tax-77');

    // User scrolling keeps paging from where the walk stopped; the lookup is not repeated.
    const panel = screen.getByTestId('inline-add-options-tax');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(351));
    setScrollGeometry(panel, { scrollHeight: 2000, clientHeight: 500, scrollTop: 1950 });
    fireEvent.scroll(panel);
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(401));
    expect(listOffsets().slice(-2)).toEqual([300, 350]);
    expect(lookupCalls()).toHaveLength(1);
    expect(screen.getAllByTestId('inline-add-option-tax-tax-77')).toHaveLength(1);
  });

  it('stops walking when a page fails, instead of re-requesting it, and then pins the value', async () => {
    const failing = routedFetch({ totalRows: 1000, lookup: [{ id: 'tax-77', name: 'IVA 4%' }] });
    global.fetch = vi.fn((url) => {
      const params = new URL(String(url), 'http://test').searchParams;
      if (!params.has('q') && Number(params.get('offset')) === 50) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      return failing(url);
    });

    await committedCombo();
    await openViaChip();

    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-tax-77')).toHaveAttribute('aria-selected', 'true'));
    expect(listOffsets()).toEqual([0, 50]);
    expect(lookupCalls()).toHaveLength(1);
  });

  // ETP-5948 — the backend matches each identifier column on its own, so a "<code> - <name>"
  // label finds nothing as a whole; the lookup retries with the code segment.
  it('retries the label lookup with the code when the full "code - name" label finds nothing', async () => {
    const paged = routedFetch({ totalRows: 1000 });
    global.fetch = vi.fn((url) => {
      const q = new URL(String(url), 'http://test').searchParams.get('q');
      if (q === '57200000') return jsonOk([{ id: 'acc-572', name: '57200000 - Bancos' }]);
      if (q != null) return jsonOk([]);
      return paged(url);
    });

    await committedCombo({ value: 'acc-572', displayLabel: '57200000 - Bancos' });
    await openViaChip();

    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-acc-572')).toHaveAttribute('aria-selected', 'true'));
    expect(lookupCalls().map(([url]) => new URL(String(url), 'http://test').searchParams.get('q')))
      .toEqual(['57200000 - Bancos', '57200000']);
  });

  it('does not re-resolve the current selection when the lookup found nothing', async () => {
    // The lookup resolved NOTHING (the selector context forbids the id). The attempt still counts:
    // re-firing it on every page append would be pure waste.
    global.fetch = routedFetch({ totalRows: 1000, lookup: makePage(900, 2) });

    await committedCombo();
    await openViaChip();

    await waitFor(() => expect(lookupCalls()).toHaveLength(1));
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(300));
    const panel = screen.getByTestId('inline-add-options-tax');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(350));

    expect(lookupCalls()).toHaveLength(1);
    expect(screen.queryByTestId('inline-add-options-tax').querySelector('[aria-selected="true"]')).toBeNull();
  });

  it('stops walking as soon as the user presses a key, and only then pins the value', async () => {
    let releasePage1;
    const page1 = new Promise((resolve) => { releasePage1 = resolve; });
    global.fetch = routedFetch({ totalRows: 1000, lookup: [{ id: 'tax-77', name: 'IVA 4%' }], hold: { 50: page1 } });

    await committedCombo();
    const input = await openViaChip();
    await waitFor(() => expect(listOffsets()).toEqual([0, 50]));

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    releasePage1(await jsonOk(makePage(50, 50)));

    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-tax-77')).toBeInTheDocument());
    expect(listOffsets()).toEqual([0, 50]);
    expect(lookupCalls()).toHaveLength(1);
  });

  it('does not walk once the user typed a search', async () => {
    global.fetch = routedFetch({ totalRows: 1000 });

    await committedCombo();
    const input = await openViaChip();
    fireEvent.change(input, { target: { value: 'Item' } });

    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => String(url).includes('q=Item'))).toBe(true), { timeout: 2000 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const typedCall = global.fetch.mock.calls.findIndex(([url]) => String(url).includes('q=Item'));
    // Nothing paged after the typed search went out.
    expect(global.fetch.mock.calls.slice(typedCall + 1)).toHaveLength(0);
  });

  it('scrolls the panel back to the top when the user types (AC4)', async () => {
    global.fetch = routedFetch({ totalRows: 5 });

    await committedCombo();
    const input = await openViaChip();
    const panel = await screen.findByTestId('inline-add-options-tax');
    panel.scrollTop = 120;

    fireEvent.change(input, { target: { value: 'Item' } });
    expect(panel.scrollTop).toBe(0);
    // Let the debounced search go out, so its timer cannot fire into the next test's fetch mock.
    await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => String(url).includes('q=Item'))).toBe(true), { timeout: 2000 });
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
    // The resolution is in flight (ETP-5903: it is issued once the walk for the value has ended).
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    // User types before the resolution lands -> new search generation.
    fireEvent.change(input, { target: { value: 'Recargo' } });
    // The typed search waits out the 1s debounce (ETP-5005).
    await waitFor(() => expect(screen.getByTestId('inline-add-option-tax-tax-recargo')).toBeInTheDocument(), { timeout: 2000 });

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
