// Unit tests for the G/L-transaction lifecycle actions added to the movement
// row kebab (ETP-4500): Confirmar / Reactivar / Eliminar. These are shown ONLY
// for manual G/L transactions (no `paymentId`); the visibility matrix and each
// action's hook call + toast + onReload wiring are verified here. The existing
// MovementRowKebab.vitest.jsx (Post action) is left untouched.

// Identity for every UI label, EXCEPT the backendError.* namespace: `translateBackendError` reads
// "t() returned the key" as a MISSING translation and falls back to the raw English, so a pure
// identity mock could never tell a translated toast from an untranslated one (ETP-5085).
//
// ETP-5111 — params are appended to the resolved text whenever a key is given any, INCLUDING the
// backendError.* namespace. No delete-block message interpolates anything any more (the user's
// correction dropped the payment's documentNo from the wording), so this is what makes that
// absence observable: if params ever came back, every reason assertion below would see a
// `:{"…"}` suffix and fail instead of quietly passing on the key alone. Every other ui() call in
// this component is param-less, so the pre-existing bare-key assertions are unaffected.
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    const base = key.startsWith('backendError.') ? `translated:${key}` : key;
    return params ? `${base}:${JSON.stringify(params)}` : base;
  },
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (...a) => toastSuccess(...a), error: (...a) => toastError(...a) },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

vi.mock('@/hooks/useNeoResource', () => ({
  getApiBase: () => '',
}));

// The three lifecycle hooks are the side effects under test — shared spies.
const processMovement = vi.fn();
const reactivateMovement = vi.fn();
const deleteMovement = vi.fn();
const postMovement = vi.fn();
vi.mock('@/hooks/useCreateMovement', () => ({
  useProcessMovement: () => ({ processMovement, processing: false }),
  useReactivateMovement: () => ({ reactivateMovement, reactivating: false }),
  useDeleteMovement: () => ({ deleteMovement, deleting: false }),
  usePostMovement: () => ({ postMovement, posting: false }),
}));

vi.mock('lucide-react', () => ({
  MoreVertical: () => null,
  ExternalLink: () => null,
  GitMerge: () => null,
  BookOpen: () => null,
  BookX: () => null,
  CheckCircle2: () => null,
  RotateCcw: () => null,
  Trash2: () => null,
  Pencil: () => null,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick, disabled, 'data-testid': dtid, ...rest }) => (
    <button
      role="menuitem"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled ? 'true' : undefined}
      data-testid={dtid}
      {...rest}
    >
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }) => <div>{children}</div>,
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipTrigger: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div>{children}</div>,
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MovementRowKebab } from '../MovementRowKebab.jsx';

// GL draft: no paymentId, not processed → Confirmar + Eliminar.
const GL_DRAFT = { id: 'gl-draft', posted: 'N', processed: false };
// GL processed: no paymentId, processed → Reactivar + Eliminar.
const GL_PROCESSED = { id: 'gl-proc', posted: 'Y', processed: true };
// Payment-linked (a PAGO): has paymentId, and `paymentIsReceipt` is not 'Y' → none of the three
// G/L lifecycle actions, but Eliminar is offered anyway since ETP-5111 and explains itself.
// `documentNo` is carried on the row on purpose even though the message must NOT name it — see
// the "never names the payment's document number" assertion below.
const PAYMENT_LINKED = {
  id: 'pay-1', posted: 'Y', processed: true, paymentId: 'p-1', paymentIsReceipt: 'N',
  documentNo: 'PAY-0042',
};
// The same row before it was processed: nothing else in the kebab applies to it, so before
// ETP-5111 the whole menu early-returned null and there was no ⋮ at all on the row.
const PAYMENT_LINKED_DRAFT = {
  id: 'pay-draft', posted: 'N', processed: false, paymentId: 'p-2', paymentIsReceipt: 'N',
};
// A COBRO: the same link, opposite direction. Only the wording differs, and it is the user-visible
// half of the correction that split the one sentence into pago/cobro.
const RECEIPT_LINKED = { ...PAYMENT_LINKED, id: 'rcp-1', paymentIsReceipt: 'Y' };
// The flag never set at all. The backend decides this with `Boolean.TRUE.equals(isReceipt())`, a
// boxed Boolean that is null in exactly this case, so both sides must read it as a PAGO.
const PAYMENT_LINKED_FLAG_UNSET = { id: 'pay-unset', posted: 'Y', processed: true, paymentId: 'p-9' };

