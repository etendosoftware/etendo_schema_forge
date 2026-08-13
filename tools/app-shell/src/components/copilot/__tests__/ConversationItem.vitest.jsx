import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('@/components/ui/input.jsx', () => ({
  Input: React.forwardRef((props, ref) => <input ref={ref} {...props} />),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('lucide-react', () => ({
  Check: () => <svg data-testid="icon-check" />,
  Pencil: () => <svg data-testid="icon-pencil" />,
  RotateCcw: () => <svg data-testid="icon-restore" />,
  Trash2: () => <svg data-testid="icon-trash" />,
}));

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationItem } from '../ConversationItem.jsx';

describe('ConversationItem', () => {
  const conversation = { conversation_id: 'c1', title: 'Test Chat' };

  const defaultProps = {
    conversation,
    isActive: false,
    isArchived: false,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onRestore: vi.fn(),
    onPermanentDelete: vi.fn(),
    onRename: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders conversation title', () => {
    render(<ConversationItem {...defaultProps} />);
    expect(screen.getByText('Test Chat')).toBeInTheDocument();
  });

  it('shows untitled label when title is empty', () => {
    render(<ConversationItem {...defaultProps} conversation={{ conversation_id: 'c1', title: '' }} />);
    expect(screen.getByText('copilotUntitledConversation')).toBeInTheDocument();
  });

  it('calls onSelect on click', async () => {
    const user = userEvent.setup();
    const { container } = render(<ConversationItem {...defaultProps} />);
    const wrapper = container.querySelector('[role="button"][tabindex="0"]');
    await user.click(wrapper);
    expect(defaultProps.onSelect).toHaveBeenCalled();
  });

  it('calls onSelect on Enter key', () => {
    const { container } = render(<ConversationItem {...defaultProps} />);
    const wrapper = container.querySelector('[role="button"][tabindex="0"]');
    fireEvent.keyDown(wrapper, { key: 'Enter' });
    expect(defaultProps.onSelect).toHaveBeenCalled();
  });

  it('calls onSelect on Space key', () => {
    const { container } = render(<ConversationItem {...defaultProps} />);
    const wrapper = container.querySelector('[role="button"][tabindex="0"]');
    fireEvent.keyDown(wrapper, { key: ' ' });
    expect(defaultProps.onSelect).toHaveBeenCalled();
  });

  // Non-archived action buttons
  it('shows rename and delete buttons for non-archived items', () => {
    render(<ConversationItem {...defaultProps} />);
    expect(screen.getByLabelText('copilotRenameConversation')).toBeInTheDocument();
    expect(screen.getByLabelText('copilotDeleteConversation')).toBeInTheDocument();
  });

  it('calls onDelete when delete button is clicked', async () => {
    const user = userEvent.setup();
    render(<ConversationItem {...defaultProps} />);
    await user.click(screen.getByLabelText('copilotDeleteConversation'));
    expect(defaultProps.onDelete).toHaveBeenCalled();
  });

  // Archived action buttons
  it('shows restore and permanent delete buttons for archived items', () => {
    render(<ConversationItem {...defaultProps} isArchived={true} />);
    expect(screen.getByLabelText('copilotRestoreConversation')).toBeInTheDocument();
    expect(screen.getByLabelText('copilotPermanentDelete')).toBeInTheDocument();
  });

  it('calls onRestore when restore button is clicked', async () => {
    const user = userEvent.setup();
    render(<ConversationItem {...defaultProps} isArchived={true} />);
    await user.click(screen.getByLabelText('copilotRestoreConversation'));
    expect(defaultProps.onRestore).toHaveBeenCalled();
  });

  it('calls onPermanentDelete when permanent delete is clicked', async () => {
    const user = userEvent.setup();
    render(<ConversationItem {...defaultProps} isArchived={true} />);
    await user.click(screen.getByLabelText('copilotPermanentDelete'));
    expect(defaultProps.onPermanentDelete).toHaveBeenCalled();
  });

  // Rename flow
  it('enters rename mode when rename button is clicked', async () => {
    const user = userEvent.setup();
    render(<ConversationItem {...defaultProps} />);
    await user.click(screen.getByLabelText('copilotRenameConversation'));
    // Input should appear with the current title
    const input = screen.getByDisplayValue('Test Chat');
    expect(input).toBeInTheDocument();
  });

  it('commits rename on Enter', async () => {
    const user = userEvent.setup();
    render(<ConversationItem {...defaultProps} />);

    // Enter rename mode
    await user.click(screen.getByLabelText('copilotRenameConversation'));
    const input = screen.getByDisplayValue('Test Chat');

    await user.clear(input);
    await user.type(input, 'New Name{Enter}');
    expect(defaultProps.onRename).toHaveBeenCalledWith('New Name');
  });

  it('cancels rename on Escape', async () => {
    const user = userEvent.setup();
    render(<ConversationItem {...defaultProps} />);

    await user.click(screen.getByLabelText('copilotRenameConversation'));
    const input = screen.getByDisplayValue('Test Chat');

    await user.type(input, 'changed');
    fireEvent.keyDown(input, { key: 'Escape' });

    // Should be back to normal view
    expect(screen.getByText('Test Chat')).toBeInTheDocument();
  });

  it('commits rename on blur', async () => {
    const user = userEvent.setup();
    render(<ConversationItem {...defaultProps} />);

    await user.click(screen.getByLabelText('copilotRenameConversation'));
    const input = screen.getByDisplayValue('Test Chat');

    await user.clear(input);
    await user.type(input, 'Blurred Name');
    fireEvent.blur(input);

    expect(defaultProps.onRename).toHaveBeenCalledWith('Blurred Name');
  });

  it('does not call onRename if name unchanged', async () => {
    const user = userEvent.setup();
    render(<ConversationItem {...defaultProps} />);

    await user.click(screen.getByLabelText('copilotRenameConversation'));
    const input = screen.getByDisplayValue('Test Chat');

    // Just press Enter without changing
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(defaultProps.onRename).not.toHaveBeenCalled();
  });

  it('does not call onRename if input is empty', async () => {
    const user = userEvent.setup();
    render(<ConversationItem {...defaultProps} />);

    await user.click(screen.getByLabelText('copilotRenameConversation'));
    const input = screen.getByDisplayValue('Test Chat');

    await user.clear(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(defaultProps.onRename).not.toHaveBeenCalled();
  });

  it('commits rename via check button', async () => {
    const user = userEvent.setup();
    render(<ConversationItem {...defaultProps} />);

    await user.click(screen.getByLabelText('copilotRenameConversation'));
    const input = screen.getByDisplayValue('Test Chat');

    await user.clear(input);
    await user.type(input, 'Check Name');

    // Click the check/save button
    await user.click(screen.getByLabelText('save'));
    expect(defaultProps.onRename).toHaveBeenCalledWith('Check Name');
  });

  it('does not call onSelect when in rename mode via click on title area', async () => {
    const user = userEvent.setup();
    const { container } = render(<ConversationItem {...defaultProps} />);

    await user.click(screen.getByLabelText('copilotRenameConversation'));
    // Clear any calls accumulated during setup
    defaultProps.onSelect.mockClear();

    // Click on the rename input area — stopPropagation prevents onSelect
    const input = screen.getByDisplayValue('Test Chat');
    await user.click(input);
    expect(defaultProps.onSelect).not.toHaveBeenCalled();
  });

  it('does not call onSelect on Enter when renaming', () => {
    const { container } = render(<ConversationItem {...defaultProps} />);

    // Enter rename mode
    fireEvent.click(screen.getByLabelText('copilotRenameConversation'));

    // Press Enter on the wrapper
    const wrapper = container.querySelector('[role="button"][tabindex="0"]');
    fireEvent.keyDown(wrapper, { key: 'Enter' });
    expect(defaultProps.onSelect).not.toHaveBeenCalled();
  });

  it('applies active styles when isActive', () => {
    const { container } = render(<ConversationItem {...defaultProps} isActive={true} />);
    const wrapper = container.querySelector('[role="button"][tabindex="0"]');
    expect(wrapper.className).toContain('bg-accent');
  });

  it('applies non-active styles when not active', () => {
    const { container } = render(<ConversationItem {...defaultProps} isActive={false} />);
    const wrapper = container.querySelector('[role="button"][tabindex="0"]');
    expect(wrapper.className).toContain('hover:bg-muted/60');
  });
});
