// @covers tools/app-shell/src/components/contract-ui/CreatableSearchSelect.jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// ETP-4975 — CreatableSearchSelect's serverSearch mode gained real pagination
// (limit/offset sent explicitly, scroll-triggered "load more", concatenate vs
// replace rules) — replacing the old fixed 20-item cap covered previously by
// CreatableSearchSelect-serverSearch.vitest.jsx. These tests cover that
// pagination behavior specifically; see that file for the base serverSearch
// debounce/label-resolution coverage this one builds on.
// ---------------------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url, params) => {
    const qs = new URLSearchParams(params).toString();
    return qs ? `${url}?${qs}` : url;
  },
}));

import { CreatableSearchSelect } from '../CreatableSearchSelect.jsx';

function makePage(startId, count) {
  return Array.from({ length: count }, (_, i) => ({ id: String(startId + i), label: `Item-${startId + i}` }));
}

function jsonOk(items) {
  return Promise.resolve({ ok: true, json: async () => ({ items }) });
}

const baseProps = {
  formData: {},
  resolvedLabel: 'Business Partner',
  selectorUrl: '/api/selectors/business-partner',
  selectorContext: {},
  token: 'test-token',
  serverSearch: true,
};

const field = { key: 'partner', required: false };

// Sets up a fake, near-the-bottom-of-scroll geometry on the portaled options
// panel — scrollHeight - scrollTop - clientHeight < 100 is the exact threshold
// the component checks (mirrors SelectorInput.jsx's identical rule).
function setScrollGeometry(panel, { scrollHeight, clientHeight, scrollTop }) {
  Object.defineProperty(panel, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(panel, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(panel, 'scrollTop', { value: scrollTop, configurable: true, writable: true });
}

describe('CreatableSearchSelect — serverSearch pagination (ETP-4975)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends explicit limit=50&offset=0 on the initial page load (focus, empty query)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(jsonOk(makePage(0, 5)));
    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);

    fireEvent.focus(screen.getByTestId('field-partner'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('limit=50');
    expect(url).toContain('offset=0');
  });

  it('sends explicit limit=50&offset=0 on a typed search too (a search is a fresh page 0, not a continuation)', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(makePage(0, 5)))
      .mockResolvedValueOnce(jsonOk([{ id: '1', label: 'Match' }]));

    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);
    const input = screen.getByTestId('field-partner');
    fireEvent.focus(input);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    fireEvent.change(input, { target: { value: 'Ma' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 50 });

    const [url] = global.fetch.mock.calls[1];
    expect(url).toContain('limit=50');
    expect(url).toContain('offset=0');
    expect(url).toContain('q=Ma');
  });

  it('scrolling near the bottom fetches the next page at offset = items loaded so far, and APPENDS (not replaces)', async () => {
    const page0 = makePage(0, 50); // a FULL page => hasMore stays true
    const page1 = makePage(50, 10); // a short page => hasMore flips false
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))
      .mockResolvedValueOnce(jsonOk(page1));

    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);
    fireEvent.focus(screen.getByTestId('field-partner'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(50));

    const panel = screen.getByTestId('options-partner');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 }); // near bottom
    fireEvent.scroll(panel);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const [url] = global.fetch.mock.calls[1];
    expect(url).toContain('offset=50');
    expect(url).toContain('limit=50');

    // Appended, not replaced: both the first page's items and the new page's items are present.
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(60));
    expect(screen.getByText('Item-0')).toBeInTheDocument();
    expect(screen.getByText('Item-59')).toBeInTheDocument();
  });

  it('does not fetch another page when the scroll position is far from the bottom', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(jsonOk(makePage(0, 50)));
    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);
    fireEvent.focus(screen.getByTestId('field-partner'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(50));

    const panel = screen.getByTestId('options-partner');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 0 }); // far from bottom
    global.fetch.mockClear();
    fireEvent.scroll(panel);

    // Give any wrongly-fired async fetch a chance to happen before asserting its absence.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('a new typed query resets pagination to offset 0 and REPLACES the list, discarding the previously loaded pages', async () => {
    const page0 = makePage(0, 50);
    const searchResults = [{ id: '999', label: 'OnlyMatch' }];
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))
      .mockResolvedValueOnce(jsonOk(searchResults));

    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);
    const input = screen.getByTestId('field-partner');
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(50));

    fireEvent.change(input, { target: { value: 'On' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2), { timeout: 1000, interval: 50 });

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    expect(screen.getByText('OnlyMatch')).toBeInTheDocument();
    expect(screen.queryByText('Item-0')).not.toBeInTheDocument();
  });

  it('shows a "loading" footer indicator while another page might exist, and hides it once the last (short) page is loaded', async () => {
    const page0 = makePage(0, 50); // full page -> hasMore true
    const page1 = makePage(50, 10); // short page -> hasMore false
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))
      .mockResolvedValueOnce(jsonOk(page1));

    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);
    fireEvent.focus(screen.getByTestId('field-partner'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(50));

    // hasMore is true after a full first page — the "loading" footer (the ETP-4975 pagination
    // hint) is visible even though the initial fetch itself has already resolved.
    expect(screen.getByText('loading')).toBeInTheDocument();

    const panel = screen.getByTestId('options-partner');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(60));
    // The short second page flips hasMore to false — footer disappears.
    expect(screen.queryByText('loading')).not.toBeInTheDocument();
  });

  it('does not trigger a second fetch for a second scroll event while the first page fetch is still in flight', async () => {
    let resolveSecondPage;
    const page0 = makePage(0, 50);
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))
      .mockReturnValueOnce(new Promise((resolve) => { resolveSecondPage = resolve; }));

    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);
    fireEvent.focus(screen.getByTestId('field-partner'));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(50));

    const panel = screen.getByTestId('options-partner');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));

    // A second scroll tick while the "load more" request is still pending must not fire yet
    // another fetch (fetchInFlightRef guard).
    fireEvent.scroll(panel);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    resolveSecondPage(await jsonOk(makePage(50, 10)));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(60));
  });

  // QA (ETP-4975) — edge case not covered by the developer's suite: fetchInFlightRef only
  // guards a SECOND offset>0 (scroll) call while one is already in flight (see the test above).
  // It does NOT guard the offset=0 branch: triggerServerSearch's own top-of-function check is
  // `if (offset > 0 && (!hasMoreRef.current || fetchInFlightRef.current)) return;` — an offset=0
  // call (a brand-new typed search) sails through unconditionally even while a scroll-triggered
  // "load more" for the OLD query is still in flight. Both fetches then race on the SAME
  // `serverOptions` state: the offset=0 branch REPLACES it, the offset>0 branch APPENDS onto
  // whatever it finds — so if the stale scroll fetch resolves AFTER the new search has already
  // replaced the list, its `.then()` blindly appends the OLD query's page onto the NEW query's
  // results (and stomps offsetRef/hasMoreRef with the old query's pagination state too).
  it('BUG: a new search typed while a scroll-triggered "load more" for the OLD query is still in flight lets the stale page corrupt the new search results once it resolves', async () => {
    const page0 = makePage(0, 50); // full page -> hasMore true, scroll can trigger page 2
    let resolveScrollFetch;
    const searchResults = [{ id: '999', label: 'OnlyMatch' }];

    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))                                              // #1 initial load
      .mockReturnValueOnce(new Promise((resolve) => { resolveScrollFetch = resolve; }))   // #2 scroll (offset=50), stays pending
      .mockResolvedValueOnce(jsonOk(searchResults));                                      // #3 new search (offset=0)

    render(<CreatableSearchSelect {...baseProps} field={field} value="" displayValue="" onChange={vi.fn()} />);
    const input = screen.getByTestId('field-partner');
    fireEvent.focus(input);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(50));

    const panel = screen.getByTestId('options-partner');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2)); // scroll fetch started, still pending

    // User types a brand-new search WHILE the scroll ("load more") fetch is still in flight.
    fireEvent.change(input, { target: { value: 'On' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3), { timeout: 1000, interval: 50 });
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    expect(screen.getByText('OnlyMatch')).toBeInTheDocument();

    // Now the stale scroll-page fetch (for the OLD, now-discarded query) finally resolves.
    resolveScrollFetch(await jsonOk(makePage(50, 10)));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // EXPECTED (correct behavior): a discarded query's page must never resurface once a newer
    // search has replaced it. FAILS today — the stale page gets appended onto the new search's
    // single result, and a stale item becomes visible again.
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.queryByText('Item-50')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ETP-5903 — reopening with a committed value that is not on page 0 walks forward (up to 6 pages
// = 300 rows) to show it IN PLACE; beyond that it is pinned on top through one label lookup.
// `routedFetch` answers by URL (`offset`, or `q=` for the lookup), independent of request order.
// ---------------------------------------------------------------------------
describe('CreatableSearchSelect — locating the committed value on reopen (ETP-5903)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function routedFetch({ totalRows, lookup = [] }) {
    return vi.fn((url) => {
      const params = new URL(String(url), 'http://test').searchParams;
      if (params.has('q')) return jsonOk(lookup);
      if (params.has('id')) return jsonOk([]);
      const offset = Number(params.get('offset') || 0);
      return jsonOk(makePage(offset, Math.max(0, Math.min(50, totalRows - offset))));
    });
  }
  const listOffsets = () => global.fetch.mock.calls
    .map(([url]) => new URL(String(url), 'http://test').searchParams)
    .filter((p) => !p.has('q') && !p.has('id'))
    .map((p) => Number(p.get('offset')));
  const lookupCalls = () => global.fetch.mock.calls.filter(([url]) => String(url).includes('q='));

  async function reopen(value, displayValue) {
    render(<CreatableSearchSelect {...baseProps} field={field} value={value} displayValue={displayValue} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('field-partner-chip'));
    return screen.findByTestId('field-partner');
  }

  it('walks to the page that holds the value and shows it in place, with no lookup', async () => {
    global.fetch = routedFetch({ totalRows: 150 });

    await reopen('120', 'Item-120');

    await waitFor(() => expect(screen.getByTestId('option-partner-120')).toHaveAttribute('aria-selected', 'true'));
    expect(listOffsets()).toEqual([0, 50, 100]);
    expect(lookupCalls()).toHaveLength(0);
    expect(screen.getByTestId('option-partner-119')).toBeInTheDocument();
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('data-testid', 'option-partner-0');
  });

  it('stops at the page cap, then pins the value on top through one label lookup', async () => {
    global.fetch = routedFetch({ totalRows: 1000, lookup: [{ id: 'bp-9', label: 'Zeta' }, { id: 'bp-99', label: 'Zeta 2' }] });

    await reopen('bp-9', 'Zeta');

    await waitFor(() => expect(screen.getByTestId('option-partner-bp-9')).toHaveAttribute('aria-selected', 'true'));
    expect(listOffsets()).toEqual([0, 50, 100, 150, 200, 250]);
    expect(lookupCalls()).toHaveLength(1);
    // Only the id-equal row is pinned, on top of the 300 walked rows.
    expect(screen.getAllByRole('option')).toHaveLength(301);
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('data-testid', 'option-partner-bp-9');
    expect(screen.queryByTestId('option-partner-bp-99')).not.toBeInTheDocument();
  });

  // ETP-5948 — the backend matches each identifier column on its own, so a "<code> - <name>"
  // label finds nothing as a whole; the lookup retries with the code segment.
  it('retries the label lookup with the code when the full "code - name" label finds nothing', async () => {
    const paged = routedFetch({ totalRows: 1000 });
    global.fetch = vi.fn((url) => {
      const q = new URL(String(url), 'http://test').searchParams.get('q');
      if (q === '57200000') return jsonOk([{ id: 'acc-572', label: '57200000 - Bancos' }]);
      if (q != null) return jsonOk([]);
      return paged(url);
    });

    await reopen('acc-572', '57200000 - Bancos');

    await waitFor(() => expect(screen.getByTestId('option-partner-acc-572')).toHaveAttribute('aria-selected', 'true'));
    expect(lookupCalls().map(([url]) => new URL(String(url), 'http://test').searchParams.get('q')))
      .toEqual(['57200000 - Bancos', '57200000']);
  });

  it('opens from the top without error when the value is nowhere (list ends, lookup finds nothing)', async () => {
    global.fetch = routedFetch({ totalRows: 30, lookup: [] });

    await reopen('gone', 'Gone partner');

    await waitFor(() => expect(lookupCalls()).toHaveLength(1));
    expect(listOffsets()).toEqual([0]);
    expect(screen.getAllByRole('option')).toHaveLength(30);
    expect(screen.getByTestId('options-partner').querySelector('[aria-selected="true"]')).toBeNull();
  });

  it('stops walking once the user types', async () => {
    global.fetch = routedFetch({ totalRows: 1000 });

    const input = await reopen('bp-9', 'Zeta');
    fireEvent.change(input, { target: { value: 'Item' } });
    await waitFor(() => expect(lookupCalls().some(([url]) => String(url).includes('q=Item'))).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const typed = global.fetch.mock.calls.findIndex(([url]) => String(url).includes('q=Item'));
    expect(global.fetch.mock.calls.slice(typed + 1)).toHaveLength(0);
  });

  it('scrolls the panel back to the top when the user types (AC4)', async () => {
    global.fetch = routedFetch({ totalRows: 5 });

    const input = await reopen('2', 'Item-2');
    const panel = await screen.findByTestId('options-partner');
    panel.scrollTop = 120;

    fireEvent.change(input, { target: { value: 'Item' } });
    expect(panel.scrollTop).toBe(0);
    await waitFor(() => expect(lookupCalls().some(([url]) => String(url).includes('q=Item'))).toBe(true));
  });
});