// ETP-5085. The two legs of a funds transfer reference each other through RESTRICT self-FKs on
// FIN_FINACC_TRANSACTION, so deleting either one could only ever fail — and it failed at flush
// time as an opaque HTTP 500. Eliminar is now hidden for those rows (the backend also rejects them
// with a 409). Row shape mirrors what the backend sends the table: see the counterpart-link suite
// in MovementsTable.vitest.jsx.
const TRANSFER_LEG = {
  id: 'trf-out',
  posted: 'N',
  processed: true,
  trxType: 'BPW',
  transferTxnId: 'txn-2',
  transferAccountId: 'acct-far',
  transferAccountName: 'Banco Santander',
  transferDirection: 'out',
};
// A bank fee carries the SAME transferTxnId as a leg, yet nothing references IT — the gate is the
// FK direction, not the mere presence of a transfer link — so it stays deletable.
const TRANSFER_BANK_FEE = { ...TRANSFER_LEG, id: 'trf-fee', trxType: 'BF', processed: false };

const TRANSFER_NOT_DELETABLE = 'Movements generated by a funds transfer cannot be deleted.';

function renderKebab(movement, onEdit = vi.fn()) {
  const onReload = vi.fn();
  render(<MovementRowKebab movement={movement} onReload={onReload} onEdit={onEdit} />);
  return { onReload, onEdit };
}

beforeEach(() => {
  processMovement.mockReset().mockResolvedValue({});
  reactivateMovement.mockReset().mockResolvedValue({});
  deleteMovement.mockReset().mockResolvedValue({});
  toastSuccess.mockClear();
  toastError.mockClear();
});

