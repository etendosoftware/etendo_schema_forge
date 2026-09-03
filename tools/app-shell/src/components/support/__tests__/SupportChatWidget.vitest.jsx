import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
}));

const mockUseSupportChat = vi.fn();
vi.mock('../SupportChatContext.jsx', () => ({
  useSupportChat: () => mockUseSupportChat(),
}));

const mockUseCopilot = vi.fn(() => ({ isOpen: false }));
vi.mock('@/components/CopilotContext', () => ({
  useCopilot: () => mockUseCopilot(),
}));

// The fuller mocks below expose the callback props as clickable buttons so
// tests can exercise SupportChatWidget's wiring logic (handleSend,
// handleSubmitRating, onBack, etc.) without rendering the real subcomponents.
vi.mock('../ConversationView.jsx', () => ({
  ConversationView: (props) => (
    <div data-testid="conversation-view">
      <span data-testid="expanded-flag">{String(props.isExpanded)}</span>
      <span data-testid="active-subject">{props.conversation?.subject}</span>
      <button onClick={() => props.onSend('hi', [])}>conv-send</button>
      <button onClick={() => props.onSend(undefined, undefined)}>conv-send-fallback</button>
      <button onClick={() => props.onBack()}>conv-back</button>
      <button onClick={() => props.onSubmitRating(5, 'ok')}>conv-rate</button>
      <button onClick={() => props.onDismissRating()}>conv-dismiss</button>
      <button onClick={() => props.onReopenConversation()}>conv-reopen</button>
      <button onClick={() => props.onToggleExpand()}>conv-toggle-expand</button>
    </div>
  ),
}));

vi.mock('../TicketList.jsx', () => ({
  TicketList: (props) => (
    <div data-testid="ticket-list">
      {(props.conversations || []).map((c) => (
        <div key={c.id} data-testid={`ticket-${c.id}`}>{c.subject}</div>
      ))}
      <button onClick={() => props.onSelect('c1')}>ticket-select</button>
      <button onClick={() => props.onStartChat()}>ticket-start</button>
    </div>
  ),
}));

vi.mock('../helpDocs.js', () => ({
  fetchHelpDocs: vi.fn(),
  groupHelpCollections: vi.fn(() => []),
  searchHelpDocs: vi.fn(() => []),
  docUrl: (loc) => `https://docs.example/${loc}`,
}));

import { fetchHelpDocs, groupHelpCollections, searchHelpDocs } from '../helpDocs.js';
import { SupportChatWidget } from '../SupportChatWidget.jsx';

const BASE_STATE = {
  isOpen: false,
  activeTab: 'inicio',
  conversations: [],
  activeConversationId: null,
  messages: [],
  input: '',
  isSending: false,
  isLoadingConversations: false,
  isLoadingMessages: false,
  pendingFiles: [],
  unreadCount: 0,
};

function mockChat(stateOverrides = {}, actionOverrides = {}) {
  const actions = {
    open: vi.fn(),
    close: vi.fn(),
    setTab: vi.fn(),
    loadConversations: vi.fn(),
    loadMessages: vi.fn(),
    startConversation: vi.fn(),
    sendMessage: vi.fn(),
    selectConversation: vi.fn(),
    setInput: vi.fn(),
    submitRating: vi.fn(),
    dismissRating: vi.fn(),
    closeConversation: vi.fn(),
    reopenConversation: vi.fn(),
    addPendingFile: vi.fn(),
    removePendingFile: vi.fn(),
    dismissFab: vi.fn(),
    ...actionOverrides,
  };
  mockUseSupportChat.mockReturnValue({ state: { ...BASE_STATE, ...stateOverrides }, actions });
  return actions;
}

