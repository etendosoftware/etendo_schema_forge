/**
 * Rendering suite for BankConnectionFlowUI — the two native surfaces of the bank
 * connect flow driven by `useBankConnectionFlow`:
 *
 *  - a NON-dismissable "waiting for bank authentication" overlay while the Salt Edge
 *    popup is open (`flow.connecting`);
 *  - the bank-account selection modal shown when the connection returns accounts
 *    (`flow.selection`), which confirms with the id of the picked account.
 *
 * A companion source-level guard lives in `BankConnectionFlowUI.test.js`; this suite
 * mounts the real component (real radix dialog primitives) so the behaviour — not just
 * the source shape — is asserted.
 */
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Params are appended so a parameterised key stays distinguishable from its bare form.
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => (vars ? `${key}|${Object.values(vars).join(',')}` : key),
}));

import { BankConnectionFlowUI } from '../BankConnectionFlowUI.jsx';

const ACCOUNTS = [
  { saltEdgeAccountId: 'se-1', name: 'Cuenta Nómina', iban: 'ES1111', currency: 'EUR' },
  { saltEdgeAccountId: 'se-2', iban: 'ES2222', currency: 'USD' },
  { saltEdgeAccountId: 'se-3' },
];

function makeFlow(overrides = {}) {
  return {
    connecting: false,
    selection: null,
    confirmSelection: vi.fn(),
    cancelSelection: vi.fn(),
    ...overrides,
  };
}

function renderFlow(overrides = {}) {
  const flow = makeFlow(overrides);
  return { flow, ...render(<BankConnectionFlowUI flow={flow} />) };
}

describe('BankConnectionFlowUI — idle', () => {
  it('renders neither surface when not connecting and with no selection', () => {
    renderFlow();

    expect(screen.queryByTestId('bank-connection-connecting-overlay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bank-connection-account-select-modal')).not.toBeInTheDocument();
  });
});

