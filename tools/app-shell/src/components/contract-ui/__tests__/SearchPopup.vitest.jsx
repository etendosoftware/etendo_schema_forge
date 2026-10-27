// @covers tools/app-shell/src/components/contract-ui/SearchPopup.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
}));

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
    expect(loadPage).toHaveBeenCalledWith('', 0, expect.any(AbortSignal));
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
    expect(loadPage).toHaveBeenCalledWith('banc', 0, expect.any(AbortSignal));
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
    expect(loadPage).toHaveBeenLastCalledWith('', 1, expect.any(AbortSignal));
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

  it('stops at the page cap, then pins the value on top through a label lookup', async () => {
    const loadPage = pager(1000);
    renderPopup({ loadPage, value: 'acc-500', valueLabel: 'Account 0500' });

    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveAttribute('data-testid', 'search-popup-option-acc-500'));
    expect(screen.getByTestId('search-popup-option-acc-500')).toHaveAttribute('aria-selected', 'true');
    expect(listOffsets(loadPage)).toEqual([0, 30, 60, 90, 120, 150]);
    expect(labelLookups(loadPage)).toHaveLength(1);
    expect(screen.getAllByRole('option')).toHaveLength(181);
  });

  it('stops walking when a page fails, without retrying it', async () => {
    const loadPage = pager(1000, { failAt: 60 });
    renderPopup({ loadPage, value: 'acc-500', valueLabel: 'Account 0500' });

    await screen.findByTestId('search-popup-load-more-error');
    await waitFor(() => expect(labelLookups(loadPage)).toHaveLength(1));
    expect(listOffsets(loadPage)).toEqual([0, 30, 60]);
  });

  it('does not walk or pin while a search is typed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const loadPage = pager(1000);
    renderPopup({ loadPage, value: 'acc-500', valueLabel: 'Account 0500' });
    fireEvent.change(screen.getByTestId('search-popup-input'), { target: { value: 'Account 001' } });
    await act(async () => { vi.advanceTimersByTime(300); });

    await screen.findByTestId('search-popup-option-acc-10');
    expect(screen.queryByTestId('search-popup-option-acc-500')).toBeNull();
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

  it('behaves as before without a value: nothing marked, no walk', async () => {
    const loadPage = pager(200);
    renderPopup({ loadPage });
    await screen.findByTestId('search-popup-option-acc-0');
    expect(screen.queryAllByTestId('search-popup-check')).toHaveLength(0);
    expect(listOffsets(loadPage)).toEqual([0]);
  });
});
