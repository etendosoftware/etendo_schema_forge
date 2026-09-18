// Credit-limit field behaviour of the contacts financial panel.
//
// ETP-5328 — the credit-limit box is `MaskedAmountInput` (the same component `ProductPriceBar`'s
// `PriceStepper` uses) and NOT a controlled `<input type="number">` any more. The old shape
// rendered a `Number()`-coerced value while propagating the DOM's raw string outward, so deleting
// the field sent `''` up, the very next render mapped it back to `0`, and the `0` reappeared under
// the caret on every delete keystroke — the field could only be cleared by typing an extra digit
// first. The same round-trip also destroyed a half-typed decimal (`1,` -> `1`).
//
// The tests below therefore assert what the USER SEES in the box and what reaches the WIRE, never
// the component's internals: an empty box is a legitimate editing state, and `SO_CreditLimit`
// being AD-mandatory is expressed as "blur on empty persists 0", not as "the box can never be
// empty".

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('lucide-react', () => ({
  Minus: () => <span data-testid="icon-minus" />,
  Plus: () => <span data-testid="icon-plus" />,
}));

vi.mock('../BillingPreferencesForm', () => ({
  default: (props) => <div data-testid="billing-form" data-editing={String(!!props.editing)} />,
}));

vi.mock('../FiscalDefaultsSection', () => ({
  default: () => <div data-testid="fiscal-defaults-section" />,
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// The real `createApiFetch` runs underneath with `globalThis.fetch` stubbed below it, so what the
// persistence tests count is what would actually hit the network (same harness as the
// single-flight suite next door).
import { neoResponse, bodyOf, writeCalls, rememberRecordVersion } from '@/test/realApiFetch.js';
// Derived, never guessed: with `grouping` on, `MaskedAmountInput`'s idle display routes through
// the canonical `formatCurrency()`, and the separators come from `getCurrencyFormatConfig()`.
// Hardcoding "5.000,00" / "," here would bake this suite to one instance configuration.
import { formatCurrency } from '@/lib/formatCurrency.js';
import { getCurrencyFormatConfig } from '@/lib/currencyFormatConfig.js';
import ContactsFinancialPanel from '../ContactsFinancialPanel.jsx';

const BP_ID = 'bp-1';
const INITIAL_CREDIT_LIMIT = 5000;

const defaultProps = {
  data: { id: BP_ID, creditLimit: INITIAL_CREDIT_LIMIT, creditUsed: 1000, active: true },
  token: 'test-token',
  apiBaseUrl: '/sws/neo/contacts',
  catalogs: {},
  api: {},
  editing: false,
  onChange: vi.fn(),
};

/** The credit fields are read-only outside edit mode, so every interaction test needs this. */
const editingProps = { ...defaultProps, editing: true };

function creditLimitInput() {
  return screen.getByTestId('CreditLimitStepperInput');
}

/** Stubs the server with a NEO envelope echoing the record, and seeds the `updated` token. */
function installServer(record) {
  rememberRecordVersion({ id: BP_ID, updated: 'TOKEN-FROM-READ' });
  globalThis.fetch = vi.fn(async () => neoResponse([{ id: BP_ID, updated: 'TOKEN-AFTER', ...record }]));
}

/** Deletes the whole box one keystroke at a time — the ticket's literal repro. */
async function deleteEveryCharacter(user, input) {
  await user.click(input);
  input.setSelectionRange(input.value.length, input.value.length);
  const seen = [];
  for (let i = 0; i < 12; i += 1) {
    await user.keyboard('{Backspace}');
    seen.push(input.value);
  }
  return seen;
}

describe('ContactsFinancialPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing', () => {
    render(<ContactsFinancialPanel {...defaultProps} />);
    expect(screen.getByText('creditTax')).toBeInTheDocument();
    expect(screen.getByText('billingPreferences')).toBeInTheDocument();
  });

  it('renders credit limit stepper with the value from data, formatted by the canonical formatter', () => {
    render(<ContactsFinancialPanel {...defaultProps} />);
    // `grouping` is on, so the idle display is `formatCurrency(undefined, value)` — grouped, two
    // fixed decimals, no symbol. Asserting the raw "5000" is what went stale in ETP-5328.
    expect(creditLimitInput()).toHaveValue(formatCurrency(undefined, INITIAL_CREDIT_LIMIT));
  });

  it('renders billing preferences form', () => {
    render(<ContactsFinancialPanel {...defaultProps} />);
    expect(screen.getByTestId('billing-form')).toBeInTheDocument();
  });

  it('passes editing=false to billing form when not editing', () => {
    render(<ContactsFinancialPanel {...defaultProps} editing={false} />);
    expect(screen.getByTestId('billing-form')).toHaveAttribute('data-editing', 'false');
  });

  it('passes editing=true to billing form when editing', () => {
    render(<ContactsFinancialPanel {...defaultProps} editing={true} />);
    expect(screen.getByTestId('billing-form')).toHaveAttribute('data-editing', 'true');
  });

  it('renders with null data gracefully', () => {
    render(<ContactsFinancialPanel {...defaultProps} data={null} />);
    // An absent credit limit renders as an EMPTY box, not a coerced "0": the 0 is a commit-time
    // normalisation (the AD marks the field mandatory), never a display-time one.
    expect(creditLimitInput()).toHaveValue('');
  });

  it('shows credit limit description', () => {
    render(<ContactsFinancialPanel {...defaultProps} />);
    expect(screen.getByText('creditTaxDescription')).toBeInTheDocument();
  });

  it('shows billing preferences description', () => {
    render(<ContactsFinancialPanel {...defaultProps} />);
    expect(screen.getByText('billingPreferencesDesc')).toBeInTheDocument();
  });

  it('renders the fiscal defaults section', () => {
    render(<ContactsFinancialPanel {...defaultProps} />);
    expect(screen.getByTestId('fiscal-defaults-section')).toBeInTheDocument();
  });

  it('separates its three sections with rendered rules', () => {
    const { container } = render(<ContactsFinancialPanel {...defaultProps} />);
    expect(container.querySelectorAll('hr')).toHaveLength(2);
  });
});

describe('ContactsFinancialPanel — credit limit editing (ETP-5328)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // THE regression. One delete keystroke per character, and the box must end up genuinely empty.
  it('lets the user empty the box: the coerced 0 never reappears under the caret', async () => {
    const user = userEvent.setup();
    render(<ContactsFinancialPanel {...editingProps} />);
    const input = creditLimitInput();
    expect(input).toHaveValue(formatCurrency(undefined, INITIAL_CREDIT_LIMIT));

    const seen = await deleteEveryCharacter(user, input);

    // Before the fix, the keystroke that removed the last character re-rendered the field as "0"
    // — so the box could only be cleared by typing an extra digit first.
    expect(seen).not.toContain('0');
    expect(input).toHaveValue('');
  });

  it('keeps the box empty across further keystrokes on an already-empty field', async () => {
    const user = userEvent.setup();
    render(<ContactsFinancialPanel {...editingProps} />);
    const input = creditLimitInput();

    await user.click(input);
    await user.clear(input);
    expect(input).toHaveValue('');

    await user.keyboard('{Backspace}');
    expect(input).toHaveValue('');
  });

  it('commits 0 — never null — when the user blurs an empty box', async () => {
    const user = userEvent.setup();
    installServer({ creditLimit: 0 });
    render(<ContactsFinancialPanel {...editingProps} />);
    const input = creditLimitInput();

    await user.click(input);
    await user.clear(input);
    await user.tab();

    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));
    const body = bodyOf(writeCalls(globalThis.fetch)[0]);
    // `SO_CreditLimit` is AD-mandatory: an empty box is an editing state, and it persists as 0.
    // A `null` here would be refused on flush.
    expect(body.creditLimit).toBe(0);
    expect(body.creditLimit).not.toBeNull();
    // Exactly the field plus the optimistic-locking token `useRecordWriteQueue` attaches — asserted
    // by key set rather than by `toEqual`, so the token's presence is documented instead of making
    // the meaningful assertion above brittle.
    expect(Object.keys(body).sort()).toEqual(['creditLimit', 'updated']);
  });

  it('shows the committed 0 back in the box once it is no longer being edited', async () => {
    const user = userEvent.setup();
    installServer({ creditLimit: 0 });
    render(<ContactsFinancialPanel {...editingProps} />);

    await user.click(creditLimitInput());
    await user.clear(creditLimitInput());
    await user.tab();

    await waitFor(() => expect(creditLimitInput()).toHaveValue(formatCurrency(undefined, 0)));
  });

  it('keeps a half-typed decimal intact while typing, and commits the parsed amount', async () => {
    const { decimalSeparator } = getCurrencyFormatConfig();
    const user = userEvent.setup();
    installServer({ creditLimit: 1.5 });
    render(<ContactsFinancialPanel {...editingProps} />);
    const input = creditLimitInput();

    await user.click(input);
    await user.clear(input);
    await user.keyboard(`1${decimalSeparator}`);
    // The old `Number()` round-trip collapsed the trailing separator ("1," -> 1), so the decimal
    // could never be typed in one pass.
    expect(input).toHaveValue(`1${decimalSeparator}`);

    await user.keyboard('5');
    expect(input).toHaveValue(`1${decimalSeparator}5`);

    await user.tab();
    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));
    // The wire value is the clean, locale-independent number — never the grouped display string.
    expect(bodyOf(writeCalls(globalThis.fetch)[0])).toMatchObject({ creditLimit: 1.5 });
  });

  it('does not write anything while the box is merely being edited (commit is blur/Enter only)', async () => {
    const user = userEvent.setup();
    installServer({ creditLimit: 1234 });
    render(<ContactsFinancialPanel {...editingProps} />);
    const input = creditLimitInput();

    await user.click(input);
    await user.clear(input);
    await user.keyboard('1234');

    expect(writeCalls(globalThis.fetch)).toHaveLength(0);
  });

  it('commits on Enter without requiring a separate blur', async () => {
    const user = userEvent.setup();
    installServer({ creditLimit: 1234 });
    render(<ContactsFinancialPanel {...editingProps} />);
    const input = creditLimitInput();

    await user.click(input);
    await user.clear(input);
    await user.keyboard('1234{Enter}');

    await waitFor(() => expect(writeCalls(globalThis.fetch)).toHaveLength(1));
    expect(bodyOf(writeCalls(globalThis.fetch)[0])).toMatchObject({ creditLimit: 1234 });
  });

  it('disables the box and both steppers outside edit mode', () => {
    render(<ContactsFinancialPanel {...defaultProps} editing={false} />);
    expect(creditLimitInput()).toBeDisabled();
    expect(screen.getByTestId('icon-minus').closest('button')).toBeDisabled();
    expect(screen.getByTestId('icon-plus').closest('button')).toBeDisabled();
  });
});
