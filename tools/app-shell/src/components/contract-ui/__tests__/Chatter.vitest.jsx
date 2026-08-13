import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@/i18n/LocaleProvider', () => ({
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }) => <div data-testid="card" {...props}>{children}</div>,
  CardHeader: ({ children, ...props }) => <div data-testid="card-header" {...props}>{children}</div>,
  CardContent: ({ children, ...props }) => <div data-testid="card-content" {...props}>{children}</div>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }) => <span {...props} data-testid="badge">{children}</span>,
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  MessageSquare: () => <svg data-testid="icon-message" />,
  Send: () => <svg data-testid="icon-send" />,
  ChevronDown: () => <svg data-testid="icon-chevron" />,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chatter } from '../Chatter.jsx';

describe('Chatter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders collapsed by default', () => {
    render(<Chatter />);
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle notes/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders expanded when collapsed=false', () => {
    render(<Chatter collapsed={false} />);
    expect(screen.getByRole('log')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle notes/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles on header click', async () => {
    const user = userEvent.setup();
    render(<Chatter />);
    const header = screen.getByRole('button', { name: /toggle notes/i });
    expect(screen.queryByRole('log')).not.toBeInTheDocument();

    await user.click(header);
    expect(screen.getByRole('log')).toBeInTheDocument();

    await user.click(header);
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('toggles on Enter/Space keydown', () => {
    render(<Chatter />);
    const header = screen.getByRole('button', { name: /toggle notes/i });

    fireEvent.keyDown(header, { key: 'Enter' });
    expect(screen.getByRole('log')).toBeInTheDocument();

    fireEvent.keyDown(header, { key: ' ' });
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('shows empty state when no messages', () => {
    render(<Chatter collapsed={false} />);
    expect(screen.getByText(/no notes yet/i)).toBeInTheDocument();
  });

  it('shows badge with message count', () => {
    const msgs = [
      { id: '1', author: 'Alice', text: 'Hello', type: 'note' },
      { id: '2', author: 'Bob', text: 'World', type: 'note' },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByTestId('badge')).toHaveTextContent('2');
  });

  it('does not show badge when no messages', () => {
    render(<Chatter collapsed={false} />);
    expect(screen.queryByTestId('badge')).not.toBeInTheDocument();
  });

  it('renders user messages with author and text', () => {
    const msgs = [
      { id: '1', author: 'Alice', text: 'Hello world', type: 'note', timestamp: new Date() },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders system messages with italic styling', () => {
    const msgs = [
      { id: '1', text: 'Status changed', type: 'system', timestamp: new Date() },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('Status changed')).toBeInTheDocument();
  });

  it('shows "Unknown" when author is empty', () => {
    const msgs = [
      { id: '1', author: '', text: 'No author', type: 'note' },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('shows initial letter in avatar', () => {
    const msgs = [
      { id: '1', author: 'Zara', text: 'Hi', type: 'note' },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('Z')).toBeInTheDocument();
  });

  it('shows ? for null author initial', () => {
    const msgs = [
      { id: '1', author: null, text: 'Hi', type: 'note' },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('calls onAddNote when submitting with callback', async () => {
    const user = userEvent.setup();
    const onAddNote = vi.fn();
    render(<Chatter collapsed={false} onAddNote={onAddNote} />);

    const input = screen.getByLabelText('Note text');
    await user.type(input, 'My note');
    await user.click(screen.getByLabelText('Send note'));

    expect(onAddNote).toHaveBeenCalledWith('My note');
  });

  it('adds local message in mock mode (no onAddNote)', async () => {
    const user = userEvent.setup();
    render(<Chatter collapsed={false} />);

    const input = screen.getByLabelText('Note text');
    await user.type(input, 'Local note');
    await user.click(screen.getByLabelText('Send note'));

    expect(screen.getByText('Local note')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('does not submit empty input', async () => {
    const user = userEvent.setup();
    const onAddNote = vi.fn();
    render(<Chatter collapsed={false} onAddNote={onAddNote} />);

    await user.click(screen.getByLabelText('Send note'));
    expect(onAddNote).not.toHaveBeenCalled();
  });

  it('clears input after submission', async () => {
    const user = userEvent.setup();
    render(<Chatter collapsed={false} onAddNote={vi.fn()} />);

    const input = screen.getByLabelText('Note text');
    await user.type(input, 'Test');
    await user.click(screen.getByLabelText('Send note'));
    expect(input).toHaveValue('');
  });

  it('disables send button when input is empty', () => {
    render(<Chatter collapsed={false} />);
    expect(screen.getByLabelText('Send note')).toBeDisabled();
  });

  it('sets aria-label on log with entityType and entityId', () => {
    render(<Chatter collapsed={false} entityType="invoice" entityId="123" />);
    expect(screen.getByRole('log')).toHaveAttribute('aria-label', 'Notes for invoice 123');
  });

  it('handles message without timestamp', () => {
    const msgs = [
      { id: '1', author: 'Test', text: 'No time', type: 'note' },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('No time')).toBeInTheDocument();
  });

  it('handles system message without timestamp', () => {
    const msgs = [
      { id: '1', text: 'System event', type: 'system' },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('System event')).toBeInTheDocument();
  });

  it('shows relative time for recent messages', () => {
    const msgs = [
      { id: '1', author: 'A', text: 'Now', type: 'note', timestamp: new Date() },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('shows minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const msgs = [
      { id: '1', author: 'A', text: 'Earlier', type: 'note', timestamp: fiveMinAgo },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
  });

  it('shows 1 minute ago (singular)', () => {
    const oneMinAgo = new Date(Date.now() - 61 * 1000);
    const msgs = [
      { id: '1', author: 'A', text: 'X', type: 'note', timestamp: oneMinAgo },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('1 minute ago')).toBeInTheDocument();
  });

  it('shows hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const msgs = [
      { id: '1', author: 'A', text: 'X', type: 'note', timestamp: threeHoursAgo },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('3 hours ago')).toBeInTheDocument();
  });

  it('shows 1 hour ago (singular)', () => {
    const oneHourAgo = new Date(Date.now() - 61 * 60 * 1000);
    const msgs = [
      { id: '1', author: 'A', text: 'X', type: 'note', timestamp: oneHourAgo },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('1 hour ago')).toBeInTheDocument();
  });

  it('shows yesterday', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const msgs = [
      { id: '1', author: 'A', text: 'X', type: 'note', timestamp: yesterday },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('yesterday')).toBeInTheDocument();
  });

  it('shows N days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const msgs = [
      { id: '1', author: 'A', text: 'X', type: 'note', timestamp: threeDaysAgo },
    ];
    render(<Chatter collapsed={false} messages={msgs} />);
    expect(screen.getByText('3 days ago')).toBeInTheDocument();
  });

  it('handles form submit via Enter key', async () => {
    const user = userEvent.setup();
    const onAddNote = vi.fn();
    render(<Chatter collapsed={false} onAddNote={onAddNote} />);

    const input = screen.getByLabelText('Note text');
    await user.type(input, 'Enter note{Enter}');
    expect(onAddNote).toHaveBeenCalledWith('Enter note');
  });
});
