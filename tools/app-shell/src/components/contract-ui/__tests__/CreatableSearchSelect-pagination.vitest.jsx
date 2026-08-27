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
  Object.defineProperty(panel, 'scrollTop', { value: scrollTop, configurable: true });
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
