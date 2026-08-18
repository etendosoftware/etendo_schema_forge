// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const mockFetchByCriteria = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockFetchChild = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockFetchById = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock('@/components/related-documents', () => ({
  DocChip: ({ type }) => <div data-testid={`chip-${type}`}>{type}</div>,
  RelatedDocumentsShell: ({ children, loading, onRefresh }) => (
    <div data-testid="shell" data-loading={String(loading)}>
      {onRefresh && (
        <button data-testid="refresh-btn" onClick={onRefresh}>
          Refresh
        </button>
      )}
      {children}
    </div>
  ),
  docChipProps: ({ type }) => ({ type }),
  fetchByCriteria: mockFetchByCriteria,
  fetchChild: mockFetchChild,
  fetchById: mockFetchById,
}));

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RelatedDocuments from '../RelatedDocuments.jsx';

const DEFAULT_PROPS = {
  recordId: 'po-1',
  data: {},
  token: 'tok',
  apiBaseUrl: '/api',
};

describe('RelatedDocuments (purchase-order)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchByCriteria.mockResolvedValue([]);
    mockFetchChild.mockResolvedValue([]);
    mockFetchById.mockResolvedValue(null);
  });

  it('renders RelatedDocumentsShell (initially loading=true, then false)', async () => {
    render(<RelatedDocuments {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('shell').dataset.loading).toBe('true');
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
  });

  it('does not fetch when recordId is absent', () => {
    render(<RelatedDocuments {...DEFAULT_PROPS} recordId={undefined} />);
    expect(mockFetchByCriteria).not.toHaveBeenCalled();
    expect(mockFetchChild).not.toHaveBeenCalled();
    expect(mockFetchById).not.toHaveBeenCalled();
  });

  it('onRefresh button triggers re-fetch (fetchByCriteria called again)', async () => {
    render(<RelatedDocuments {...DEFAULT_PROPS} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );

    const callsBefore = mockFetchByCriteria.mock.calls.length;

    screen.getByTestId('refresh-btn').click();

    await waitFor(() =>
      expect(mockFetchByCriteria.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });

  // ETP-4779: generating a derived document (e.g. Goods Receipt / Purchase
  // Invoice) from this Purchase Order's menu actions must refresh this
  // component the same way the manual refresh button does — via a
  // `docsRefreshSignal` prop threaded down from DetailView through
  // LinesBottomSection. Currently `docsRefreshSignal` is not part of the
  // fetch effect's dependency array, so incrementing it does NOT trigger a
  // refetch. This test is expected to FAIL until that fix lands.
  it('refetches when docsRefreshSignal prop increments (regression, ETP-4779)', async () => {
    const { rerender } = render(
      <RelatedDocuments {...DEFAULT_PROPS} docsRefreshSignal={0} />
    );
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );

    const callsBefore = mockFetchByCriteria.mock.calls.length;

    rerender(<RelatedDocuments {...DEFAULT_PROPS} docsRefreshSignal={1} />);

    await waitFor(() =>
      expect(mockFetchByCriteria.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });
});
