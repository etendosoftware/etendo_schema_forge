// @covers tools/app-shell/src/components/contract-ui/ReconciliationSplitPanel.jsx
// @covers tools/app-shell/src/components/contract-ui/BouncePairPanel.jsx
// @covers tools/app-shell/src/components/contract-ui/useBouncePairReview.jsx
// @covers tools/app-shell/src/components/contract-ui/bouncePairs.js
/**
 * Bounce pairs and discarded lines in the reconciliation split panel (flag `bank-bounce-suggestions`).
 * The backend sends `counts.bounce`, `counts.discarded` and the discarded rows only with the flag
 * on; with it off the panel gets none of them.
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
const dismissPairMock = vi.fn();
// Read on every render, so a test can put a discard or a restore in flight (the panel's `busy`).
const pairActions = { discarding: false, restoring: false };
const pendingLineCountsMock = vi.fn();
vi.mock('@/hooks/useBouncePairActions.js', () => ({
  useDiscardPair: () => ({ discardPair: discardPairMock, loading: pairActions.discarding, error: null }),
  useRestorePair: () => ({ restorePair: restorePairMock, loading: pairActions.restoring, error: null }),
  useDismissPair: () => ({ dismissPair: dismissPairMock, loading: false, error: null }),
  usePendingLineCounts: () => pendingLineCountsMock,
}));

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { ReconciliationSplitPanel } from '@/components/contract-ui/ReconciliationSplitPanel.jsx';
import { formatDate, formatSigned } from '@/lib/formatSigned';

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
  pairActions.discarding = false;
  pairActions.restoring = false;
  pending.calls = [];
  pending.reload = vi.fn();
  candidateLineIds.length = 0;
  discardPairMock.mockReset().mockResolvedValue({ discarded: true });
  restorePairMock.mockReset().mockResolvedValue({ restored: ['D1', 'D2'] });
  dismissPairMock.mockReset().mockResolvedValue({});
  pendingLineCountsMock.mockReset().mockResolvedValue(null);
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

  // The backend only sends counts.discarded with the flag on, and then always with counts.bounce:
  // an account whose pairs were all discarded answers `bounce: 0` next to `discarded: N`.
  it('flag on with no pair left but discarded lines: offers Posibles rechazos (0) and Descartadas', async () => {
    pending.answer = () => ({ lines: [PLAIN], counts: { all: 1, pending: 1, bounce: 0, discarded: 2 } });
    renderPanel();
    await screen.findByTestId('recon-line-row-P1');
    expect(lastCall().status).toBeUndefined();
    openStatus('financeReconcileFilterStatusPending');
    expect(screen.getByText(/^financeReconcileFilterStatusBounce \(0\)/)).toBeInTheDocument();
    expect(screen.getByText(/^financeReconcileFilterStatusDiscarded \(2\)/)).toBeInTheDocument();
  });

  it('shows the "Posible rechazo" badge, the bounce entry and counts bounce lines as Pendientes', async () => {
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

  it('the Posibles rechazos filter shows only the bounce lines, still without a status param', async () => {
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

// ── Dismissal ("No es un rechazo") ──────────────────────────────────────────────

describe('ReconciliationSplitPanel — "No es un rechazo"', () => {
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
    // The two lines move from Posibles rechazos to plain pending; Pendientes is unchanged.
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

  // ETP-5581 KPI: the dismissal is also reported to the backend (dismissPair), fire-and-forget.

  it('reports it with dismissPair: the selected line and the other line of the pair', async () => {
    renderPanel();
    await selectLineRow('O1');
    fireEvent.click(screen.getByTestId('recon-bounce-dismiss'));
    expect(dismissPairMock).toHaveBeenCalledTimes(1);
    expect(dismissPairMock).toHaveBeenCalledWith({
      financialAccountId: 'ACC-1', statementLineId: 'O1', counterpartLineId: 'B1',
    });
  });

  it('an ambiguous pair with an original chosen sends it as the counterpart', async () => {
    renderPanel();
    await selectLineRow('B3');
    fireEvent.click(screen.getByTestId('recon-bounce-radio-C2'));
    fireEvent.click(screen.getByTestId('recon-bounce-dismiss'));
    expect(dismissPairMock).toHaveBeenCalledWith({
      financialAccountId: 'ACC-1', statementLineId: 'B3', counterpartLineId: 'C2',
    });
  });

  it('an ambiguous pair with no original chosen omits the counterpart', async () => {
    renderPanel();
    await selectLineRow('B3');
    fireEvent.click(screen.getByTestId('recon-bounce-dismiss'));
    expect(dismissPairMock).toHaveBeenCalledWith({ financialAccountId: 'ACC-1', statementLineId: 'B3' });
  });

  it('a failed report is silent: the pair is still hidden, only the dismissal toast shows', async () => {
    dismissPairMock.mockRejectedValue(new Error('HTTP 500'));
    renderPanel();
    await selectLineRow('O1');
    fireEvent.click(screen.getByTestId('recon-bounce-dismiss'));
    await waitFor(() => expect(dismissPairMock).toHaveBeenCalled());
    await Promise.resolve();
    expect(toast.success).toHaveBeenCalledWith('financeReconcileBounceToastDismissed');
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByTestId('recon-bounce-panel')).toBeNull();
    expect(within(row('O1')).getByText('financeReconcileBadgePending')).toBeInTheDocument();
  });

  it('a report that throws synchronously does not break the dismissal either', async () => {
    dismissPairMock.mockImplementation(() => { throw new Error('boom'); });
    renderPanel();
    await selectLineRow('O1');
    fireEvent.click(screen.getByTestId('recon-bounce-dismiss'));
    expect(toast.success).toHaveBeenCalledWith('financeReconcileBounceToastDismissed');
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

  it('after a restore on Descartadas, re-reads the default counts so the other filters are current', async () => {
    pendingLineCountsMock.mockResolvedValue({
      all: 8, pending: 3, suggested: 0, byRule: 0, difference: 0, reconciled: 0, bounce: 5, discarded: 3,
    });
    await openDiscarded();
    const discardedFilters = lastCall();
    fireEvent.click(screen.getByTestId('recon-line-radio-D1'));
    fireEvent.click(screen.getByTestId('recon-bounce-restore'));
    await waitFor(() => expect(pendingLineCountsMock).toHaveBeenCalledWith({
      financialAccountId: 'ACC-1', dateFrom: discardedFilters.dateFrom, dateTo: discardedFilters.dateTo,
    }));
    openStatus('financeReconcileFilterStatusDiscarded');
    await waitFor(() => expect(screen.getByText(/^financeReconcileFilterStatusPending \(8\)/)).toBeInTheDocument());
    // The discarded count still comes from the discarded answer.
    expect(screen.getAllByText(/^financeReconcileFilterStatusDiscarded \(3\)/).length).toBeGreaterThan(0);
  });

  it('a failed re-read of the counts keeps the last ones and shows no error', async () => {
    pendingLineCountsMock.mockRejectedValue(new Error('offline'));
    await openDiscarded();
    fireEvent.click(screen.getByTestId('recon-line-radio-D1'));
    fireEvent.click(screen.getByTestId('recon-bounce-restore'));
    await waitFor(() => expect(pendingLineCountsMock).toHaveBeenCalled());
    openStatus('financeReconcileFilterStatusDiscarded');
    expect(screen.getByText(/^financeReconcileFilterStatusPending \(6\)/)).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a failed restore of a line discarded alone uses the single-line message', async () => {
    restorePairMock.mockRejectedValue(new Error('x'));
    await openDiscarded();
    fireEvent.click(screen.getByTestId('recon-line-radio-D3'));
    fireEvent.click(screen.getByTestId('recon-bounce-restore'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('financeReconcileBounceToastRestoreLineError'));
  });

  it('a failed restore of a pair keeps the pair message', async () => {
    restorePairMock.mockRejectedValue(new Error('x'));
    await openDiscarded();
    fireEvent.click(screen.getByTestId('recon-line-radio-D1'));
    fireEvent.click(screen.getByTestId('recon-bounce-restore'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('financeReconcileBounceToastRestoreError'));
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
  it('disables Descartar par but keeps "No es un rechazo" available', async () => {
    renderPanel({ windowReadOnly: true });
    await selectLineRow('O1');
    expect(screen.getByTestId('recon-bounce-discard')).toBeDisabled();
    expect(screen.getByTestId('recon-bounce-dismiss')).toBeEnabled();
    fireEvent.click(screen.getByTestId('recon-bounce-discard'));
    await Promise.resolve();
    expect(discardPairMock).not.toHaveBeenCalled();
  });

  it('"No es un rechazo" still hides the pair, but reports nothing to the backend', async () => {
    renderPanel({ windowReadOnly: true });
    await selectLineRow('O1');
    fireEvent.click(screen.getByTestId('recon-bounce-dismiss'));
    expect(toast.success).toHaveBeenCalledWith('financeReconcileBounceToastDismissed');
    expect(screen.queryByTestId('recon-bounce-panel')).toBeNull();
    await Promise.resolve();
    expect(dismissPairMock).not.toHaveBeenCalled();
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

  it('switches to Posibles rechazos, clears the search, selects and scrolls to the line, then consumes', async () => {
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

  it('a second request with the lines loaded and the filter already on Posibles rechazos selects the line', async () => {
    const r = review({ lineId: 'B3', seq: 1 });
    const { rerender } = renderPanel({ bounceReview: r });
    await waitFor(() => expect(r.onFocusConsumed).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('recon-line-radio-B3')).toBeChecked();
    // The user moves on to another line; nothing reloads, the filter stays on Posibles rechazos.
    fireEvent.click(screen.getByTestId('recon-line-radio-B1'));
    expect(screen.getByTestId('recon-line-radio-B1')).toBeChecked();
    const callsBefore = pending.calls.length;
    const filtersBefore = lastCall();

    // "Revisar en el panel" again on the same pair: only `focus` changes.
    rerender(<ReconciliationSplitPanel accountId="ACC-1" currency="EUR" amountTolerance={5}
      bounceReview={{ ...r, focus: { lineId: 'B3', seq: 2 } }} />);

    await waitFor(() => expect(r.onFocusConsumed).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('recon-line-radio-B3')).toBeChecked();
    // Served from the lines on screen: no request with other filters.
    expect(pending.calls.slice(callsBefore)
      .every((c) => c.status === undefined && c.dateFrom === filtersBefore.dateFrom)).toBe(true);
  });

  it('while Descartadas is active at any date, waits for the reload before looking for the line', async () => {
    // A first request for a line that is not there widens the range to any date and gives up.
    const r = review({ lineId: 'GONE', seq: 1 });
    const { rerender } = renderPanel({ bounceReview: r });
    await waitFor(() => expect(r.onFocusConsumed).toHaveBeenCalledTimes(1));
    expect(lastCall().dateFrom).toBeUndefined();
    selectStatus('financeReconcileFilterStatusBounce', 'financeReconcileFilterStatusDiscarded');
    await screen.findByTestId('recon-line-row-D1');
    expect(lastCall().status).toBe('discarded');

    // "Revisar en el panel": the lines on screen are the discarded ones, which do not hold B3.
    rerender(<ReconciliationSplitPanel accountId="ACC-1" currency="EUR" amountTolerance={5}
      bounceReview={{ ...r, focus: { lineId: 'B3', seq: 2 } }} />);

    await waitFor(() => expect(r.onFocusConsumed).toHaveBeenCalledTimes(2));
    expect(lastCall().status).toBeUndefined();
    expect(screen.getByTestId('recon-line-radio-B3')).toBeChecked();
    expect(screen.getByTestId('recon-bounce-panel')).toBeInTheDocument();
  });
});

// ── Two ambiguous pairs sharing a candidate, with bank references ─────────────

// One statement, one day, in this order (neo-headless.md §4.12.1.1, the adjacency example):
// -0,61 (R-C1) · +0,61 (R-B1) · -0,61 (R-C2) · +0,61 (R-B2) · -0,61 (R-C3). Two ambiguous pairs,
// R-B1 over [R-C1, R-C2] and R-B2 over [R-C2, R-C3]: both offered although they share R-C2, which
// is annotated once, by the first pair.
const SAME_DAY = '2026-08-24';
const LONG_DESC = 'TRANSFERENCIA INMEDIATA A FAVOR DE PROVEEDORES UNIDOS CONCEPTO 10000268 100-1';
const R_C1_SHORT = { id: 'R-C1', amount: -0.61, date: SAME_DAY, description: LONG_DESC, referenceNo: 'REF-120' };
const R_C2_SHORT = { id: 'R-C2', amount: -0.61, date: SAME_DAY, description: 'TRANSFERENCIA 100-2', referenceNo: 'REF-140' };
const R_C3_SHORT = { id: 'R-C3', amount: -0.61, date: SAME_DAY, description: 'TRANSFERENCIA 100-3', referenceNo: '   ' };
const R_B1_SHORT = { id: 'R-B1', amount: 0.61, date: SAME_DAY, description: 'RETROCESION', referenceNo: 'REF-130' };
const R_B2_SHORT = { id: 'R-B2', amount: 0.61, date: SAME_DAY, description: 'RETROCESION', referenceNo: '' };
const SHARED_A = {
  groupKey: 'g-shared-a', ambiguous: true, adjacent: true, confidence: 'review', signal: 'return_text', signals: ['return_text'],
};
const SHARED_B = { ...SHARED_A, groupKey: 'g-shared-b' };
const bounceRow = (short, bouncePair) => ({ ...short, state: 'bounce', status: 'pending', bouncePair });
const R_B1 = bounceRow(R_B1_SHORT, { ...SHARED_A, role: 'bounce', candidates: [{ line: R_C1_SHORT }, { line: R_C2_SHORT }] });
const R_B2 = bounceRow(R_B2_SHORT, { ...SHARED_B, role: 'bounce', candidates: [{ line: R_C2_SHORT }, { line: R_C3_SHORT }] });
const R_C1 = bounceRow(R_C1_SHORT, { ...SHARED_A, role: 'candidate', counterpartLine: R_B1_SHORT });
const R_C2 = bounceRow(R_C2_SHORT, { ...SHARED_A, role: 'candidate', counterpartLine: R_B1_SHORT });
const R_C3 = bounceRow(R_C3_SHORT, { ...SHARED_B, role: 'candidate', counterpartLine: R_B2_SHORT });

function sharedAnswer(filters) {
  if (filters.status === 'discarded') return { lines: [D1, D2, D3], counts: { discarded: 3 } };
  return {
    lines: [PLAIN, R_C1, R_B1, R_C2, R_B2, R_C3, O1, B1],
    counts: { all: 8, pending: 1, suggested: 0, byRule: 0, difference: 0, reconciled: 0, bounce: 7, discarded: 3 },
  };
}

const sameDay = () => formatDate(SAME_DAY, 'es-ES');
const refText = (ref) => `financeReconcileBounceRef:${JSON.stringify({ ref })}`;
const total = (which) => screen.getByTestId(`recon-bounce-total-${which}`);
// The amount is the row's last cell; compared exactly, since the formatted value carries an NBSP.
const totalValue = (which) => total(which).lastElementChild.textContent;

describe('ReconciliationSplitPanel — ambiguous pairs sharing a candidate', () => {
  beforeEach(() => { pending.answer = sharedAnswer; });

  it('the Posibles rechazos filter lists both pairs, the shared candidate once', async () => {
    renderPanel();
    await screen.findByTestId('recon-line-row-R-B2');
    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusBounce');
    expect(screen.queryByTestId('recon-line-row-P1')).toBeNull();
    expect(screen.queryAllByTestId(/^recon-line-row-R-/).map((el) => el.dataset.testid)).toEqual([
      'recon-line-row-R-C1', 'recon-line-row-R-B1', 'recon-line-row-R-C2', 'recon-line-row-R-B2', 'recon-line-row-R-C3',
    ]);
    for (const id of ['R-B1', 'R-B2']) {
      expect(within(row(id)).getByText('financeReconcileBadgeBounce')).toBeInTheDocument();
    }
  });

  it('each bounce lists its own two candidates, with "2 salidas posibles" as the reason', async () => {
    renderPanel();
    await selectLineRow('R-B1');
    expect(screen.getByTestId('recon-bounce-source')).toHaveTextContent('financeReconcileBounceSourceOriginals:{"count":2}');
    expect(screen.queryAllByTestId(/^recon-bounce-row-/).map((el) => el.dataset.testid))
      .toEqual(['recon-bounce-row-R-C1', 'recon-bounce-row-R-C2']);
    expect(screen.getByTestId('recon-bounce-notice').textContent)
      .toMatch(/^financeReconcileBounceNoticeReview:.*financeReconcileBounceReasonAmbiguous:.*count.*2/);

    fireEvent.click(screen.getByTestId('recon-line-radio-R-B2'));
    expect(screen.queryAllByTestId(/^recon-bounce-row-/).map((el) => el.dataset.testid))
      .toEqual(['recon-bounce-row-R-C2', 'recon-bounce-row-R-C3']);
    expect(screen.getByTestId('recon-bounce-radio-R-C2')).not.toBeChecked();
  });

  it('the choice on one pair does not carry over to the other pair sharing the candidate', async () => {
    renderPanel();
    await selectLineRow('R-B1');
    fireEvent.click(screen.getByTestId('recon-bounce-radio-R-C2'));
    expect(screen.getByTestId('recon-bounce-discard')).toBeEnabled();
    fireEvent.click(screen.getByTestId('recon-line-radio-R-B2'));
    expect(screen.getByTestId('recon-bounce-radio-R-C2')).not.toBeChecked();
    expect(screen.getByTestId('recon-bounce-discard')).toBeDisabled();
  });
});

describe('ReconciliationSplitPanel — the bank reference and the description of a pair row', () => {
  beforeEach(() => { pending.answer = sharedAnswer; });

  it('shows "Ref. X" under a row that carries a reference', async () => {
    renderPanel();
    await selectLineRow('R-B1');
    expect(screen.getByTestId('recon-bounce-ref-R-C1')).toHaveTextContent(refText('REF-120'));
    expect(screen.getByTestId('recon-bounce-ref-R-C2')).toHaveTextContent(refText('REF-140'));
  });

  it('shows nothing for a whitespace, empty or missing reference', async () => {
    renderPanel();
    await selectLineRow('R-B2');
    // whitespace
    expect(screen.getByTestId('recon-bounce-row-R-C3')).toBeInTheDocument();
    expect(screen.queryByTestId('recon-bounce-ref-R-C3')).toBeNull();
    // empty: R-C3's counterpart is R-B2
    fireEvent.click(screen.getByTestId('recon-line-radio-R-C3'));
    expect(screen.getByTestId('recon-bounce-row-R-B2')).toBeInTheDocument();
    expect(screen.queryByTestId('recon-bounce-ref-R-B2')).toBeNull();
    // missing: B1 has no referenceNo at all
    fireEvent.click(screen.getByTestId('recon-line-radio-O1'));
    expect(screen.getByTestId('recon-bounce-row-B1')).toBeInTheDocument();
    expect(screen.queryByTestId('recon-bounce-ref-B1')).toBeNull();
  });

  it('renders the description through TruncatedText, with the full text on hover when clipped', async () => {
    renderPanel();
    await selectLineRow('R-B1');
    const desc = screen.getByTestId('recon-bounce-desc-R-C1');
    expect(desc).toHaveTextContent(LONG_DESC);
    Object.defineProperty(desc, 'scrollWidth', { configurable: true, value: 640 });
    Object.defineProperty(desc, 'clientWidth', { configurable: true, value: 200 });
    fireEvent.focus(desc);
    expect(screen.getByTestId('recon-bounce-desc-R-C1-tooltip')).toHaveTextContent(LONG_DESC);
  });
});

describe('ReconciliationSplitPanel — the footer of the bounce panel', () => {
  beforeEach(() => { pending.answer = sharedAnswer; });

  it('a bounce line: "Rechazo seleccionado" with its amount and "date · Ref. X"', async () => {
    renderPanel();
    await selectLineRow('R-B1');
    expect(within(total('selected')).getByText('financeReconcileBounceSelectedBounce')).toBeInTheDocument();
    expect(totalValue('selected')).toBe(formatSigned(0.61, 'EUR'));
    expect(screen.getByTestId('recon-bounce-total-selected-meta').textContent)
      .toBe(`${sameDay()} · ${refText('REF-130')}`);
  });

  it('the counterpart meta follows the chosen radio, and is absent before a choice', async () => {
    renderPanel();
    await selectLineRow('R-B1');
    expect(within(total('other')).getByText('financeReconcileBounceTotalOriginal')).toBeInTheDocument();
    expect(totalValue('other')).toBe('—');
    expect(screen.queryByTestId('recon-bounce-total-other-meta')).toBeNull();

    fireEvent.click(screen.getByTestId('recon-bounce-radio-R-C2'));
    expect(screen.getByTestId('recon-bounce-total-other-meta').textContent).toBe(`${sameDay()} · ${refText('REF-140')}`);
    expect(totalValue('other')).toBe(formatSigned(-0.61, 'EUR'));

    fireEvent.click(screen.getByTestId('recon-bounce-radio-R-C1'));
    expect(screen.getByTestId('recon-bounce-total-other-meta').textContent).toBe(`${sameDay()} · ${refText('REF-120')}`);
  });

  it('a line without a reference: the meta is the date alone', async () => {
    renderPanel();
    await selectLineRow('R-B2');
    expect(screen.getByTestId('recon-bounce-total-selected-meta').textContent).toBe(sameDay());
  });

  it('a candidate line: "Salida seleccionada", the bounce as the counterpart', async () => {
    renderPanel();
    await selectLineRow('R-C1');
    expect(within(total('selected')).getByText('financeReconcileBounceTotalOriginal')).toBeInTheDocument();
    expect(totalValue('selected')).toBe(formatSigned(-0.61, 'EUR'));
    expect(screen.getByTestId('recon-bounce-total-selected-meta').textContent).toBe(`${sameDay()} · ${refText('REF-120')}`);
    expect(within(total('other')).getByText('financeReconcileBounceTotalBounce')).toBeInTheDocument();
    expect(screen.getByTestId('recon-bounce-total-other-meta').textContent).toBe(`${sameDay()} · ${refText('REF-130')}`);
  });

  it('an original line: "Salida seleccionada" with its amount and date', async () => {
    renderPanel();
    await selectLineRow('O1');
    expect(within(total('selected')).getByText('financeReconcileBounceTotalOriginal')).toBeInTheDocument();
    expect(totalValue('selected')).toBe(formatSigned(-120, 'EUR'));
    expect(screen.getByTestId('recon-bounce-total-selected-meta').textContent).toBe(formatDate('2026-10-02', 'es-ES'));
    expect(within(total('other')).getByText('financeReconcileBounceTotalBounce')).toBeInTheDocument();
  });

  it('a discarded line: "Línea seleccionada" with its amount', async () => {
    renderPanel();
    await screen.findByTestId('recon-line-row-R-B1');
    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusDiscarded');
    fireEvent.click(await screen.findByTestId('recon-line-radio-D1'));
    expect(within(total('selected')).getByText('financeReconcileBounceSelectedLine')).toBeInTheDocument();
    expect(totalValue('selected')).toBe(formatSigned(-50, 'EUR'));
    expect(screen.getByTestId('recon-bounce-total-selected-meta').textContent).toBe(formatDate('2026-09-01', 'es-ES'));
    expect(screen.queryByTestId('recon-bounce-total-other')).toBeNull();
  });
});

// ── The shared controls of the bounce panel ───────────────────────────────────

describe('ReconciliationSplitPanel — buttons and radios of the bounce panel', () => {
  it('"Descartar par" is the blue primary Button, "No es un rechazo" the outline one', async () => {
    renderPanel();
    await selectLineRow('O1');
    const discard = screen.getByTestId('recon-bounce-discard');
    expect(discard.tagName).toBe('BUTTON');
    expect(discard.className).toContain('bg-primary');
    const dismiss = screen.getByTestId('recon-bounce-dismiss');
    expect(dismiss.className).toContain('border');
    expect(dismiss.className).not.toContain('bg-primary');
  });

  it('"Descartar par" is disabled while a discard or a restore is in flight', async () => {
    pairActions.discarding = true;
    renderPanel();
    await selectLineRow('O1');
    expect(screen.getByTestId('recon-bounce-discard')).toBeDisabled();
    expect(screen.getByTestId('recon-bounce-dismiss')).toBeEnabled();
  });

  it('"Restaurar par" is the blue primary Button, enabled when idle', async () => {
    renderPanel();
    await screen.findByTestId('recon-line-row-B3');
    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusDiscarded');
    fireEvent.click(await screen.findByTestId('recon-line-radio-D1'));
    const restore = screen.getByTestId('recon-bounce-restore');
    expect(restore.className).toContain('bg-primary');
    expect(restore).toBeEnabled();
  });

  it('"Restaurar par" is disabled while a restore is in flight', async () => {
    pairActions.restoring = true;
    renderPanel();
    await screen.findByTestId('recon-line-row-B3');
    selectStatus('financeReconcileFilterStatusPending', 'financeReconcileFilterStatusDiscarded');
    fireEvent.click(await screen.findByTestId('recon-line-radio-D1'));
    expect(screen.getByTestId('recon-bounce-restore')).toBeDisabled();
    fireEvent.click(screen.getByTestId('recon-bounce-restore'));
    await Promise.resolve();
    expect(restorePairMock).not.toHaveBeenCalled();
  });

  it('names each candidate radio by its date, amount and bank reference, so they can be told apart', async () => {
    pending.answer = sharedAnswer;
    renderPanel();
    await selectLineRow('R-B1');
    const amount = formatSigned(-0.61, 'EUR');
    expect(screen.getByTestId('recon-bounce-radio-R-C1')).toHaveAttribute('aria-label',
      `financeReconcileBounceChooseOriginalLineRef:${JSON.stringify({ date: sameDay(), amount, ref: 'REF-120' })}`);
    expect(screen.getByTestId('recon-bounce-radio-R-C2')).toHaveAttribute('aria-label',
      `financeReconcileBounceChooseOriginalLineRef:${JSON.stringify({ date: sameDay(), amount, ref: 'REF-140' })}`);
  });

  it('a candidate without a reference is named by its date and amount only', async () => {
    pending.answer = sharedAnswer;
    renderPanel();
    await selectLineRow('R-B2');
    expect(screen.getByTestId('recon-bounce-radio-R-C3')).toHaveAttribute('aria-label',
      `financeReconcileBounceChooseOriginalLine:${JSON.stringify({ date: sameDay(), amount: formatSigned(-0.61, 'EUR') })}`);
  });

  it('the left-panel and the pair radios use accent-primary', async () => {
    renderPanel();
    await selectLineRow('B3');
    expect(screen.getByTestId('recon-line-radio-P1')).toHaveClass('accent-primary');
    expect(screen.getByTestId('recon-line-radio-B3')).toHaveClass('accent-primary');
    expect(screen.getByTestId('recon-bounce-radio-C1')).toHaveClass('accent-primary');
  });
});
