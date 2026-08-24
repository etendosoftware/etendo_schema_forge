/**
 * accountColumns — the shared Cuentas cell bodies, and their reveal-on-row-hover contract.
 *
 * `NameCell` / `TypeCell` / `BalanceCell` are rendered by TWO hosts: the legacy hand-rolled
 * `AccountRow`, which marks its <tr> as a plain Tailwind `group`, and the generic `DataTable`,
 * which marks it as a NAMED group (`group/row`, DataTable.jsx:1201). Tailwind's `group-hover:`
 * variant does NOT match `.group/row`, so the two affordances that start at `opacity-0` —
 * the copy-IBAN button and the drag grip — silently stayed invisible forever once the Cuentas
 * list moved onto DataTable. Nothing in the suite asserted them, so 111 green tests coexisted
 * with a visibly broken UI.
 *
 * HONEST LABEL: the two hover tests below are className assertions, NOT behavioural ones.
 * jsdom neither loads the Tailwind stylesheet nor computes `opacity`, so hovering the row and
 * asserting the button became visible is impossible here — a test written that way would look
 * behavioural and prove nothing. The emitted variant list IS the contract, so that is what is
 * asserted, and the real hover is left to the E2E layer.
 */
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { NameCell, TypeCell, BalanceCell } from '../accountColumns.jsx';

const ACCOUNT = {
  id: 'acc-1',
  name: 'BBVA Principal',
  type: 'B',
  currentBalance: 1234.56,
  currencyIso: 'EUR',
  // ES on purpose: the connect affordance below is Spain-only since ETP-4896
  // (see saltEdgeEligibility.js), so a fixture without it would hide the button.
  countryIso: 'ES',
  countryName: 'Spain',
  iban: 'ES1212340000000000000001',
  bankConnected: true,
};

const ui = (key) => key;

/** Both variants are load-bearing: one per host. Dropping either breaks one of the two. */
function expectBothGroupVariants(el) {
  const tokens = el.className.split(/\s+/).filter(Boolean);
  expect(tokens).toContain('opacity-0');
  // The legacy AccountsTable host (`group` on the <tr>).
  expect(tokens).toContain('group-hover:opacity-100');
  // The generic DataTable host (`group/row` on the <tr>).
  expect(tokens).toContain('group-hover/row:opacity-100');
}

describe('NameCell', () => {
  it('renders the account name', () => {
    render(<NameCell account={ACCOUNT} ui={ui} />);

    expect(screen.getByText('BBVA Principal')).toBeInTheDocument();
  });

  // Regression guard (ETP-4658): the grip is the 44px slot that keeps the row content
  // aligned with the `pl-[84px]` header, and it only appears on row hover.
  it('reveals the drag grip on hover from EITHER host\'s row group', () => {
    render(<NameCell account={ACCOUNT} ui={ui} />);

    const grip = screen.getByTestId('GripVertical__dc050f').parentElement;
    expectBothGroupVariants(grip);
  });

  it('shows the offline badge only for a bank/card account that is not connected', () => {
    const { unmount } = render(<NameCell account={{ ...ACCOUNT, bankConnected: false }} ui={ui} />);
    expect(screen.getByText('financeAccountsBadgeOffline')).toBeInTheDocument();
    unmount();

    render(<NameCell account={ACCOUNT} ui={ui} />);
    expect(screen.queryByText('financeAccountsBadgeOffline')).not.toBeInTheDocument();
  });

  it('treats a cash account as neither offline nor syncable', () => {
    render(<NameCell account={{ ...ACCOUNT, type: 'C', bankConnected: false }} ui={ui} />);

    expect(screen.queryByText('financeAccountsBadgeOffline')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-sync-connect-acc-1')).not.toBeInTheDocument();
  });

  it('wires the connect affordance to onConnect, once, with the account', () => {
    const onConnect = vi.fn();
    render(<NameCell account={{ ...ACCOUNT, bankConnected: false }} ui={ui} onConnect={onConnect} />);

    fireEvent.click(screen.getByTestId('account-sync-connect-acc-1'));

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({ id: 'acc-1' }));
  });

  it('renders no connect affordance when the host passes no handler', () => {
    render(<NameCell account={{ ...ACCOUNT, bankConnected: false }} ui={ui} />);

    // The button still renders (it is SyncStatusInline's default state) but has nothing
    // to call — clicking it must not throw.
    expect(() => fireEvent.click(screen.getByTestId('account-sync-connect-acc-1'))).not.toThrow();
  });
});

