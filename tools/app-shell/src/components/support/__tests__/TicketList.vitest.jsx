import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
}));

vi.mock('../ValerIATile.jsx', () => ({
  ValerIATile: () => <span data-testid="valeria-tile" />,
}));

import { TicketList } from '../TicketList.jsx';

describe('TicketList', () => {
  it('shows a loading state', () => {
    render(<TicketList conversations={[]} isLoading onSelect={vi.fn()} />);
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('shows an empty state with a call-to-action when there are no conversations', () => {
    const onStartChat = vi.fn();
    render(<TicketList conversations={[]} isLoading={false} onSelect={vi.fn()} onStartChat={onStartChat} />);
    expect(screen.getByText('supportNoConversations')).toBeInTheDocument();
    expect(screen.getByText(/supportAskQuestionCta/)).toBeInTheDocument();
  });

  it('does not render the CTA in the empty state when onStartChat is not provided', () => {
    render(<TicketList conversations={[]} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.queryByText(/supportAskQuestionCta/)).not.toBeInTheDocument();
  });

  it('renders a row per conversation with subject and bot avatar', () => {
    const conversations = [
      { id: 'c1', subject: 'Duda sobre facturación', lastMessage: 'Hola', unread: false, status: 'open' },
    ];
    render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Duda sobre facturación')).toBeInTheDocument();
    expect(screen.getByTestId('valeria-tile')).toBeInTheDocument();
  });

  it('falls back to a default subject when the conversation has none', () => {
    const conversations = [{ id: 'c1', unread: false, status: 'open' }];
    render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.getByText('supportDefaultSubject')).toBeInTheDocument();
  });

  it('renders initials instead of the bot avatar for human-assigned conversations', () => {
    const conversations = [
      { id: 'c1', subject: 'Con un humano', assigneeKind: 'human', assigneeInitials: 'LP', status: 'open' },
    ];
    render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.getByText('LP')).toBeInTheDocument();
    expect(screen.queryByTestId('valeria-tile')).not.toBeInTheDocument();
  });

  it('calls onSelect with the conversation id when a row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const conversations = [{ id: 'c42', subject: 'Click me', status: 'open' }];
    render(<TicketList conversations={conversations} isLoading={false} onSelect={onSelect} />);
    await user.click(screen.getByText('Click me'));
    expect(onSelect).toHaveBeenCalledWith('c42');
  });

  it('shows the closed status label for closed conversations even if marked unread', () => {
    const conversations = [{ id: 'c1', subject: 'Cerrado', status: 'closed', unread: true }];
    render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.getByText('supportStatusClosed')).toBeInTheDocument();
  });

  it('shows the new-message badge for unread open conversations', () => {
    const conversations = [{ id: 'c1', subject: 'Nuevo', status: 'open', unread: true }];
    render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.getByText('supportNewMessageBadge')).toBeInTheDocument();
  });
});
