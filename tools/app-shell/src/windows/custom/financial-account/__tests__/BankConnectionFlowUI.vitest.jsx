// @covers tools/app-shell/src/windows/custom/financial-account/BankConnectionFlowUI.jsx
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

// ETP-6151 — flag `psd2-statement-import-settings`. These suites describe the flag-on behaviour,
// so it defaults to on; the final block flips it off.
const importSettingsFlag = vi.hoisted(() => ({ on: true }));
vi.mock('@/hooks/usePsd2ImportSettingsFlag.js', () => ({
  usePsd2ImportSettingsFlag: () => importSettingsFlag.on,
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

/**
 * ETP-6151 — "Vincular cuenta" also needs the statement grouping (the date has a default). Opens
 * the grouping select and picks the option.
 */
async function pickGrouping(user, id = '1BM') {
  await user.click(screen.queryByTestId('field-statementGrouping-chip')
    ?? screen.getByTestId('field-statementGrouping'));
  await user.click(await screen.findByTestId(`option-statementGrouping-${id}`));
}

/** The default "Importar desde": first day of the current month, from local getters. */
function firstOfCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
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

  it('disables confirm until an account and a grouping are picked', async () => {
    const user = userEvent.setup();
    renderFlow({ selection: { accounts: ACCOUNTS } });

    const confirm = screen.getByTestId('bank-connection-account-select-confirm');
    expect(confirm).toBeDisabled();

    await user.click(screen.getByTestId('bank-connection-account-option-se-2'));
    // ETP-6151 — the grouping starts empty and is required.
    expect(confirm).toBeDisabled();

    await pickGrouping(user);

    expect(confirm).toBeEnabled();
  });

  it('confirms with the id of the picked account and the import settings', async () => {
    const user = userEvent.setup();
    const { flow } = renderFlow({ selection: { accounts: ACCOUNTS } });

    await user.click(screen.getByTestId('bank-connection-account-option-se-2'));
    await pickGrouping(user, '1BW');
    await user.click(screen.getByTestId('bank-connection-account-select-confirm'));

    expect(flow.confirmSelection).toHaveBeenCalledWith('se-2', {
      importFromDate: firstOfCurrentMonth(),
      statementGrouping: '1BW',
    });
  });

  it('confirms with the LAST picked account when the user changes their mind', async () => {
    const user = userEvent.setup();
    const { flow } = renderFlow({ selection: { accounts: ACCOUNTS } });

    await user.click(screen.getByTestId('bank-connection-account-option-se-1'));
    await user.click(screen.getByTestId('bank-connection-account-option-se-3'));
    await pickGrouping(user);
    await user.click(screen.getByTestId('bank-connection-account-select-confirm'));

    expect(flow.confirmSelection).toHaveBeenCalledTimes(1);
    expect(flow.confirmSelection).toHaveBeenCalledWith('se-3', expect.objectContaining({
      statementGrouping: '1BM',
    }));
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

/**
 * ETP-6151 — the account picker also asks for the import settings the link persists in the same
 * transaction. The fields themselves are covered in `BankImportSettingsFields.vitest.jsx`; this
 * block pins the modal's own contract: the defaults, the confirm gate, what `confirmSelection`
 * receives and the reset between flows.
 */
describe('BankConnectionFlowUI — import settings in the account select modal', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  const DATE_BOX = 'field-date-bank-connection-link-import-from';

  it('starts with "Importar desde" on the first of the month and no grouping', () => {
    renderFlow({ selection: { connectionId: 'c-1', accounts: ACCOUNTS } });

    expect(screen.getByTestId(DATE_BOX)).not.toHaveValue('');
    // No grouping: the empty input, not a chip with a value.
    expect(screen.getByTestId('field-statementGrouping')).toHaveValue('');
    expect(screen.queryByTestId('field-statementGrouping-chip')).toBeNull();
    // Nothing is flagged until the user touches a field.
    expect(screen.queryByTestId('bank-connection-link-import-from-required')).toBeNull();
    expect(screen.queryByTestId('bank-connection-link-grouping-required')).toBeNull();
  });

  it('keeps confirm disabled with a grouping but no account', async () => {
    const user = userEvent.setup();
    renderFlow({ selection: { connectionId: 'c-1', accounts: ACCOUNTS } });

    await pickGrouping(user);

    expect(screen.getByTestId('bank-connection-account-select-confirm')).toBeDisabled();
  });

  it('disables confirm again, and flags the field, when the date is emptied', async () => {
    const user = userEvent.setup();
    const { flow } = renderFlow({ selection: { connectionId: 'c-1', accounts: ACCOUNTS } });
    await user.click(screen.getByTestId('bank-connection-account-option-se-1'));
    await pickGrouping(user);
    const confirm = screen.getByTestId('bank-connection-account-select-confirm');
    expect(confirm).toBeEnabled();

    await user.clear(screen.getByTestId(DATE_BOX));
    await user.tab();

    expect(confirm).toBeDisabled();
    expect(await screen.findByTestId('bank-connection-link-import-from-required')).toBeInTheDocument();
    await user.click(confirm);
    expect(flow.confirmSelection).not.toHaveBeenCalled();
  });

  it('confirms with a date the user typed instead of the default', async () => {
    const user = userEvent.setup();
    const { flow } = renderFlow({ selection: { connectionId: 'c-1', accounts: ACCOUNTS } });
    await user.click(screen.getByTestId('bank-connection-account-option-se-1'));
    await pickGrouping(user, '1BD');

    const box = screen.getByTestId(DATE_BOX);
    await user.clear(box);
    // DateField is a masked text box: ddmmyyyy digits, committed on blur.
    await user.type(box, '15032026');
    await user.tab();
    await user.click(screen.getByTestId('bank-connection-account-select-confirm'));

    expect(flow.confirmSelection).toHaveBeenCalledWith('se-1', {
      importFromDate: '2026-03-15',
      statementGrouping: '1BD',
    });
  });

  it('passes the bank limit to the fields, so the help names it', () => {
    renderFlow({ selection: { connectionId: 'c-1', accounts: ACCOUNTS, maxFetchInterval: 90 } });

    expect(screen.getByTestId('bank-connection-link-import-from-help'))
      .toHaveTextContent('financeAccountsBankConnectionImportFromHelpLimit|90');
  });

  it('names no limit when the bank published none', () => {
    renderFlow({ selection: { connectionId: 'c-1', accounts: ACCOUNTS } });

    expect(screen.getByTestId('bank-connection-link-import-from-help'))
      .not.toHaveTextContent('financeAccountsBankConnectionImportFromHelpLimit');
  });

  it('starts every new selection from a clean slate: no account, no grouping, default date, no errors', async () => {
    const user = userEvent.setup();
    const flow = makeFlow({ selection: { connectionId: 'c-1', accounts: ACCOUNTS } });
    const { rerender } = render(<BankConnectionFlowUI flow={flow} />);
    const defaultDisplay = screen.getByTestId(DATE_BOX).value;

    await user.click(screen.getByTestId('bank-connection-account-option-se-2'));
    await pickGrouping(user, '1BW');
    await user.clear(screen.getByTestId(DATE_BOX));
    await user.tab();
    await screen.findByTestId('bank-connection-link-import-from-required');

    rerender(<BankConnectionFlowUI flow={{ ...flow, selection: { connectionId: 'c-2', accounts: ACCOUNTS } }} />);

    expect(screen.getByTestId(DATE_BOX)).toHaveValue(defaultDisplay);
    expect(screen.getByTestId('field-statementGrouping')).toHaveValue('');
    expect(screen.queryByTestId('bank-connection-link-import-from-required')).toBeNull();
    const confirm = screen.getByTestId('bank-connection-account-select-confirm');
    expect(confirm).toBeDisabled();
    // The account pick was dropped too: a grouping alone does not enable confirm.
    await pickGrouping(user);
    expect(confirm).toBeDisabled();
  });

  it('confirms the new flow with its own values after a reset', async () => {
    const user = userEvent.setup();
    const flow = makeFlow({ selection: { connectionId: 'c-1', accounts: ACCOUNTS } });
    const { rerender } = render(<BankConnectionFlowUI flow={flow} />);
    await user.click(screen.getByTestId('bank-connection-account-option-se-2'));
    await pickGrouping(user, '1BW');

    rerender(<BankConnectionFlowUI flow={{ ...flow, selection: { connectionId: 'c-2', accounts: ACCOUNTS } }} />);
    await user.click(screen.getByTestId('bank-connection-account-option-se-3'));
    await pickGrouping(user, '1BE');
    await user.click(screen.getByTestId('bank-connection-account-select-confirm'));

    expect(flow.confirmSelection).toHaveBeenCalledWith('se-3', {
      importFromDate: firstOfCurrentMonth(),
      statementGrouping: '1BE',
    });
  });
});

describe('BankConnectionFlowUI — flag psd2-statement-import-settings off', () => {
  beforeEach(() => {
    importSettingsFlag.on = false;
  });

  afterEach(() => {
    importSettingsFlag.on = true;
  });

  it('shows only the account list: no date, no grouping, no help', () => {
    renderFlow({ selection: { accounts: ACCOUNTS, maxFetchInterval: 90 } });

    expect(screen.getByTestId('bank-connection-account-option-se-1')).toBeInTheDocument();
    expect(screen.queryByTestId('bank-connection-link-import-from-help')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bank-connection-link-grouping-help')).not.toBeInTheDocument();
    expect(screen.queryByTestId('field-statementGrouping')).not.toBeInTheDocument();
  });

  it('enables confirm with just an account and confirms with the account id only', async () => {
    const user = userEvent.setup();
    const { flow } = renderFlow({ selection: { accounts: ACCOUNTS } });

    const confirm = screen.getByTestId('bank-connection-account-select-confirm');
    expect(confirm).toBeDisabled();
    await user.click(screen.getByTestId('bank-connection-account-option-se-2'));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(flow.confirmSelection).toHaveBeenCalledTimes(1);
    expect(flow.confirmSelection).toHaveBeenCalledWith('se-2');
  });
});
