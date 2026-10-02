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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
// Stable holders (not a fresh vi.fn() per render) so a test can assert a write was — or was not —
// issued. Reset in beforeEach.
const writes = { saveDraft: vi.fn(), confirmClose: vi.fn() };
vi.mock('@/hooks/useCashClose.js', () => ({
  useCashClosePending: () => pendingState,
  useSaveCashCloseDraft: () => ({ saveDraft: writes.saveDraft, loading: false }),
  useConfirmCashClose: () => ({ confirmClose: writes.confirmClose, loading: false }),
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

// The side panel stub exposes the tier it received and its three callbacks as plain buttons, so a
// test can fire them whatever the tier — the REAL panel disables them (CashCloseSidePanel suite);
// here the subject is the tab's own early returns (ETP-5457).
vi.mock('../CashCloseSidePanel.jsx', () => ({
  CashCloseSidePanel: ({ windowReadOnly, onConfirm, onSaveDraft, onDeclaredInputChange }) => (
    <div data-testid="stub-side-panel" data-window-read-only={windowReadOnly ? 'true' : 'false'}>
      <button type="button" data-testid="stub-side-confirm" onClick={onConfirm} />
      <button type="button" data-testid="stub-side-save-draft" onClick={onSaveDraft} />
      <button
        type="button"
        data-testid="stub-side-declare-50"
        onClick={() => onDeclaredInputChange('50')} />
    </div>
  ),
}));

vi.mock('../CashCloseConfirmDialog.jsx', () => ({
  CashCloseConfirmDialog: ({ open, onConfirm }) => (
    <div data-testid="stub-confirm-dialog" data-open={open ? 'true' : 'false'}>
      <button type="button" data-testid="stub-confirm-run" onClick={onConfirm} />
    </div>
  ),
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
  writes.saveDraft = vi.fn().mockResolvedValue({});
  writes.confirmClose = vi.fn().mockResolvedValue({});
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

// ETP-5457 — the window's "read-only" access tier. The tab forwards it to the side panel (which
// disables the inputs and both actions), keeps the confirmation dialog shut, and returns early
// from every handler that writes. Each read-only case has a writable twin firing the same callback.
describe('CashCloseTab — window read-only access tier (ETP-5457)', () => {
  it('forwards windowReadOnly=true to the side panel (ETP-5457)', () => {
    renderTab({ windowReadOnly: true });
    expect(screen.getByTestId('stub-side-panel')).toHaveAttribute('data-window-read-only', 'true');
  });

  it('forwards windowReadOnly=false (the default) to the side panel (ETP-5457)', () => {
    renderTab();
    expect(screen.getByTestId('stub-side-panel')).toHaveAttribute('data-window-read-only', 'false');
  });

  it('does not save a draft when onSaveDraft fires under read-only (ETP-5457)', async () => {
    renderTab({ windowReadOnly: true });
    fireEvent.click(screen.getByTestId('stub-side-save-draft'));
    await Promise.resolve();
    expect(writes.saveDraft).not.toHaveBeenCalled();
    expect(pendingState.reload).not.toHaveBeenCalled();
  });

  it('saves a draft from the same callback without read-only (ETP-5457)', async () => {
    renderTab();
    fireEvent.click(screen.getByTestId('stub-side-save-draft'));
    await waitFor(() => expect(writes.saveDraft).toHaveBeenCalledTimes(1));
    expect(writes.saveDraft.mock.calls[0][0]).toMatchObject({ accountId: 'acc-1' });
    await waitFor(() => expect(pendingState.reload).toHaveBeenCalled());
  });

  it('does not confirm a balanced close when onConfirm fires under read-only (ETP-5457)', async () => {
    const onCloseSuccess = vi.fn();
    renderTab({ windowReadOnly: true, onCloseSuccess });
    // Nothing marked, nothing declared → balanced → would confirm straight away if writable.
    fireEvent.click(screen.getByTestId('stub-side-confirm'));
    await Promise.resolve();
    expect(writes.confirmClose).not.toHaveBeenCalled();
    expect(onCloseSuccess).not.toHaveBeenCalled();
  });

  it('confirms the same balanced close straight away without read-only (ETP-5457)', async () => {
    const onCloseSuccess = vi.fn();
    renderTab({ onCloseSuccess });
    fireEvent.click(screen.getByTestId('stub-side-confirm'));
    await waitFor(() => expect(writes.confirmClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onCloseSuccess).toHaveBeenCalled());
  });

  it('keeps the confirmation dialog shut for an unbalanced close under read-only (ETP-5457)', () => {
    renderTab({ windowReadOnly: true });
    fireEvent.click(screen.getByTestId('stub-side-declare-50'));
    fireEvent.click(screen.getByTestId('stub-side-confirm'));
    expect(screen.getByTestId('stub-confirm-dialog')).toHaveAttribute('data-open', 'false');
    expect(writes.confirmClose).not.toHaveBeenCalled();
  });

  it('opens the confirmation dialog for the same unbalanced close without read-only (ETP-5457)', () => {
    renderTab();
    fireEvent.click(screen.getByTestId('stub-side-declare-50'));
    fireEvent.click(screen.getByTestId('stub-side-confirm'));
    expect(screen.getByTestId('stub-confirm-dialog')).toHaveAttribute('data-open', 'true');
    // Unbalanced: nothing is written until the dialog itself is confirmed.
    expect(writes.confirmClose).not.toHaveBeenCalled();
  });

  it('forces an open confirmation dialog shut and makes its confirm a no-op once read-only (ETP-5457)', async () => {
    const onCloseSuccess = vi.fn();
    const account = { id: 'acc-1', currencyIso: 'EUR' };
    const { rerender } = render(<CashCloseTab account={account} onCloseSuccess={onCloseSuccess} />);
    fireEvent.click(screen.getByTestId('stub-side-declare-50'));
    fireEvent.click(screen.getByTestId('stub-side-confirm'));
    expect(screen.getByTestId('stub-confirm-dialog')).toHaveAttribute('data-open', 'true');

    rerender(<CashCloseTab account={account} onCloseSuccess={onCloseSuccess} windowReadOnly />);
    expect(screen.getByTestId('stub-confirm-dialog')).toHaveAttribute('data-open', 'false');

    // runConfirm's own guard: even reached directly, it writes nothing.
    fireEvent.click(screen.getByTestId('stub-confirm-run'));
    await Promise.resolve();
    expect(writes.confirmClose).not.toHaveBeenCalled();
    expect(onCloseSuccess).not.toHaveBeenCalled();
  });

  it('confirms from the dialog without read-only (ETP-5457)', async () => {
    renderTab();
    fireEvent.click(screen.getByTestId('stub-side-declare-50'));
    fireEvent.click(screen.getByTestId('stub-side-confirm'));
    fireEvent.click(screen.getByTestId('stub-confirm-run'));
    await waitFor(() => expect(writes.confirmClose).toHaveBeenCalledTimes(1));
    expect(writes.confirmClose.mock.calls[0][0]).toMatchObject({ declaredBalance: 50 });
  });
});
