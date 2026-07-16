// Unit tests for the G/L-transaction lifecycle actions added to the movement
// row kebab (ETP-4500): Confirmar / Reactivar / Eliminar. These are shown ONLY
// for manual G/L transactions (no `paymentId`); the visibility matrix and each
// action's hook call + toast + onReload wiring are verified here. The existing
// MovementRowKebab.vitest.jsx (Post action) is left untouched.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
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
// Payment-linked: has paymentId → none of the three lifecycle actions.
const PAYMENT_LINKED = { id: 'pay-1', posted: 'Y', processed: true, paymentId: 'p-1' };

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

  it('payment-linked, posted movement exposes only Unpost (no G/L lifecycle actions)', () => {
    renderKebab(PAYMENT_LINKED);
    // All G/L-only actions are hidden — this movement is managed from the Payments module.
    expect(screen.queryByTestId('movement-row-edit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('movement-row-process')).not.toBeInTheDocument();
    expect(screen.queryByTestId('movement-row-reactivate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('movement-row-delete')).not.toBeInTheDocument();
    // But because it is posted, Unpost (descontabilizar) keeps the kebab alive (ETP-4505 merge).
    expect(screen.getByTestId(`movement-row-menu-${PAYMENT_LINKED.id}`)).toBeInTheDocument();
    expect(screen.getByTestId('movement-row-unpost')).toBeInTheDocument();
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

  it('Eliminar on a Draft removes it directly (no confirm dialog)', async () => {
    const user = userEvent.setup();
    const { onReload } = renderKebab(GL_DRAFT);
    await user.click(screen.getByTestId('movement-row-delete'));

    expect(screen.queryByTestId('movement-confirm-modal')).not.toBeInTheDocument();
    await waitFor(() => expect(deleteMovement).toHaveBeenCalledWith({ id: 'gl-draft' }));
    expect(toastSuccess).toHaveBeenCalledWith('financeAccountTxRowDeleteSuccess');
    expect(onReload).toHaveBeenCalledOnce();
  });

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

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('financeAccountTxRowDeleteError'));
  });
});
