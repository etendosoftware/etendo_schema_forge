/**
 * Tests for ContactsPeriodButton — period selector rendered in tabsBarRight slot.
 */

// Mocks before imports
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="icon-chevron" />,
  Calendar: () => <span data-testid="icon-calendar" />,
}));

import { render, screen, act } from '@testing-library/react';
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

  it('renders without crashing inside provider', () => {
    render(<ContactsPeriodButton />, { wrapper: ProviderWrapper });
  });

  it('shows the 3M label by default (bpLast3Months key)', () => {
    render(<ContactsPeriodButton />, { wrapper: ProviderWrapper });
    expect(screen.getByText('bpLast3Months')).toBeInTheDocument();
  });

  it('does not show the dropdown initially', () => {
    render(<ContactsPeriodButton />, { wrapper: ProviderWrapper });
    expect(screen.queryByText('bpLast6Months')).not.toBeInTheDocument();
  });

  it('opens the dropdown when the button is clicked', async () => {
    const user = userEvent.setup();
    render(<ContactsPeriodButton />, { wrapper: ProviderWrapper });
    await user.click(screen.getByRole('button', { name: /bpLast3Months/ }));
    expect(screen.getAllByText('bpLast3Months').length).toBeGreaterThan(0);
    expect(screen.getByText('bpLast6Months')).toBeInTheDocument();
  });

  it('selects 6M and closes the dropdown when option is clicked', async () => {
    const user = userEvent.setup();
    render(<ContactsPeriodButton />, { wrapper: ProviderWrapper });

    // Open
    await user.click(screen.getByRole('button', { name: /bpLast3Months/ }));
    // Select 6M
    await user.click(screen.getByText('bpLast6Months'));

    // Dropdown closed — only one instance of each label now
    expect(screen.queryByText('bpLast3Months')).not.toBeInTheDocument();
    // The trigger button now shows the 6M label
    expect(screen.getByRole('button', { name: /bpLast6Months/ })).toBeInTheDocument();
  });

  it('selects 3M after choosing 6M', async () => {
    const user = userEvent.setup();
    render(<ContactsPeriodButton />, { wrapper: ProviderWrapper });

    // Switch to 6M
    await user.click(screen.getByRole('button', { name: /bpLast3Months/ }));
    await user.click(screen.getByText('bpLast6Months'));

    // Now switch back to 3M
    await user.click(screen.getByRole('button', { name: /bpLast6Months/ }));
    await user.click(screen.getByText('bpLast3Months'));

    expect(screen.getByRole('button', { name: /bpLast3Months/ })).toBeInTheDocument();
  });

  it('closes dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <ContactsPeriodButton />
        <button data-testid="outside">outside</button>
      </div>,
      { wrapper: ProviderWrapper },
    );

    await user.click(screen.getByRole('button', { name: /bpLast3Months/ }));
    expect(screen.getByText('bpLast6Months')).toBeInTheDocument();

    // Click outside
    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByText('bpLast6Months')).not.toBeInTheDocument();
  });

  it('throws when used outside ContactsFinanceProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<ContactsPeriodButton />)).toThrow(
      'useContactsFinance must be used inside ContactsFinanceProvider',
    );
    spy.mockRestore();
  });

  it('renders the calendar icon', () => {
    render(<ContactsPeriodButton />, { wrapper: ProviderWrapper });
    expect(screen.getByTestId('icon-calendar')).toBeInTheDocument();
  });

  it('renders the chevron icon', () => {
    render(<ContactsPeriodButton />, { wrapper: ProviderWrapper });
    expect(screen.getByTestId('icon-chevron')).toBeInTheDocument();
  });
});
