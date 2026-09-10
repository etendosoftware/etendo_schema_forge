import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));

// Radix only mounts TooltipContent while the tooltip is open, and opening it needs a real hover
// with its delay timers — unreachable here, where the trigger also sits inside a DropdownMenu.
// Flattening the primitives renders the tip inline so the WORDING can be asserted; the
// open/close behaviour is Radix's own and not what these tests are about. Same mock
// MovementRowKebab.vitest.jsx already uses.
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }) => <div>{children}</div>,
  Tooltip: ({ children }) => <div>{children}</div>,
  TooltipTrigger: ({ children }) => <div>{children}</div>,
  TooltipContent: ({ children }) => <div>{children}</div>,
}));

import { StatementRowKebab } from '../StatementRowKebab.jsx';

const DRAFT = { id: 'd1', status: 'DRAFT', processed: 'N' };
const PROCESSED = { id: 'p1', status: 'PENDING', processed: 'Y' };

function renderKebab(statement, overrides = {}) {
  const props = {
    statement,
    onProcess: vi.fn(),
    onReactivate: vi.fn(),
    ...overrides,
  };
  return { ...render(<StatementRowKebab {...props} />), props };
}

async function openMenu(user, id) {
  await user.click(screen.getByTestId(`statement-row-menu-${id}`));
}

describe('StatementRowKebab', () => {
  it('enables Procesar for a draft and fires the callback (Reactivar disabled)', async () => {
    const user = userEvent.setup();
    const { props } = renderKebab(DRAFT);
    await openMenu(user, 'd1');

    expect(screen.getByTestId('statement-row-reactivate')).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByTestId('statement-row-process'));
    expect(props.onProcess).toHaveBeenCalledWith(DRAFT);
  });

  it('disables Procesar for a processed statement', async () => {
    const user = userEvent.setup();
    const { props } = renderKebab(PROCESSED);
    await openMenu(user, 'p1');

    const process = screen.getByTestId('statement-row-process');
    expect(process).toHaveAttribute('aria-disabled', 'true');
    await user.click(process);
    expect(props.onProcess).not.toHaveBeenCalled();
  });

  it('enables Reactivate only for a processed statement and fires the callback', async () => {
    const user = userEvent.setup();
    const { props } = renderKebab(PROCESSED);
    await openMenu(user, 'p1');
    await user.click(screen.getByTestId('statement-row-reactivate'));
    expect(props.onReactivate).toHaveBeenCalledWith(PROCESSED);
  });

  it('disables Reactivate for a draft statement', async () => {
    const user = userEvent.setup();
    const { props } = renderKebab(DRAFT);
    await openMenu(user, 'd1');
    const reactivate = screen.getByTestId('statement-row-reactivate');
    expect(reactivate).toHaveAttribute('aria-disabled', 'true');
    await user.click(reactivate);
    expect(props.onReactivate).not.toHaveBeenCalled();
  });

  it('treats a statement with processed="N" as a draft even without DRAFT status', async () => {
    const user = userEvent.setup();
    const { props } = renderKebab({ id: 'x', status: 'PARTIAL', processed: 'N' });
    await openMenu(user, 'x');
    await user.click(screen.getByTestId('statement-row-process'));
    expect(props.onProcess).toHaveBeenCalled();
  });

  /**
   * ETP-4921 — a PSD2-connected account's statements come from the bank and must not be
   * hand-edited. Reactivar is the only door left open (Edit and Delete already hide themselves
   * once a statement is processed, and reactivating is what would reopen them), so closing it
   * here is what makes the account read-only.
   */
  describe('bank-connected account', () => {
    it('disables Reactivar even on a processed statement', async () => {
      const user = userEvent.setup();
      const { props } = renderKebab(PROCESSED, { bankConnected: true });
      await openMenu(user, 'p1');

      const reactivate = screen.getByTestId('statement-row-reactivate');
      expect(reactivate).toHaveAttribute('aria-disabled', 'true');
      await user.click(reactivate);
      expect(props.onReactivate).not.toHaveBeenCalled();
    });

    // Its own wording: the user must not be left thinking this unblocks by processing or
    // reactivating something, the way the plain "already processed" copy would suggest.
    it('explains the block with the bank-connected reason, not the processed one', async () => {
      const user = userEvent.setup();
      renderKebab(PROCESSED, { bankConnected: true });
      await openMenu(user, 'p1');

      expect(screen.getByText('financeAccountStatementsRowBankSyncedTooltip')).toBeInTheDocument();
      expect(screen.queryByText('financeAccountStatementsRowReactivateTooltip')).toBeNull();
    });

    // Completing a draft is not editing its content, so Procesar keeps working.
    it('leaves Procesar available on a draft', async () => {
      const user = userEvent.setup();
      const { props } = renderKebab(DRAFT, { bankConnected: true });
      await openMenu(user, 'd1');

      await user.click(screen.getByTestId('statement-row-process'));
      expect(props.onProcess).toHaveBeenCalledWith(DRAFT);
    });

    // Guard against over-correcting: an unconnected account keeps the original behaviour.
    it('does not change anything when the account is not connected', async () => {
      const user = userEvent.setup();
      const { props } = renderKebab(PROCESSED, { bankConnected: false });
      await openMenu(user, 'p1');

      await user.click(screen.getByTestId('statement-row-reactivate'));
      expect(props.onReactivate).toHaveBeenCalledWith(PROCESSED);
    });
  });
});
