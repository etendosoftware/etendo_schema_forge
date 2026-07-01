import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

vi.mock('@/components/ui/input.jsx', () => ({
  Input: (props) => <input {...props} />,
}));

vi.mock('@/components/ui/separator.jsx', () => ({
  Separator: () => <hr />,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Archive: () => <svg data-testid="icon-archive" />,
  LoaderCircle: () => <svg data-testid="icon-loader" />,
  Plus: () => <svg data-testid="icon-plus" />,
  Search: () => <svg data-testid="icon-search" />,
}));

vi.mock('../ConversationItem.jsx', () => ({
  ConversationItem: ({ conversation, isActive, isArchived, onSelect, onDelete, onRestore, onPermanentDelete, onRename }) => (
    <div
      data-testid={`conv-item-${conversation.conversation_id}`}
      data-active={isActive}
      data-archived={isArchived}
      onClick={onSelect}
    >
      {conversation.title}
    </div>
  ),
}));

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationSidebar } from '../ConversationSidebar.jsx';

describe('ConversationSidebar', () => {
  const convos = [
    { conversation_id: 'c1', title: 'First Chat' },
    { conversation_id: 'c2', title: 'Second Chat' },
  ];

  const archived = [
    { conversation_id: 'a1', title: 'Old Chat' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the header with title and new-button', () => {
    render(<ConversationSidebar />);
    expect(screen.getByText('copilotConversations')).toBeInTheDocument();
    expect(screen.getByLabelText('copilotNewConversation')).toBeInTheDocument();
  });

  it('calls onNew when plus button is clicked', async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    render(<ConversationSidebar onNew={onNew} />);
    await user.click(screen.getByLabelText('copilotNewConversation'));
    expect(onNew).toHaveBeenCalled();
  });

  it('renders conversation items', () => {
    render(<ConversationSidebar conversations={convos} />);
    expect(screen.getByTestId('conv-item-c1')).toBeInTheDocument();
    expect(screen.getByTestId('conv-item-c2')).toBeInTheDocument();
  });

  it('marks the active conversation', () => {
    render(<ConversationSidebar conversations={convos} activeConversationId="c1" />);
    expect(screen.getByTestId('conv-item-c1')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('conv-item-c2')).toHaveAttribute('data-active', 'false');
  });

  it('shows loading spinner when isLoading', () => {
    render(<ConversationSidebar isLoading={true} />);
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
  });

  it('shows empty state when no conversations and not loading', () => {
    render(<ConversationSidebar conversations={[]} />);
    expect(screen.getByText('copilotNoConversations')).toBeInTheDocument();
  });

  it('filters conversations by search term', async () => {
    const user = userEvent.setup();
    render(<ConversationSidebar conversations={convos} />);
    const input = screen.getByPlaceholderText('copilotSearchConversations');
    await user.type(input, 'First');
    expect(screen.getByTestId('conv-item-c1')).toBeInTheDocument();
    expect(screen.queryByTestId('conv-item-c2')).not.toBeInTheDocument();
  });

  it('shows no conversations when search has no match', async () => {
    const user = userEvent.setup();
    render(<ConversationSidebar conversations={convos} />);
    const input = screen.getByPlaceholderText('copilotSearchConversations');
    await user.type(input, 'zzzzz');
    expect(screen.getByText('copilotNoConversations')).toBeInTheDocument();
  });

  it('calls onSelect when a conversation item is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ConversationSidebar conversations={convos} onSelect={onSelect} />);
    await user.click(screen.getByTestId('conv-item-c1'));
    expect(onSelect).toHaveBeenCalledWith(convos[0]);
  });

  // Archived section
  it('shows archive section when archivedConversations exist', () => {
    render(<ConversationSidebar archivedConversations={archived} />);
    expect(screen.getByText('copilotArchived')).toBeInTheDocument();
  });

  it('hides archive section when no archived conversations', () => {
    render(<ConversationSidebar archivedConversations={[]} />);
    expect(screen.queryByText('copilotArchived')).not.toBeInTheDocument();
  });

  it('shows archive section when isLoadingArchived', () => {
    render(<ConversationSidebar isLoadingArchived={true} />);
    expect(screen.getByText('copilotArchived')).toBeInTheDocument();
  });

  it('toggles archived list on click', async () => {
    const user = userEvent.setup();
    render(<ConversationSidebar archivedConversations={archived} />);

    // Archived items should not be visible initially
    expect(screen.queryByTestId('conv-item-a1')).not.toBeInTheDocument();

    // Click to open
    await user.click(screen.getByText('copilotArchived'));
    expect(screen.getByTestId('conv-item-a1')).toBeInTheDocument();

    // Click to close
    await user.click(screen.getByText('copilotArchived'));
    expect(screen.queryByTestId('conv-item-a1')).not.toBeInTheDocument();
  });

  it('shows archive count', async () => {
    const user = userEvent.setup();
    render(<ConversationSidebar archivedConversations={archived} />);
    expect(screen.getByText('(1)')).toBeInTheDocument();
  });

  it('shows no archived conversations message when archived list is open but empty after filter', async () => {
    const user = userEvent.setup();
    render(<ConversationSidebar conversations={convos} archivedConversations={archived} />);

    // Open archive
    await user.click(screen.getByText('copilotArchived'));
    expect(screen.getByTestId('conv-item-a1')).toBeInTheDocument();

    // Filter to exclude archived
    const input = screen.getByPlaceholderText('copilotSearchConversations');
    await user.type(input, 'zzzzz');
    expect(screen.getByText('copilotNoArchivedConversations')).toBeInTheDocument();
  });

  it('shows loading spinner in archive section when isLoadingArchived and archive is open', async () => {
    const user = userEvent.setup();
    render(<ConversationSidebar isLoadingArchived={true} />);

    // Open archive
    await user.click(screen.getByText('copilotArchived'));
    // Should see loader inside archive
    const loaders = screen.getAllByTestId('icon-loader');
    expect(loaders.length).toBeGreaterThanOrEqual(1);
  });

  it('filters archived conversations too', async () => {
    const user = userEvent.setup();
    render(<ConversationSidebar archivedConversations={archived} />);
    await user.click(screen.getByText('copilotArchived'));

    const input = screen.getByPlaceholderText('copilotSearchConversations');
    await user.type(input, 'Old');
    expect(screen.getByTestId('conv-item-a1')).toBeInTheDocument();
  });

  it('sets isArchived=true on archived conversation items', async () => {
    const user = userEvent.setup();
    render(<ConversationSidebar archivedConversations={archived} />);
    await user.click(screen.getByText('copilotArchived'));
    expect(screen.getByTestId('conv-item-a1')).toHaveAttribute('data-archived', 'true');
  });

  it('renders without crashing with all defaults', () => {
    render(<ConversationSidebar />);
    expect(screen.getByText('copilotConversations')).toBeInTheDocument();
  });
});
