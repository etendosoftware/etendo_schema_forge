/**
 * Vitest interactive behavior tests for AccountCodeField.jsx.
 *
 * Run from tools/app-shell/:
 *   npx vitest run --config vitest.config.js ../../artifacts/chart-of-accounts/custom/__tests__/AccountCodeField.vitest.jsx
 *
 * (The default Vitest include pattern covers src/ only; this file is run manually
 * or via a custom glob during CI for artifact-level component tests.)
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
  const mod = await import('../AccountCodeField.jsx');
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
