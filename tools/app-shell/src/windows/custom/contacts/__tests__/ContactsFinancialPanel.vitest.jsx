// --- Mocks (before imports) ---

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

// --- Import under test ---

import { render, screen, fireEvent } from '@testing-library/react';
import ContactsFinancialPanel from '../ContactsFinancialPanel.jsx';

// --- Tests ---

const defaultProps = {
  data: { id: 'bp-1', creditLimit: 5000, creditUsed: 1000, active: true },
  token: 'test-token',
  apiBaseUrl: '/sws/neo/contacts',
  catalogs: {},
  api: {},
  editing: false,
  onChange: vi.fn(),
};

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

  it('renders credit limit stepper with value from data', () => {
    render(<ContactsFinancialPanel {...defaultProps} />);
    const input = screen.getByDisplayValue('5000');
    expect(input).toBeInTheDocument();
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
    const input = screen.getByDisplayValue('0');
    expect(input).toBeInTheDocument();
  });

  it('shows credit limit description', () => {
    render(<ContactsFinancialPanel {...defaultProps} />);
    expect(screen.getByText('creditTaxDescription')).toBeInTheDocument();
  });

  it('shows billing preferences description', () => {
    render(<ContactsFinancialPanel {...defaultProps} />);
    expect(screen.getByText('billingPreferencesDesc')).toBeInTheDocument();
  });
});
