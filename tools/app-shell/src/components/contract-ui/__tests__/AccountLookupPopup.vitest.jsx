// @covers tools/app-shell/src/components/contract-ui/AccountLookupPopup.jsx
// @covers tools/app-shell/src/components/contract-ui/useAccountSelectorPages.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, renderHook, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
}));

const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => mockApiFetch,
}));

import AccountLookupPopup from '../AccountLookupPopup.jsx';
import { useAccountSelectorPages, selectorItemLabel } from '../useAccountSelectorPages.js';

const SELECTOR_URL = '/sws/neo/simple-g-l-journal/lines/selectors/C_ValidCombination_ID';
const ITEMS = [
  { id: 'vc-1', _identifier: '64000000 - Sueldos y salarios' },
  { id: 'vc-2', _identifier: '55300000 - Socios por desembolsos no exigidos, capital pendiente de inscripción' },
];

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, status: ok ? 200 : 504, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
});

// ETP-5681 — the `account` lookup drawer: the shared search popup over the field's own selector.
describe('AccountLookupPopup', () => {
  it('queries the field selector with the parent context and paging, and lists full labels', async () => {
    mockApiFetch.mockReturnValue(jsonResponse({ items: ITEMS, hasMore: false }));
    render(
      <AccountLookupPopup open onClose={vi.fn()} onSelect={vi.fn()} selectorUrl={SELECTOR_URL}
        selectorContext={{ parentId: 'h-1' }} title="Account" />,
    );
    expect(await screen.findByText(ITEMS[1]._identifier)).toBeInTheDocument();
    const [url, opts] = mockApiFetch.mock.calls[0];
    expect(url).toContain(SELECTOR_URL);
    expect(url).toContain('parentId=h-1');
    expect(url).toContain('limit=30');
    expect(url).toContain('offset=0');
    expect(url).not.toContain('q=');
    expect(opts).toEqual(expect.objectContaining({ baseUrl: '' }));
  });

  it('hands the raw selector item to onSelect (the caller reads _identifier from it)', async () => {
    mockApiFetch.mockReturnValue(jsonResponse({ items: ITEMS, hasMore: false }));
    const onSelect = vi.fn();
    render(<AccountLookupPopup open onClose={vi.fn()} onSelect={onSelect} selectorUrl={SELECTOR_URL} />);
    fireEvent.click(await screen.findByTestId('account-lookup-popup-option-vc-1'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'vc-1', _identifier: ITEMS[0]._identifier }));
  });

  it('shows the error state when the selector answers non-2xx', async () => {
    mockApiFetch.mockReturnValue(jsonResponse({}, false));
    render(<AccountLookupPopup open onClose={vi.fn()} onSelect={vi.fn()} selectorUrl={SELECTOR_URL} />);
    expect(await screen.findByTestId('account-lookup-popup-error')).toBeInTheDocument();
  });

  it('accepts a bare array answer', async () => {
    mockApiFetch.mockReturnValue(jsonResponse(ITEMS));
    render(<AccountLookupPopup open onClose={vi.fn()} onSelect={vi.fn()} selectorUrl={SELECTOR_URL} />);
    expect(await screen.findByText(ITEMS[0]._identifier)).toBeInTheDocument();
  });

  it('does not fetch without a selector URL', async () => {
    render(<AccountLookupPopup open onClose={vi.fn()} onSelect={vi.fn()} selectorUrl="" />);
    expect(await screen.findByTestId('account-lookup-popup-empty')).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

// ETP-5791 — the selector page loader, extracted from AccountLookupPopup so an AccountSelect can be
// fed by the same server selector. The popup tests above cover the null URL, the non-2xx and the
// bare-array answers end to end; these pin what the popup cannot show.
describe('useAccountSelectorPages', () => {
  it.each([
    ['label first', { id: 'a', label: 'L', name: 'N', _identifier: 'I' }, 'L'],
    ['then name', { id: 'a', name: 'N', _identifier: 'I' }, 'N'],
    ['then _identifier', { id: 'a', _identifier: 'I' }, 'I'],
    ['then the id', { id: 'a' }, 'a'],
  ])('selectorItemLabel: %s', (_label, item, expected) => {
    expect(selectorItemLabel(item)).toBe(expected);
  });

  it('sends the query and offset, names each item and passes hasMore through', async () => {
    mockApiFetch.mockReturnValue(jsonResponse({ items: [{ id: 'vc-1', _identifier: '430 - Clientes' }], hasMore: true }));
    const { result } = renderHook(() => useAccountSelectorPages(SELECTOR_URL));
    const page = await result.current('430', 30);

    expect(page).toEqual({ items: [{ id: 'vc-1', _identifier: '430 - Clientes', name: '430 - Clientes' }], hasMore: true });
    const [url] = mockApiFetch.mock.calls[0];
    expect(url).toContain('q=430');
    expect(url).toContain('offset=30');
  });

  it('rejects on a non-2xx answer so the popup can show its error state', async () => {
    mockApiFetch.mockReturnValue(jsonResponse({}, false));
    const { result } = renderHook(() => useAccountSelectorPages(SELECTOR_URL));
    await expect(result.current('', 0)).rejects.toThrow(/504/);
  });
});