describe('SupportChatWidget', () => {
  beforeEach(() => {
    fetchHelpDocs.mockResolvedValue([]);
    mockUseCopilot.mockReturnValue({ isOpen: false });
  });

  it('renders a closed FAB with no badge when there is nothing unread', () => {
    mockChat({ isOpen: false, unreadCount: 0 });
    render(<SupportChatWidget />);
    expect(screen.getByLabelText('supportOpenAria')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('shows the unread count on the closed FAB, capped at "9+"', () => {
    mockChat({ isOpen: false, unreadCount: 12 });
    render(<SupportChatWidget />);
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('calls actions.open when the FAB is clicked', async () => {
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: false });
    render(<SupportChatWidget />);
    await user.click(screen.getByLabelText('supportOpenAria'));
    expect(actions.open).toHaveBeenCalledTimes(1);
  });

  it('renders the Inicio tab greeting when open', () => {
    mockChat({ isOpen: true, activeTab: 'inicio' });
    render(<SupportChatWidget />);
    expect(screen.getByText('supportHomeGreeting')).toBeInTheDocument();
  });

  it('starts a new conversation and switches to Mensajes when the ask-a-question card is clicked', async () => {
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: true, activeTab: 'inicio' });
    render(<SupportChatWidget />);
    await user.click(screen.getByText('supportAskQuestionCta'));
    expect(actions.selectConversation).toHaveBeenCalledWith('new');
    expect(actions.setTab).toHaveBeenCalledWith('mensajes');
  });

  it('renders the ticket list on the Mensajes tab when there is no active conversation', () => {
    mockChat({ isOpen: true, activeTab: 'mensajes', activeConversationId: null });
    render(<SupportChatWidget />);
    expect(screen.getByTestId('ticket-list')).toBeInTheDocument();
  });

  it('renders the conversation view once a conversation is active, regardless of tab', () => {
    mockChat({ isOpen: true, activeTab: 'inicio', activeConversationId: 'c1' });
    render(<SupportChatWidget />);
    expect(screen.getByTestId('conversation-view')).toBeInTheDocument();
  });

  it('hides the tab bar while a conversation is open', () => {
    mockChat({ isOpen: true, activeConversationId: 'c1' });
    render(<SupportChatWidget />);
    expect(screen.queryByText('supportTabHome')).not.toBeInTheDocument();
  });

  it('switches tabs when a tab bar button is clicked', async () => {
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: true, activeTab: 'inicio' });
    render(<SupportChatWidget />);
    await user.click(screen.getByText('supportTabHelp'));
    expect(actions.setTab).toHaveBeenCalledWith('ayuda');
  });

  it('loads and renders help docs on the Ayuda tab', async () => {
    fetchHelpDocs.mockResolvedValue([{ location: 'facturas/', title: 'Facturas' }]);
    mockChat({ isOpen: true, activeTab: 'ayuda' });
    render(<SupportChatWidget />);
    await waitFor(() => expect(fetchHelpDocs).toHaveBeenCalled());
  });

  it('shows a load error message when fetching help docs fails', async () => {
    fetchHelpDocs.mockRejectedValue(new Error('network down'));
    mockChat({ isOpen: true, activeTab: 'ayuda' });
    render(<SupportChatWidget />);
    await waitFor(() => expect(screen.getByText('supportDocsLoadError')).toBeInTheDocument());
  });

  it('shows an unread indicator dot on the Mensajes tab button when there are unread conversations', () => {
    mockChat({ isOpen: true, activeTab: 'inicio', unreadCount: 2 });
    const { container } = render(<SupportChatWidget />);
    expect(container.querySelector('.sc-ind-dot')).toBeInTheDocument();
  });

  it('shifts the panel clear of Copilot\'s own panel when Copilot is open, so the two floating '
      + 'windows do not stack on top of each other', () => {
    mockChat({ isOpen: true, activeTab: 'inicio' });
    mockUseCopilot.mockReturnValue({ isOpen: true });
    const { container } = render(<SupportChatWidget />);
    expect(container.querySelector('.sc-panel--copilot-open')).toBeInTheDocument();
  });

  it('does not shift the panel when Copilot is closed', () => {
    mockChat({ isOpen: true, activeTab: 'inicio' });
    mockUseCopilot.mockReturnValue({ isOpen: false });
    const { container } = render(<SupportChatWidget />);
    expect(container.querySelector('.sc-panel--copilot-open')).not.toBeInTheDocument();
  });

  it('loads conversations when the Mensajes tab becomes active', () => {
    const actions = mockChat({ isOpen: true, activeTab: 'mensajes' });
    render(<SupportChatWidget />);
    expect(actions.loadConversations).toHaveBeenCalled();
  });

  it('does not load conversations while on the Inicio tab', () => {
    const actions = mockChat({ isOpen: true, activeTab: 'inicio' });
    render(<SupportChatWidget />);
    expect(actions.loadConversations).not.toHaveBeenCalled();
  });

  it('loads messages when a conversation is selected and has no messages yet', () => {
    const actions = mockChat({ isOpen: true, activeConversationId: 'c1', messages: [] });
    render(<SupportChatWidget />);
    expect(actions.loadMessages).toHaveBeenCalledWith('c1');
  });

  it('does not reload messages once messages are already present', () => {
    const actions = mockChat({
      isOpen: true,
      activeConversationId: 'c1',
      messages: [{ id: 'm1', sender: 'user', text: 'hola' }],
    });
    render(<SupportChatWidget />);
    expect(actions.loadMessages).not.toHaveBeenCalled();
  });

  it('does not load messages for an unsent draft conversation ("new")', () => {
    const actions = mockChat({ isOpen: true, activeConversationId: 'new', messages: [] });
    render(<SupportChatWidget />);
    expect(actions.loadMessages).not.toHaveBeenCalled();
  });

  it('selecting a ticket from the list calls selectConversation', async () => {
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: true, activeTab: 'mensajes' });
    render(<SupportChatWidget />);
    await user.click(screen.getByText('ticket-select'));
    expect(actions.selectConversation).toHaveBeenCalledWith('c1');
  });

  it('starting a chat from the ticket list switches to a new draft conversation', async () => {
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: true, activeTab: 'mensajes' });
    render(<SupportChatWidget />);
    await user.click(screen.getByText('ticket-start'));
    expect(actions.selectConversation).toHaveBeenCalledWith('new');
    expect(actions.setTab).toHaveBeenCalledWith('mensajes');
  });

  it('sending a message on an existing conversation calls sendMessage', async () => {
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: true, activeConversationId: 'c1' });
    render(<SupportChatWidget />);
    await user.click(screen.getByText('conv-send'));
    expect(actions.sendMessage).toHaveBeenCalledWith('c1', 'hi', []);
    expect(actions.startConversation).not.toHaveBeenCalled();
  });

  it('sending a message on a fresh draft conversation calls startConversation', async () => {
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: true, activeConversationId: 'new' });
    render(<SupportChatWidget />);
    await user.click(screen.getByText('conv-send'));
    expect(actions.startConversation).toHaveBeenCalledWith('hi', []);
    expect(actions.sendMessage).not.toHaveBeenCalled();
  });

  it('going back from a conversation clears the active conversation and returns to Mensajes', async () => {
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: true, activeConversationId: 'c1' });
    render(<SupportChatWidget />);
    await user.click(screen.getByText('conv-back'));
    expect(actions.selectConversation).toHaveBeenCalledWith(null);
    expect(actions.setTab).toHaveBeenCalledWith('mensajes');
  });

  it('submits a rating for the active conversation', async () => {
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: true, activeConversationId: 'c1' });
    render(<SupportChatWidget />);
    await user.click(screen.getByText('conv-rate'));
    expect(actions.submitRating).toHaveBeenCalledWith('c1', 5, 'ok');
  });

  it('does not submit a rating when there is no real active conversation', async () => {
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: true, activeConversationId: 'new' });
    render(<SupportChatWidget />);
    await user.click(screen.getByText('conv-rate'));
    expect(actions.submitRating).not.toHaveBeenCalled();
  });

  it('dismisses a rating for the active conversation', async () => {
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: true, activeConversationId: 'c1' });
    render(<SupportChatWidget />);
    await user.click(screen.getByText('conv-dismiss'));
    expect(actions.dismissRating).toHaveBeenCalledWith('c1');
  });

  it('reopening a conversation continues the SAME conversation via actions.reopenConversation (not a new one)', async () => {
    // Regression: this used to call handleStartChat(), opening an unrelated brand-new
    // conversation instead of continuing the existing thread the user asked to follow up on.
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: true, activeConversationId: 'c1' });
    render(<SupportChatWidget />);
    await user.click(screen.getByText('conv-reopen'));
    expect(actions.reopenConversation).toHaveBeenCalledWith('c1');
    expect(actions.startConversation).not.toHaveBeenCalled();
    expect(actions.selectConversation).not.toHaveBeenCalledWith('new');
  });

  it('does nothing when reopening without a real active conversation ("new")', async () => {
    const user = userEvent.setup();
    const actions = mockChat({ isOpen: true, activeConversationId: 'new' });
    render(<SupportChatWidget />);
    await user.click(screen.getByText('conv-reopen'));
    expect(actions.reopenConversation).not.toHaveBeenCalled();
  });

  it('toggles the expanded flag passed to ConversationView', async () => {
    const user = userEvent.setup();
    mockChat({ isOpen: true, activeConversationId: 'c1' });
    render(<SupportChatWidget />);
    expect(screen.getByTestId('expanded-flag')).toHaveTextContent('false');
    await user.click(screen.getByText('conv-toggle-expand'));
    expect(screen.getByTestId('expanded-flag')).toHaveTextContent('true');
  });

  describe('FAB dismiss state (in-memory only — resets on remount/refresh)', () => {
    it('hides the FAB when state.fabDismissed is true', () => {
      mockChat({ isOpen: false, fabDismissed: true });
      render(<SupportChatWidget />);
      expect(screen.queryByLabelText('supportOpenAria')).not.toBeInTheDocument();
    });

    it('clicking the FAB dismiss control calls actions.dismissFab', async () => {
      const user = userEvent.setup();
      const actions = mockChat({ isOpen: false, fabDismissed: false });
      render(<SupportChatWidget />);
      await user.click(screen.getByLabelText('supportDismissFab'));
      expect(actions.dismissFab).toHaveBeenCalledTimes(1);
    });

    it('shows the FAB again on a fresh mount after a previous mount had it dismissed — fabDismissed is in-memory only and is never persisted, so a real page refresh (a brand-new SupportChatProvider) always starts undismissed (see SupportChatContext.vitest.jsx for the no-localStorage-persistence coverage)', () => {
      mockChat({ isOpen: false, fabDismissed: true });
      const { unmount } = render(<SupportChatWidget />);
      expect(screen.queryByLabelText('supportOpenAria')).not.toBeInTheDocument();
      unmount();

      mockChat({ isOpen: false, fabDismissed: false });
      render(<SupportChatWidget />);
      expect(screen.getByLabelText('supportOpenAria')).toBeInTheDocument();
    });
  });

  describe('additional coverage', () => {
    it('pressing Enter on the ask-a-question card starts a new conversation', () => {
      const actions = mockChat({ isOpen: true, activeTab: 'inicio' });
      render(<SupportChatWidget />);
      const card = screen.getByText('supportAskQuestionCta').closest('[role="button"]');
      fireEvent.keyDown(card, { key: 'Enter' });
      expect(actions.selectConversation).toHaveBeenCalledWith('new');
      expect(actions.setTab).toHaveBeenCalledWith('mensajes');
    });

    it('clicking the search bar on Inicio switches to the Ayuda tab', async () => {
      const user = userEvent.setup();
      const actions = mockChat({ isOpen: true, activeTab: 'inicio' });
      render(<SupportChatWidget />);
      await user.click(screen.getByPlaceholderText('supportSearchHelp'));
      expect(actions.setTab).toHaveBeenCalledWith('ayuda');
    });

    it('clicking the sample search result on Inicio switches to the Ayuda tab', async () => {
      const user = userEvent.setup();
      const actions = mockChat({ isOpen: true, activeTab: 'inicio' });
      render(<SupportChatWidget />);
      await user.click(screen.getByText('supportSampleSearchResult'));
      expect(actions.setTab).toHaveBeenCalledWith('ayuda');
    });

    it('shows the exact unread count on the closed FAB when it is 9 or fewer', () => {
      mockChat({ isOpen: false, unreadCount: 3 });
      render(<SupportChatWidget />);
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('renders the conversation view scoped to the matching active conversation', () => {
      mockChat({
        isOpen: true,
        activeConversationId: 'c2',
        conversations: [{ id: 'c1', subject: 'Uno' }, { id: 'c2', subject: 'Dos' }],
      });
      render(<SupportChatWidget />);
      expect(screen.getByTestId('active-subject')).toHaveTextContent('Dos');
    });

    it('falls back to pendingFiles and the stored input when the conversation view sends without explicit values', async () => {
      const user = userEvent.setup();
      const actions = mockChat({
        isOpen: true,
        activeConversationId: 'c1',
        input: 'hi',
        pendingFiles: [{ name: 'a.txt' }],
      });
      render(<SupportChatWidget />);
      await user.click(screen.getByText('conv-send-fallback'));
      expect(actions.sendMessage).toHaveBeenCalledWith('c1', 'hi', [{ name: 'a.txt' }]);
    });

    it('does not dismiss a rating when there is no real active conversation', async () => {
      const user = userEvent.setup();
      const actions = mockChat({ isOpen: true, activeConversationId: 'new' });
      render(<SupportChatWidget />);
      await user.click(screen.getByText('conv-dismiss'));
      expect(actions.dismissRating).not.toHaveBeenCalled();
    });

    describe('Ayuda tab search and browsing', () => {
      beforeEach(() => {
        fetchHelpDocs.mockResolvedValue([{ id: 1 }]);
        groupHelpCollections.mockReturnValue([]);
        searchHelpDocs.mockReturnValue([]);
      });

      it('typing a query shows matching help articles with a snippet', async () => {
        searchHelpDocs.mockReturnValue([{ location: 'facturas/', title: 'Facturas', snippet: 'Cómo pagar' }]);
        const user = userEvent.setup();
        mockChat({ isOpen: true, activeTab: 'ayuda' });
        render(<SupportChatWidget />);
        await waitFor(() => expect(fetchHelpDocs).toHaveBeenCalled());
        await user.type(screen.getByPlaceholderText('supportSearchArticles'), 'pagar');
        expect(screen.getByText('supportResultsCount {"count":1}')).toBeInTheDocument();
        expect(screen.getByText('Cómo pagar…')).toBeInTheDocument();
        const link = screen.getByText('Facturas').closest('a');
        expect(link).toHaveAttribute('href', 'https://docs.example/facturas/');
      });

      it('shows a no-articles message when a search yields no results', async () => {
        searchHelpDocs.mockReturnValue([]);
        const user = userEvent.setup();
        mockChat({ isOpen: true, activeTab: 'ayuda' });
        render(<SupportChatWidget />);
        await waitFor(() => expect(fetchHelpDocs).toHaveBeenCalled());
        await user.type(screen.getByPlaceholderText('supportSearchArticles'), 'inexistente');
        expect(screen.getByText(/supportNoArticlesFor/)).toBeInTheDocument();
      });

      it('browsing a help collection shows its pages and the back button returns to the collection list', async () => {
        groupHelpCollections.mockReturnValue([
          { id: 'c1', title: 'Facturación', pages: [{ location: 'a/', title: 'Página A' }, { location: 'b/', title: 'Página B' }] },
        ]);
        const user = userEvent.setup();
        mockChat({ isOpen: true, activeTab: 'ayuda' });
        render(<SupportChatWidget />);
        await waitFor(() => expect(fetchHelpDocs).toHaveBeenCalled());
        await user.click(await screen.findByText('Facturación'));
        expect(screen.getByText('Página A')).toBeInTheDocument();
        expect(screen.getByText('Página B')).toBeInTheDocument();
        await user.click(screen.getByLabelText('back'));
        expect(screen.queryByText('Página A')).not.toBeInTheDocument();
        expect(screen.getByText('Facturación')).toBeInTheDocument();
      });

      it('pressing Enter on a help collection row selects it', async () => {
        groupHelpCollections.mockReturnValue([
          { id: 'c1', title: 'Envíos', pages: [{ location: 'x/', title: 'Página X' }] },
        ]);
        mockChat({ isOpen: true, activeTab: 'ayuda' });
        render(<SupportChatWidget />);
        await waitFor(() => expect(fetchHelpDocs).toHaveBeenCalled());
        const row = (await screen.findByText('Envíos')).closest('[role="button"]');
        fireEvent.keyDown(row, { key: 'Enter' });
        expect(screen.getByText('Página X')).toBeInTheDocument();
      });
    });

    describe('Mensajes tab search', () => {
      const CONV_INVOICE = {
        id: 'c1',
        subject: 'Problema con factura',
        lastMessage: 'no puedo descargarla',
        status: 'open',
      };
      const CONV_GENERAL = {
        id: 'c2',
        subject: 'Consulta general',
        lastMessage: 'Hola, tengo una duda',
        status: 'open',
      };

      it('shows the search input only when there are conversations to search', () => {
        mockChat({ isOpen: true, activeTab: 'mensajes', conversations: [] });
        const { rerender } = render(<SupportChatWidget />);
        expect(screen.queryByPlaceholderText('supportSearchPlaceholder')).not.toBeInTheDocument();

        mockChat({ isOpen: true, activeTab: 'mensajes', conversations: [CONV_INVOICE] });
        rerender(<SupportChatWidget />);
        expect(screen.getByPlaceholderText('supportSearchPlaceholder')).toBeInTheDocument();
      });

      it('filters the list down to conversations whose subject matches the query', async () => {
        const user = userEvent.setup();
        mockChat({ isOpen: true, activeTab: 'mensajes', conversations: [CONV_INVOICE, CONV_GENERAL] });
        render(<SupportChatWidget />);
        await user.type(screen.getByPlaceholderText('supportSearchPlaceholder'), 'factura');
        expect(screen.getByTestId('ticket-c1')).toBeInTheDocument();
        expect(screen.queryByTestId('ticket-c2')).not.toBeInTheDocument();
      });

      it('surfaces a conversation matched only by its last-message preview', async () => {
        const user = userEvent.setup();
        mockChat({ isOpen: true, activeTab: 'mensajes', conversations: [CONV_INVOICE, CONV_GENERAL] });
        render(<SupportChatWidget />);
        await user.type(screen.getByPlaceholderText('supportSearchPlaceholder'), 'duda');
        expect(screen.getByTestId('ticket-c2')).toBeInTheDocument();
        expect(screen.queryByTestId('ticket-c1')).not.toBeInTheDocument();
      });

      it('surfaces a conversation matched only by its Jira ticket key, case-insensitively', async () => {
        // Customers get the Jira ticket key (e.g. "EGS-165") via the JSM notification
        // email, so they may search for it directly instead of the chat's own subject/preview.
        const convWithTicket = {
          id: 'c3',
          subject: 'Otro asunto sin relación',
          lastMessage: 'nada que ver',
          status: 'open',
          jiraTicketKey: 'EGS-165',
        };
        const user = userEvent.setup();
        mockChat({ isOpen: true, activeTab: 'mensajes', conversations: [CONV_INVOICE, convWithTicket] });
        render(<SupportChatWidget />);
        await user.type(screen.getByPlaceholderText('supportSearchPlaceholder'), 'egs-165');
        expect(screen.getByTestId('ticket-c3')).toBeInTheDocument();
        expect(screen.queryByTestId('ticket-c1')).not.toBeInTheDocument();
      });

      it('surfaces a conversation by a partial, case-insensitive match on the Jira ticket key', async () => {
        const convWithTicket = {
          id: 'c3',
          subject: 'Otro asunto sin relación',
          lastMessage: 'nada que ver',
          status: 'open',
          jiraTicketKey: 'EGS-165',
        };
        const user = userEvent.setup();
        mockChat({ isOpen: true, activeTab: 'mensajes', conversations: [CONV_INVOICE, convWithTicket] });
        render(<SupportChatWidget />);
        await user.type(screen.getByPlaceholderText('supportSearchPlaceholder'), '165');
        expect(screen.getByTestId('ticket-c3')).toBeInTheDocument();
        expect(screen.queryByTestId('ticket-c1')).not.toBeInTheDocument();
      });

      it('matches the query case-insensitively', async () => {
        const user = userEvent.setup();
        mockChat({ isOpen: true, activeTab: 'mensajes', conversations: [CONV_INVOICE, CONV_GENERAL] });
        render(<SupportChatWidget />);
        await user.type(screen.getByPlaceholderText('supportSearchPlaceholder'), 'FACTURA');
        expect(screen.getByTestId('ticket-c1')).toBeInTheDocument();
        expect(screen.queryByTestId('ticket-c2')).not.toBeInTheDocument();
      });

      it('shows the distinct no-results message when the query matches nothing but conversations exist', async () => {
        const user = userEvent.setup();
        mockChat({ isOpen: true, activeTab: 'mensajes', conversations: [CONV_INVOICE, CONV_GENERAL] });
        render(<SupportChatWidget />);
        await user.type(screen.getByPlaceholderText('supportSearchPlaceholder'), 'zzz-no-match');
        expect(screen.getByText('supportNoSearchResults')).toBeInTheDocument();
        expect(screen.queryByTestId('ticket-list')).not.toBeInTheDocument();
      });

      it('restores the full list when the search input is cleared', async () => {
        const user = userEvent.setup();
        mockChat({ isOpen: true, activeTab: 'mensajes', conversations: [CONV_INVOICE, CONV_GENERAL] });
        render(<SupportChatWidget />);
        const input = screen.getByPlaceholderText('supportSearchPlaceholder');
        await user.type(input, 'factura');
        expect(screen.queryByTestId('ticket-c2')).not.toBeInTheDocument();
        await user.clear(input);
        expect(screen.getByTestId('ticket-c1')).toBeInTheDocument();
        expect(screen.getByTestId('ticket-c2')).toBeInTheDocument();
      });

      it('leaves the zero-conversations empty state unaffected by the search feature (regression)', () => {
        mockChat({ isOpen: true, activeTab: 'mensajes', conversations: [] });
        render(<SupportChatWidget />);
        expect(screen.queryByPlaceholderText('supportSearchPlaceholder')).not.toBeInTheDocument();
        expect(screen.queryByText('supportNoSearchResults')).not.toBeInTheDocument();
        expect(screen.getByTestId('ticket-list')).toBeInTheDocument();
      });
    });
  });
});
