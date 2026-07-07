import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));

vi.mock('../SatisfactionRating.jsx', () => ({
  SatisfactionRating: ({ submitted }) => (
    <div data-testid="satisfaction-rating">{submitted ? 'submitted' : 'pending'}</div>
  ),
}));

import { ChatView } from '../ChatView.jsx';

function baseProps(overrides = {}) {
  return {
    messages: [],
    input: '',
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    isSending: false,
    isLoadingMessages: false,
    isClosed: false,
    isRated: false,
    pendingFiles: [],
    onAddFile: vi.fn(),
    onRemoveFile: vi.fn(),
    onSubmitRating: vi.fn(),
    ...overrides,
  };
}

describe('ChatView', () => {
  it('shows a loading indicator while messages are loading', () => {
    render(<ChatView {...baseProps({ isLoadingMessages: true })} />);
    expect(screen.getByText('supportLoading')).toBeInTheDocument();
  });

  it('shows the AI greeting when there are no messages yet', () => {
    render(<ChatView {...baseProps()} />);
    expect(screen.getByText('supportAiGreeting')).toBeInTheDocument();
  });

  it('renders each message with its sender name', () => {
    const messages = [
      { id: 'm1', sender: 'user', text: 'Hola' },
      { id: 'm2', sender: 'ai', senderName: 'ValerIA', text: 'Hola, ¿en qué te ayudo?' },
    ];
    render(<ChatView {...baseProps({ messages })} />);
    expect(screen.getByText('Hola')).toBeInTheDocument();
    expect(screen.getByText('Hola, ¿en qué te ayudo?')).toBeInTheDocument();
    expect(screen.getByText('ValerIA')).toBeInTheDocument();
  });

  it('renders attachment links for a message', () => {
    const messages = [
      { id: 'm1', sender: 'ai', text: 'Aquí tenés el archivo', attachments: [{ filename: 'factura.pdf', url: '/f/1' }] },
    ];
    render(<ChatView {...baseProps({ messages })} />);
    const link = screen.getByText('factura.pdf');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/f/1');
  });

  it('shows a typing indicator while a reply is being sent', () => {
    const { container } = render(<ChatView {...baseProps({ isSending: true })} />);
    expect(container.querySelector('.animate-bounce')).toBeInTheDocument();
  });

  it('disables the send button when there is nothing to send', () => {
    render(<ChatView {...baseProps()} />);
    expect(screen.getByLabelText('send')).toBeDisabled();
  });

  it('enables the send button once there is text and calls onSend on click', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatView {...baseProps({ input: 'Hola', onSend })} />);
    const sendBtn = screen.getByLabelText('send');
    expect(sendBtn).toBeEnabled();
    await user.click(sendBtn);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('renders pending file chips with a remove control', async () => {
    const user = userEvent.setup();
    const onRemoveFile = vi.fn();
    const file = new File(['x'], 'a.txt', { type: 'text/plain' });
    render(<ChatView {...baseProps({ pendingFiles: [file], onRemoveFile })} />);
    expect(screen.getByText('a.txt')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Remove file'));
    expect(onRemoveFile).toHaveBeenCalledWith(0);
  });

  it('hides the composer and shows the closed banner + rating when the conversation is closed', () => {
    render(<ChatView {...baseProps({ isClosed: true })} />);
    expect(screen.getByText('supportClosedConversation')).toBeInTheDocument();
    expect(screen.getByTestId('satisfaction-rating')).toHaveTextContent('pending');
    expect(screen.queryByLabelText('send')).not.toBeInTheDocument();
  });

  it('shows the rating as already submitted when isRated is true', () => {
    render(<ChatView {...baseProps({ isClosed: true, isRated: true })} />);
    expect(screen.getByTestId('satisfaction-rating')).toHaveTextContent('submitted');
  });

  it('pressing Enter sends the message when there is text to send', () => {
    const onSend = vi.fn();
    render(<ChatView {...baseProps({ input: 'Hola', onSend })} />);
    const textarea = screen.getByPlaceholderText('supportTypeMessage');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('Shift+Enter does not send the message', () => {
    const onSend = vi.fn();
    render(<ChatView {...baseProps({ input: 'Hola', onSend })} />);
    const textarea = screen.getByPlaceholderText('supportTypeMessage');
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('pressing Enter with no text and no pending files does not send', () => {
    const onSend = vi.fn();
    render(<ChatView {...baseProps({ input: '   ', onSend })} />);
    const textarea = screen.getByPlaceholderText('supportTypeMessage');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('renders an image preview for image pending files', () => {
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    render(<ChatView {...baseProps({ pendingFiles: [file] })} />);
    expect(screen.getByAltText('photo.png')).toBeInTheDocument();
  });

  describe('additional coverage', () => {
    it('shows the formatted time for a message with a valid timestamp', () => {
      const messages = [{ id: 'm1', sender: 'ai', text: 'Hola', timestamp: '2024-01-01T10:00:00.000Z' }];
      const { container } = render(<ChatView {...baseProps({ messages })} />);
      const timeEl = container.querySelector('.text-\\[10px\\]');
      expect(timeEl).not.toBeNull();
      expect(timeEl.textContent).not.toBe('');
    });

    it('falls back to an empty time label when formatting the timestamp throws', () => {
      const spy = vi.spyOn(Date.prototype, 'toLocaleTimeString').mockImplementation(() => {
        throw new Error('boom');
      });
      const messages = [{ id: 'm1', sender: 'ai', text: 'Hola', timestamp: '2024-01-01T10:00:00.000Z' }];
      const { container } = render(<ChatView {...baseProps({ messages })} />);
      const timeEl = container.querySelector('.text-\\[10px\\]');
      expect(timeEl.textContent).toBe('');
      spy.mockRestore();
    });

    it('keys an attachment link by its filename when no url is provided', () => {
      const messages = [
        { id: 'm1', sender: 'ai', text: 'Aquí tenés', attachments: [{ filename: 'sin-url.pdf' }] },
      ];
      render(<ChatView {...baseProps({ messages })} />);
      const link = screen.getByText('sin-url.pdf');
      expect(link.closest('a')).not.toHaveAttribute('href');
    });

    it('adds files selected via the hidden file input and resets its value', () => {
      const onAddFile = vi.fn();
      const { container } = render(<ChatView {...baseProps({ onAddFile })} />);
      const input = container.querySelector('input[type="file"]');
      const file = new File(['x'], 'doc.txt', { type: 'text/plain' });
      fireEvent.change(input, { target: { files: [file] } });
      expect(onAddFile).toHaveBeenCalledWith(file);
      expect(input.value).toBe('');
    });

    it('clicking the attach button triggers the hidden file input', async () => {
      const user = userEvent.setup();
      const { container } = render(<ChatView {...baseProps()} />);
      const input = container.querySelector('input[type="file"]');
      const clickSpy = vi.spyOn(input, 'click');
      await user.click(screen.getByLabelText('supportAttachFile'));
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });

    it('typing in the composer calls onInputChange with the new value', () => {
      const onInputChange = vi.fn();
      render(<ChatView {...baseProps({ onInputChange })} />);
      const textarea = screen.getByPlaceholderText('supportTypeMessage');
      fireEvent.change(textarea, { target: { value: 'Hola' } });
      expect(onInputChange).toHaveBeenCalledWith('Hola');
    });

    it('adjusts the textarea height as content grows', () => {
      render(<ChatView {...baseProps()} />);
      const textarea = screen.getByPlaceholderText('supportTypeMessage');
      Object.defineProperty(textarea, 'scrollHeight', { value: 80, configurable: true });
      fireEvent.input(textarea, { target: { value: 'Una línea más larga' } });
      expect(textarea.style.height).toBe('80px');
    });
  });
});
