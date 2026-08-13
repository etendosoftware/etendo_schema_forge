import { render, screen } from '@testing-library/react';

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardContent: ({ children, className }) => <div className={className}>{children}</div>,
}));
vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }) => <span>{children}</span>,
}));
vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));
vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

import { KanbanBoard } from '../KanbanBoard.jsx';

const COLUMNS = [
  { id: 'todo', title: 'To Do', color: 'blue' },
  { id: 'doing', title: 'Doing', color: 'green' },
  { id: 'done', title: 'Done', color: 'red' },
];

const CARDS = [
  { id: 'c1', columnId: 'todo', title: 'Task 1', subtitle: 'Sub 1' },
  { id: 'c2', columnId: 'todo', title: 'Task 2', avatar: 'John', value: 1500, priority: 2, badges: ['urgent'] },
  { id: 'c3', columnId: 'doing', title: 'Task 3' },
];

describe('KanbanBoard', () => {
  it('renders all columns', () => {
    render(<KanbanBoard columns={COLUMNS} cards={CARDS} />);
    expect(screen.getByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('Doing')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('renders cards in correct columns', () => {
    render(<KanbanBoard columns={COLUMNS} cards={CARDS} />);
    expect(screen.getByText('Task 1')).toBeInTheDocument();
    expect(screen.getByText('Task 2')).toBeInTheDocument();
    expect(screen.getByText('Task 3')).toBeInTheDocument();
  });

  it('shows empty message for columns with no cards', () => {
    render(<KanbanBoard columns={COLUMNS} cards={CARDS} emptyMessage="Empty" />);
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });

  it('shows default empty message when no emptyMessage prop', () => {
    render(<KanbanBoard columns={COLUMNS} cards={[]} />);
    const empties = screen.getAllByText('No items');
    expect(empties.length).toBe(3);
  });

  it('renders card subtitle when present', () => {
    render(<KanbanBoard columns={COLUMNS} cards={CARDS} />);
    expect(screen.getByText('Sub 1')).toBeInTheDocument();
  });

  it('renders avatar circle with initial', () => {
    render(<KanbanBoard columns={COLUMNS} cards={CARDS} />);
    expect(screen.getByLabelText('John')).toBeInTheDocument();
    expect(screen.getByLabelText('John').textContent).toBe('J');
  });

  it('renders card value as formatted currency', () => {
    render(<KanbanBoard columns={COLUMNS} cards={CARDS} />);
    // Intl.NumberFormat formats 1500 as $1,500
    expect(screen.getByText('$1,500')).toBeInTheDocument();
  });

  it('renders priority stars', () => {
    render(<KanbanBoard columns={COLUMNS} cards={CARDS} />);
    expect(screen.getByLabelText('Priority 2 of 3')).toBeInTheDocument();
  });

  it('renders badges on cards', () => {
    render(<KanbanBoard columns={COLUMNS} cards={CARDS} />);
    expect(screen.getByText('urgent')).toBeInTheDocument();
  });

  it('renders with custom renderCard', () => {
    const custom = (card) => <div data-testid="custom">{card.title}-custom</div>;
    render(<KanbanBoard columns={COLUMNS} cards={CARDS} renderCard={custom} />);
    expect(screen.getAllByTestId('custom').length).toBeGreaterThan(0);
  });

  it('handles card without subtitle', () => {
    const cards = [{ id: 'c1', columnId: 'todo', title: 'No Sub' }];
    render(<KanbanBoard columns={COLUMNS} cards={cards} />);
    expect(screen.getByText('No Sub')).toBeInTheDocument();
  });

  it('handles card without avatar', () => {
    const cards = [{ id: 'c1', columnId: 'todo', title: 'No Avatar' }];
    render(<KanbanBoard columns={COLUMNS} cards={cards} />);
    expect(screen.getByText('No Avatar')).toBeInTheDocument();
  });

  it('handles card without value or priority', () => {
    const cards = [{ id: 'c1', columnId: 'todo', title: 'Simple' }];
    render(<KanbanBoard columns={COLUMNS} cards={cards} />);
    expect(screen.getByText('Simple')).toBeInTheDocument();
  });

  it('renders with empty columns and cards arrays', () => {
    const { container } = render(<KanbanBoard columns={[]} cards={[]} />);
    expect(container.querySelector('[aria-label="Kanban board"]')).toBeInTheDocument();
  });

  it('renders column without color (uses default)', () => {
    const cols = [{ id: 'x', title: 'No Color' }];
    render(<KanbanBoard columns={cols} cards={[]} />);
    expect(screen.getByText('No Color')).toBeInTheDocument();
  });

  it('renders column with each color variant', () => {
    const colors = ['blue', 'green', 'red', 'yellow', 'purple', 'orange', 'pink', 'gray'];
    const cols = colors.map(c => ({ id: c, title: c, color: c }));
    render(<KanbanBoard columns={cols} cards={[]} />);
    colors.forEach(c => expect(screen.getByText(c)).toBeInTheDocument());
  });

  it('handles card with priority 0 (no stars)', () => {
    const cards = [{ id: 'c1', columnId: 'todo', title: 'P0', priority: 0 }];
    render(<KanbanBoard columns={COLUMNS} cards={cards} />);
    expect(screen.queryByLabelText(/Priority/)).not.toBeInTheDocument();
  });

  it('handles card with priority > 3 (capped at 3)', () => {
    const cards = [{ id: 'c1', columnId: 'todo', title: 'P5', priority: 5 }];
    render(<KanbanBoard columns={COLUMNS} cards={cards} />);
    expect(screen.getByLabelText('Priority 3 of 3')).toBeInTheDocument();
  });

  it('handles card value of 0', () => {
    const cards = [{ id: 'c1', columnId: 'todo', title: 'Zero', value: 0 }];
    render(<KanbanBoard columns={COLUMNS} cards={cards} />);
    expect(screen.getByText('$0')).toBeInTheDocument();
  });

  it('handles card value null (no currency shown)', () => {
    const cards = [{ id: 'c1', columnId: 'todo', title: 'Null', value: null }];
    render(<KanbanBoard columns={COLUMNS} cards={cards} />);
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('renders card with empty badges array', () => {
    const cards = [{ id: 'c1', columnId: 'todo', title: 'NoBadge', badges: [] }];
    render(<KanbanBoard columns={COLUMNS} cards={cards} />);
    expect(screen.getByText('NoBadge')).toBeInTheDocument();
  });

  it('renders card with badge as object with label', () => {
    const cards = [{ id: 'c1', columnId: 'todo', title: 'ObjBadge', badges: [{ label: 'Important' }] }];
    render(<KanbanBoard columns={COLUMNS} cards={cards} />);
    expect(screen.getByText('Important')).toBeInTheDocument();
  });

  it('shows card count in column header', () => {
    render(<KanbanBoard columns={COLUMNS} cards={CARDS} />);
    // todo has 2 cards
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