describe('MovementRowKebab — lifecycle visibility matrix', () => {
  it('GL draft shows Editar + Procesar + Eliminar, hides Reactivar', () => {
    renderKebab(GL_DRAFT);
    expect(screen.getByTestId('movement-row-edit')).toBeInTheDocument();
    expect(screen.getByTestId('movement-row-process')).toBeInTheDocument();
    expect(screen.getByTestId('movement-row-delete')).toBeInTheDocument();
    expect(screen.queryByTestId('movement-row-reactivate')).not.toBeInTheDocument();
  });

  it('GL processed shows Reactivar + Eliminar, hides Editar + Procesar', () => {
    renderKebab(GL_PROCESSED);
    expect(screen.getByTestId('movement-row-reactivate')).toBeInTheDocument();
    expect(screen.getByTestId('movement-row-delete')).toBeInTheDocument();
    expect(screen.queryByTestId('movement-row-edit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('movement-row-process')).not.toBeInTheDocument();
  });

  it('processed but NOT posted still shows Editar (partial edit) + Reactivar', () => {
    renderKebab({ id: 'gl-pnp', posted: 'N', processed: true });
    expect(screen.getByTestId('movement-row-edit')).toBeInTheDocument();
    expect(screen.getByTestId('movement-row-reactivate')).toBeInTheDocument();
    // Confirmar (Draft → Processed) is gone — it's already processed.
    expect(screen.queryByTestId('movement-row-process')).not.toBeInTheDocument();
  });

  // ETP-5111 — Eliminar is no longer hidden for a payment-linked movement. The G/L-only actions
  // still are (that movement is managed from the Payments module), but the delete item is offered
  // and explains its refusal on click — see the "delete is always offered" describe below.
  it('payment-linked, posted movement exposes Unpost + Eliminar and no G/L lifecycle actions', () => {
    renderKebab(PAYMENT_LINKED);
    expect(screen.queryByTestId('movement-row-edit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('movement-row-process')).not.toBeInTheDocument();
    expect(screen.queryByTestId('movement-row-reactivate')).not.toBeInTheDocument();
    // Because it is posted, Unpost (descontabilizar) applies (ETP-4505 merge)…
    expect(screen.getByTestId(`movement-row-menu-${PAYMENT_LINKED.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('movement-row-unpost')).toBeInTheDocument();
    // …and Eliminar is present rather than hidden.
    expect(screen.getByTestId('movement-row-delete')).toBeInTheDocument();
  });

  // ── funds-transfer delete guard (ETP-5085, inverted by ETP-5111) ───────────
  it('plain G/L movement (no transfer link) keeps Eliminar', () => {
    renderKebab(GL_DRAFT);
    expect(screen.getByTestId('movement-row-delete')).toBeInTheDocument();
  });

  it('a funds-transfer leg shows Eliminar alongside its other applicable actions', () => {
    renderKebab(TRANSFER_LEG);
    expect(screen.getByTestId('movement-row-delete')).toBeInTheDocument();
    // Offering the delete item must not disturb what a leg legitimately still supports:
    // processed and not posted → Reactivar + Contabilizar + partial Editar.
    expect(screen.getByTestId(`movement-row-menu-${TRANSFER_LEG.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('movement-row-reactivate')).toBeInTheDocument();
    expect(screen.getByTestId('movement-row-post')).toBeInTheDocument();
    expect(screen.getByTestId('movement-row-edit')).toBeInTheDocument();
  });

  // A behavioural consequence of retiring the "nothing to offer" early return: the kebab now
  // exists on rows that previously had NO ⋮ at all. A payment-linked draft is exactly that row —
  // and exactly the one whose delete refusal the ticket exists to explain.
  it('renders the menu for a payment-linked draft, which used to have no kebab at all', () => {
    renderKebab(PAYMENT_LINKED_DRAFT);
    expect(screen.getByTestId(`movement-row-menu-${PAYMENT_LINKED_DRAFT.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('movement-row-delete')).toBeInTheDocument();
    // Delete is genuinely the ONLY item — nothing else applies to it.
    expect(screen.queryByTestId('movement-row-edit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('movement-row-process')).not.toBeInTheDocument();
    expect(screen.queryByTestId('movement-row-reactivate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('movement-row-post')).not.toBeInTheDocument();
    expect(screen.queryByTestId('movement-row-unpost')).not.toBeInTheDocument();
  });

  it('a transfer bank fee (BF) keeps Eliminar and deletes through the hook', async () => {
    const user = userEvent.setup();
    const { onReload } = renderKebab(TRANSFER_BANK_FEE);
    expect(screen.getByTestId('movement-row-delete')).toBeInTheDocument();

    await user.click(screen.getByTestId('movement-row-delete'));
    // ETP-5111 — Eliminar confirms first on every row. A BF fee is unblocked and has nothing to
    // undo, so the confirmation is the generic dialog (`batch-delete-confirm`), not the cartel.
    await user.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(deleteMovement).toHaveBeenCalledWith({ id: 'trf-fee' }));
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountTxRowDeleteSuccess');
    expect(onReload).toHaveBeenCalledOnce();
  });
});

/**
 * ETP-5111 — the unified delete rule on this surface: Eliminar is offered on EVERY row, and a row
 * the backend would refuse is answered with the reason instead of a hidden item. The check is
 * client-side (`resolveMovementDeleteBlock`, whose precedence is unit-tested in
 * movementActionEligibility.test.js), so the refusal costs no request and shows no modal.
 *
 * What matters behaviourally, and is asserted below, is the pair: the toast fires AND the hook is
 * never called. A test that only checked the toast would still pass if the delete also went out.
 */
describe('MovementRowKebab — delete is always offered, and explains its refusal', () => {
  /**
   * A blocked row confirms FIRST and only then learns it cannot be deleted. The eligibility check
   * lives in `runConfirmed`, not in the click handler, so the sequence is: click → generic dialog →
   * confirm → reason. Asserted as a sequence rather than an end state, because the interesting
   * failure modes are ordering ones.
   *
   * The three assertions each cover a different regression:
   *   - the toast has NOT fired before confirming — catches the old short-circuit coming back;
   *   - the toast fires exactly once after confirming — catches it firing on click AND on confirm;
   *   - `deleteMovement` is NEVER called even though the user explicitly confirmed. This is the
   *     replacement for the retired "no dialog" assertion, and it is strictly stronger: the old one
   *     caught only the block check being moved below `setConfirm`, whereas this also catches the
   *     likelier bug of wiring the dialog for blocked rows but forgetting the guard in
   *     `runConfirmed` — which would delete the row after the user pressed Eliminar.
   */
  async function expectBlockedWithToast(movement, expectedToast) {
    const user = userEvent.setup();
    const { onReload } = renderKebab(movement);

    await user.click(screen.getByTestId('movement-row-delete'));

    // The generic dialog, not the cartel: nothing is going to be undone, so there are no effects
    // to enumerate (see the routing matrix suite below).
    expect(screen.getByTestId('batch-delete-confirm')).toBeInTheDocument();
    expect(screen.queryByTestId('movement-confirm-modal')).not.toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('batch-delete-confirm'));

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(expectedToast);
    expect(deleteMovement).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  }

  // Cancelling must be just as inert as confirming is refused — no request either way.
  it('a blocked row that is cancelled fires no toast and calls no hook', async () => {
    const user = userEvent.setup();
    const { onReload } = renderKebab(PAYMENT_LINKED);

    await user.click(screen.getByTestId('movement-row-delete'));
    await user.click(screen.getByTestId('Button__batch-delete-cancel'));

    expect(deleteMovement).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();
  });

  // Both sentences are the very `backendError.*` keys BACKEND_ERROR_MAP maps the backend's own 409
  // literals to, so the user reads byte-identical text whether the refusal came from this
  // client-side pre-check or from the server (bulk path, REST, MCP).
  it('a payment-linked movement (pago) toasts the payment reason and never calls the hook', async () => {
    await expectBlockedWithToast(
      PAYMENT_LINKED, 'translated:backendError.paymentMovementNotDeletable',
    );
  });

  it('a receipt-linked movement (cobro) toasts the RECEIPT reason instead', async () => {
    await expectBlockedWithToast(
      RECEIPT_LINKED, 'translated:backendError.receiptMovementNotDeletable',
    );
  });

  // The null case, mirrored from the backend's `Boolean.TRUE.equals(isReceipt())`: an unset flag
  // is a pago on both sides. Pinned here as well as in movementActionEligibility.test.js because
  // this is the surface where the wrong wording would actually be read by a user.
  it('a payment-linked movement with paymentIsReceipt unset reads as a pago', async () => {
    await expectBlockedWithToast(
      PAYMENT_LINKED_FLAG_UNSET, 'translated:backendError.paymentMovementNotDeletable',
    );
  });

  /**
   * The user's correction, asserted directly: the message must not name the payment's document
   * number any more. `PAYMENT_LINKED` deliberately still CARRIES `documentNo: 'PAY-0042'`, so this
   * fails if the interpolation returns — the i18n mock appends any params it is given, and the
   * regex catches the reference arriving by any other route too.
   */
  it('never names the payment document number, even though the row carries one', async () => {
    const user = userEvent.setup();
    renderKebab(PAYMENT_LINKED);

    await user.click(screen.getByTestId('movement-row-delete'));
    await user.click(screen.getByTestId('batch-delete-confirm'));

    const toasted = toastError.mock.calls[0][0];
    expect(toasted).toBe('translated:backendError.paymentMovementNotDeletable');
    expect(toasted).not.toMatch(/PAY-0042|documentNo/);
    // Called with the key ALONE — a second argument is what interpolation would look like.
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('a funds-transfer leg toasts the translated transfer reason and never calls the hook', async () => {
    await expectBlockedWithToast(
      TRANSFER_LEG, 'translated:backendError.transferMovementNotDeletable',
    );
  });

  // The contrast that makes the assertions above mean something: an unblocked row is NOT
  // short-circuited — it reaches the confirm dialog, and the hook runs once confirmed.
  it('an unblocked G/L movement reaches the dialog and deletes on confirm, with no error toast', async () => {
    const user = userEvent.setup();
    const { onReload } = renderKebab(GL_DRAFT);

    await user.click(screen.getByTestId('movement-row-delete'));
    // A draft has nothing to undo, so it gets the generic dialog too.
    expect(screen.getByTestId('batch-delete-confirm')).toBeInTheDocument();
    expect(deleteMovement).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(deleteMovement).toHaveBeenCalledWith({ id: 'gl-draft' }));
    expect(toastError).not.toHaveBeenCalled();
    expect(onReload).toHaveBeenCalledOnce();
  });

  // A bank fee carries the same transferTxnId as a leg but nothing references IT, so it must NOT
  // be caught by the pre-check — the mirror of the eligibility rule, asserted at this level too.
  it('a transfer bank fee (BF) is not blocked by the pre-check', async () => {
    const user = userEvent.setup();
    renderKebab(TRANSFER_BANK_FEE);

    await user.click(screen.getByTestId('movement-row-delete'));
    expect(screen.getByTestId('batch-delete-confirm')).toBeInTheDocument();
    await user.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(deleteMovement).toHaveBeenCalledWith({ id: 'trf-fee' }));
    expect(toastError).not.toHaveBeenCalled();
  });
});

/**
 * ETP-5111 — Eliminar now confirms UNCONDITIONALLY. It used to delete a plain draft on a single
 * click (the old `needsConfirm = isPosted || isReconciled` gate) while the bulk-delete trash
 * confirmed every selection, so the same destructive act had two different levels of protection
 * depending on which control the user reached for.
 *
 * `needsConfirm` still exists but now gates REACTIVAR only — which is why the reactivate side is
 * re-asserted here rather than assumed: the two paths share one `confirm` state, and collapsing
 * them would show a dialog for a merely-Processed reactivate that never used to have one.
 */
/**
 * ETP-5111 — WHICH confirmation, decided by what is actually at stake:
 *
 *   showCartel = confirm === 'reactivate' || (confirm === 'delete' && !deleteBlock && needsConfirm)
 *
 * The cartel (`MovementLifecycleConfirmModal`) enumerates the desconciliación and the asiento
 * contable that deleting a posted/reconciled movement will undo. The generic dialog
 * (`DeleteConfirmDialog`, the very component the bulk trash renders) just asks for confirmation.
 *
 * The row that matters most here is **blocked AND posted**: it takes the generic dialog, because
 * the cartel would otherwise promise to reverse an asiento for a delete that never happens — the
 * same class of false assertion as the old `'posted'` fallthrough on a draft. It is also the one
 * case where the two conditions of `showCartel` disagree, so a refactor that dropped `!deleteBlock`
 * would still pass every other row in this matrix.
 *
 * Asserted by the presence of one dialog and the ABSENCE of the other, in both directions — a
 * one-sided assertion would pass if both somehow rendered.
 */
describe('MovementRowKebab — which confirmation the row gets', () => {
  const CARTEL = 'movement-confirm-modal';
  const GENERIC = 'batch-delete-confirm';

  it.each([
    // [label, movement, action-testid to click, expected dialog]
    ['Eliminar on a posted movement', { id: 'r-posted', posted: 'Y', processed: true }, 'movement-row-delete', CARTEL],
    ['Eliminar on a reconciled movement', { id: 'r-rec', posted: 'N', processed: true, paymentStatus: 'RPPC' }, 'movement-row-delete', CARTEL],
    ['Eliminar on a plain draft', GL_DRAFT, 'movement-row-delete', GENERIC],
    ['Eliminar on a blocked (payment-linked) POSTED row', PAYMENT_LINKED, 'movement-row-delete', GENERIC],
    ['Eliminar on a blocked (transfer leg) row', TRANSFER_LEG, 'movement-row-delete', GENERIC],
    ['Reactivar on a posted movement', { id: 'r-react', posted: 'Y', processed: true }, 'movement-row-reactivate', CARTEL],
  ])('%s gets the expected dialog', async (_label, movement, trigger, expected) => {
    const user = userEvent.setup();
    renderKebab(movement);

    await user.click(screen.getByTestId(trigger));

    const other = expected === CARTEL ? GENERIC : CARTEL;
    expect(screen.getByTestId(expected)).toBeInTheDocument();
    expect(screen.queryByTestId(other)).not.toBeInTheDocument();
  });

  /**
   * The blocked+posted row in detail: the generic dialog it gets must carry NONE of the cartel's
   * effect copy. Asserted by name, because a test that only checked "the generic dialog is present"
   * would pass even if the cartel rendered alongside it and promised the asiento anyway.
   */
  it('a blocked, posted row is never told an asiento or a conciliación will be undone', async () => {
    const user = userEvent.setup();
    renderKebab(PAYMENT_LINKED);

    await user.click(screen.getByTestId('movement-row-delete'));

    for (const key of [
      'financeAccountTxConfirmDeleteSubPostedOnly',
      'financeAccountTxConfirmDeleteSubReconciledOnly',
      'financeAccountTxConfirmDeleteSubBoth',
      'financeAccountTxConfirmWarningPostedOnly',
      'financeAccountTxConfirmWarningReconciledOnly',
      'financeAccountTxConfirmWarningBoth',
    ]) {
      expect(screen.queryByText(key)).not.toBeInTheDocument();
    }
    // No effect bullets either (they render with a trailing period — see LifecycleConfirmModal).
    expect(screen.queryByText('reactivarItem1Title.')).not.toBeInTheDocument();
    expect(screen.queryByText('reactivarItem3Title.')).not.toBeInTheDocument();
    // And no "Eliminar de todos modos" — that label only makes sense over a warning box.
    expect(screen.queryByText('financeAccountTxConfirmDeleteBtn')).not.toBeInTheDocument();
  });

  // The cartel side of the same guarantee, kept explicit so the routing change cannot quietly
  // downgrade the most destructive case. The user protected this specifically.
  it.each([
    ['posted only', { id: 'c-posted', posted: 'Y', processed: true }, 'financeAccountTxConfirmWarningPostedOnly'],
    ['reconciled only', { id: 'c-rec', posted: 'N', processed: true, paymentStatus: 'RPPC' }, 'financeAccountTxConfirmWarningReconciledOnly'],
    ['both', { id: 'c-both', posted: 'Y', processed: true, paymentStatus: 'RPPC' }, 'financeAccountTxConfirmWarningBoth'],
  ])('an unblocked %s row still gets the full cartel, with its warning', async (_label, movement, warningKey) => {
    const user = userEvent.setup();
    renderKebab(movement);

    await user.click(screen.getByTestId('movement-row-delete'));

    expect(screen.getByTestId(CARTEL)).toBeInTheDocument();
    expect(screen.getByText(warningKey)).toBeInTheDocument();
    expect(screen.getByText('financeAccountTxConfirmDeleteBtn')).toBeInTheDocument();
    expect(screen.queryByTestId(GENERIC)).not.toBeInTheDocument();
  });
});

describe('MovementRowKebab — Eliminar always confirms first', () => {
  it.each([
    ['a plain draft', GL_DRAFT, 'gl-draft'],
    ['a merely-Processed movement (not posted, not reconciled)', { id: 'gl-pnp2', posted: 'N', processed: true }, 'gl-pnp2'],
  ])('opens the dialog for %s, and only deletes once confirmed', async (_label, movement, id) => {
    const user = userEvent.setup();
    const { onReload } = renderKebab(movement);

    await user.click(screen.getByTestId('movement-row-delete'));

    // The click itself must not delete anything any more. Both rows have nothing to undo, so the
    // confirmation is the generic dialog.
    expect(screen.getByTestId('batch-delete-confirm')).toBeInTheDocument();
    expect(deleteMovement).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(deleteMovement).toHaveBeenCalledWith({ id }));
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountTxRowDeleteSuccess');
    expect(onReload).toHaveBeenCalledOnce();
  });

  // Dismissing the dialog must leave the row alone — the escape hatch the confirmation exists for.
  it('deletes nothing when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    const { onReload } = renderKebab(GL_DRAFT);

    await user.click(screen.getByTestId('movement-row-delete'));
    await user.click(screen.getByTestId('Button__batch-delete-cancel'));

    expect(deleteMovement).not.toHaveBeenCalled();
    expect(onReload).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  // Reactivar keeps the OLD gate: nothing to undo on a merely-Processed movement, so no dialog.
  it('still reactivates a merely-Processed movement without a dialog (needsConfirm is unchanged there)', async () => {
    const user = userEvent.setup();
    renderKebab({ id: 'gl-proc4', posted: 'N', processed: true });

    await user.click(screen.getByTestId('movement-row-reactivate'));

    expect(screen.queryByTestId('movement-confirm-modal')).not.toBeInTheDocument();
    await waitFor(() => expect(reactivateMovement).toHaveBeenCalledWith({ id: 'gl-proc4' }));
  });
});

// ETP-5085. The row-level guard only covers rows whose transfer link the list actually exposes; a
// legacy transfer (created before the mirror FK column existed) still reaches the backend and comes
// back as the 409. The hook now propagates that sentence verbatim instead of wrapping it in
// `HTTP <status>: <raw body>`, so the kebab can look it up in BACKEND_ERROR_MAP and translate it —
// what the user must never read is the English original.
describe('MovementRowKebab — backend rejection is translated', () => {
  const LEGACY_TRANSFER_LEG = { id: 'legacy-leg', posted: 'N', processed: false };

  it('shows the translated message when the backend guard rejects the delete', async () => {
    const rejection = new Error(TRANSFER_NOT_DELETABLE);
    rejection.status = 409;
    deleteMovement.mockRejectedValue(rejection);

    const user = userEvent.setup();
    const { onReload } = renderKebab(LEGACY_TRANSFER_LEG);
    // The row carries no transferTxnId, so the client-side pre-check does NOT block it: the delete
    // is attempted and the backend's own 409 is what has to be translated. Since ETP-5111 that
    // attempt goes through a confirmation first — the generic one, this row being an unblocked
    // draft with nothing to undo.
    await user.click(screen.getByTestId('movement-row-delete'));
    await user.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(toastError).toHaveBeenCalledWith('translated:backendError.transferMovementNotDeletable');
    expect(toastError).not.toHaveBeenCalledWith(TRANSFER_NOT_DELETABLE);
    expect(onReload).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  // Regression on the SHAPE of the old bug: `HTTP 500: {"error":{"message":…}}` is not a
  // BACKEND_ERROR_MAP key, so a wrapped message could only ever reach the toast raw.
  it('never receives an HTTP-status-wrapped message from the hook', async () => {
    const rejection = new Error(TRANSFER_NOT_DELETABLE);
    rejection.status = 409;
    deleteMovement.mockRejectedValue(rejection);

    const user = userEvent.setup();
    renderKebab(LEGACY_TRANSFER_LEG);
    await user.click(screen.getByTestId('movement-row-delete'));
    await user.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(toastError).toHaveBeenCalledOnce());
    expect(toastError.mock.calls[0][0]).not.toMatch(/HTTP \d+/);
  });
});

describe('MovementRowKebab — lifecycle actions', () => {
  it('Procesar calls processMovement with { id }, then toast.success + onReload', async () => {
    const user = userEvent.setup();
    const { onReload } = renderKebab(GL_DRAFT);
    await user.click(screen.getByTestId('movement-row-process'));

    await waitFor(() => expect(processMovement).toHaveBeenCalledWith({ id: 'gl-draft' }));
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountTxRowProcessSuccess');
    expect(onReload).toHaveBeenCalledOnce();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('Editar invokes onEdit with the movement (no hook call)', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    renderKebab(GL_DRAFT, onEdit);
    await user.click(screen.getByTestId('movement-row-edit'));

    expect(onEdit).toHaveBeenCalledWith(GL_DRAFT);
    expect(processMovement).not.toHaveBeenCalled();
  });

  it('Reactivar opens the confirm dialog, then calls reactivateMovement on accept', async () => {
    const user = userEvent.setup();
    const { onReload } = renderKebab(GL_PROCESSED);
    await user.click(screen.getByTestId('movement-row-reactivate'));

    // A confirmation dialog is shown before running the destructive action.
    expect(screen.getByTestId('movement-confirm-modal')).toBeInTheDocument();
    expect(reactivateMovement).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('movement-confirm-accept'));
    await waitFor(() => expect(reactivateMovement).toHaveBeenCalledWith({ id: 'gl-proc' }));
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountTxRowReactivateSuccess');
    expect(onReload).toHaveBeenCalledOnce();
  });

  // ETP-5111 — the former "Eliminar on a Draft removes it directly (no confirm dialog)" test lived
  // here. Its premise is inverted: a draft now confirms like every other row. The replacement is
  // the parametrized "Eliminar always confirms first" describe above, which covers the draft and
  // the merely-Processed row together rather than only the draft.

  it('Eliminar on a Processed & posted movement confirms first, then calls deleteMovement', async () => {
    const user = userEvent.setup();
    // Posted (contabilizado) → there is something to undo → confirm.
    const { onReload } = renderKebab({ id: 'gl-proc2', posted: 'Y', processed: true });
    await user.click(screen.getByTestId('movement-row-delete'));

    expect(screen.getByTestId('movement-confirm-modal')).toBeInTheDocument();
    expect(deleteMovement).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('movement-confirm-accept'));
    await waitFor(() => expect(deleteMovement).toHaveBeenCalledWith({ id: 'gl-proc2' }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('Reactivar a merely-Processed (not posted/reconciled) movement runs directly, no dialog', async () => {
    const user = userEvent.setup();
    const { onReload } = renderKebab({ id: 'gl-proc3', posted: 'N', processed: true });
    await user.click(screen.getByTestId('movement-row-reactivate'));

    expect(screen.queryByTestId('movement-confirm-modal')).not.toBeInTheDocument();
    await waitFor(() => expect(reactivateMovement).toHaveBeenCalledWith({ id: 'gl-proc3' }));
    expect(onReload).toHaveBeenCalledOnce();
  });

  it('surfaces toast.error and skips onReload when the hook rejects', async () => {
    processMovement.mockRejectedValue(new Error('Cannot process'));
    const user = userEvent.setup();
    const { onReload } = renderKebab(GL_DRAFT);
    await user.click(screen.getByTestId('movement-row-process'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Cannot process'));
    expect(onReload).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('falls back to the error label key when the rejection has no message', async () => {
    deleteMovement.mockRejectedValue(new Error(''));
    const user = userEvent.setup();
    renderKebab(GL_DRAFT);
    await user.click(screen.getByTestId('movement-row-delete'));
    await user.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('financeAccountTxRowDeleteError'));
  });
});
