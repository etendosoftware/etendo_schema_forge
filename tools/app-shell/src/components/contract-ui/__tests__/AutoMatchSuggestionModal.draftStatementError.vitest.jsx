import { render, screen, fireEvent } from '@testing-library/react';

/**
 * ETP-5121 (QA round) — the automatch apply toast must TRANSLATE the backend's refusal.
 *
 * `applySuggestions` answers 201 even when every group is rejected; the reason travels inside
 * `results[].error.message`, in English. The modal used to render that string verbatim, so a
 * Spanish user applying a suggestion whose statement had gone back to Borrador read
 * "The bank statement is in draft; process it before reconciling its lines".
 *
 * `handleApply` now pipes both failure paths (the all-rejected branch and the thrown-error branch)
 * through `translateBackendError`. THIS SUITE IS THE ONLY THING PINNING THAT WIRING: the mapping
 * itself is covered by `lib/__tests__/backendErrors.test.js` and the locale entries by
 * `locales/__tests__/etp5121-draft-statement-key.vitest.js`, but neither notices if a refactor drops
 * the call at the call site and goes back to rendering `failures[0]?.error?.message` raw.
 *
 * The i18n mock deliberately returns `t:<key>` rather than the key itself: `translateBackendError`
 * guards on `t(key) === key` (a missing translation falls back to the original English), so a
 * key-echoing mock would make the translated and untranslated outcomes identical and the assertions
 * vacuous.
 */

// --- Mocks ------------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    const base = `t:${key}`;
    if (params && typeof params === 'object') {
      return `${base} ${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(' ')}`;
    }
    return base;
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children, ...rest }) => <div {...rest}>{children}</div>,
  DialogTitle: ({ children, ...rest }) => <h2 {...rest}>{children}</h2>,
}));

vi.mock('@/components/ui/money-amount', () => ({
  MoneyAmount: ({ value }) => <span>{value}</span>,
}));

const applyMock = vi.fn();
vi.mock('@/hooks/useReconciliation', () => ({
  useApplySuggestions: () => ({ apply: applyMock, loading: false, error: null }),
}));

// --- Import under test (after mocks) ----------------------------------------

import { AutoMatchSuggestionModal } from '../AutoMatchSuggestionModal.jsx';
import { toast } from 'sonner';

// --- Fixtures ---------------------------------------------------------------

/** The exact sentence the three backend write paths return with their 409. */
const DRAFT_STATEMENT_MESSAGE =
  'The bank statement is in draft; process it before reconciling its lines';

const TRANSLATED = 't:backendError.statementDraftNotReconcilable';
const GENERIC_ERROR = 't:financeReconcileAutomatchToastError';

/** A single plain 1:1 group — the shape a stale preview would still be offering. */
const GROUP = {
  groupKey: 'g-draft',
  statementLine: {
    id: 'line-1',
    description: 'Cargo sin conciliar',
    amount: -40,
    date: '2026-05-06T00:00:00Z',
  },
  operations: [
    { id: 'txn-1', documentNo: 'F2660006', partnerName: 'Acme S.L.', amount: -40, isNew: false },
  ],
  origin: 'standard',
  isNew: false,
  difference: 0,
};

const SECOND_GROUP = {
  ...GROUP,
  groupKey: 'g-draft-2',
  statementLine: { ...GROUP.statementLine, id: 'line-2' },
  operations: [{ ...GROUP.operations[0], id: 'txn-2' }],
};

function renderModal(overrides = {}) {
  const props = {
    accountId: 'acc-1',
    accountName: 'Banco ETP-5121',
    groups: [GROUP],
    kpis: { pendingLines: 1, groupsFound: 1, opsToLink: 1, willCreate: 0 },
    currency: 'EUR',
    open: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    glItemDifference: null,
    ...overrides,
  };
  return { ...render(<AutoMatchSuggestionModal {...props} />), props };
}

beforeEach(() => {
  applyMock.mockReset().mockResolvedValue({});
  toast.success.mockReset();
  toast.error.mockReset();
  toast.warning.mockReset();
});

// ---------------------------------------------------------------------------
// 1. The all-rejected branch (HTTP 201 + results[].error)
// ---------------------------------------------------------------------------

describe('AutoMatchSuggestionModal — draft-statement refusal is translated', () => {
  it('shows the localized copy, not the English sentence, when the batch is fully rejected', async () => {
    applyMock.mockResolvedValue({
      results: [{ statementLineId: 'line-1', error: { message: DRAFT_STATEMENT_MESSAGE } }],
    });
    renderModal();

    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(TRANSLATED);
    // The regression this suite exists for: the raw backend sentence reaching the user.
    expect(toast.error).not.toHaveBeenCalledWith(DRAFT_STATEMENT_MESSAGE);
    // Nor the generic fallback — the specific cause is the whole point.
    expect(toast.error).not.toHaveBeenCalledWith(GENERIC_ERROR);
  });

  it('translates the FIRST failure when every group was refused for the same reason', async () => {
    applyMock.mockResolvedValue({
      results: [
        { statementLineId: 'line-1', error: { message: DRAFT_STATEMENT_MESSAGE } },
        { statementLineId: 'line-2', error: { message: DRAFT_STATEMENT_MESSAGE } },
      ],
    });
    renderModal({ groups: [GROUP, SECOND_GROUP] });

    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(TRANSLATED);
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('still passes an UNMAPPED backend message through untouched', async () => {
    // translateBackendError returns the original for anything it does not know, so wiring it in
    // must not have swallowed the messages that were already surfacing correctly.
    applyMock.mockResolvedValue({
      results: [{ statementLineId: 'line-1', error: { message: 'Statement line is already reconciled: line-1' } }],
    });
    renderModal();

    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith('Statement line is already reconciled: line-1');
  });

  it('falls back to the generic error key when the failure carries no message', async () => {
    applyMock.mockResolvedValue({ results: [{ statementLineId: 'line-1', error: {} }] });
    renderModal();

    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(GENERIC_ERROR);
  });
});

// ---------------------------------------------------------------------------
// 2. The thrown-error branch
//
// A 409 that `useApplySuggestions` rejects with (rather than reporting inside results[]) lands in
// the catch. Same sentence, same guard — and it was rendered raw there too.
// ---------------------------------------------------------------------------

describe('AutoMatchSuggestionModal — draft-statement refusal thrown by the apply call', () => {
  it('translates the thrown message', async () => {
    applyMock.mockRejectedValue(new Error(DRAFT_STATEMENT_MESSAGE));
    renderModal();

    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(TRANSLATED);
    expect(toast.error).not.toHaveBeenCalledWith(DRAFT_STATEMENT_MESSAGE);
  });

  it('falls back to the generic error key when the thrown error has no message', async () => {
    applyMock.mockRejectedValue(new Error(''));
    renderModal();

    fireEvent.click(screen.getByTestId('automatch-modal-apply'));

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith(GENERIC_ERROR);
  });
});
