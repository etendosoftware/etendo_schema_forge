// @covers tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx
// @covers tools/app-shell/src/components/contract-ui/BouncePairPanel.jsx
// @covers tools/app-shell/src/components/contract-ui/useBouncePairReview.jsx
/**
 * Bounce pairs and discarded lines in the reconciliation split panel (flag `bank-bounce-suggestions`
 * for the pairs; the discarded lines are unconditional).
 *
 * The SPA never evaluates the flag. It renders the `bounce` line state, `counts.bounce` and the
 * `bouncePair` annotation when the backend answers them; a selected bounce or discarded line gets
 * the bounce-pair panel instead of the candidate operations.
 *
 * `usePendingStatementLines` is replaced by a small fake that behaves like the real resource hook:
 * a change of filters (date range, `status`) reloads — `loading` turns true, then the answer for
 * the new filters arrives on the next tick. The answer is chosen per test by `pending.answer`.
 */

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

// The key, plus its params as JSON; a `backendError.*` key reads as translated (`T(<key>)`).
function fakeUi(key, params) {
  if (key.startsWith('backendError.')) return `T(${key})`;
  if (params && typeof params === 'object' && Object.keys(params).length > 0) {
    return `${key}:${JSON.stringify(params)}`;
  }
  return key;
}

vi.mock('@/i18n', () => ({
  useUI: () => fakeUi,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }),
}));

const pending = {
  answer: () => ({ lines: [], counts: {} }),
  calls: [],
  reload: vi.fn(),
};
const candidateLineIds = [];

