// ETP-5005 — first-page loading feedback for InlineSearchCombo's server-side search, plus
// the fetch-timing split that followed it (opening fetches IMMEDIATELY, typing is debounced
// at TYPED_SEARCH_DEBOUNCE_MS = 1000ms — was a single shared 300ms debounce for both).
//
// Before the loading-flag fix, the dropdown panel only rendered when `filtered.length > 0`. A
// line cell is always constructed with an empty local `options` catalog (server-backed fields
// don't ship a static list), so while the FIRST server page was in flight — the debounce plus
// the request itself — NOTHING was rendered: no panel, no spinner, no feedback at all.
// `loadingFirstPage` closes that gap with a skeleton, keyed off the request's own search
// "generation" so a stale/superseded request can never hide the spinner for a newer search
// that is still in flight.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron" />,
  X: () => <span data-testid="x-icon" />,
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

function jsonOk(items) {
  return Promise.resolve({ ok: true, json: async () => ({ items }) });
}

function makePage(startId, count) {
  return Array.from({ length: count }, (_, i) => ({ id: String(startId + i), name: `Item-${startId + i}` }));
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
  const input = screen.queryByTestId('inline-add-field-tax');
  return { ...result, input, onChange };
}

describe('InlineSearchCombo — first-page loading feedback (ETP-5005)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Belt-and-braces: a test that switched to fake timers and failed before its own
    // `vi.useRealTimers()` must not leak them into the next test in this file.
    vi.useRealTimers();
  });

  it('shows a loading skeleton while the first server page is in flight, then swaps to the real options once it resolves', async () => {
    let resolveFetch;
    global.fetch = vi.fn().mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));
    const { input } = renderCombo();

    fireEvent.focus(input);

    // Opening the combo fetches IMMEDIATELY (not debounced) — the loading flag is raised
    // synchronously on focus and the request fires in the same tick, so the skeleton must
    // appear right away.
    await waitFor(() => {
      expect(screen.getByTestId('inline-add-options-tax-loading')).toBeInTheDocument();
    }, { timeout: 500, interval: 20 });

    // It is a role="status" skeleton with an accessible label, not a bare empty div.
    const loading = screen.getByTestId('inline-add-options-tax-loading');
    expect(loading).toHaveAttribute('role', 'status');
    expect(loading).toHaveTextContent('loading');

    // No options are rendered yet — the panel shows the skeleton only.
    expect(screen.queryByTestId(/^inline-add-option-tax-/)).not.toBeInTheDocument();

    resolveFetch(await jsonOk([{ id: '1', name: 'Item-1' }]));

    await waitFor(() => {
      expect(screen.queryByTestId('inline-add-options-tax-loading')).not.toBeInTheDocument();
      expect(screen.getByTestId('inline-add-option-tax-1')).toBeInTheDocument();
    });
  });

  it('a stale first-page request resolving late does not clear the loading flag while a newer search is still in flight', async () => {
    let resolveStale;
    let resolveFresh;
    global.fetch = vi.fn()
      .mockReturnValueOnce(new Promise((resolve) => { resolveStale = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveFresh = resolve; }));

    const { input } = renderCombo();
    fireEvent.focus(input);

    // Opening fetches immediately (generation 1) — no debounce to wait out here.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1), { timeout: 500, interval: 20 });
    await waitFor(() => expect(screen.getByTestId('inline-add-options-tax-loading')).toBeInTheDocument());

    // A new typed query starts generation 2 and its own debounced fetch — now at
    // TYPED_SEARCH_DEBOUNCE_MS (1000ms), so give it room well past that.
    fireEvent.change(input, { target: { value: 'On' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2), { timeout: 2500, interval: 50 });

    // The stale (generation-1) request resolves LATE, after generation 2 has already
    // superseded it.
    resolveStale(await jsonOk([{ id: '999', name: 'Stale' }]));
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Still loading — generation 2 owns the flag now; the stale generation-1 resolution
    // must not have lowered it, and its (discarded) results must not have rendered.
    expect(screen.getByTestId('inline-add-options-tax-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('inline-add-option-tax-999')).not.toBeInTheDocument();

    // Only the CURRENT generation's resolution may drop the flag and show its own results.
    resolveFresh(await jsonOk([{ id: '1', name: 'OnlyMatch' }]));
    await waitFor(() => {
      expect(screen.queryByTestId('inline-add-options-tax-loading')).not.toBeInTheDocument();
      expect(screen.getByTestId('inline-add-option-tax-1')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// ETP-5005 follow-up — opening fetches immediately, typing stays debounced at 1000ms.
// ---------------------------------------------------------------------------

describe('InlineSearchCombo — immediate open vs debounced typing (ETP-5005 follow-up)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('opening the combo (focus) fires the request immediately — synchronously, not after the typed-search debounce', () => {
    // Never resolves — this test only cares whether the request was SENT, not about its result.
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    const { input } = renderCombo();

    fireEvent.focus(input);

    // No waitFor, no timer advance: `apiFetch` calls the underlying `fetch` synchronously
    // (before its first `await`), so an immediate (non-debounced) call must be visible right
    // after the event fires.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('typing is debounced at ~1000ms: several rapid keystrokes collapse into exactly one request, and none fires before the debounce elapses', async () => {
    vi.useFakeTimers();
    try {
      global.fetch = vi.fn().mockResolvedValue(jsonOk([]));
      const { input } = renderCombo();

      // Open first (its own immediate fetch is unrelated to the debounce under test here).
      fireEvent.focus(input);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      global.fetch.mockClear();

      fireEvent.change(input, { target: { value: 'a' } });
      fireEvent.change(input, { target: { value: 'ar' } });
      fireEvent.change(input, { target: { value: 'arr' } });

      // Each keystroke resets the debounce timer (clearTimeout) — well before 1000ms have
      // passed since the LAST one, nothing should have fired yet.
      await vi.advanceTimersByTimeAsync(900);
      expect(global.fetch).not.toHaveBeenCalled();

      // Crossing the 1000ms mark from the last keystroke fires exactly one request — not
      // one per keystroke.
      await vi.advanceTimersByTimeAsync(150);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a chip click (opens + fetches immediately, then focuses the input via rAF) fires exactly ONE request, not two', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn().mockResolvedValue(jsonOk([{ id: 'iva10', name: 'IVA 10%' }]));
    renderCombo({ value: 'iva10', options: [{ id: 'iva10', name: 'IVA 10%' }] });

    const chip = screen.getByTestId('inline-add-field-tax-chip');
    await user.click(chip);

    const input = await screen.findByTestId('inline-add-field-tax');
    // Wait for the rAF-scheduled focus to actually land — this is exactly the event whose
    // onFocus handler must be swallowed by the `if (open) return;` guard.
    await waitFor(() => expect(document.activeElement).toBe(input));

    // Only handleChipClick's own immediate fetch may have fired. Before the `if (open)
    // return;` guard, the rAF-scheduled onFocus fired a SECOND identical request once
    // opening stopped being debounced (the old shared 300ms debounce used to mask this: the
    // second call's clearTimeout silently cancelled the first).
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('a scroll-triggered "load more" (offset > 0) still runs immediately, unaffected by the 1000ms typed-search debounce', async () => {
    const page0 = makePage(0, 50); // full page -> hasMore stays true
    const page1 = makePage(50, 1);
    global.fetch = vi.fn()
      .mockResolvedValueOnce(jsonOk(page0))
      .mockResolvedValueOnce(jsonOk(page1));

    const { input } = renderCombo();
    fireEvent.focus(input); // immediate — first page fetched right away
    await waitFor(() => expect(screen.getAllByTestId(/^inline-add-option-tax-/)).toHaveLength(50));

    const panel = screen.getByTestId('inline-add-options-tax');
    setScrollGeometry(panel, { scrollHeight: 1000, clientHeight: 500, scrollTop: 950 });
    fireEvent.scroll(panel);

    // A short timeout is the point: if "load more" were debounced like typing now is, this
    // would still be pending well short of 1000ms.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2), { timeout: 300, interval: 20 });
  });
});
