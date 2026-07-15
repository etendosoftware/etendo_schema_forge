import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));

// A plain vi.fn() wrapper (instead of a bare arrow function) so a single test
// can override the username via mockReturnValueOnce without affecting the rest.
const mockUseAuth = vi.fn(() => ({ username: 'lucas.palacios' }));
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockUseAuth(),
}));

// Attachments without an `id` never trigger a fetch, so this stub is only
// exercised by tests that explicitly pass an attachment with an id.
const mockApiFetch = vi.fn();
vi.mock('@/auth/useApiFetch', () => ({
  useApiFetch: () => mockApiFetch,
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

  it('renders a plain filename for an attachment with no id or mimeType (legacy/optimistic echo)', () => {
    const messages = [{ id: 'm1', sender: 'ai', text: 'Aquí tenés', attachments: [{ name: 'nota.webm' }] }];
    render(<ConversationView {...baseProps({ messages })} />);
    expect(screen.getByText('nota.webm')).toBeInTheDocument();
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

  describe('additional coverage', () => {
    afterEach(() => {
      delete window.AudioContext;
      vi.useRealTimers();
    });

    it('hides message text but still shows attachments when the message has no text', () => {
      const messages = [{ id: 'm1', sender: 'ai', text: undefined, attachments: [{ name: 'sin-texto.pdf' }] }];
      render(<ConversationView {...baseProps({ messages })} />);
      expect(screen.getByText('sin-texto.pdf')).toBeInTheDocument();
    });

    it('renders **bold** markdown segments as <strong> elements', () => {
      const messages = [{ id: 'm1', sender: 'ai', text: 'Esto es **importante** de verdad' }];
      const { container } = render(<ConversationView {...baseProps({ messages })} />);
      const strong = container.querySelector('strong');
      expect(strong).toHaveTextContent('importante');
    });

    it('splits a message with a blank line into separate paragraphs', () => {
      const messages = [{ id: 'm1', sender: 'ai', text: 'Primer párrafo\n\nSegundo párrafo' }];
      const { container } = render(<ConversationView {...baseProps({ messages })} />);
      const paragraphs = container.querySelectorAll('.sc-bubble p');
      expect(paragraphs.length).toBe(2);
      expect(paragraphs[0]).toHaveTextContent('Primer párrafo');
      expect(paragraphs[1]).toHaveTextContent('Segundo párrafo');
    });

    it('plays a receive sound when the bot finishes responding', () => {
      class FakeGainNode {
        constructor() { this.gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }; }
        connect() {}
      }
      class FakeOscillatorNode {
        constructor() { this.frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }; this.onended = null; }
        connect() {}
        start() {}
        stop() { queueMicrotask(() => this.onended?.()); }
      }
      class FakeAudioContext {
        constructor() { this.currentTime = 0; this.destination = {}; this.close = vi.fn(); }
        createOscillator() { return new FakeOscillatorNode(); }
        createGain() { return new FakeGainNode(); }
      }
      window.AudioContext = FakeAudioContext;
      vi.useFakeTimers();
      const messages = [{ id: 'm1', sender: 'bot', text: 'Ya está' }];
      const { rerender } = render(<ConversationView {...baseProps({ isSending: true, messages })} />);
      rerender(<ConversationView {...baseProps({ isSending: false, messages })} />);
      vi.advanceTimersByTime(700);
      expect(screen.getByText('Ya está')).toBeInTheDocument();
    });

    it('sends a message and lets the outgoing sound finish without crashing', async () => {
      const user = userEvent.setup();
      let closeSpy;
      class FakeGainNode {
        constructor() { this.gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }; }
        connect() {}
      }
      class FakeOscillatorNode {
        constructor() { this.frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }; this.onended = null; }
        connect() {}
        start() {}
        stop() { queueMicrotask(() => this.onended?.()); }
      }
      class FakeAudioContext {
        constructor() { this.currentTime = 0; this.destination = {}; closeSpy = vi.fn(); this.close = closeSpy; }
        createOscillator() { return new FakeOscillatorNode(); }
        createGain() { return new FakeGainNode(); }
      }
      window.AudioContext = FakeAudioContext;
      const onSend = vi.fn();
      render(<ConversationView {...baseProps({ onSend })} />);
      await user.type(screen.getByPlaceholderText('supportTypeMessage'), 'Con sonido');
      await user.click(screen.getByLabelText('send'));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(onSend).toHaveBeenCalledWith('Con sonido', []);
      expect(closeSpy).toHaveBeenCalled();
    });

    it('shows a "new messages" divider once earlier messages are marked as seen', () => {
      const initialMessages = [
        { id: 'm1', sender: 'user', text: 'Hola' },
        { id: 'm2', sender: 'bot', text: 'Hola, ¿en qué te ayudo?' },
      ];
      const { rerender } = render(
        <ConversationView {...baseProps({ isLoadingMessages: true, messages: [] })} />
      );
      rerender(<ConversationView {...baseProps({ isLoadingMessages: false, messages: initialMessages })} />);
      const withNewMessage = [...initialMessages, { id: 'm3', sender: 'bot', text: 'Nuevo mensaje' }];
      rerender(<ConversationView {...baseProps({ isLoadingMessages: false, messages: withNewMessage })} />);
      expect(screen.getByText('supportNewDivider')).toBeInTheDocument();
    });

    it('shows the drop overlay only while dragging and hides it on drag-leave', () => {
      const { container } = render(<ConversationView {...baseProps()} />);
      const wrap = container.querySelector('.sc-conv-wrap');
      fireEvent.dragEnter(wrap);
      fireEvent.dragOver(wrap);
      expect(screen.getByText('supportDropToAttach')).toBeInTheDocument();
      fireEvent.dragLeave(wrap);
      expect(screen.queryByText('supportDropToAttach')).not.toBeInTheDocument();
    });

    it('clicking a quick reply on a regular bot message fills the draft', async () => {
      const user = userEvent.setup();
      const messages = [{ id: 'm1', sender: 'bot', text: '¿Cómo puedo ayudarte?', quickReplies: ['Facturación', 'Soporte técnico'] }];
      render(<ConversationView {...baseProps({ messages })} />);
      await user.click(screen.getByText('Facturación'));
      expect(screen.getByPlaceholderText('supportTypeMessage')).toHaveValue('Facturación');
    });

    it('clicking the attach-file icon triggers the hidden file input', async () => {
      const user = userEvent.setup();
      const { container } = render(<ConversationView {...baseProps()} />);
      const input = container.querySelector('input[type="file"]');
      const clickSpy = vi.spyOn(input, 'click');
      await user.click(screen.getByLabelText('supportAttachFile'));
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('falls back through the sender-initial chain for human/agent messages without explicit initials', () => {
      const messages = [
        { id: 'm1', sender: 'human', senderInitials: 'LP', text: 'Con iniciales' },
        { id: 'm2', sender: 'agent', senderName: 'Lucas', text: 'Con nombre' },
        { id: 'm3', sender: 'human', text: 'Sin nada' },
      ];
      render(<ConversationView {...baseProps({ messages })} />);
      expect(screen.getByText('LP')).toBeInTheDocument();
      expect(screen.getByText('L')).toBeInTheDocument();
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('does not send on Enter while the conversation is closed', () => {
      const onSend = vi.fn();
      const conversation = { id: 'c1', status: 'closed' };
      render(<ConversationView {...baseProps({ conversation, onSend })} />);
      const textarea = screen.getByPlaceholderText('supportClosedConversation');
      fireEvent.keyDown(textarea, { key: 'Enter' });
      expect(onSend).not.toHaveBeenCalled();
    });

    it('does not send on Enter while a message is already being sent', () => {
      const onSend = vi.fn();
      render(<ConversationView {...baseProps({ onSend, isSending: true })} />);
      const textarea = screen.getByPlaceholderText('supportTypeMessage');
      fireEvent.keyDown(textarea, { key: 'Enter' });
      expect(onSend).not.toHaveBeenCalled();
    });

    it('does not show the "more options" menu button once a conversation is closed', () => {
      const conversation = { id: 'c1', status: 'closed' };
      render(<ConversationView {...baseProps({ conversation })} />);
      expect(screen.queryByLabelText('moreOptions')).not.toBeInTheDocument();
    });

    it('shows an empty first-name greeting when there is no authenticated username', () => {
      mockUseAuth.mockReturnValueOnce({ username: '' });
      render(<ConversationView {...baseProps({ conversation: null })} />);
      expect(screen.getByText(/supportWelcomeBubble1/)).toBeInTheDocument();
    });
  });

  describe('attachment type validation', () => {
    beforeEach(() => {
      toast.error.mockClear();
    });

    it('adds an allowed document selected via the hidden file input', () => {
      const onAddFile = vi.fn();
      const { container } = render(<ConversationView {...baseProps({ onAddFile })} />);
      const input = container.querySelector('input[type="file"]');
      const file = new File(['%PDF-1.4'], 'invoice.pdf', { type: 'application/pdf' });
      fireEvent.change(input, { target: { files: [file] } });
      expect(onAddFile).toHaveBeenCalledWith(file);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('adds an allowed image selected via the hidden file input', () => {
      const onAddFile = vi.fn();
      const { container } = render(<ConversationView {...baseProps({ onAddFile })} />);
      const input = container.querySelector('input[type="file"]');
      const file = new File(['\x89PNG'], 'photo.png', { type: 'image/png' });
      fireEvent.change(input, { target: { files: [file] } });
      expect(onAddFile).toHaveBeenCalledWith(file);
    });

    it('rejects a disallowed audio file selected via the hidden file input and shows the unsupported-type error', () => {
      const onAddFile = vi.fn();
      const { container } = render(<ConversationView {...baseProps({ onAddFile })} />);
      const input = container.querySelector('input[type="file"]');
      const file = new File(['fake-audio'], 'nota.mp3', { type: 'audio/mpeg' });
      fireEvent.change(input, { target: { files: [file] } });
      expect(onAddFile).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('supportUnsupportedFileType {"name":"nota.mp3"}');
    });

    it('rejects a disallowed video file dropped onto the conversation (drag-and-drop bypassed validation before this fix)', () => {
      const onAddFile = vi.fn();
      const { container } = render(<ConversationView {...baseProps({ onAddFile })} />);
      const wrap = container.querySelector('.sc-conv-wrap');
      const file = new File(['fake-video'], 'clip.mp4', { type: 'video/mp4' });
      fireEvent.drop(wrap, { dataTransfer: { files: [file] } });
      expect(onAddFile).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('supportUnsupportedFileType {"name":"clip.mp4"}');
    });

    it('accepts an allowed document dropped onto the conversation', () => {
      const onAddFile = vi.fn();
      const { container } = render(<ConversationView {...baseProps({ onAddFile })} />);
      const wrap = container.querySelector('.sc-conv-wrap');
      const file = new File(['col1,col2'], 'data.csv', { type: 'text/csv' });
      fireEvent.drop(wrap, { dataTransfer: { files: [file] } });
      expect(onAddFile).toHaveBeenCalledWith(file);
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('inbound attachment rendering (AttachmentItem)', () => {
    const realCreateObjectURL = global.URL.createObjectURL;
    const realRevokeObjectURL = global.URL.revokeObjectURL;

    beforeEach(() => {
      mockApiFetch.mockReset();
      global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      global.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      global.URL.createObjectURL = realCreateObjectURL;
      global.URL.revokeObjectURL = realRevokeObjectURL;
    });

    it('renders an image attachment as a thumbnail via authenticated fetch', async () => {
      mockApiFetch.mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['img']) });
      const messages = [{
        id: 'm1',
        sender: 'ai',
        text: 'Mirá esto',
        attachments: [{ id: 'att-1', filename: 'foto.png', mimeType: 'image/png' }],
      }];
      render(<ConversationView {...baseProps({ messages })} />);
      expect(mockApiFetch).toHaveBeenCalledWith('/sws/support/attachments/att-1');
      const img = await screen.findByAltText('foto.png');
      expect(img).toHaveAttribute('src', 'blob:mock-url');
    });

    it('renders a document attachment (pdf) as a download control, not an image', async () => {
      mockApiFetch.mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['pdf']) });
      const messages = [{
        id: 'm1',
        sender: 'ai',
        text: 'Aquí el archivo',
        attachments: [{ id: 'att-2', filename: 'reporte.pdf', mimeType: 'application/pdf' }],
      }];
      render(<ConversationView {...baseProps({ messages })} />);
      const downloadBtn = await screen.findByRole('button', { name: 'reporte.pdf' });
      expect(downloadBtn.tagName).toBe('BUTTON');
      expect(screen.queryByAltText('reporte.pdf')).not.toBeInTheDocument();
    });

    it('renders the neutral unsupported fallback for a mimetype outside the allowed set, without fetching it', () => {
      const messages = [{
        id: 'm1',
        sender: 'human',
        text: 'Adjunto desde Jira',
        attachments: [{ id: 'att-3', filename: 'clip.mp4', mimeType: 'video/mp4' }],
      }];
      render(<ConversationView {...baseProps({ messages })} />);
      expect(screen.getByText('supportAttachmentUnsupported')).toBeInTheDocument();
      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });
});
