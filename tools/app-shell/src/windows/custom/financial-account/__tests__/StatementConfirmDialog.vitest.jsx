// @covers tools/app-shell/src/windows/custom/financial-account/StatementConfirmDialog.jsx
/**
 * Rendering suite for StatementConfirmDialog — the confirmation dialog shared by the
 * "Process", "Reactivate" and "Delete" row actions of an imported statement.
 *
 * What is load-bearing here: the copy switches on `variant` through a key triple map
 * (so the JSX stays free of nested ternaries), the statement name is interpolated into
 * the body, the confirm button is destructive ONLY for deletion, and `busy` locks both
 * buttons while the mutation is in flight.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Params are appended so an interpolated key stays distinguishable from its bare form.
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => (vars ? `${key}|${Object.values(vars).join(',')}` : key),
}));

import { StatementConfirmDialog } from '../StatementConfirmDialog.jsx';

const STATEMENT = { id: 'st-1', name: 'Extracto marzo', documentNo: 'EXT-0003' };

function renderDialog(props = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  const result = render(
    <StatementConfirmDialog
      variant="process"
      statement={STATEMENT}
      busy={false}
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  );
  return { onConfirm, onClose, ...result };
}

describe('StatementConfirmDialog — open/closed', () => {
  it('stays closed when no variant is active', () => {
    renderDialog({ variant: null });

    expect(screen.queryByTestId('statement-confirm-dialog')).not.toBeInTheDocument();
  });

  it('stays closed when there is no statement to act on', () => {
    renderDialog({ statement: null });

    expect(screen.queryByTestId('statement-confirm-dialog')).not.toBeInTheDocument();
  });

  it('opens once both a variant and a statement are given', () => {
    renderDialog();

    expect(screen.getByTestId('statement-confirm-dialog')).toBeInTheDocument();
  });
});

describe('StatementConfirmDialog — per-variant copy', () => {
  it('uses the process copy and a non-destructive confirm', () => {
    renderDialog({ variant: 'process' });

    const dialog = screen.getByTestId('statement-confirm-dialog');
    expect(dialog).toHaveTextContent('financeAccountStatementsProcessTitle');
    expect(dialog).toHaveTextContent('financeAccountStatementsProcessBody|Extracto marzo');
    const confirm = screen.getByTestId('statement-confirm-action');
    expect(confirm).toHaveTextContent('financeAccountStatementsProcessConfirm');
    expect(confirm.className).not.toContain('bg-destructive');
  });

  it('uses the reactivate copy and a non-destructive confirm', () => {
    renderDialog({ variant: 'reactivate' });

    const dialog = screen.getByTestId('statement-confirm-dialog');
    expect(dialog).toHaveTextContent('financeAccountStatementsReactivateTitle');
    expect(dialog).toHaveTextContent('financeAccountStatementsReactivateBody|Extracto marzo');
    const confirm = screen.getByTestId('statement-confirm-action');
    expect(confirm).toHaveTextContent('financeAccountStatementsReactivateConfirm');
    expect(confirm.className).not.toContain('bg-destructive');
  });

  it('uses the delete copy and marks the confirm as destructive', () => {
    renderDialog({ variant: 'delete' });

    const dialog = screen.getByTestId('statement-confirm-dialog');
    expect(dialog).toHaveTextContent('financeAccountStatementsDeleteTitle');
    expect(dialog).toHaveTextContent('financeAccountStatementsDeleteBody|Extracto marzo');
    const confirm = screen.getByTestId('statement-confirm-action');
    expect(confirm).toHaveTextContent('financeAccountStatementsDeleteConfirm');
    expect(confirm.className).toContain('bg-destructive');
  });

  it('falls back to the process copy for an unmapped variant', () => {
    renderDialog({ variant: 'somethingElse' });

    expect(screen.getByTestId('statement-confirm-action'))
      .toHaveTextContent('financeAccountStatementsProcessConfirm');
    expect(screen.getByTestId('statement-confirm-dialog'))
      .toHaveTextContent('financeAccountStatementsProcessTitle');
  });

  it('always offers a cancel control', () => {
    renderDialog();

    expect(screen.getByText('financeAccountStatementsManualCancel')).toBeInTheDocument();
  });
});

describe('StatementConfirmDialog — statement name interpolation', () => {
  it('prefers the statement name', () => {
    renderDialog({ statement: { name: 'Extracto abril', documentNo: 'EXT-0004' } });

    expect(screen.getByTestId('statement-confirm-dialog'))
      .toHaveTextContent('financeAccountStatementsProcessBody|Extracto abril');
  });

  it('falls back to the document number when the statement has no name', () => {
    renderDialog({ statement: { documentNo: 'EXT-0004' } });

    expect(screen.getByTestId('statement-confirm-dialog'))
      .toHaveTextContent('financeAccountStatementsProcessBody|EXT-0004');
  });

  it('interpolates an empty name when the statement carries neither', () => {
    renderDialog({ statement: { id: 'st-9' } });

    expect(screen.getByTestId('statement-confirm-dialog'))
      .toHaveTextContent('financeAccountStatementsProcessBody|');
  });
});

describe('StatementConfirmDialog — actions', () => {
  it('confirms through onConfirm', async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderDialog();

    await user.click(screen.getByTestId('statement-confirm-action'));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes through onClose from the cancel button', async () => {
    const user = userEvent.setup();
    const { onConfirm, onClose } = renderDialog();

    await user.click(screen.getByText('financeAccountStatementsManualCancel'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes through onClose when dismissed with Escape', () => {
    const { onClose } = renderDialog();

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('locks both buttons while busy', () => {
    renderDialog({ busy: true });

    expect(screen.getByTestId('statement-confirm-action')).toBeDisabled();
    expect(screen.getByText('financeAccountStatementsManualCancel').closest('button')).toBeDisabled();
  });
});

/**
 * ETP-6151 — optional `notice`, rendered under the description: the Imported Statements tab passes
 * the bank re-import warning there when deleting a statement of a bank-connected account.
 */
