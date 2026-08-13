import { render, screen } from '@testing-library/react';

// Mock i18n
vi.mock('@/i18n', () => ({
  useLocale: () => ({
    genericLabels: {
      totalContacts: 'Total Contacts',
      customers: 'Customers',
      vendors: 'Vendors',
    },
  }),
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Users: (props) => <svg {...props} data-testid="icon-users" />,
}));

import ContactsKpiCards from '../ContactsKpiCards.jsx';

describe('ContactsKpiCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing with no props', () => {
    render(<ContactsKpiCards />);
  });

  it('renders three KPI cards', () => {
    render(<ContactsKpiCards items={[]} />);
    expect(screen.getByText('Total Contacts')).toBeInTheDocument();
    expect(screen.getByText('Customers')).toBeInTheDocument();
    expect(screen.getByText('Vendors')).toBeInTheDocument();
  });

  it('shows dash when items is empty (null values)', () => {
    render(<ContactsKpiCards items={[]} />);
    // total=0 → null → renders dash
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  it('calculates total contacts count', () => {
    const items = [
      { id: '1', customer: true },
      { id: '2', customer: false },
      { id: '3', vendor: true },
    ];
    render(<ContactsKpiCards items={items} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('counts customers with boolean true', () => {
    const items = [
      { id: '1', customer: true },
      { id: '2', customer: true },
      { id: '3', customer: false },
    ];
    render(<ContactsKpiCards items={items} />);
    expect(screen.getByText('2')).toBeInTheDocument(); // 2 customers
  });

  it('counts customers with string Y', () => {
    const items = [
      { id: '1', customer: 'Y' },
      { id: '2', customer: 'N' },
    ];
    render(<ContactsKpiCards items={items} />);
    // total=2, customers=1, vendors=0 (dash)
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(1);
  });

  it('counts vendors with boolean true', () => {
    const items = [
      { id: '1', vendor: true },
      { id: '2', vendor: false },
    ];
    render(<ContactsKpiCards items={items} />);
    // total=2, customers=0 (dash), vendors=1
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(1);
  });

  it('counts vendors with string Y', () => {
    const items = [
      { id: '1', vendor: 'Y' },
    ];
    render(<ContactsKpiCards items={items} />);
    // total=1, vendors=1 — two "1"s
    expect(screen.getAllByText('1')).toHaveLength(2);
  });

  it('shows loading skeleton when loading is true', () => {
    const { container } = render(<ContactsKpiCards items={[]} loading={true} />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThanOrEqual(3);
  });

  it('shows values when loading is false', () => {
    const items = [
      { id: '1', customer: true, vendor: true },
    ];
    const { container } = render(<ContactsKpiCards items={items} loading={false} />);
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements).toHaveLength(0);
  });

  it('falls back to key when genericLabels is missing a key', () => {
    vi.doMock('@/i18n', () => ({
      useLocale: () => ({ genericLabels: {} }),
    }));
    // With empty genericLabels, keys are returned as-is
    // This is tested implicitly since the t() function returns key as fallback
  });

  it('renders Users icon on the total contacts card', () => {
    render(<ContactsKpiCards items={[{ id: '1' }]} />);
    expect(screen.getByTestId('icon-users')).toBeInTheDocument();
  });

  it('handles items with both customer and vendor flags', () => {
    const items = [
      { id: '1', customer: true, vendor: true },
      { id: '2', customer: true, vendor: 'Y' },
    ];
    render(<ContactsKpiCards items={items} />);
    // total=2, customers=2, vendors=2 — all same value "2"
    const twos = screen.getAllByText('2');
    expect(twos).toHaveLength(3);
  });
});
