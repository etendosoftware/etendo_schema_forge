import { render, screen, fireEvent } from '@testing-library/react';
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

  it('closes the "more options" menu on an outside click', async () => {
    const user = userEvent.setup();
    render(<ConversationView {...baseProps()} />);
    await user.click(screen.getByLabelText('moreOptions'));
    expect(screen.getByText('supportCloseConversation')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('supportCloseConversation')).not.toBeInTheDocument();
  });

  it('shows a loading indicator while messages are loading', () => {
    render(<ConversationView {...baseProps({ isLoadingMessages: true })} />);
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('clicking a welcome quick reply fills the message draft', async () => {
    const user = userEvent.setup();
    render(<ConversationView {...baseProps({ conversation: null })} />);
    await user.click(screen.getByText('supportQuickReply1'));
    expect(screen.getByPlaceholderText('supportTypeMessage')).toHaveValue('supportQuickReply1');
  });

  it('renders a filename for a non-audio attachment', () => {
    const messages = [{ id: 'm1', sender: 'ai', text: 'Aquí tenés', attachments: [{ name: 'factura.pdf' }] }];
    render(<ConversationView {...baseProps({ messages })} />);
    expect(screen.getByText('factura.pdf')).toBeInTheDocument();
  });

  it('renders an audio attachment as "Audio" without a play control when no local audio URL is available', () => {
    const messages = [{ id: 'm1', sender: 'ai', text: 'Nota de voz', attachments: [{ name: 'nota.webm' }] }];
    render(<ConversationView {...baseProps({ messages })} />);
    expect(screen.getByText('Audio')).toBeInTheDocument();
    expect(screen.queryByTitle('supportPlayAudio')).not.toBeInTheDocument();
  });

  it('shows a day divider before the first timestamped message and whenever the day changes', () => {
    const messages = [
      { id: 'm1', sender: 'user', text: 'Primero', timestamp: '2024-01-01T10:00:00.000Z' },
      { id: 'm2', sender: 'user', text: 'Segundo mismo día', timestamp: '2024-01-01T18:00:00.000Z' },
      { id: 'm3', sender: 'user', text: 'Otro día', timestamp: '2024-02-15T10:00:00.000Z' },
    ];
    const { container } = render(<ConversationView {...baseProps({ messages })} />);
    expect(container.querySelectorAll('.sc-day-divider')).toHaveLength(2);
  });

  it('shows a drop hint while dragging a file over an open conversation and adds it on drop', () => {
    const onAddFile = vi.fn();
    const { container } = render(<ConversationView {...baseProps({ onAddFile })} />);
    const wrap = container.querySelector('.sc-conv-wrap');
    fireEvent.dragEnter(wrap);
    expect(screen.getByText('supportDropToAttach')).toBeInTheDocument();
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    fireEvent.drop(wrap, { dataTransfer: { files: [file] } });
    expect(onAddFile).toHaveBeenCalledWith(file);
  });

  it('shows a closed-conversation hint while dragging over a closed conversation and ignores the drop', () => {
    const onAddFile = vi.fn();
    const conversation = { id: 'c1', status: 'closed' };
    const { container } = render(<ConversationView {...baseProps({ conversation, onAddFile })} />);
    const wrap = container.querySelector('.sc-conv-wrap');
    fireEvent.dragEnter(wrap);
    expect(screen.getByText('supportClosedConversation')).toBeInTheDocument();
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    fireEvent.drop(wrap, { dataTransfer: { files: [file] } });
    expect(onAddFile).not.toHaveBeenCalled();
  });

  it('adds files selected via the hidden file input', () => {
    const onAddFile = vi.fn();
    const { container } = render(<ConversationView {...baseProps({ onAddFile })} />);
    const input = container.querySelector('input[type="file"]');
    const file = new File(['x'], 'b.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onAddFile).toHaveBeenCalledWith(file);
  });

  it('pressing Enter sends the message', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ConversationView {...baseProps({ onSend })} />);
    const textarea = screen.getByPlaceholderText('supportTypeMessage');
    await user.type(textarea, 'Hola{Enter}');
    expect(onSend).toHaveBeenCalledWith('Hola', []);
  });

  it('Shift+Enter does not send the message', () => {
    const onSend = vi.fn();
    render(<ConversationView {...baseProps({ onSend })} />);
    const textarea = screen.getByPlaceholderText('supportTypeMessage');
    fireEvent.change(textarea, { target: { value: 'Hola' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('opens the emoji picker and appends an emoji to the draft', async () => {
    const user = userEvent.setup();
    render(<ConversationView {...baseProps()} />);
    await user.click(screen.getByLabelText('Emoji'));
    await user.click(screen.getByText('😀'));
    expect(screen.getByPlaceholderText('supportTypeMessage')).toHaveValue('😀');
  });

  it('closes the emoji picker on an outside click', async () => {
    const user = userEvent.setup();
    render(<ConversationView {...baseProps()} />);
    await user.click(screen.getByLabelText('Emoji'));
    expect(screen.getByText('😀')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('😀')).not.toBeInTheDocument();
  });

  it('submits a CSAT rating with the selected score and comment', async () => {
    const user = userEvent.setup();
    const onSubmitRating = vi.fn().mockResolvedValue();
    const conversation = { id: 'c1', status: 'closed', rated: false };
    render(<ConversationView {...baseProps({ conversation, onSubmitRating })} />);
    await user.click(screen.getByLabelText('supportRatingAriaLabel {"n":5}'));
    await user.type(screen.getByPlaceholderText('supportAddComment'), 'Genial');
    await user.click(screen.getByText('supportSubmitRating'));
    expect(onSubmitRating).toHaveBeenCalledWith(5, 'Genial');
  });

  it('dismisses the CSAT card via "later"', async () => {
    const user = userEvent.setup();
    const onDismissRating = vi.fn();
    const conversation = { id: 'c1', status: 'closed', rated: false };
    render(<ConversationView {...baseProps({ conversation, onDismissRating })} />);
    await user.click(screen.getByLabelText('supportRatingAriaLabel {"n":3}'));
    await user.click(screen.getByText('supportLater'));
    expect(onDismissRating).toHaveBeenCalledTimes(1);
  });

  describe('voice recording', () => {
    beforeEach(() => {
      global.navigator.mediaDevices = {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
      };
      global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');

      class FakeMediaRecorder {
        constructor() {
          this.state = 'recording';
          this.mimeType = 'audio/webm';
        }
        start() {}
        stop() {
          this.state = 'inactive';
          this.onstop?.();
        }
      }
      global.MediaRecorder = FakeMediaRecorder;
    });

    it('starts and stops recording, adding the captured audio as a pending file', async () => {
      const user = userEvent.setup();
      const onAddFile = vi.fn();
      render(<ConversationView {...baseProps({ onAddFile })} />);
      await user.click(screen.getByLabelText('supportStartRecording'));
      expect(await screen.findByLabelText('supportStopRecording')).toBeInTheDocument();
      await user.click(screen.getByLabelText('supportStopRecording'));
      expect(onAddFile).toHaveBeenCalledTimes(1);
      expect(onAddFile.mock.calls[0][0]).toBeInstanceOf(File);
    });

    it('sends the recording immediately when clicking send while recording', async () => {
      const user = userEvent.setup();
      const onSend = vi.fn();
      render(<ConversationView {...baseProps({ onSend })} />);
      await user.click(screen.getByLabelText('supportStartRecording'));
      await screen.findByLabelText('supportStopRecording');
      await user.type(screen.getByPlaceholderText('supportTypeMessage'), 'Nota');
      await user.click(screen.getByLabelText('send'));
      expect(onSend).toHaveBeenCalledTimes(1);
      const [text, files] = onSend.mock.calls[0];
      expect(text).toBe('Nota');
      expect(files).toHaveLength(1);
      expect(files[0]).toBeInstanceOf(File);
    });
  });
});