vi.mock('@/hooks/useReconciliation', async () => {
  const React = await import('react');
  return {
    usePendingStatementLines: (accountId, filters = {}) => {
      pending.calls.push({ accountId, ...filters });
      const key = JSON.stringify(filters);
      const [state, setState] = React.useState({ key: null, data: null });
      React.useEffect(() => {
        let alive = true;
        const t = setTimeout(() => {
          if (alive) setState({ key, data: pending.answer(filters) });
        }, 0);
        return () => { alive = false; clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [key]);
      const data = state.data ?? { lines: [], counts: {} };
      return {
        lines: data.lines,
        total: data.lines.length,
        counts: data.counts,
        loading: state.key !== key,
        reload: pending.reload,
        draftReconciliationCount: 0,
      };
    },
    useCandidateOperations: (accountId, lineId) => {
      candidateLineIds.push(lineId);
      return { candidates: [], counts: {}, loading: false };
    },
    useReconcileGroup: () => ({ reconcile: vi.fn(), loading: false }),
    useRemoveOperation: () => ({ removeOperation: vi.fn(), loading: false }),
    useReconcileDifference: () => ({ reconcileDifference: vi.fn(), loading: false }),
  };
});

const discardPairMock = vi.fn();
const restorePairMock = vi.fn();
vi.mock('@/hooks/useBouncePairActions.js', () => ({
  useDiscardPair: () => ({ discardPair: discardPairMock, loading: false, error: null }),
  useRestorePair: () => ({ restorePair: restorePairMock, loading: false, error: null }),
}));

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';
import { formatDate } from '@/lib/formatSigned';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const PLAIN = { id: 'P1', state: 'pending', status: 'pending', amount: -10, date: '2026-10-01', description: 'Plain line' };

const O1_SHORT = { id: 'O1', amount: -120, date: '2026-10-02', description: 'Pago proveedor' };
const B1_SHORT = { id: 'B1', amount: 120, date: '2026-10-02', description: 'DEVOLUCION' };
const HIGH_PAIR = {
  groupKey: 'g-high', ambiguous: false, confidence: 'high', signal: 'pis_link', signals: ['pis_link'],
};
const O1 = {
  ...O1_SHORT, state: 'bounce', status: 'pending',
  bouncePair: { ...HIGH_PAIR, role: 'original', counterpartLine: B1_SHORT },
};
const B1 = {
  ...B1_SHORT, state: 'bounce', status: 'pending',
  bouncePair: { ...HIGH_PAIR, role: 'bounce', counterpartLine: O1_SHORT },
};

const C1_SHORT = { id: 'C1', amount: -80, date: '2026-10-01', description: 'Pago ACME 1' };
const C2_SHORT = { id: 'C2', amount: -80, date: '2026-10-03', description: 'Pago ACME 2' };
const B3_SHORT = { id: 'B3', amount: 80, date: '2026-10-05', description: 'Abono ACME' };
const AMB_PAIR = {
  groupKey: 'g-amb', ambiguous: true, confidence: 'review', signal: 'counterparty', signals: ['counterparty'],
};
const B3 = {
  ...B3_SHORT, state: 'bounce', status: 'pending',
  bouncePair: { ...AMB_PAIR, role: 'bounce', candidates: [{ line: C1_SHORT }, { line: C2_SHORT }] },
};
const C1 = { ...C1_SHORT, state: 'bounce', status: 'pending', bouncePair: { ...AMB_PAIR, role: 'candidate', counterpartLine: B3_SHORT } };
const C2 = { ...C2_SHORT, state: 'bounce', status: 'pending', bouncePair: { ...AMB_PAIR, role: 'candidate', counterpartLine: B3_SHORT } };

const BOUNCE_LINES = [PLAIN, O1, B1, C1, C2, B3];
const BOUNCE_COUNTS = {
  all: 6, pending: 1, suggested: 0, byRule: 0, difference: 0, reconciled: 0, bounce: 5, discarded: 3,
};

const DISCARDED_AT = '2026-09-10T10:00:00Z';
const D1 = {
  id: 'D1', state: 'discarded', status: 'discarded', discarded: true, amount: -50, date: '2026-09-01', description: 'Cuota gimnasio',
  bounceLink: { counterpartLineId: 'D2', discardedAt: DISCARDED_AT, signal: 'return_text', confidence: 'high' },
};
const D2 = {
  id: 'D2', state: 'discarded', status: 'discarded', discarded: true, amount: 50, date: '2026-09-03', description: 'Cuota devuelta',
  bounceLink: { counterpartLineId: 'D1', discardedAt: DISCARDED_AT, signal: 'return_text', confidence: 'high' },
};
const D3 = {
  id: 'D3', state: 'discarded', status: 'discarded', discarded: true, amount: -7, date: '2026-08-20', description: 'Comision', bounceLink: null,
};

/** The flag-on answer, and the `status=discarded` one when that filter is active. */
function bounceAnswer(filters) {
  if (filters.status === 'discarded') return { lines: [D1, D2, D3], counts: { discarded: 3 } };
  return { lines: BOUNCE_LINES, counts: BOUNCE_COUNTS };
}

function renderPanel(props = {}) {
  const onReconcileSuccess = vi.fn();
  const utils = render(
    <ReconciliationSplitPanel
      accountId="ACC-1"
      currency="EUR"
      amountTolerance={5}
      onReconcileSuccess={onReconcileSuccess}
      {...props}
    />,
  );
  return { ...utils, onReconcileSuccess };
}

const row = (id) => screen.getByTestId(`recon-line-row-${id}`);
const lastCall = () => pending.calls.at(-1);

/** Opens the status dropdown (its trigger shows the active label) and returns the option labels. */
function openStatus(activeLabelKey) {
  fireEvent.click(screen.getByText(new RegExp(`^${activeLabelKey} \\(`)));
}

function selectStatus(activeLabelKey, nextLabelKey) {
  openStatus(activeLabelKey);
  fireEvent.click(screen.getByText(new RegExp(`^${nextLabelKey} \\(`)));
}

async function selectLineRow(id) {
  fireEvent.click(await screen.findByTestId(`recon-line-radio-${id}`));
}

beforeEach(() => {
  pending.answer = bounceAnswer;
  pending.calls = [];
  pending.reload = vi.fn();
  candidateLineIds.length = 0;
  discardPairMock.mockReset().mockResolvedValue({ discarded: true });
  restorePairMock.mockReset().mockResolvedValue({ restored: ['D1', 'D2'] });
  toast.success.mockClear();
  toast.error.mockClear();
  Element.prototype.scrollIntoView.mockClear();
});

// ── Left panel ─────────────────────────────────────────────────────────────────

describe('ReconciliationSplitPanel — bounce lines in the left panel', () => {
  it('flag off: no bounce or discarded filter entry, no status param', async () => {
    pending.answer = () => ({ lines: [PLAIN], counts: { all: 1, pending: 1, reconciled: 0 } });
    renderPanel();
    await screen.findByTestId('recon-line-row-P1');
    expect(lastCall().status).toBeUndefined();
    openStatus('financeReconcileFilterStatusPending');
    expect(screen.queryByText(/^financeReconcileFilterStatusBounce/)).toBeNull();
    expect(screen.queryByText(/^financeReconcileFilterStatusDiscarded/)).toBeNull();
    expect(screen.getByText(/^financeReconcileFilterStatusReconciled \(0\)/)).toBeInTheDocument();
  });

  it('flag off but with a discarded line (Classic): offers Descartadas only', async () => {
    pending.answer = () => ({ lines: [PLAIN], counts: { all: 1, pending: 1, discarded: 2 } });
    renderPanel();
    await screen.findByTestId('recon-line-row-P1');
    openStatus('financeReconcileFilterStatusPending');
    expect(screen.queryByText(/^financeReconcileFilterStatusBounce/)).toBeNull();
    expect(screen.getByText(/^financeReconcileFilterStatusDiscarded \(2\)/)).toBeInTheDocument();
  });

  it('shows the "Posible rebote" badge, the bounce entry and counts bounce lines as Pendientes', async () => {
    renderPanel();
    await screen.findByTestId('recon-line-row-B3');
    expect(within(row('B3')).getByText('financeReconcileBadgeBounce')).toBeInTheDocument();
    expect(within(row('P1')).getByText('financeReconcileBadgePending')).toBeInTheDocument();
    // Pendientes = 1 pending + 5 bounce: every bounce line is on screen under the default filter.
    expect(screen.getByText(/^financeReconcileFilterStatusPending \(6\)/)).toBeInTheDocument();
    expect(screen.queryAllByTestId(/^recon-line-row-/)).toHaveLength(6);
    openStatus('financeReconcileFilterStatusPending');
    expect(screen.getByText(/^financeReconcileFilterStatusBounce \(5\)/)).toBeInTheDocument();
    expect(screen.getByText(/^financeReconcileFilterStatusDiscarded \(3\)/)).toBeInTheDocument();
  });

  it('the Posibles rebotes filter shows only the bounce lines, still without a status param', async () => {
    renderPanel();
    await screen.findByTestId('recon-line-row-B3');
    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusBounce');
    expect(screen.queryByTestId('recon-line-row-P1')).toBeNull();
    expect(screen.queryAllByTestId(/^recon-line-row-/)).toHaveLength(5);
    expect(lastCall().status).toBeUndefined();
  });
});

// ── Right panel: lines of a detected pair ──────────────────────────────────────

describe('ReconciliationSplitPanel — the bounce-pair panel', () => {
  it('replaces the candidate operations: useCandidateOperations gets a null line id', async () => {
    renderPanel();
    await selectLineRow('O1');
    expect(screen.getByTestId('recon-bounce-panel')).toBeInTheDocument();
    expect(candidateLineIds.at(-1)).toBeNull();
    // A plain line still gets its candidates.
    fireEvent.click(screen.getByTestId('recon-line-radio-P1'));
    expect(screen.queryByTestId('recon-bounce-panel')).toBeNull();
    expect(candidateLineIds.at(-1)).toBe('P1');
  });

  it('original of a high pair: lists the bounce, high notice, net effect and an enabled discard', async () => {
    renderPanel();
    await selectLineRow('O1');
    expect(screen.getByTestId('recon-bounce-source')).toHaveTextContent('financeReconcileBounceSourceBounces:{"count":1}');
    expect(screen.getByTestId('recon-bounce-row-B1')).toBeInTheDocument();
    expect(screen.getByTestId('recon-bounce-badge-B1')).toHaveTextContent('financeReconcileBadgeBounce');
    expect(screen.getByTestId('recon-bounce-notice')).toHaveTextContent(/^financeReconcileBounceNoticeHigh:.*financeReconcileBounceSignalPisLink/);
    expect(screen.getByTestId('recon-bounce-total-net')).toBeInTheDocument();
    expect(screen.getByTestId('recon-bounce-discard')).toBeEnabled();
    fireEvent.click(screen.getByTestId('recon-bounce-discard'));
    await waitFor(() => expect(discardPairMock).toHaveBeenCalledWith({
      financialAccountId: 'ACC-1', statementLineId: 'O1', counterpartLineId: 'B1',
    }));
  });

  it('bounce of an ambiguous pair: radios, nothing preselected, discard disabled until chosen', async () => {
    renderPanel();
    await selectLineRow('B3');
    expect(screen.getByTestId('recon-bounce-source')).toHaveTextContent('financeReconcileBounceSourceOriginals:{"count":2}');
    expect(screen.getByTestId('recon-bounce-radio-C1')).not.toBeChecked();
    expect(screen.getByTestId('recon-bounce-radio-C2')).not.toBeChecked();
    expect(screen.getByTestId('recon-bounce-badge-C1')).toHaveTextContent('financeReconcileBadgeBounceOriginal');
    expect(screen.getByTestId('recon-bounce-notice')).toHaveTextContent('financeReconcileBounceNoticeChoose');
    expect(screen.getByTestId('recon-bounce-discard')).toBeDisabled();
  });

  it('choosing the original of an ambiguous pair sends discardPair, then toasts, reloads and notifies', async () => {
    const { onReconcileSuccess } = renderPanel();
    await selectLineRow('B3');
    fireEvent.click(screen.getByTestId('recon-bounce-radio-C2'));
    expect(screen.getByTestId('recon-bounce-radio-C2')).toBeChecked();
    expect(screen.getByTestId('recon-bounce-notice')).not.toHaveTextContent('financeReconcileBounceNoticeChoose');
    fireEvent.click(screen.getByTestId('recon-bounce-discard'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('financeReconcileBounceToastDiscarded'));
    expect(discardPairMock).toHaveBeenCalledTimes(1);
    expect(discardPairMock).toHaveBeenCalledWith({
      financialAccountId: 'ACC-1', statementLineId: 'C2', counterpartLineId: 'B3',
    });
    expect(pending.reload).toHaveBeenCalled();
    expect(onReconcileSuccess).toHaveBeenCalled();
  });

  it('clicking a row of an ambiguous pair also chooses it', async () => {
    renderPanel();
    await selectLineRow('B3');
    fireEvent.click(screen.getByTestId('recon-bounce-row-C1'));
    expect(screen.getByTestId('recon-bounce-radio-C1')).toBeChecked();
    expect(screen.getByTestId('recon-bounce-discard')).toBeEnabled();
  });

  it('shows the coded refusal translated, and does not reload', async () => {
    const err = Object.assign(new Error('One of the lines is the bank movement of a payment'), {
      status: 409,
      code: 'HAS_PAYMENT',
      body: {
        code: 'HAS_PAYMENT',
        error: { message: 'One of the lines is the bank movement of a payment', messageKeys: ['ETGO_BounceHasPayment'] },
      },
    });
    discardPairMock.mockRejectedValue(err);
    const { onReconcileSuccess } = renderPanel();
    await selectLineRow('O1');
    fireEvent.click(screen.getByTestId('recon-bounce-discard'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('T(backendError.bounceHasPayment)'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(pending.reload).not.toHaveBeenCalled();
    expect(onReconcileSuccess).not.toHaveBeenCalled();
  });

  it('falls back to the action message when the refusal carries no body', async () => {
    discardPairMock.mockRejectedValue(new Error('boom'));
    renderPanel();
    await selectLineRow('O1');
    fireEvent.click(screen.getByTestId('recon-bounce-discard'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('financeReconcileBounceToastDiscardError'));
  });
});

// ── Dismissal ("No es un rebote") ──────────────────────────────────────────────

describe('ReconciliationSplitPanel — "No es un rebote"', () => {
  it('without a bounceReview prop: the pair turns back into pending lines, locally', async () => {
    renderPanel();
    await selectLineRow('O1');
    fireEvent.click(screen.getByTestId('recon-bounce-dismiss'));
    expect(toast.success).toHaveBeenCalledWith('financeReconcileBounceToastDismissed');
    expect(screen.queryByTestId('recon-bounce-panel')).toBeNull();
    expect(within(row('O1')).getByText('financeReconcileBadgePending')).toBeInTheDocument();
    expect(within(row('B1')).getByText('financeReconcileBadgePending')).toBeInTheDocument();
    expect(within(row('B3')).getByText('financeReconcileBadgeBounce')).toBeInTheDocument();
    expect(discardPairMock).not.toHaveBeenCalled();
    // The two lines move from Posibles rebotes to plain pending; Pendientes is unchanged.
    expect(screen.getByText(/^financeReconcileFilterStatusPending \(6\)/)).toBeInTheDocument();
    openStatus('financeReconcileFilterStatusPending');
    expect(screen.getByText(/^financeReconcileFilterStatusBounce \(3\)/)).toBeInTheDocument();
  });

  it('with a bounceReview prop: delegates to onDismiss with the pair key and reads its dismissed keys', async () => {
    const onDismiss = vi.fn();
    const review = { focus: null, onFocusConsumed: vi.fn(), dismissedKeys: new Set(), onDismiss };
    const { rerender } = renderPanel({ bounceReview: review });
    await selectLineRow('B3');
    fireEvent.click(screen.getByTestId('recon-bounce-dismiss'));
    expect(onDismiss).toHaveBeenCalledWith('g-amb');
    expect(toast.success).toHaveBeenCalledWith('financeReconcileBounceToastDismissed');

    rerender(
      <ReconciliationSplitPanel
        accountId="ACC-1" currency="EUR" amountTolerance={5}
        bounceReview={{ ...review, dismissedKeys: new Set(['g-amb']) }} />,
    );
    expect(within(row('B3')).getByText('financeReconcileBadgePending')).toBeInTheDocument();
    expect(within(row('C1')).getByText('financeReconcileBadgePending')).toBeInTheDocument();
    expect(screen.queryByTestId('recon-bounce-panel')).toBeNull();
  });
});

// ── Discarded lines ────────────────────────────────────────────────────────────

describe('ReconciliationSplitPanel — the Descartadas filter', () => {
  async function openDiscarded() {
    renderPanel();
    await screen.findByTestId('recon-line-row-B3');
    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusDiscarded');
    await screen.findByTestId('recon-line-row-D1');
  }

  it('asks for status=discarded and keeps the counts of the default answer for the other entries', async () => {
    await openDiscarded();
    expect(lastCall().status).toBe('discarded');
    expect(screen.queryAllByTestId(/^recon-line-row-/).map((el) => el.dataset.testid))
      .toEqual(['recon-line-row-D1', 'recon-line-row-D2', 'recon-line-row-D3']);
    expect(within(row('D1')).getByText('financeReconcileBadgeDiscarded')).toBeInTheDocument();
    openStatus('financeReconcileFilterStatusDiscarded');
    expect(screen.getAllByText(/^financeReconcileFilterStatusDiscarded \(3\)/).length).toBeGreaterThan(0);
    expect(screen.getByText(/^financeReconcileFilterStatusPending \(6\)/)).toBeInTheDocument();
    expect(screen.getByText(/^financeReconcileFilterStatusBounce \(5\)/)).toBeInTheDocument();
  });

  it('going back to Pendientes drops the status param', async () => {
    await openDiscarded();
    selectStatus('financeReconcileFilterStatusDiscarded', 'financeReconcileFilterStatusPending');
    await screen.findByTestId('recon-line-row-B3');
    expect(lastCall().status).toBeUndefined();
  });

  it('a paired discarded line shows its counterpart and the discard date', async () => {
    await openDiscarded();
    fireEvent.click(screen.getByTestId('recon-line-radio-D1'));
    expect(candidateLineIds.at(-1)).toBeNull();
    expect(screen.getByTestId('recon-bounce-row-D2')).toBeInTheDocument();
    expect(screen.getByTestId('recon-bounce-badge-D2')).toHaveTextContent('financeReconcileBadgeDiscarded');
    expect(screen.getByTestId('recon-bounce-source')).toHaveTextContent('financeReconcileBounceSourceDiscarded:{"count":1}');
    expect(screen.getByTestId('recon-bounce-notice')).toHaveTextContent(
      `financeReconcileBounceDiscardedNotice:${JSON.stringify({ date: formatDate(DISCARDED_AT, 'es-ES') })}`,
    );
    expect(screen.queryByTestId('recon-bounce-dismiss')).toBeNull();
    expect(screen.queryByTestId('recon-bounce-discard')).toBeNull();
    expect(screen.getByTestId('recon-bounce-restore')).toHaveTextContent('financeReconcileBounceRestore');
  });

  it('restoring a pair (2 lines restored) toasts "Par restaurado", reloads and notifies', async () => {
    const onReconcileSuccess = vi.fn();
    render(<ReconciliationSplitPanel accountId="ACC-1" currency="EUR" amountTolerance={5} onReconcileSuccess={onReconcileSuccess} />);
    await screen.findByTestId('recon-line-row-B3');
    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusDiscarded');
    fireEvent.click(await screen.findByTestId('recon-line-radio-D1'));
    fireEvent.click(screen.getByTestId('recon-bounce-restore'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('financeReconcileBounceToastRestored'));
    expect(restorePairMock).toHaveBeenCalledWith({ financialAccountId: 'ACC-1', lineId: 'D1' });
    expect(pending.reload).toHaveBeenCalled();
    expect(onReconcileSuccess).toHaveBeenCalled();
  });

  it('a line discarded alone shows no row, the alone notice and "Restaurar línea"; 1 restored line toasts so', async () => {
    restorePairMock.mockResolvedValue({ restored: ['D3'], lineId: 'D3', counterpartLineId: null });
    await openDiscarded();
    fireEvent.click(screen.getByTestId('recon-line-radio-D3'));
    expect(screen.queryAllByTestId(/^recon-bounce-row-/)).toHaveLength(0);
    expect(screen.getByTestId('recon-bounce-notice')).toHaveTextContent('financeReconcileBounceDiscardedAloneNotice');
    expect(screen.getByTestId('recon-bounce-restore')).toHaveTextContent('financeReconcileBounceRestoreLine');
    expect(screen.queryByTestId('recon-bounce-total-net')).toBeNull();
    fireEvent.click(screen.getByTestId('recon-bounce-restore'));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('financeReconcileBounceToastRestoredLine'));
    expect(restorePairMock).toHaveBeenCalledWith({ financialAccountId: 'ACC-1', lineId: 'D3' });
  });

  it('a failed restore shows the translated refusal', async () => {
    restorePairMock.mockRejectedValue(Object.assign(new Error('x'), {
      body: { error: { message: 'x', messageKeys: ['ETGO_BounceLineNotPending'] } },
    }));
    await openDiscarded();
    fireEvent.click(screen.getByTestId('recon-line-radio-D1'));
    fireEvent.click(screen.getByTestId('recon-bounce-restore'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('T(backendError.bounceLineNotPending)'));
  });
});

// ── Read-only tier ─────────────────────────────────────────────────────────────

describe('ReconciliationSplitPanel — bounce panel under the read-only tier', () => {
  it('disables Descartar par but keeps "No es un rebote" available', async () => {
    renderPanel({ windowReadOnly: true });
    await selectLineRow('O1');
    expect(screen.getByTestId('recon-bounce-discard')).toBeDisabled();
    expect(screen.getByTestId('recon-bounce-dismiss')).toBeEnabled();
    fireEvent.click(screen.getByTestId('recon-bounce-discard'));
    await Promise.resolve();
    expect(discardPairMock).not.toHaveBeenCalled();
  });

  it('disables Restaurar par', async () => {
    renderPanel({ windowReadOnly: true });
    await screen.findByTestId('recon-line-row-B3');
    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusDiscarded');
    fireEvent.click(await screen.findByTestId('recon-line-radio-D1'));
    expect(screen.getByTestId('recon-bounce-restore')).toBeDisabled();
    fireEvent.click(screen.getByTestId('recon-bounce-restore'));
    await Promise.resolve();
    expect(restorePairMock).not.toHaveBeenCalled();
  });
});

// ── "Revisar en el panel": the focus request ───────────────────────────────────

describe('ReconciliationSplitPanel — the "Revisar en el panel" focus request', () => {
  function review(focus, extra = {}) {
    return {
      focus, onFocusConsumed: vi.fn(), dismissedKeys: new Set(), onDismiss: vi.fn(), ...extra,
    };
  }

  it('switches to Posibles rebotes, clears the search, selects and scrolls to the line, then consumes', async () => {
    const r = review(null);
    const { rerender } = renderPanel({ bounceReview: r });
    await screen.findByTestId('recon-line-row-B3');
    fireEvent.change(screen.getByTestId('recon-left-search'), { target: { value: 'zzz' } });
    expect(screen.queryByTestId('recon-line-row-B3')).toBeNull();

    const withFocus = { ...r, focus: { lineId: 'B3', seq: 1 } };
    rerender(<ReconciliationSplitPanel accountId="ACC-1" currency="EUR" amountTolerance={5} bounceReview={withFocus} />);

    await waitFor(() => expect(r.onFocusConsumed).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('recon-left-search')).toHaveValue('');
    expect(screen.getByText(/^financeReconcileFilterStatusBounce \(5\)/)).toBeInTheDocument();
    expect(screen.queryByTestId('recon-line-row-P1')).toBeNull();
    expect(screen.getByTestId('recon-line-radio-B3')).toBeChecked();
    expect(screen.getByTestId('recon-bounce-panel')).toBeInTheDocument();
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect(Element.prototype.scrollIntoView.mock.contexts.at(-1)).toBe(row('B3'));
  });

  it('widens the date range to any date once when the line is outside it', async () => {
    const FAR = { ...B3, id: 'BFAR', date: '2024-01-15' };
    pending.answer = (filters) => (filters.dateFrom
      ? { lines: BOUNCE_LINES, counts: BOUNCE_COUNTS }
      : { lines: [...BOUNCE_LINES, FAR], counts: { ...BOUNCE_COUNTS, all: 7, bounce: 6 } });
    const r = review({ lineId: 'BFAR', seq: 1 });
    renderPanel({ bounceReview: r });

    await waitFor(() => expect(r.onFocusConsumed).toHaveBeenCalledTimes(1));
    expect(pending.calls[0].dateFrom).toBeTruthy();
    expect(lastCall().dateFrom).toBeUndefined();
    expect(lastCall().dateTo).toBeUndefined();
    expect(screen.getByTestId('recon-line-radio-BFAR')).toBeChecked();
  });

  it('gives up (consumes, selects nothing) when the line is not there even at any date', async () => {
    const r = review({ lineId: 'GONE', seq: 1 });
    renderPanel({ bounceReview: r });
    await waitFor(() => expect(r.onFocusConsumed).toHaveBeenCalledTimes(1));
    expect(lastCall().dateFrom).toBeUndefined();
    expect(screen.queryByTestId('recon-bounce-panel')).toBeNull();
    // The request is consumed once: later reloads do not replay it.
    await new Promise((res) => setTimeout(res, 10));
    expect(r.onFocusConsumed).toHaveBeenCalledTimes(1);
  });
});
