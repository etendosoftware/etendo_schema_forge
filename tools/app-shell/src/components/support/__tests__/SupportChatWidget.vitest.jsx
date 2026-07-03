import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
}));

const mockUseSupportChat = vi.fn();
vi.mock('../SupportChatContext.jsx', () => ({
  useSupportChat: () => mockUseSupportChat(),
}));

vi.mock('../ConversationView.jsx', () => ({
  ConversationView: () => <div data-testid="conversation-view" />,
}));

vi.mock('../TicketList.jsx', () => ({
  TicketList: () => <div data-testid="ticket-list" />,
}));

vi.mock('../helpDocs.js', () => ({
  fetchHelpDocs: vi.fn(),
  groupHelpCollections: vi.fn(() => []),
  searchHelpDocs: vi.fn(() => []),
  docUrl: (loc) => `https://docs.example/${loc}`,
}));

import { fetchHelpDocs } from '../helpDocs.js';
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
    addPendingFile: vi.fn(),
    removePendingFile: vi.fn(),
    ...actionOverrides,
  };
  mockUseSupportChat.mockReturnValue({ state: { ...BASE_STATE, ...stateOverrides }, actions });
  return actions;
}

describe('SupportChatWidget', () => {
  beforeEach(() => {
    fetchHelpDocs.mockResolvedValue([]);
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
});
