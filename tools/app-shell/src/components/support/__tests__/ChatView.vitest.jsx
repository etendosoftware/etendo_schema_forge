import { render, screen } from '@testing-library/react';
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
});
