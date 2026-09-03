import { render, screen, fireEvent } from '@testing-library/react';
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

  it('prepends the linked Jira ticket key, in its own lighter span, before the title', () => {
    const conversations = [
      { id: 'c1', subject: 'Duda sobre facturación', status: 'open', jiraTicketKey: 'ESD-1234' },
    ];
    const { container } = render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} />);
    const title = container.querySelector('.sc-t-title');
    expect(title).toHaveTextContent('ESD-1234 - Duda sobre facturación');
    const key = container.querySelector('.sc-t-key');
    expect(key).toHaveTextContent('ESD-1234');
    // The key must render BEFORE the subject text, not after.
    expect(title.firstChild).toBe(key);
  });

  it('shows just the subject with no leading key span when there is no jiraTicketKey '
    + '(regression guard against the title silently drifting)', () => {
    const conversations = [
      { id: 'c1', subject: 'Duda sobre facturación', status: 'open' },
    ];
    const { container } = render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.getByText('Duda sobre facturación')).toBeInTheDocument();
    expect(container.querySelector('.sc-t-key')).not.toBeInTheDocument();
  });

  describe('additional coverage', () => {
    it('renders the "open" status badge and CSS class when a conversation has no explicit status', () => {
      const conversations = [{ id: 'c1', subject: 'Sin estado', unread: false }];
      const { container } = render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} />);
      expect(screen.getByText('supportStatusOpen')).toBeInTheDocument();
      expect(container.querySelector('.sc-t-status.open')).toBeInTheDocument();
    });

    it('shows the waiting-status label for a conversation awaiting a reply', () => {
      const conversations = [{ id: 'c1', subject: 'Esperando', status: 'waiting', unread: false }];
      render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} />);
      expect(screen.getByText('supportStatusWaiting')).toBeInTheDocument();
    });

    it('falls back to the first letter of the assignee name when no initials are set', () => {
      const conversations = [
        { id: 'c1', subject: 'Con nombre', assigneeKind: 'human', assigneeName: 'Lucas', status: 'open' },
      ];
      render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} />);
      expect(screen.getByText('L')).toBeInTheDocument();
    });

    it('falls back to "A" when a human-assigned conversation has neither initials nor a name', () => {
      const conversations = [
        { id: 'c1', subject: 'Sin nada', assigneeKind: 'human', status: 'open' },
      ];
      render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} />);
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('selects a row when Enter is pressed on it, and ignores other keys', () => {
      const onSelect = vi.fn();
      const conversations = [{ id: 'c42', subject: 'Con teclado', status: 'open' }];
      render(<TicketList conversations={conversations} isLoading={false} onSelect={onSelect} />);
      const row = screen.getByText('Con teclado').closest('[role="button"]');
      fireEvent.keyDown(row, { key: 'Tab' });
      expect(onSelect).not.toHaveBeenCalled();
      fireEvent.keyDown(row, { key: 'Enter' });
      expect(onSelect).toHaveBeenCalledWith('c42');
    });

    it('renders the ask-a-question CTA below a non-empty conversation list and calls onStartChat', async () => {
      const user = userEvent.setup();
      const onStartChat = vi.fn();
      const conversations = [{ id: 'c1', subject: 'Con CTA', status: 'open' }];
      render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} onStartChat={onStartChat} />);
      await user.click(screen.getByText(/supportAskQuestionCta/));
      expect(onStartChat).toHaveBeenCalledTimes(1);
    });

    describe('relative time labels', () => {
      let nowSpy;
      beforeEach(() => {
        nowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date('2024-06-15T12:00:00.000Z').getTime());
      });
      afterEach(() => {
        nowSpy.mockRestore();
      });

      function conversationAt(msAgo) {
        return {
          id: 'c1',
          subject: 'Con actividad',
          status: 'open',
          lastActivity: new Date(Date.now() - msAgo).toISOString(),
        };
      }

      it('shows "just now" for activity under a minute old', () => {
        render(<TicketList conversations={[conversationAt(30 * 1000)]} isLoading={false} onSelect={vi.fn()} />);
        expect(screen.getByText('supportTimeNow')).toBeInTheDocument();
      });

      it('shows minutes-ago for activity under an hour old', () => {
        render(<TicketList conversations={[conversationAt(5 * 60 * 1000)]} isLoading={false} onSelect={vi.fn()} />);
        expect(screen.getByText(/supportTimeMinutesAgo/)).toBeInTheDocument();
      });

      it('shows hours and minutes ago for activity a few hours old with a remainder', () => {
        render(<TicketList conversations={[conversationAt((2 * 60 + 15) * 60 * 1000)]} isLoading={false} onSelect={vi.fn()} />);
        expect(screen.getByText(/supportTimeHoursMinutesAgo/)).toBeInTheDocument();
      });

      it('shows only hours ago when there is no minute remainder', () => {
        render(<TicketList conversations={[conversationAt(2 * 60 * 60 * 1000)]} isLoading={false} onSelect={vi.fn()} />);
        expect(screen.getByText(/supportTimeHoursAgo/)).toBeInTheDocument();
      });

      it('shows hours ago for activity between 6 and 24 hours old', () => {
        render(<TicketList conversations={[conversationAt(10 * 60 * 60 * 1000)]} isLoading={false} onSelect={vi.fn()} />);
        expect(screen.getByText(/supportTimeHoursAgo/)).toBeInTheDocument();
      });

      it('shows "yesterday" for activity exactly one day old', () => {
        render(<TicketList conversations={[conversationAt(30 * 60 * 60 * 1000)]} isLoading={false} onSelect={vi.fn()} />);
        expect(screen.getByText('supportTimeYesterday')).toBeInTheDocument();
      });

      it('shows days-ago for activity a few days old', () => {
        render(<TicketList conversations={[conversationAt(3 * 24 * 60 * 60 * 1000)]} isLoading={false} onSelect={vi.fn()} />);
        expect(screen.getByText(/supportTimeDaysAgo/)).toBeInTheDocument();
      });

      it('shows weeks-ago for activity more than a week old', () => {
        render(<TicketList conversations={[conversationAt(10 * 24 * 60 * 60 * 1000)]} isLoading={false} onSelect={vi.fn()} />);
        expect(screen.getByText(/supportTimeWeeksAgo/)).toBeInTheDocument();
      });

      it('falls back to an empty relative time when formatting throws', () => {
        const conversations = [{ id: 'c1', subject: 'Error', status: 'open', lastActivity: '2024-01-01T00:00:00.000Z' }];
        nowSpy.mockImplementation(() => { throw new Error('boom'); });
        const { container } = render(<TicketList conversations={conversations} isLoading={false} onSelect={vi.fn()} />);
        expect(container.querySelector('.sc-t-time')).toHaveTextContent('');
      });
    });
  });
});