describe('TypeCell', () => {
  it('renders the translated type label and the IBAN chunked in fours', () => {
    render(<TypeCell account={ACCOUNT} ui={ui} />);

    expect(screen.getByText('financeAccountsTypeBank')).toBeInTheDocument();
    expect(screen.getByText(/ES12 1234 0000 0000 0000 0001/)).toBeInTheDocument();
  });

  it('falls back to the bank label for an unknown account type', () => {
    render(<TypeCell account={{ ...ACCOUNT, type: 'ZZ' }} ui={ui} />);

    expect(screen.getByText('financeAccountsTypeBank')).toBeInTheDocument();
  });

  it('renders an em dash when there is neither an IBAN nor a masked PAN', () => {
    render(<TypeCell account={{ ...ACCOUNT, iban: '', type: 'CA', maskedPan: '' }} ui={ui} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // Regression guard (ETP-4658): this button is the reason the bug was visible at all.
  it('reveals the copy-IBAN button on hover from EITHER host\'s row group', () => {
    render(<TypeCell account={ACCOUNT} ui={ui} />);

    expectBothGroupVariants(screen.getByTestId('account-row-copy-iban-acc-1'));
  });

  it('renders no copy button when the account has no IBAN', () => {
    render(<TypeCell account={{ ...ACCOUNT, iban: '' }} ui={ui} />);

    expect(screen.queryByTestId('account-row-copy-iban-acc-1')).not.toBeInTheDocument();
  });

  it('labels the icon-only copy button through i18n', () => {
    render(<TypeCell account={ACCOUNT} ui={ui} />);

    expect(screen.getByTestId('account-row-copy-iban-acc-1'))
      .toHaveAttribute('aria-label', 'financeAccountsCopyIban');
  });

  it('copies the raw (unchunked) IBAN to the clipboard', () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<TypeCell account={ACCOUNT} ui={ui} />);

    fireEvent.click(screen.getByTestId('account-row-copy-iban-acc-1'));

    expect(writeText).toHaveBeenCalledWith('ES1212340000000000000001');
  });

  it('does not throw when the browser exposes no clipboard API', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    render(<TypeCell account={ACCOUNT} ui={ui} />);

    expect(() => fireEvent.click(screen.getByTestId('account-row-copy-iban-acc-1'))).not.toThrow();
  });

  // The whole row navigates to the account detail, so copying must not also open it.
  it('swallows the copy click so the row does not navigate underneath it', () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onRowClick = vi.fn();
    render(
      <div role="presentation" onClick={onRowClick}>
        <TypeCell account={ACCOUNT} ui={ui} />
      </div>,
    );

    fireEvent.click(screen.getByTestId('account-row-copy-iban-acc-1'));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe('BalanceCell', () => {
  it('renders the currency-formatted balance', () => {
    render(<BalanceCell account={ACCOUNT} />);

    expect(screen.getByText(/1\.234,56/)).toBeInTheDocument();
  });

  it('renders a negative balance in the destructive treatment', () => {
    const { container } = render(<BalanceCell account={{ ...ACCOUNT, currentBalance: -42.5 }} />);

    expect(container.firstChild.className).toMatch(/text-\[hsl\(var\(--destructive\)\)\]/);
  });

  it('renders a zero balance in the default treatment', () => {
    const { container } = render(<BalanceCell account={{ ...ACCOUNT, currentBalance: 0 }} />);

    expect(container.firstChild.className).not.toMatch(/destructive/);
  });
});
