import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ username: 'lucas.palacios' }),
}));

import { ConversationView } from '../ConversationView.jsx';

function baseProps(overrides = {}) {
  return {
    conversation: { id: 'c1', status: 'open', assigneeKind: 'bot' },
    messages: [],
    input: '',
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    isSending: false,
    isLoadingMessages: false,
    pendingFiles: [],
    onAddFile: vi.fn(),
    onRemoveFile: vi.fn(),
    onBack: vi.fn(),
    onClose: vi.fn(),
    onSubmitRating: vi.fn(),
    onDismissRating: vi.fn(),
    onCloseConversation: vi.fn(),
    onReopenConversation: vi.fn(),
    isExpanded: false,
    onToggleExpand: vi.fn(),
    ...overrides,
  };
}

describe('ConversationView', () => {
  it('shows the bot name and "team can help" meta for an open bot conversation', () => {
    render(<ConversationView {...baseProps()} />);
    expect(screen.getByText('ValerIA')).toBeInTheDocument();
    expect(screen.getByText('supportTeamCanHelp')).toBeInTheDocument();
  });

  it('shows the human agent name and active status for a human-assigned open conversation', () => {
    const conversation = { id: 'c1', status: 'open', assigneeKind: 'human', assigneeName: 'Lucas' };
    render(<ConversationView {...baseProps({ conversation })} />);
    expect(screen.getByText('Lucas')).toBeInTheDocument();
    expect(screen.getByText('supportActiveNow')).toBeInTheDocument();
  });

  it('shows the closed meta label once the conversation is closed', () => {
    const conversation = { id: 'c1', status: 'closed' };
    render(<ConversationView {...baseProps({ conversation })} />);
    expect(screen.getByText('supportConversationClosedMeta')).toBeInTheDocument();
  });

  it('greets a first-time visitor with the welcome bubbles when there is no conversation yet', () => {
    render(<ConversationView {...baseProps({ conversation: null })} />);
    expect(screen.getByText(/supportWelcomeBubble1/)).toBeInTheDocument();
    expect(screen.getByText('supportWelcomeBubble2')).toBeInTheDocument();
  });

  it('renders the message thread with sender bubbles', () => {
    const messages = [
      { id: 'm1', sender: 'user', text: 'Hola' },
      { id: 'm2', sender: 'ai', text: 'Hola, ¿en qué te ayudo?' },
    ];
    render(<ConversationView {...baseProps({ messages })} />);
    expect(screen.getByText('Hola')).toBeInTheDocument();
    expect(screen.getByText('Hola, ¿en qué te ayudo?')).toBeInTheDocument();
  });

  it('renders a handover banner for handover messages instead of a bubble', () => {
    const messages = [{ id: 'm1', handover: true, agentName: 'Lucas' }];
    render(<ConversationView {...baseProps({ messages })} />);
    expect(screen.getByText(/supportHandoverIntro/)).toBeInTheDocument();
    expect(screen.getByText('supportHandoverStatus')).toBeInTheDocument();
  });

  it('disables the send control while there is nothing to send', () => {
    render(<ConversationView {...baseProps()} />);
    expect(screen.getByLabelText('send')).toBeDisabled();
  });

  it('sends the typed draft and clears the textarea', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ConversationView {...baseProps({ onSend })} />);
    const textarea = screen.getByPlaceholderText('supportTypeMessage');
    await user.type(textarea, 'Necesito ayuda');
    await user.click(screen.getByLabelText('send'));
    expect(onSend).toHaveBeenCalledWith('Necesito ayuda', []);
    expect(textarea).toHaveValue('');
  });

  it('calls onBack when the back button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<ConversationView {...baseProps({ onBack })} />);
    await user.click(screen.getByLabelText('back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('toggles expand/collapse via the header button', async () => {
    const user = userEvent.setup();
    const onToggleExpand = vi.fn();
    render(<ConversationView {...baseProps({ onToggleExpand })} />);
    await user.click(screen.getByLabelText('expand'));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it('shows the closed banner and satisfaction survey for a closed, unrated conversation', () => {
    const conversation = { id: 'c1', status: 'closed', rated: false };
    render(<ConversationView {...baseProps({ conversation })} />);
    expect(screen.getByText('supportConversationEnded')).toBeInTheDocument();
    expect(screen.getByText('supportRateExperience')).toBeInTheDocument();
    expect(screen.getByText('supportReopen')).toBeInTheDocument();
  });

  it('shows a thank-you message instead of the survey once the conversation has been rated', () => {
    const conversation = { id: 'c1', status: 'closed', rated: true };
    render(<ConversationView {...baseProps({ conversation })} />);
    expect(screen.getByText('supportRatingThanks')).toBeInTheDocument();
    expect(screen.queryByText('supportRateExperience')).not.toBeInTheDocument();
  });

  it('hides the survey once it has been dismissed', () => {
    const conversation = { id: 'c1', status: 'closed', rated: false, csatDismissed: true };
    render(<ConversationView {...baseProps({ conversation })} />);
    expect(screen.queryByText('supportRateExperience')).not.toBeInTheDocument();
  });

  it('renders pending attachment chips with size and a remove control', async () => {
    const user = userEvent.setup();
    const onRemoveFile = vi.fn();
    const file = new File(['x'.repeat(2048)], 'doc.pdf', { type: 'application/pdf' });
    render(<ConversationView {...baseProps({ pendingFiles: [file], onRemoveFile })} />);
    expect(screen.getByText('doc.pdf')).toBeInTheDocument();
    expect(screen.getByText(/2 KB/)).toBeInTheDocument();
    const removeButtons = document.querySelectorAll('.sc-x');
    await user.click(removeButtons[0]);
    expect(onRemoveFile).toHaveBeenCalledWith(0);
  });

  it('opens the "more options" menu and closes the conversation from it', async () => {
    const user = userEvent.setup();
    const onCloseConversation = vi.fn();
    render(<ConversationView {...baseProps({ onCloseConversation })} />);
    await user.click(screen.getByLabelText('moreOptions'));
    await user.click(screen.getByText('supportCloseConversation'));
    expect(onCloseConversation).toHaveBeenCalledTimes(1);
  });
});
