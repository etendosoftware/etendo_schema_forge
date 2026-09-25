/**
 * Vitest interactive behavior tests for AccountCodeField.jsx.
 *
 * Hosted here (not next to the component under artifacts/) because the Vitest include
 * pattern only covers src/** — it lived in artifacts/chart-of-accounts/custom/__tests__/
 * until ETP-5399 and never ran. It imports the runtime component through `@generated`
 * (resolves to artifacts/), like the sibling AccountTreeView / NewAccountModal suites.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key === 'codeExact8Digits'
    ? 'The account code must be exactly 8 digits'
    : key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Dynamic import so the mock is registered first
let AccountCodeField;
beforeAll(async () => {
  const mod = await import('@generated/chart-of-accounts/custom/AccountCodeField.jsx');
  AccountCodeField = mod.default;
});

// ─── Summary account (readOnly display) ─────────────────────────────────────

describe('AccountCodeField — summary account (summaryLevel=Y)', () => {
  it('renders a single read-only display element', () => {
    render(
      <AccountCodeField
        value="70100000"
        onChange={vi.fn()}
        record={{ summaryLevel: 'Y' }}
        readOnly={false}
      />
    );
    expect(screen.getByTestId('account-code-readonly')).toBeInTheDocument();
    expect(screen.queryByTestId('account-code-suffix-input')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-code-prefix')).not.toBeInTheDocument();
  });

  it('shows the full code value in the read-only element', () => {
    render(
      <AccountCodeField
        value="70100000"
        onChange={vi.fn()}
        record={{ summaryLevel: 'Y' }}
      />
    );
    expect(screen.getByTestId('account-code-readonly')).toHaveTextContent('70100000');
  });
});

// ─── Forced read-only (readOnly prop) ────────────────────────────────────────

describe('AccountCodeField — readOnly prop', () => {
  it('renders single read-only display when readOnly=true even for leaf account', () => {
    render(
      <AccountCodeField
        value="70100001"
        onChange={vi.fn()}
        record={{ summaryLevel: 'N' }}
        readOnly={true}
      />
    );
    expect(screen.getByTestId('account-code-readonly')).toBeInTheDocument();
    expect(screen.queryByTestId('account-code-suffix-input')).not.toBeInTheDocument();
  });
});

// ─── Leaf account (split prefix + suffix) ────────────────────────────────────

describe('AccountCodeField — leaf account (split view)', () => {
  it('renders prefix and suffix inputs for leaf accounts', () => {
    render(
      <AccountCodeField
        value="70100001"
        onChange={vi.fn()}
        record={{ summaryLevel: 'N' }}
        readOnly={false}
      />
    );
    expect(screen.getByTestId('account-code-prefix')).toBeInTheDocument();
    expect(screen.getByTestId('account-code-suffix-input')).toBeInTheDocument();
    expect(screen.queryByTestId('account-code-readonly')).not.toBeInTheDocument();
  });

  it('shows the first 4 chars as the locked prefix', () => {
    render(
      <AccountCodeField
        value="70100001"
        onChange={vi.fn()}
        record={{ summaryLevel: 'N' }}
      />
    );
    expect(screen.getByTestId('account-code-prefix')).toHaveTextContent('7010');
  });

  it('shows the last 4 chars as the editable suffix', () => {
    render(
      <AccountCodeField
        value="70100001"
        onChange={vi.fn()}
        record={{ summaryLevel: 'N' }}
      />
    );
    expect(screen.getByTestId('account-code-suffix-input')).toHaveValue('0001');
  });

  it('uses record.codePrefix as prefix when value is empty (new child)', () => {
    render(
      <AccountCodeField
        value=""
        onChange={vi.fn()}
        record={{ summaryLevel: 'N', codePrefix: '7010' }}
      />
    );
    expect(screen.getByTestId('account-code-prefix')).toHaveTextContent('7010');
    expect(screen.getByTestId('account-code-suffix-input')).toHaveValue('');
  });
});

// ─── onChange fires full 8-char code ─────────────────────────────────────────

describe('AccountCodeField — onChange', () => {
  it('fires onChange with full 8-char code when suffix changes', async () => {
    const onChange = vi.fn();
    render(
      <AccountCodeField
        value="70100000"
        onChange={onChange}
        record={{ summaryLevel: 'N' }}
      />
    );
    const suffixInput = screen.getByTestId('account-code-suffix-input');
    await userEvent.clear(suffixInput);
    await userEvent.type(suffixInput, '0042');
    // onChange is called with prefix(7010) + typed suffix
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall).toMatch(/^7010/);
    expect(lastCall.length).toBe(8);
  });

  it('fires onChange with prefix + new suffix on every keystroke', async () => {
    const onChange = vi.fn();
    render(
      <AccountCodeField
        value="70100000"
        onChange={onChange}
        record={{ summaryLevel: 'N' }}
      />
    );
    const suffixInput = screen.getByTestId('account-code-suffix-input');
    await userEvent.clear(suffixInput);
    await userEvent.type(suffixInput, '9');
    const call = onChange.mock.calls.find(c => c[0].endsWith('9'));
    expect(call).toBeDefined();
    expect(call[0]).toMatch(/^7010.*9$/);
  });
});

// ─── Digits-only restriction ──────────────────────────────────────────────────

describe('AccountCodeField — digits-only input', () => {
  it('does not call onChange for non-digit keys (letter rejected)', async () => {
    const onChange = vi.fn();
    render(
      <AccountCodeField
        value="70100000"
        onChange={onChange}
        record={{ summaryLevel: 'N' }}
      />
    );
    const suffixInput = screen.getByTestId('account-code-suffix-input');
    fireEvent.keyDown(suffixInput, { key: 'a', code: 'KeyA' });
    // The input value should not change since the key is prevented
    expect(screen.getByTestId('account-code-suffix-input')).toHaveValue('0000');
  });

  it('allows digit keys', async () => {
    const onChange = vi.fn();
    render(
      <AccountCodeField
        value="70100000"
        onChange={onChange}
        record={{ summaryLevel: 'N' }}
      />
    );
    const suffixInput = screen.getByTestId('account-code-suffix-input');
    // Digit key should NOT be prevented
    const event = fireEvent.keyDown(suffixInput, { key: '5', code: 'Digit5' });
    // The keydown event should not have been prevented
    expect(event).toBe(true);
  });
});

// ─── Blur validation ──────────────────────────────────────────────────────────

describe('AccountCodeField — blur validation', () => {
  it('shows error message on blur when total code length is not 8', async () => {
    render(
      <AccountCodeField
        value=""
        onChange={vi.fn()}
        record={{ summaryLevel: 'N', codePrefix: '7010' }}
      />
    );
    const suffixInput = screen.getByTestId('account-code-suffix-input');
    await userEvent.type(suffixInput, '1');
    await userEvent.tab(); // trigger blur
    // Error should appear — value is "70101" which is 5 chars, not 8
    expect(screen.getByTestId('account-code-error')).toBeInTheDocument();
  });

  it('does not show error when total code is exactly 8 chars', async () => {
    render(
      <AccountCodeField
        value=""
        onChange={vi.fn()}
        record={{ summaryLevel: 'N', codePrefix: '7010' }}
      />
    );
    const suffixInput = screen.getByTestId('account-code-suffix-input');
    await userEvent.type(suffixInput, '0042');
    await userEvent.tab();
    expect(screen.queryByTestId('account-code-error')).not.toBeInTheDocument();
  });

  it('error message uses codeExact8Digits i18n key', async () => {
    render(
      <AccountCodeField
        value=""
        onChange={vi.fn()}
        record={{ summaryLevel: 'N', codePrefix: '7010' }}
      />
    );
    const suffixInput = screen.getByTestId('account-code-suffix-input');
    await userEvent.type(suffixInput, '1');
    await userEvent.tab();
    expect(screen.getByTestId('account-code-error')).toHaveTextContent(
      'The account code must be exactly 8 digits'
    );
  });
});

// ─── placeholder prop (ETP-5101 — last-used suffix hint) ─────────────────────

describe('AccountCodeField — placeholder prop', () => {
  it('uses the supplied placeholder on the suffix input when provided', () => {
    render(
      <AccountCodeField
        value=""
        onChange={vi.fn()}
        record={{ summaryLevel: 'N', codePrefix: '2000' }}
        placeholder="0004"
      />
    );
    expect(screen.getByTestId('account-code-suffix-input')).toHaveAttribute('placeholder', '0004');
  });

  it('falls back to the codeSuffixPlaceholder i18n key when placeholder is omitted', () => {
    render(
      <AccountCodeField
        value=""
        onChange={vi.fn()}
        record={{ summaryLevel: 'N', codePrefix: '2000' }}
      />
    );
    // The mocked useUI echoes the key back for anything but codeExact8Digits.
    expect(screen.getByTestId('account-code-suffix-input')).toHaveAttribute('placeholder', 'codeSuffixPlaceholder');
  });

  it('falls back to the codeSuffixPlaceholder i18n key when placeholder is explicitly undefined', () => {
    render(
      <AccountCodeField
        value=""
        onChange={vi.fn()}
        record={{ summaryLevel: 'N', codePrefix: '2000' }}
        placeholder={undefined}
      />
    );
    expect(screen.getByTestId('account-code-suffix-input')).toHaveAttribute('placeholder', 'codeSuffixPlaceholder');
  });
});

// ─── ETP-5399 QA: prefix + suffix render as one readable control ─────────────

describe('AccountCodeField — composite control (ETP-5399)', () => {
  function renderLeaf() {
    render(
      <AccountCodeField
        value="1030"
        onChange={vi.fn()}
        record={{ summaryLevel: 'N', codePrefix: '1030' }}
      />
    );
  }

  it('wraps the locked prefix and the suffix input in a single bordered control', () => {
    renderLeaf();
    const control = screen.getByTestId('account-code-control');
    expect(control).toContainElement(screen.getByTestId('account-code-prefix'));
    expect(control).toContainElement(screen.getByTestId('account-code-suffix-input'));
    expect(control.className).toContain('border-[hsl(var(--border-control))]');
    expect(control.className).toContain('focus-within:ring-2');
  });

  it('renders the locked prefix in the foreground colour, not the pale info-border tone', () => {
    renderLeaf();
    const prefix = screen.getByTestId('account-code-prefix');
    expect(prefix).toHaveTextContent('1030');
    expect(prefix.className).toContain('text-[hsl(var(--foreground))]');
    expect(prefix.className).not.toContain('status-info-border');
  });

  it('uses monospace tabular digits for both halves so the 8-digit code lines up', () => {
    renderLeaf();
    const control = screen.getByTestId('account-code-control');
    expect(control.className).toContain('font-mono');
    expect(control.className).toContain('tabular-nums');
    // The input inherits the control's font instead of setting its own.
    expect(screen.getByTestId('account-code-suffix-input').className).not.toMatch(/\btext-sm\b|\bfont-sans\b/);
  });

  it('gives the read-only display a visible border (no longer the card colour)', () => {
    render(<AccountCodeField value="70100000" onChange={vi.fn()} record={{ summaryLevel: 'Y' }} />);
    const display = screen.getByTestId('account-code-readonly');
    expect(display.className).toContain('border-[hsl(var(--border-control))]');
    expect(display.className).not.toContain('border-[hsl(var(--card))]');
  });
});
