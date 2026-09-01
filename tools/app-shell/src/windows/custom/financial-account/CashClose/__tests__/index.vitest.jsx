/**
 * CashCloseTab — refresh progress bar (ETP-4921).
 *
 * The cash close draws its own two-panel surface instead of going through ListView, so it never
 * inherited ListView's refresh progress bar. It now renders the extracted ListProgressBar above
 * the split, under the same gate: only once movements are already on screen, because the panel's
 * own loading state covers the first fetch. Both directions are asserted here — a bar that shows
 * on the initial fetch double-signals with the panel skeleton, and one that never shows makes the
 * header's refresh button look dead.
 *
 * The three child panels and the cash-close hooks have their own suites (see cashCloseMath.test.js
 * for the arithmetic); they are stubbed so the assertions stay on this component's wiring.
 * ListProgressBar is deliberately NOT stubbed — it is the subject.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/backendErrors.js', () => ({
  translateBackendError: (raw) => raw,
}));

// Driven per-test via this mutable holder, mirroring how the other financial-account tab specs
// stub their data hook.
const pendingState = {
  openingBalance: 0,
  glItemDifference: null,
  draft: null,
  movements: [],
  loading: false,
  reload: vi.fn(),
};
vi.mock('@/hooks/useCashClose.js', () => ({
  useCashClosePending: () => pendingState,
  useSaveCashCloseDraft: () => ({ saveDraft: vi.fn(), loading: false }),
  useConfirmCashClose: () => ({ confirmClose: vi.fn(), loading: false }),
}));

vi.mock('../CashCloseMovementsPanel.jsx', () => ({
  CashCloseMovementsPanel: ({ movements, loading }) => (
    <div
      data-testid="stub-movements-panel"
      data-len={movements.length}
      data-loading={loading ? 'true' : 'false'}
    />
  ),
}));

vi.mock('../CashCloseSidePanel.jsx', () => ({
  CashCloseSidePanel: () => <div data-testid="stub-side-panel" />,
}));

vi.mock('../CashCloseConfirmDialog.jsx', () => ({
  CashCloseConfirmDialog: () => <div data-testid="stub-confirm-dialog" />,
}));

import { CashCloseTab } from '../index.jsx';

const MOVEMENTS = [
  { id: 'm1', transactionDate: '2026-05-10', description: 'Venta mostrador', amount: 100 },
  { id: 'm2', transactionDate: '2026-05-11', description: 'Compra caja', amount: -40 },
];

function renderTab(props = {}) {
  return render(<CashCloseTab account={{ id: 'acc-1', currencyIso: 'EUR' }} {...props} />);
}

beforeEach(() => {
  pendingState.openingBalance = 0;
  pendingState.glItemDifference = null;
  pendingState.draft = null;
  pendingState.movements = MOVEMENTS;
  pendingState.loading = false;
  pendingState.reload = vi.fn();
});

describe('CashCloseTab — refresh progress bar', () => {
  it('shows the bar while refreshing over movements already on screen', () => {
    pendingState.loading = true;
    renderTab();
    expect(screen.getByTestId('cash-close-progress-bar')).toBeInTheDocument();
  });

  it('keeps the movements panel mounted underneath the bar (smooth refresh, not a remount)', () => {
    pendingState.loading = true;
    renderTab();
    expect(screen.getByTestId('cash-close-progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('stub-movements-panel')).toHaveAttribute('data-len', '2');
  });

  it('hides the bar on the very first fetch, where the panel loading state is the indicator', () => {
    pendingState.movements = [];
    pendingState.loading = true;
    renderTab();
    expect(screen.queryByTestId('cash-close-progress-bar')).not.toBeInTheDocument();
    expect(screen.getByTestId('stub-movements-panel')).toHaveAttribute('data-loading', 'true');
  });

  it('hides the bar once the fetch settles', () => {
    pendingState.loading = false;
    renderTab();
    expect(screen.queryByTestId('cash-close-progress-bar')).not.toBeInTheDocument();
  });

  it('uses its own testid so it never collides with another tab bar', () => {
    pendingState.loading = true;
    renderTab();
    expect(screen.queryByTestId('list-progress-bar')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBe(screen.getByTestId('cash-close-progress-bar'));
  });
});
