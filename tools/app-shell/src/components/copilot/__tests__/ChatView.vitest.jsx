import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

// UI primitives are thin wrappers; render plain elements so DOM assertions work.
vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/input.jsx', () => ({
  Input: (props) => <input {...props} />,
}));
vi.mock('@/components/ui/badge.jsx', () => ({
  Badge: ({ children, ...props }) => <span {...props}>{children}</span>,
}));
vi.mock('@/components/ui/separator.jsx', () => ({
  Separator: (props) => <hr {...props} />,
}));

// Stub AttachmentChips so we can assert it receives the props and exercise onRemove.
vi.mock('../AttachmentChips.jsx', () => ({
  AttachmentChips: ({ attachments, onRemove }) => (
    <div data-testid="attachment-chips">
      {attachments.map((a) => (
        <button
          key={a.id}
          type="button"
          data-testid={`remove-attachment-${a.id}`}
          onClick={() => onRemove?.(a.id)}
        >
          {a.tabTitle}
        </button>
      ))}
    </div>
  ),
}));

import { ChatView } from '../ChatView.jsx';

// jsdom does not implement scrollIntoView; stub it for the auto-scroll effect.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ChatView', () => {
  it('renders the default welcome message when there are no messages', () => {
    render(<ChatView messages={[]} />);
    // welcomeMessage prop is undefined -> falls back to ui('copilotWelcome') key.
    expect(screen.getByText('copilotWelcome')).toBeInTheDocument();
  });

  it('renders a custom welcome message when provided', () => {
    render(<ChatView messages={[]} welcomeMessage="Hello there" />);
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    expect(screen.queryByText('copilotWelcome')).not.toBeInTheDocument();
  });

  it('renders user, copilot and error message bubbles', () => {
    const messages = [
      { id: '1', role: 'user', text: 'user msg' },
      { id: '2', role: 'copilot', text: 'copilot msg' },
      { id: '3', role: 'error', text: 'error msg' },
    ];
    render(<ChatView messages={messages} />);
    expect(screen.getByText('user msg')).toBeInTheDocument();
    expect(screen.getByText('copilot msg')).toBeInTheDocument();
    expect(screen.getByText('error msg')).toBeInTheDocument();
    // Non-user messages render the Bot avatar icon (copilot + error = 2).
    expect(screen.getAllByTestId('Bot__61b427')).toHaveLength(2);
    // Welcome message must be gone once there are messages.
    expect(screen.queryByText('copilotWelcome')).not.toBeInTheDocument();
  });

  it('renders the file list attached to a message', () => {
    const messages = [
      {
        id: '1',
        role: 'user',
        text: 'with files',
        files: [{ name: 'a.pdf' }, { name: 'b.png' }],
      },
    ];
    render(<ChatView messages={messages} />);
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('b.png')).toBeInTheDocument();
  });

  it('does not render a file list when message.files is empty or absent', () => {
    const messages = [
      { id: '1', role: 'user', text: 'no files', files: [] },
      { id: '2', role: 'copilot', text: 'also none' },
    ];
    render(<ChatView messages={messages} />);
    // Only message bubbles, no extra file badges.
    expect(screen.getByText('no files')).toBeInTheDocument();
    expect(screen.getByText('also none')).toBeInTheDocument();
  });

  it('shows the typing indicator while sending', () => {
    render(<ChatView messages={[{ id: '1', role: 'user', text: 'hi' }]} isSending />);
    // The Bot icon appears in the typing indicator even for a user-only thread.
    expect(screen.getByTestId('Bot__61b427')).toBeInTheDocument();
  });

  it('renders AttachmentChips and forwards onRemoveAttachment', async () => {
    const user = userEvent.setup();
    const onRemoveAttachment = vi.fn();
    const attachments = [{ id: 'att-1', tabTitle: 'Orders' }];
    render(
      <ChatView
        messages={[]}
        attachments={attachments}
        onRemoveAttachment={onRemoveAttachment}
      />,
    );
    expect(screen.getByTestId('attachment-chips')).toBeInTheDocument();
    await user.click(screen.getByTestId('remove-attachment-att-1'));
    expect(onRemoveAttachment).toHaveBeenCalledWith('att-1');
  });

  it('renders pending files with a working remove button', async () => {
    const user = userEvent.setup();
    const onRemoveFile = vi.fn();
    const files = [{ name: 'pending.txt' }, { name: 'second.csv' }];
    render(<ChatView messages={[]} files={files} onRemoveFile={onRemoveFile} />);
    expect(screen.getByText('pending.txt')).toBeInTheDocument();
    expect(screen.getByText('second.csv')).toBeInTheDocument();
    // aria-label is `${ui('remove')} ${file.name}`.
    await user.click(screen.getByLabelText('remove pending.txt'));
    expect(onRemoveFile).toHaveBeenCalledWith(0);
  });

  it('calls onInputChange when the user types', async () => {
    const user = userEvent.setup();
    const onInputChange = vi.fn();
    render(<ChatView messages={[]} input="" onInputChange={onInputChange} />);
    await user.type(screen.getByTestId('Input__61b427'), 'h');
    expect(onInputChange).toHaveBeenCalledWith('h');
  });

  it('renders the default placeholder and a custom placeholder', () => {
    const { rerender } = render(<ChatView messages={[]} />);
    expect(screen.getByPlaceholderText('askSomething')).toBeInTheDocument();
    rerender(<ChatView messages={[]} inputPlaceholder="Type here" />);
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('submits the form, preventing default and calling onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChatView messages={[]} input="ready" onSubmit={onSubmit} />);
    await user.click(screen.getByLabelText('send'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables the send button when input is empty or only whitespace', () => {
    const { rerender } = render(<ChatView messages={[]} input="" />);
    expect(screen.getByLabelText('send')).toBeDisabled();
    rerender(<ChatView messages={[]} input="   " />);
    expect(screen.getByLabelText('send')).toBeDisabled();
    rerender(<ChatView messages={[]} input="text" />);
    expect(screen.getByLabelText('send')).not.toBeDisabled();
  });

  it('disables inputs and buttons while sending', () => {
    render(<ChatView messages={[]} input="text" isSending />);
    expect(screen.getByLabelText('send')).toBeDisabled();
    expect(screen.getByLabelText('copilotAttachFile')).toBeDisabled();
    expect(screen.getByTestId('Input__61b427')).toBeDisabled();
  });

  it('triggers the hidden file input and onFilePick when the paperclip is clicked', async () => {
    const user = userEvent.setup();
    const onFilePick = vi.fn();
    const { container } = render(
      <ChatView messages={[]} onFilePick={onFilePick} />,
    );
    const hiddenInput = container.querySelector('input[type="file"]');
    const clickSpy = vi.spyOn(hiddenInput, 'click');
    await user.click(screen.getByLabelText('copilotAttachFile'));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(onFilePick).toHaveBeenCalledTimes(1);
  });

  it('calls onFileChange when a file is selected via the hidden input', async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const { container } = render(
      <ChatView messages={[]} onFileChange={onFileChange} />,
    );
    const hiddenInput = container.querySelector('input[type="file"]');
    const file = new File(['data'], 'upload.txt', { type: 'text/plain' });
    await user.upload(hiddenInput, file);
    expect(onFileChange).toHaveBeenCalledTimes(1);
  });

  it('auto-scrolls to the bottom anchor on mount and when messages change', async () => {
    const { rerender } = render(<ChatView messages={[]} />);
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    Element.prototype.scrollIntoView.mockClear();
    rerender(<ChatView messages={[{ id: '1', role: 'user', text: 'new' }]} />);
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });
});