describe('BankConnectionFlowUI — connecting overlay', () => {
  it('shows the overlay with the spinner label and the hint while connecting', () => {
    renderFlow({ connecting: true });

    const overlay = screen.getByTestId('bank-connection-connecting-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveTextContent('financeAccountsBankConnectionConnecting');
    expect(overlay).toHaveTextContent('financeAccountsBankConnectionConnectingHint');
  });

  it('does not open the account-select modal while merely connecting', () => {
    renderFlow({ connecting: true });

    expect(screen.queryByTestId('bank-connection-account-select-modal')).not.toBeInTheDocument();
  });

  it('stays open when Escape is pressed (escape is prevented)', () => {
    renderFlow({ connecting: true });

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(screen.getByTestId('bank-connection-connecting-overlay')).toBeInTheDocument();
  });

  it('stays open on a pointer-down outside the overlay (outside interaction is prevented)', async () => {
    renderFlow({ connecting: true });

    // The dismissable layer attaches its document listener on a 0ms timer.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    fireEvent.pointerDown(document.body);

    expect(screen.getByTestId('bank-connection-connecting-overlay')).toBeInTheDocument();
  });

  it('exposes no operable close control — the always-rendered dialog X is hidden (ETP-5102)', () => {
    renderFlow({ connecting: true });

    const overlay = screen.getByTestId('bank-connection-connecting-overlay');

    // `DialogContent` always renders its own close button and offers no prop to
    // disable it; since this overlay's `<Dialog>` has no `onOpenChange`, that X
    // would be a visible no-op. It is suppressed with the `[&>button]:hidden`
    // direct-child variant, so the guard has two halves:
    //
    //  1. the close control is still a DIRECT child of the styled element — that
    //     is exactly what the `>` combinator selects, so if the core ever wraps it
    //     the rule silently stops applying and this fails;
    //  2. the element that carries the rule is the overlay itself.
    //
    // Scoping by accessible name keeps the test green if a legitimate button is
    // added inside the modal later; `toBeVisible()` is deliberately NOT used
    // because jsdom does not compile Tailwind, so an arbitrary variant produces
    // no computed style and the button would read as visible either way.
    const closeControl = within(overlay).getByRole('button', { name: /close/i });
    expect(closeControl.parentElement).toBe(overlay);
    expect(overlay).toHaveClass('[&>button]:hidden');
  });
});

describe('BankConnectionFlowUI — account select modal', () => {
  it('opens with one option per returned account', () => {
    renderFlow({ selection: { accounts: ACCOUNTS } });

    expect(screen.getByTestId('bank-connection-account-select-modal')).toBeInTheDocument();
    expect(screen.getByTestId('bank-connection-account-option-se-1')).toBeInTheDocument();
    expect(screen.getByTestId('bank-connection-account-option-se-2')).toBeInTheDocument();
    expect(screen.getByTestId('bank-connection-account-option-se-3')).toBeInTheDocument();
  });

  it('labels each option with name, then iban, then the raw id as a fallback', () => {
    renderFlow({ selection: { accounts: ACCOUNTS } });

    expect(screen.getByTestId('bank-connection-account-option-se-1')).toHaveTextContent('Cuenta Nómina');
    // No name → the iban becomes the primary label…
    expect(screen.getByTestId('bank-connection-account-option-se-2')).toHaveTextContent('ES2222');
    // …and with neither name nor iban the Salt Edge id is shown.
    expect(screen.getByTestId('bank-connection-account-option-se-3')).toHaveTextContent('se-3');
  });

  it('renders the iban and currency on the option subtitle joined by a separator', () => {
    renderFlow({ selection: { accounts: ACCOUNTS } });

    expect(screen.getByTestId('bank-connection-account-option-se-1')).toHaveTextContent('ES1111 · EUR');
  });

  it('renders the generic title and no logo when the provider is unknown', () => {
    renderFlow({ selection: { accounts: ACCOUNTS } });

    const modal = screen.getByTestId('bank-connection-account-select-modal');
    expect(modal).toHaveTextContent('financeAccountsBankConnectionSelectTitle');
    expect(modal).toHaveTextContent('financeAccountsBankConnectionSelectHint');
    expect(modal.querySelector('img')).toBeNull();
  });

  it('renders a bank-aware title and the provider logo when the provider is known', () => {
    renderFlow({
      selection: { accounts: ACCOUNTS, providerName: 'BBVA', providerLogoUrl: 'https://cdn/bbva.png' },
    });

    const modal = screen.getByTestId('bank-connection-account-select-modal');
    expect(modal).toHaveTextContent('financeAccountsBankConnectionSelectTitleBank|BBVA');
    expect(modal.querySelector('img')).toHaveAttribute('src', 'https://cdn/bbva.png');
  });

  it('renders an empty option list when the selection carries no accounts', () => {
    renderFlow({ selection: {} });

    expect(screen.getByTestId('bank-connection-account-select-modal')).toBeInTheDocument();
    expect(screen.queryByTestId(/^bank-connection-account-option-/)).not.toBeInTheDocument();
  });

  it('disables confirm until an account is picked', async () => {
    const user = userEvent.setup();
    renderFlow({ selection: { accounts: ACCOUNTS } });

    const confirm = screen.getByTestId('bank-connection-account-select-confirm');
    expect(confirm).toBeDisabled();

    await user.click(screen.getByTestId('bank-connection-account-option-se-2'));

    expect(confirm).toBeEnabled();
  });

  it('confirms with the id of the picked account', async () => {
    const user = userEvent.setup();
    const { flow } = renderFlow({ selection: { accounts: ACCOUNTS } });

    await user.click(screen.getByTestId('bank-connection-account-option-se-2'));
    await user.click(screen.getByTestId('bank-connection-account-select-confirm'));

    expect(flow.confirmSelection).toHaveBeenCalledWith('se-2');
  });

  it('confirms with the LAST picked account when the user changes their mind', async () => {
    const user = userEvent.setup();
    const { flow } = renderFlow({ selection: { accounts: ACCOUNTS } });

    await user.click(screen.getByTestId('bank-connection-account-option-se-1'));
    await user.click(screen.getByTestId('bank-connection-account-option-se-3'));
    await user.click(screen.getByTestId('bank-connection-account-select-confirm'));

    expect(flow.confirmSelection).toHaveBeenCalledTimes(1);
    expect(flow.confirmSelection).toHaveBeenCalledWith('se-3');
  });

  it('cancels the selection from the cancel button', async () => {
    const user = userEvent.setup();
    const { flow } = renderFlow({ selection: { accounts: ACCOUNTS } });

    await user.click(screen.getByTestId('bank-connection-account-select-cancel'));

    expect(flow.cancelSelection).toHaveBeenCalled();
    expect(flow.confirmSelection).not.toHaveBeenCalled();
  });

  it('cancels the selection when the modal is dismissed with Escape', () => {
    const { flow } = renderFlow({ selection: { accounts: ACCOUNTS } });

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    expect(flow.cancelSelection).toHaveBeenCalled();
  });
});
