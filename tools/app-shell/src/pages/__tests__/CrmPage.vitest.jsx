import { render, screen } from '@testing-library/react';

// Mock i18n
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock contract-ui components
vi.mock('@/components/contract-ui', () => ({
  KPIHeader: ({ kpis }) => <div data-testid="kpi-header">{kpis.length} kpis</div>,
  KanbanBoard: ({ columns, cards, emptyMessage }) => (
    <div data-testid="kanban-board">{cards.length} cards</div>
  ),
  DataTable: ({ data }) => <div data-testid="data-table">{data?.length ?? 0} rows</div>,
}));

// Mock UI components
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }) => <div>{children}</div>,
  CardTitle: ({ children }) => <div>{children}</div>,
  CardContent: ({ children }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

// Mock lucide icons
vi.mock('lucide-react', () => ({
  Target: (props) => <svg {...props} />,
  DollarSign: (props) => <svg {...props} />,
  Trophy: (props) => <svg {...props} />,
  TrendingUp: (props) => <svg {...props} />,
  Users: (props) => <svg {...props} />,
  Activity: (props) => <svg {...props} />,
  ArrowUp: (props) => <svg {...props} />,
  ArrowDown: (props) => <svg {...props} />,
}));

// Mock CRM config and data
vi.mock('@generated/crm/generated/config', () => ({
  sections: {
    kpis: {
      kpis: [
        { key: 'revenue', label: 'Revenue', icon: 'DollarSign' },
        { key: 'deals', label: 'Deals', icon: 'Target' },
      ],
    },
    dealPipeline: {
      columns: [
        { id: 'col1', title: 'New' },
        { id: 'col2', title: 'Won' },
      ],
    },
    recentActivities: {
      columns: [{ key: 'name', label: 'Name' }],
      filters: [],
    },
  },
}));

vi.mock('@generated/crm/generated/mockData', () => ({
  kpis: { revenue: 5000, deals: 12, trends: { revenue: 5 } },
  dealPipeline: [
    { id: 'card1', columnId: 'col1', title: 'Deal A' },
    { id: 'card2', columnId: 'col2', title: 'Deal B' },
  ],
  recentActivities: [
    { id: 'act1', name: 'Call with Client', status: 'Completed' },
  ],
  teamFeed: [
    { id: 'tf1', label: 'New sale', time: '2h ago', direction: 'in', detail: '$1000' },
    { id: 'tf2', label: 'Invoice sent', time: '3h ago', direction: 'out' },
    { id: 'tf3', label: 'Meeting', time: '5h ago' },
  ],
}));

import CrmPage from '../CrmPage.jsx';

describe('CrmPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<CrmPage />);
  });

  it('renders the KPI header with correct count', () => {
    render(<CrmPage />);
    expect(screen.getByTestId('kpi-header')).toHaveTextContent('2 kpis');
  });

  it('renders the Kanban board with cards', () => {
    render(<CrmPage />);
    expect(screen.getByTestId('kanban-board')).toHaveTextContent('2 cards');
  });

  it('renders the recent activities data table', () => {
    render(<CrmPage />);
    expect(screen.getByTestId('data-table')).toHaveTextContent('1 rows');
  });

  it('renders the recent activities section title', () => {
    render(<CrmPage />);
    expect(screen.getByText('recentActivities')).toBeInTheDocument();
  });

  it('renders the team activity section title', () => {
    render(<CrmPage />);
    expect(screen.getByText('teamActivity')).toBeInTheDocument();
  });

  it('renders team feed entries', () => {
    render(<CrmPage />);
    expect(screen.getByText('New sale')).toBeInTheDocument();
    expect(screen.getByText('Invoice sent')).toBeInTheDocument();
    expect(screen.getByText('Meeting')).toBeInTheDocument();
  });

  it('renders team feed times', () => {
    render(<CrmPage />);
    expect(screen.getByText('2h ago')).toBeInTheDocument();
    expect(screen.getByText('3h ago')).toBeInTheDocument();
  });

  it('renders detail text for entries that have it', () => {
    render(<CrmPage />);
    expect(screen.getByText('$1000')).toBeInTheDocument();
  });

  it('renders separators between feed entries (not before first)', () => {
    render(<CrmPage />);
    // 3 entries = 2 separators
    const separators = screen.getAllByRole('separator');
    expect(separators).toHaveLength(2);
  });
});
