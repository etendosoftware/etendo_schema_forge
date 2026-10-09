// @covers tools/app-shell/src/components/contract-ui/AccountSelect.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';

// i18n returns the key as-is (no hardcoded strings).
vi.mock('@/i18n', () => ({
  useUI: () => (k) => k,
}));

import { AccountSelect, accountOptionLabel } from '../AccountSelect.jsx';

const OPTIONS = [
  { id: 'acc-572', code: '572', name: 'Bancos c/c' },
  { id: 'acc-5723', code: '5723', name: 'Bancos, cuenta puente' },
  { id: 'acc-626', code: '626', name: 'Servicios bancarios' },
  { id: 'acc-long', code: '55300000', name: 'Socios por desembolsos no exigidos, capital pendiente de inscripción' },
];

/** Opens the selector the way a user does: focusing its search input. */
function openSelector(testId) {
  const input = within(screen.getByTestId(testId)).getByRole('combobox');
  fireEvent.focus(input);
  return input;
}

describe('accountOptionLabel', () => {
  it.each([
    ['code + name', { code: '572', name: 'Bancos c/c' }, '572 - Bancos c/c'],
    ['name only when there is no code', { code: null, name: 'Sin código' }, 'Sin código'],
  ])('%s', (_label, option, expected) => {
    expect(accountOptionLabel(option)).toBe(expected);
  });
});

// ETP-5681 — account pickers use the app's DEFAULT selector instead of the old
// AccountBadgeSelect popover, which was as wide as its field and cut long names off.
describe('AccountSelect', () => {
  it('shows the selected account as "code - name"', () => {
    render(<AccountSelect value="acc-5723" options={OPTIONS} data-testid="acct-select" />);
    const root = screen.getByTestId('acct-select');
    expect(within(root).getByText('5723 - Bancos, cuenta puente')).toBeInTheDocument();
  });

  it('shows the placeholder when nothing is selected', () => {
    render(<AccountSelect value={null} options={OPTIONS} data-testid="acct-select" />);
    expect(within(screen.getByTestId('acct-select')).getByRole('combobox'))
      .toHaveAttribute('placeholder', 'selectAccount');
  });

  it('renders the label with a required marker', () => {
    render(<AccountSelect label="Cuenta" required options={OPTIONS} data-testid="acct-select" />);
    const root = screen.getByTestId('acct-select');
    expect(within(root).getByText('Cuenta')).toBeInTheDocument();
    expect(within(root).getByText('*')).toBeInTheDocument();
  });

  it('renders the error message below the selector', () => {
    render(<AccountSelect options={OPTIONS} error="requiredField" data-testid="acct-select" />);
    expect(within(screen.getByTestId('acct-select')).getByText('requiredField')).toBeInTheDocument();
  });

  it('lists every option with its FULL name (no truncation class)', async () => {
    render(<AccountSelect options={OPTIONS} data-testid="acct-select" />);
    openSelector('acct-select');
    const longOption = await screen.findByText(
      '55300000 - Socios por desembolsos no exigidos, capital pendiente de inscripción',
    );
    expect(longOption.className).not.toMatch(/\btruncate\b/);
    expect(longOption.className).toMatch(/whitespace-nowrap/);
  });

  it('searches by account code', async () => {
    render(<AccountSelect options={OPTIONS} data-testid="acct-select" />);
    const input = openSelector('acct-select');
    fireEvent.change(input, { target: { value: '626' } });
    expect(await screen.findByText('626 - Servicios bancarios')).toBeInTheDocument();
    expect(screen.queryByText('572 - Bancos c/c')).not.toBeInTheDocument();
  });

  it('searches by account name', async () => {
    render(<AccountSelect options={OPTIONS} data-testid="acct-select" />);
    const input = openSelector('acct-select');
    fireEvent.change(input, { target: { value: 'puente' } });
    expect(await screen.findByText('5723 - Bancos, cuenta puente')).toBeInTheDocument();
    expect(screen.queryByText('626 - Servicios bancarios')).not.toBeInTheDocument();
  });

  it('calls onChange with the selected id', async () => {
    const onChange = vi.fn();
    render(<AccountSelect options={OPTIONS} onChange={onChange} data-testid="acct-select" />);
    openSelector('acct-select');
    fireEvent.mouseDown(await screen.findByText('626 - Servicios bancarios'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('acc-626'));
  });

  it('an optional field can be cleared (onChange(null)); a required one cannot', () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <AccountSelect value="acc-572" options={OPTIONS} onChange={onChange} data-testid="acct-select" />,
    );
    fireEvent.mouseDown(within(screen.getByTestId('acct-select')).getByRole('button', { name: 'clear' }));
    expect(onChange).toHaveBeenCalledWith(null);
    unmount();

    render(<AccountSelect value="acc-572" required options={OPTIONS} data-testid="acct-select" />);
    expect(within(screen.getByTestId('acct-select')).queryByRole('button', { name: 'clear' })).toBeNull();
  });

  it('readOnly renders a static value with no interactive selector', () => {
    render(<AccountSelect value="acc-572" options={OPTIONS} readOnly data-testid="acct-select" />);
    const root = screen.getByTestId('acct-select');
    expect(within(root).getByText('572 - Bancos c/c')).toHaveAttribute('title', '572 - Bancos c/c');
    expect(within(root).queryByRole('combobox')).toBeNull();
    expect(within(root).queryByRole('button')).toBeNull();
  });
});
