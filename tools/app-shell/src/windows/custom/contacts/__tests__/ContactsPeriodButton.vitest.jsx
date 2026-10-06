// @covers tools/app-shell/src/windows/custom/contacts/ContactsPeriodButton.jsx
/**
 * Tests for ContactsPeriodButton — period selector rendered inside ContactsSummaryWidget.
 * Built on the core Radix DropdownMenu: keyboard/focus handling is Radix's, so these
 * tests only guard the component's own contract (labels, checked option, period state).
 */

// Mocks before imports
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="icon-chevron" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
  Calendar: () => <span data-testid="icon-calendar" />,
  Check: () => <span data-testid="icon-check" />,
  Circle: () => <span data-testid="icon-circle" />,
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactsFinanceProvider } from '../ContactsFinanceContext';
import ContactsPeriodButton from '../ContactsPeriodButton';

// ─── Wrapper that provides the required context ───────────────────────────────

function ProviderWrapper({ children, token = 'tok', apiBaseUrl = '/api' }) {
  return (
    <ContactsFinanceProvider token={token} apiBaseUrl={apiBaseUrl}>
      {children}
    </ContactsFinanceProvider>
  );
}

const trigger = () => screen.getByRole('button', { name: /bpLast/ });
const option = (name) => screen.getByRole('menuitemradio', { name });

describe('ContactsPeriodButton', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the 3M label with its icons and keeps the menu closed initially', () => {
    render(<ContactsPeriodButton />, { wrapper: ProviderWrapper });
    expect(trigger()).toHaveTextContent('bpLast3Months');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('icon-calendar')).toBeInTheDocument();
    expect(screen.getByTestId('icon-chevron')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens with both options and marks the selected one checked with a Check icon', async () => {
    const user = userEvent.setup();
    render(<ContactsPeriodButton />, { wrapper: ProviderWrapper });

    await user.click(trigger());

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('data-state', 'open');
    expect(option('bpLast3Months')).toHaveAttribute('aria-checked', 'true');
    expect(option('bpLast6Months')).toHaveAttribute('aria-checked', 'false');
    expect(option('bpLast3Months').querySelector('[data-testid="icon-check"]')).not.toBeNull();
    expect(option('bpLast6Months').querySelector('[data-testid="icon-check"]')).toBeNull();
  });

  it('choosing 6M updates the context period and closes the menu', async () => {
    const user = userEvent.setup();
    render(<ContactsPeriodButton />, { wrapper: ProviderWrapper });

    await user.click(trigger());
    await user.click(option('bpLast6Months'));

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveTextContent('bpLast6Months');

    await user.click(trigger());
    expect(option('bpLast6Months')).toHaveAttribute('aria-checked', 'true');
  });

  it('Escape closes the menu and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<ContactsPeriodButton />, { wrapper: ProviderWrapper });

    trigger().focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('throws when used outside ContactsFinanceProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ContactsPeriodButton />)).toThrow(
      'useContactsFinance must be used inside ContactsFinanceProvider',
    );
    spy.mockRestore();
  });
});
