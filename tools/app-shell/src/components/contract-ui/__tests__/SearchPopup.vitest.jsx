// @covers tools/app-shell/src/components/contract-ui/SearchPopup.jsx
// @covers tools/app-shell/src/components/contract-ui/useLocateCommittedValue.js
// @covers tools/app-shell/src/components/contract-ui/LocatingNotice.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
}));

import { mockGeometry, ROW_H, PANEL_H } from './selectorTestGeometry.js';
import { SearchPopup, staticPageLoader, SEARCH_POPUP_PAGE_SIZE } from '../SearchPopup.jsx';

// Captures the infinite-scroll observer so a test can "scroll" the sentinel into view.
let observerCallback = null;
beforeEach(() => {
  observerCallback = null;
  globalThis.IntersectionObserver = class {
    constructor(cb) { observerCallback = cb; }
    observe() {}
    disconnect() {}
  };
});
afterEach(() => { vi.useRealTimers(); });

const ITEMS = [
  { id: 'a', name: '572 - Bancos c/c' },
  { id: 'b', name: '626 - Servicios bancarios' },
];

function renderPopup(props = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const loadPage = props.loadPage ?? vi.fn(() => Promise.resolve({ items: ITEMS, hasMore: false }));
  render(<SearchPopup open onClose={onClose} onSelect={onSelect} loadPage={loadPage} title="Cuenta" {...props} />);
  return { onSelect, onClose, loadPage };
}