describe('StatementConfirmDialog — notice', () => {
  it('renders the notice under the description, before the actions', () => {
    renderDialog({ variant: 'delete', notice: <p data-testid="host-notice">Heads up</p> });

    const notice = screen.getByTestId('host-notice');
    expect(screen.getByTestId('statement-confirm-dialog')).toContainElement(notice);
    const description = screen.getByText('financeAccountStatementsDeleteBody|Extracto marzo');
    expect(description).not.toContainElement(notice);
    // eslint-disable-next-line no-bitwise
    expect(description.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // eslint-disable-next-line no-bitwise
    expect(notice.compareDocumentPosition(screen.getByTestId('statement-confirm-action'))
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // Unchanged when null: the header is still followed directly by the footer, as before the prop.
  it.each([
    ['omitted', {}],
    ['null', { notice: null }],
  ])('adds nothing between the header and the footer when the notice is %s', (_label, extra) => {
    renderDialog({ variant: 'delete', ...extra });

    expect(screen.getByTestId('DialogHeader__858de3').nextElementSibling)
      .toBe(screen.getByTestId('DialogFooter__858de3'));
  });

  it('keeps its original max-w-md content class when no notice is given, and switches only with one', () => {
    const { unmount } = renderDialog({ variant: 'delete' });
    const plain = screen.getByTestId('statement-confirm-dialog').className;
    unmount();
    expect(plain).toContain('max-w-md');
    expect(plain).not.toContain('bg-card');

    renderDialog({ variant: 'delete', notice: <p>n</p> });
    expect(screen.getByTestId('statement-confirm-dialog').className).toContain('bg-card');
  });

  it('renders nothing while closed, notice included', () => {
    renderDialog({ variant: null, notice: <p data-testid="host-notice">Heads up</p> });

    expect(screen.queryByTestId('host-notice')).toBeNull();
  });
});
