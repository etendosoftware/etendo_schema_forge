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

/** Opens the account popup the way a user does — clicking the field — and returns its search box. */
async function openSelector(testId) {
  fireEvent.click(screen.getByTestId(`field-${testId}`));
  return screen.findByTestId(`${testId}-popup-input`);
}

describe('accountOptionLabel', () => {
  it.each([
    ['code + name', { code: '572', name: 'Bancos c/c' }, '572 - Bancos c/c'],
    ['name only when there is no code', { code: null, name: 'Sin código' }, 'Sin código'],
  ])('%s', (_label, option, expected) => {
    expect(accountOptionLabel(option)).toBe(expected);
  });
});

// ETP-5681 — account pickers open the shared SearchPopup (the report filters' "Desde la cuenta"
// popup) instead of the old AccountBadgeSelect popover, which was as wide as its field and cut
// long names off.
describe('AccountSelect', () => {
  it('shows the selected account as "code - name"', () => {
    render(<AccountSelect value="acc-5723" options={OPTIONS} data-testid="acct-select" />);
    const root = screen.getByTestId('acct-select');
    expect(within(root).getByText('5723 - Bancos, cuenta puente')).toBeInTheDocument();
  });

  it('shows the placeholder when nothing is selected', () => {
    render(<AccountSelect value={null} options={OPTIONS} data-testid="acct-select" />);
    expect(screen.getByTestId('field-acct-select')).toHaveTextContent('selectAccount');
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

  it('opens a popup titled with the field label that lists every option with its FULL name', async () => {
    render(<AccountSelect label="Cuenta" options={OPTIONS} data-testid="acct-select" />);
    await openSelector('acct-select');
    const popup = screen.getByTestId('acct-select-popup');
    expect(within(popup).getByText('Cuenta')).toBeInTheDocument();
    const longOption = await within(popup).findByText(
      '55300000 - Socios por desembolsos no exigidos, capital pendiente de inscripción',
    );
    expect(longOption.className).not.toMatch(/\btruncate\b/);
    expect(within(popup).getAllByRole('option')).toHaveLength(OPTIONS.length);
  });

  it('searches by account code', async () => {
    render(<AccountSelect options={OPTIONS} data-testid="acct-select" />);
    const input = await openSelector('acct-select');
    fireEvent.change(input, { target: { value: '626' } });
    expect(await screen.findByText('626 - Servicios bancarios')).toBeInTheDocument();
    expect(screen.queryByText('572 - Bancos c/c')).not.toBeInTheDocument();
  });

  it('searches by account name', async () => {
    render(<AccountSelect options={OPTIONS} data-testid="acct-select" />);
    const input = await openSelector('acct-select');
    fireEvent.change(input, { target: { value: 'puente' } });
    expect(await screen.findByText('5723 - Bancos, cuenta puente')).toBeInTheDocument();
    expect(screen.queryByText('626 - Servicios bancarios')).not.toBeInTheDocument();
  });

  it('calls onChange with the selected id and closes the popup', async () => {
    const onChange = vi.fn();
    render(<AccountSelect options={OPTIONS} onChange={onChange} data-testid="acct-select" />);
    await openSelector('acct-select');
    fireEvent.click(await screen.findByTestId('acct-select-popup-option-acc-626'));
    expect(onChange).toHaveBeenCalledWith('acc-626', '626 - Servicios bancarios');
    await waitFor(() => expect(screen.queryByTestId('acct-select-popup')).toBeNull());
  });

  it('selects the highlighted option with the keyboard', async () => {
    const onChange = vi.fn();
    render(<AccountSelect options={OPTIONS} onChange={onChange} data-testid="acct-select" />);
    const input = await openSelector('acct-select');
    await screen.findByTestId('acct-select-popup-option-acc-572');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('acc-5723', '5723 - Bancos, cuenta puente');
  });

  it('shows noResults when the search matches no account', async () => {
    render(<AccountSelect options={OPTIONS} data-testid="acct-select" />);
    const input = await openSelector('acct-select');
    fireEvent.change(input, { target: { value: 'zzz-no-match' } });
    expect(await screen.findByTestId('acct-select-popup-empty')).toHaveTextContent('noResults');
  });

  it('an optional field can be cleared (onChange(null)); a required one cannot', () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <AccountSelect value="acc-572" options={OPTIONS} onChange={onChange} data-testid="acct-select" />,
    );
    fireEvent.click(screen.getByTestId('field-acct-select-clear'));
    expect(onChange).toHaveBeenCalledWith(null);
    unmount();

    render(<AccountSelect value="acc-572" required options={OPTIONS} data-testid="acct-select" />);
    expect(screen.queryByTestId('field-acct-select-clear')).toBeNull();
  });

  it('falls back to displayValue when the selected id is not in the catalog', () => {
    render(<AccountSelect value="acc-gone" displayValue="640 - Gastos de personal" options={OPTIONS} data-testid="acct-select" />);
    expect(screen.getByTestId('field-acct-select')).toHaveTextContent('640 - Gastos de personal');
  });

  it('titles the popup with popupTitle when the label is rendered outside', async () => {
    render(<AccountSelect popupTitle="Cuenta de depósito" options={OPTIONS} data-testid="acct-select" />);
    await openSelector('acct-select');
    expect(within(screen.getByTestId('acct-select-popup')).getByText('Cuenta de depósito')).toBeInTheDocument();
  });

  it('readOnly renders a static value with no interactive selector', () => {
    render(<AccountSelect value="acc-572" options={OPTIONS} readOnly data-testid="acct-select" />);
    const root = screen.getByTestId('acct-select');
    expect(within(root).getByText('572 - Bancos c/c')).toHaveAttribute('title', '572 - Bancos c/c');
    expect(within(root).queryByRole('button')).toBeNull();
  });
});
