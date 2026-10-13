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
    expect(screen.getByTestId('search-popup-option-a')).toHaveAttribute('aria-selected', 'true');
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
