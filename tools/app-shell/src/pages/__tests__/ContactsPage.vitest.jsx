import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/contract-ui/KPIHeader', () => ({
  KPIHeader: ({ kpis }) => <div data-testid="kpi-header">{kpis?.length ?? 0} kpis</div>,
}));

vi.mock('@/components/contract-ui/KanbanBoard', () => ({
  KanbanBoard: ({ cards, onCardClick }) => (
    <div data-testid="kanban-board">
      {cards.map((c) => (
        <div key={c.id} data-testid={`kanban-card-${c.id}`} onClick={() => onCardClick(c)}>
          {c.title}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/contract-ui/Chatter', () => ({
  Chatter: () => <div data-testid="chatter" />,
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }) => <button onClick={onClick} {...props}>{children}</button>,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }) => <span data-testid="badge">{children}</span>,
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

vi.mock('lucide-react', () => ({
  Users: () => <span>Users</span>,
  Mail: () => <span>Mail</span>,
  Phone: () => <span>Phone</span>,
  MapPin: () => <span>MapPin</span>,
  X: () => <span>X</span>,
}));

vi.mock('@generated/contacts/generated/config', () => ({
  kpisConfig: [],
  sections: {
    kpis: {
      kpis: [{ key: 'totalContacts', label: 'Total', icon: 'Users' }],
    },
    directory: {
      columns: [
        { id: 'col1', title: 'Customers' },
        { id: 'col2', title: 'Prospects' },
      ],
    },
  },
}));

vi.mock('@generated/contacts/generated/mockData', () => ({
  kpis: { totalContacts: 42, trends: { totalContacts: 5 } },
  directory: [
    { id: 'c1', title: 'Alice Smith', subtitle: 'New York', columnId: 'col1', avatar: 'AS', value: 50000, badges: ['VIP'] },
    { id: 'c2', title: 'Bob Jones', subtitle: 'London', columnId: 'col2', avatar: 'BJ', value: null },
  ],
  notes: [{ id: 'n1', text: 'A note' }],
  contactList: [
    { name: 'Alice Smith', email: 'alice@test.com', phone: '555-1234' },
    { name: 'Bob Jones', email: 'bob@test.com', phone: '555-5678' },
  ],
}));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContactsPage from '../ContactsPage.jsx';

describe('ContactsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<ContactsPage />);
  });

  it('renders KPI header', () => {
    render(<ContactsPage />);
    expect(screen.getByTestId('kpi-header')).toBeInTheDocument();
  });

  it('shows kanban view by default', () => {
    render(<ContactsPage />);
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
  });

  it('renders view toggle buttons', () => {
    render(<ContactsPage />);
    expect(screen.getByText('viewKanban')).toBeInTheDocument();
    expect(screen.getByText('viewList')).toBeInTheDocument();
  });

  it('switches to list view when list button is clicked', async () => {
    const user = userEvent.setup();
    render(<ContactsPage />);
    await user.click(screen.getByText('viewList'));
    // List view renders a table with header columns
    expect(screen.getByText('name')).toBeInTheDocument();
    expect(screen.getByText('category')).toBeInTheDocument();
    expect(screen.getByText('location')).toBeInTheDocument();
    expect(screen.getByText('email')).toBeInTheDocument();
  });

  it('switches back to kanban view', async () => {
    const user = userEvent.setup();
    render(<ContactsPage />);
    await user.click(screen.getByText('viewList'));
    await user.click(screen.getByText('viewKanban'));
    expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
  });

  it('shows contact cards in kanban board', () => {
    render(<ContactsPage />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('opens detail panel when a card is clicked', async () => {
    const user = userEvent.setup();
    render(<ContactsPage />);
    await user.click(screen.getByTestId('kanban-card-c1'));
    // Detail panel shows activity summary and chatter
    expect(screen.getByText('activitySummary')).toBeInTheDocument();
    expect(screen.getByTestId('chatter')).toBeInTheDocument();
  });

  it('closes detail panel when close button is clicked', async () => {
    const user = userEvent.setup();
    render(<ContactsPage />);
    await user.click(screen.getByTestId('kanban-card-c1'));
    expect(screen.getByText('activitySummary')).toBeInTheDocument();

    // Close button has aria-label "closeDetailPanel"
    await user.click(screen.getByLabelText('closeDetailPanel'));
    expect(screen.queryByText('activitySummary')).not.toBeInTheDocument();
  });

  it('detail panel shows contact info for contact with value', async () => {
    const user = userEvent.setup();
    render(<ContactsPage />);
    await user.click(screen.getByTestId('kanban-card-c1'));
    // totalInvoiced12m should show a formatted currency value
    expect(screen.getByText('totalInvoiced12m')).toBeInTheDocument();
    expect(screen.getByText('$50,000')).toBeInTheDocument();
  });

  it('detail panel shows dashes for contact without value', async () => {
    const user = userEvent.setup();
    render(<ContactsPage />);
    await user.click(screen.getByTestId('kanban-card-c2'));
    // Contact with null value shows dashes
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('list view shows contacts in table', async () => {
    const user = userEvent.setup();
    render(<ContactsPage />);
    await user.click(screen.getByText('viewList'));
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
  });

  it('list view row click opens detail panel', async () => {
    const user = userEvent.setup();
    render(<ContactsPage />);
    await user.click(screen.getByText('viewList'));
    // Click the row containing Alice Smith
    await user.click(screen.getByText('Alice Smith'));
    expect(screen.getByText('activitySummary')).toBeInTheDocument();
  });

  it('detail panel renders tags including category and badges', async () => {
    const user = userEvent.setup();
    render(<ContactsPage />);
    await user.click(screen.getByTestId('kanban-card-c1'));
    // Badge for category + VIP badge
    const badges = screen.getAllByTestId('badge');
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });
});