describe('SearchPopup', () => {
  it('renders nothing while closed', () => {
    const loadPage = vi.fn();
    render(<SearchPopup open={false} onClose={vi.fn()} onSelect={vi.fn()} loadPage={loadPage} />);
    expect(screen.queryByTestId('search-popup')).toBeNull();
    expect(loadPage).not.toHaveBeenCalled();
  });

  it('loads the first page on open and shows the title and options', async () => {
    const { loadPage } = renderPopup();
    expect(await screen.findByText('572 - Bancos c/c')).toBeInTheDocument();
    expect(screen.getByText('Cuenta')).toBeInTheDocument();
    expect(loadPage).toHaveBeenCalledWith('', 0, expect.any(AbortSignal), { limit: SEARCH_POPUP_PAGE_SIZE });
  });

  it('calls onSelect with the clicked option', async () => {
    const { onSelect } = renderPopup();
    fireEvent.click(await screen.findByTestId('search-popup-option-b'));
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);
  });

  it('debounces the search and queries with the trimmed text', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { loadPage } = renderPopup();
    await screen.findByText('572 - Bancos c/c');
    loadPage.mockClear();
    fireEvent.change(screen.getByTestId('search-popup-input'), { target: { value: ' ban' } });
    fireEvent.change(screen.getByTestId('search-popup-input'), { target: { value: ' banc ' } });
    expect(loadPage).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(loadPage).toHaveBeenCalledTimes(1);
    expect(loadPage).toHaveBeenCalledWith('banc', 0, expect.any(AbortSignal), { limit: SEARCH_POPUP_PAGE_SIZE });
  });

  it('shows an error with a retry — not "no results" — when the page fails, and retries', async () => {
    const loadPage = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 504'))
      .mockResolvedValueOnce({ items: ITEMS, hasMore: false });
    renderPopup({ loadPage });
    const error = await screen.findByTestId('search-popup-error');
    expect(error).toHaveTextContent('searchPopupError');
    expect(screen.queryByTestId('search-popup-empty')).toBeNull();
    fireEvent.click(screen.getByText('retry'));
    expect(await screen.findByText('572 - Bancos c/c')).toBeInTheDocument();
  });

  it('shows noResults when the page is empty', async () => {
    renderPopup({ loadPage: vi.fn(() => Promise.resolve({ items: [], hasMore: false })) });
    expect(await screen.findByTestId('search-popup-empty')).toHaveTextContent('noResults');
  });

  it('appends the next page when the sentinel scrolls into view', async () => {
    const loadPage = vi.fn()
      .mockResolvedValueOnce({ items: [ITEMS[0]], hasMore: true })
      .mockResolvedValueOnce({ items: [ITEMS[1]], hasMore: false });
    renderPopup({ loadPage });
    await screen.findByText('572 - Bancos c/c');
    await act(async () => { observerCallback([{ isIntersecting: true }]); });
    expect(await screen.findByText('626 - Servicios bancarios')).toBeInTheDocument();
    expect(loadPage).toHaveBeenLastCalledWith('', 1, expect.any(AbortSignal), { limit: SEARCH_POPUP_PAGE_SIZE });
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('keeps the shown options when the next page fails', async () => {
    const loadPage = vi.fn()
      .mockResolvedValueOnce({ items: [ITEMS[0]], hasMore: true })
      .mockRejectedValueOnce(new Error('HTTP 500'));
    renderPopup({ loadPage });
    await screen.findByText('572 - Bancos c/c');
    await act(async () => { observerCallback([{ isIntersecting: true }]); });
    expect(await screen.findByTestId('search-popup-load-more-error')).toBeInTheDocument();
    expect(screen.getByText('572 - Bancos c/c')).toBeInTheDocument();
  });

  it('ignores a stale page that resolves after a newer search', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolveFirst;
    const loadPage = vi.fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({ items: [ITEMS[1]], hasMore: false });
    renderPopup({ loadPage });
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(loadPage).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByTestId('search-popup-input'), { target: { value: '626' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(await screen.findByText('626 - Servicios bancarios')).toBeInTheDocument();
    await act(async () => { resolveFirst({ items: ITEMS, hasMore: false }); });
    expect(screen.queryByText('572 - Bancos c/c')).toBeNull();
  });

  it('moves the highlight with the arrow keys and selects it with Enter', async () => {
    const { onSelect } = renderPopup();
    await screen.findByText('572 - Bancos c/c');
    const input = screen.getByTestId('search-popup-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    // Rewritten for ETP-5948: the highlight is data-highlighted + aria-activedescendant;
    // aria-selected belongs to the committed value only (ETP-5846).
    const option = screen.getByTestId('search-popup-option-a');
    expect(option).toHaveAttribute('data-highlighted', 'true');
    expect(option).toHaveAttribute('aria-selected', 'false');
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(ITEMS[0]);
  });

  it('calls onClose when the dialog is dismissed with Escape', async () => {
    const { onClose } = renderPopup();
    await screen.findByText('572 - Bancos c/c');
    fireEvent.keyDown(screen.getByTestId('search-popup-input'), { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('staticPageLoader', () => {
  const many = Array.from({ length: SEARCH_POPUP_PAGE_SIZE + 5 }, (_, i) => ({ id: `id-${i}`, name: `Cuenta ${i}` }));

  it('pages an in-memory list like a server selector', async () => {
    const load = staticPageLoader(many);
    const first = await load('', 0);
    expect(first.items).toHaveLength(SEARCH_POPUP_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    const second = await load('', SEARCH_POPUP_PAGE_SIZE);
    expect(second.items).toHaveLength(5);
    expect(second.hasMore).toBe(false);
  });

  it('matches the label case-insensitively', async () => {
    const { items } = await staticPageLoader(ITEMS)('BANCARIOS', 0);
    expect(items).toEqual([ITEMS[1]]);
  });
});

// ETP-5948 — the ETP-5903 reopen behaviour on the popup: the committed value is marked, located in
// place by walking pages (cap: 6), pinned on top otherwise, and the arrows start from it.
describe('SearchPopup — committed value (ETP-5948)', () => {
  const row = (n) => ({ id: `acc-${n}`, name: `Account ${String(n).padStart(4, '0')}` });
  // A server-like loader: pages of SEARCH_POPUP_PAGE_SIZE; a query filters by label.
  function pager(total, { failAt } = {}) {
    const all = Array.from({ length: total }, (_, i) => row(i));
    return vi.fn((q, offset) => {
      if (offset === failAt) return Promise.reject(new Error('HTTP 500'));
      const matches = q ? all.filter((o) => o.name.includes(q)) : all;
      return Promise.resolve({
        items: matches.slice(offset, offset + SEARCH_POPUP_PAGE_SIZE),
        hasMore: offset + SEARCH_POPUP_PAGE_SIZE < matches.length,
      });
    });
  }
  const listOffsets = (loadPage) => loadPage.mock.calls.filter(([q]) => q === '').map(([, offset]) => offset);
  const labelLookups = (loadPage) => loadPage.mock.calls.filter(([q]) => q !== '');

  it('marks only the committed value with aria-selected and the check', async () => {
    renderPopup({ value: 'b', valueLabel: '626 - Servicios bancarios' });
    const committed = await screen.findByTestId('search-popup-option-b');
    expect(committed).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('search-popup-option-a')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getAllByTestId('search-popup-check')).toHaveLength(1);
  });

  it('starts the first ArrowDown from the option after the committed one', async () => {
    renderPopup({ value: 'a', valueLabel: '572 - Bancos c/c' });
    await screen.findByTestId('search-popup-option-a');
    fireEvent.keyDown(screen.getByTestId('search-popup-input'), { key: 'ArrowDown' });
    expect(screen.getByTestId('search-popup-option-b')).toHaveAttribute('data-highlighted', 'true');
  });

  it('walks forward to the page holding the value and shows it in place, with no lookup', async () => {
    const loadPage = pager(200);
    renderPopup({ loadPage, value: 'acc-75', valueLabel: 'Account 0075' });

    await waitFor(() => expect(screen.getByTestId('search-popup-option-acc-75')).toHaveAttribute('aria-selected', 'true'));
    expect(listOffsets(loadPage)).toEqual([0, 30, 60]);
    expect(labelLookups(loadPage)).toHaveLength(0);
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('data-testid', 'search-popup-option-acc-0');
  });

  it('stops at the 1000-row walk total, then pins the value on top through a label lookup', async () => {
    const loadPage = pager(2000);
    renderPopup({ loadPage, value: 'acc-1500', valueLabel: 'Account 1500' });

    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveAttribute('data-testid', 'search-popup-option-acc-1500'),
      { timeout: 90000 }); // CPU-bound 34-page walk: ~3s idle, 11-19s under load+coverage, >25s on CI
    expect(screen.getByTestId('search-popup-option-acc-1500')).toHaveAttribute('aria-selected', 'true');
    // A loader that ignores the size hint walks 30 rows at a time up to the 1000-row walk total.
    expect(listOffsets(loadPage)).toEqual(Array.from({ length: 34 }, (_, i) => i * 30));
    expect(labelLookups(loadPage)).toHaveLength(1);
    expect(screen.getAllByRole('option')).toHaveLength(1021);
  }, 100000);

  // The backend matches each identifier column on its own, so "<code> - <name>" as a whole finds
  // nothing (seen live on the product account popup); the code alone does.
  it('retries the pin with the code segment when the full "code - name" label finds nothing', async () => {
    const loadPage = sizedPager(2000);
    renderPopup({ loadPage, value: 'acc-1500', valueLabel: 'Account 1500 - Compras de mercaderías' });

    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveAttribute('data-testid', 'search-popup-option-acc-1500'));
    expect(labelLookups(loadPage).map(([q]) => q)).toEqual(['Account 1500 - Compras de mercaderías', 'Account 1500']);
  });

  it('stops walking when a page fails, without retrying it', async () => {
    const loadPage = pager(2000, { failAt: 60 });
    renderPopup({ loadPage, value: 'acc-1500', valueLabel: 'Account 1500' });

    await screen.findByTestId('search-popup-load-more-error');
    await waitFor(() => expect(labelLookups(loadPage)).toHaveLength(1));
    expect(listOffsets(loadPage)).toEqual([0, 30, 60]);
  });

  it('does not walk or pin while a search is typed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const loadPage = pager(2000);
    renderPopup({ loadPage, value: 'acc-1500', valueLabel: 'Account 1500' });
    fireEvent.change(screen.getByTestId('search-popup-input'), { target: { value: 'Account 001' } });
    await act(async () => { vi.advanceTimersByTime(300); });

    await screen.findByTestId('search-popup-option-acc-10');
    expect(screen.queryByTestId('search-popup-option-acc-1500')).toBeNull();
    expect(loadPage.mock.calls.every(([q, offset]) => q === 'Account 001' || offset === 0)).toBe(true);
  });

  it('never decides on the previous open rows when reopened', async () => {
    const loadPage = pager(200);
    const props = { onClose: vi.fn(), onSelect: vi.fn(), loadPage, title: 'Cuenta', value: 'acc-75', valueLabel: 'Account 0075' };
    const { rerender } = render(<SearchPopup open {...props} />);
    await waitFor(() => expect(screen.getByTestId('search-popup-option-acc-75')).toHaveAttribute('aria-selected', 'true'));

    rerender(<SearchPopup open={false} {...props} />);
    loadPage.mockClear();
    rerender(<SearchPopup open {...props} />);

    await waitFor(() => expect(screen.getByTestId('search-popup-option-acc-75')).toHaveAttribute('aria-selected', 'true'));
    expect(listOffsets(loadPage)).toEqual([0, 30, 60]);
    expect(labelLookups(loadPage)).toHaveLength(0);
  });

  // ETP-6103 — a limit-aware server-like loader, to see the page sizes the popup asks for.
  function sizedPager(total) {
    const all = Array.from({ length: total }, (_, i) => row(i));
    return vi.fn((q, offset, _signal, opts) => {
      const size = opts?.limit ?? SEARCH_POPUP_PAGE_SIZE;
      const matches = q ? all.filter((o) => o.name.includes(q)) : all;
      return Promise.resolve({ items: matches.slice(offset, offset + size), hasMore: offset + size < matches.length });
    });
  }
  const listCalls = (loadPage) => loadPage.mock.calls.filter(([q]) => q === '').map(([, offset, , opts]) => [offset, opts.limit]);

  it('locates a value near row 600 in two requests: 100 rows, then all the rest (ETP-6103)', async () => {
    const loadPage = sizedPager(659);
    renderPopup({ loadPage, value: 'acc-600', valueLabel: 'Account 0600' });

    await waitFor(() => expect(screen.getByTestId('search-popup-option-acc-600')).toHaveAttribute('aria-selected', 'true'));
    expect(listCalls(loadPage)).toEqual([[0, 100], [100, 900]]);
    expect(labelLookups(loadPage)).toHaveLength(0);
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('data-testid', 'search-popup-option-acc-0');
  });

  it('stops at 1000 rows and pins the value when it is further (ETP-6103)', async () => {
    const loadPage = sizedPager(2000);
    renderPopup({ loadPage, value: 'acc-1500', valueLabel: 'Account 1500' });

    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveAttribute('data-testid', 'search-popup-option-acc-1500'));
    expect(listCalls(loadPage)).toEqual([[0, 100], [100, 900]]);
    expect(screen.getAllByRole('option')).toHaveLength(1001);
  });

  it('asks for the own page size when there is no value or the user searches (ETP-6103)', async () => {
    const loadPage = sizedPager(200);
    renderPopup({ loadPage });
    await screen.findByTestId('search-popup-option-acc-0');
    expect(listCalls(loadPage)).toEqual([[0, SEARCH_POPUP_PAGE_SIZE]]);
  });

  let restoreGeometry = null;
  afterEach(() => { restoreGeometry?.(); restoreGeometry = null; });

  const deferredPage = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

  it('keeps the rows hidden, then reveals them centred (ETP-6103)', async () => {
    restoreGeometry = mockGeometry();
    const loadPage = sizedPager(300);
    renderPopup({ loadPage, value: 'acc-40', valueLabel: 'Account 0040' });
    // Held: right after the first page the value is not yet positioned, so the notice shows and the
    // rows are invisible. (waitFor polls, so assert on the first frame where the option exists.)
    const option = await screen.findByTestId('search-popup-option-acc-40');
    await waitFor(() => expect(screen.queryByTestId('search-popup-locating')).toBeNull());
    expect(option).not.toHaveClass('invisible');
    expect(Math.abs(option.getBoundingClientRect().top - (PANEL_H - ROW_H) / 2)).toBeLessThan(2);
    expect(option).toHaveAttribute('aria-selected', 'true');
  });

  it('stays held while the extra page is in flight, then centres when it lands (ETP-6103)', async () => {
    restoreGeometry = mockGeometry();
    const all = Array.from({ length: 300 }, (_, i) => row(i));
    const next = deferredPage();
    const loadPage = vi.fn((q, offset, _signal, opts) => {
      const size = opts?.limit ?? SEARCH_POPUP_PAGE_SIZE;
      const page = { items: all.slice(offset, offset + size), hasMore: offset + size < all.length };
      return offset > 0 ? next.promise.then(() => page) : Promise.resolve(page);
    });
    renderPopup({ loadPage, value: 'acc-98', valueLabel: 'Account 0098' });
    // acc-98 is among the last rows of the 100-row first page: it cannot be centred yet.
    await waitFor(() => expect(loadPage.mock.calls.filter((c) => c[1] > 0)).toHaveLength(1));
    // It is already found: the extra page only needs rows below it, not the rest of the walk.
    expect(listCalls(loadPage)).toEqual([[0, 100], [100, SEARCH_POPUP_PAGE_SIZE]]);
    const option = screen.getByTestId('search-popup-option-acc-98');
    expect(screen.getByTestId('search-popup-locating')).toBeInTheDocument();
    expect(option).toHaveClass('invisible');
    // Still held a moment later: the in-flight page must not be mistaken for the page cap.
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.getByTestId('search-popup-locating')).toBeInTheDocument();
    expect(option).toHaveClass('invisible');

    await act(async () => { next.resolve(); await next.promise; });
    await waitFor(() => expect(screen.queryByTestId('search-popup-locating')).toBeNull());
    expect(option).not.toHaveClass('invisible');
    expect(Math.abs(option.getBoundingClientRect().top - (PANEL_H - ROW_H) / 2)).toBeLessThan(2);
  });

  it('does not hold forever when reopened after the walk page was aborted (ETP-6103)', async () => {
    const all = Array.from({ length: 1000 }, (_, i) => row(i));
    let hang = true;
    const loadPage = vi.fn((q, offset, signal, opts) => {
      const size = opts?.limit ?? SEARCH_POPUP_PAGE_SIZE;
      if (offset > 0 && hang) {
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
      }
      const matches = q ? all.filter((o) => o.name.includes(q)) : all;
      return Promise.resolve({ items: matches.slice(offset, offset + size), hasMore: offset + size < matches.length });
    });
    const popup = (open) => <SearchPopup open={open} onClose={() => {}} onSelect={() => {}} loadPage={loadPage} value="acc-150" valueLabel="Account 0150" title="t" />;
    const { rerender } = render(popup(true));
    await waitFor(() => expect(loadPage.mock.calls.filter((c) => c[1] > 0)).toHaveLength(1));
    rerender(popup(false));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    hang = false;
    rerender(popup(true));
    await screen.findByTestId('search-popup-option-acc-0');
    await waitFor(() => expect(screen.queryByTestId('search-popup-locating')).toBeNull());
    expect(screen.getByTestId('search-popup-option-acc-0')).not.toHaveClass('invisible');
  });

  // The server can answer an empty page with hasMore: true (a SELECT DISTINCT page counted with
  // COUNT(alias)): neither offset nor loaded rows advance, so the walk must end instead of
  // re-requesting the same page on every settle.
  it('ends the walk and releases the hold on an empty page that claims hasMore (ETP-6103)', async () => {
    const all = Array.from({ length: 100 }, (_, i) => row(i));
    const loadPage = vi.fn((q, offset) => Promise.resolve(offset === 0
      ? { items: all, hasMore: true }
      : { items: [], hasMore: true }));
    renderPopup({ loadPage, value: 'acc-missing', valueLabel: 'Account missing' });

    await screen.findByTestId('search-popup-option-acc-0');
    await waitFor(() => expect(screen.queryByTestId('search-popup-locating')).toBeNull());
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(loadPage.mock.calls.filter(([q, offset]) => q === '' && offset > 0).length).toBeLessThanOrEqual(2);
    expect(screen.getByTestId('search-popup-option-acc-0')).not.toHaveClass('invisible');
  });

  it('ends the extra-page centring on an empty page that claims hasMore (ETP-6103)', async () => {
    restoreGeometry = mockGeometry();
    const all = Array.from({ length: 100 }, (_, i) => row(i));
    const loadPage = vi.fn((q, offset) => Promise.resolve(offset === 0
      ? { items: all, hasMore: true }
      : { items: [], hasMore: true }));
    renderPopup({ loadPage, value: 'acc-98', valueLabel: 'Account 0098' });

    await waitFor(() => expect(screen.queryByTestId('search-popup-locating')).toBeNull());
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
    expect(loadPage.mock.calls.filter(([, offset]) => offset > 0).length).toBeLessThanOrEqual(2);
  });

  it('releases the hold when the value is not found (ETP-6103)', async () => {
    const loadPage = sizedPager(2000);
    renderPopup({ loadPage, value: 'acc-1900', valueLabel: 'Account 1900' });
    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveAttribute('data-testid', 'search-popup-option-acc-1900'));
    expect(screen.queryByTestId('search-popup-locating')).toBeNull();
    expect(screen.getAllByRole('option')[0]).not.toHaveClass('invisible');
  });

  it('behaves as before without a value: nothing marked, no walk', async () => {
    const loadPage = pager(200);
    renderPopup({ loadPage });
    await screen.findByTestId('search-popup-option-acc-0');
    expect(screen.queryAllByTestId('search-popup-check')).toHaveLength(0);
    expect(listOffsets(loadPage)).toEqual([0]);
  });
});
