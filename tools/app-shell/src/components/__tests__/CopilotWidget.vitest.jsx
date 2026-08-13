// Vitest render tests for CopilotWidget.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/sales-order' }),
}));

const mockActions = {
  loadBootstrap: vi.fn(),
  attachCurrentWindow: vi.fn(),
  syncAttachments: vi.fn(),
  selectAssistant: vi.fn(),
  resetConversation: vi.fn(),
  setFilter: vi.fn(),
  sendMessage: vi.fn(),
  uploadFile: vi.fn(),
  removeFile: vi.fn(),
  removeAttachment: vi.fn(),
  setInput: vi.fn(),
  selectConversation: vi.fn(),
  startNewConversation: vi.fn(),
  loadConversations: vi.fn(),
  loadArchivedConversations: vi.fn(),
  deleteConversation: vi.fn(),
  restoreConversation: vi.fn(),
  permanentDelete: vi.fn(),
  renameConversation: vi.fn(),
};

const mockState = {
  messages: [],
  input: '',
  isSending: false,
  assistants: [],
  selectedAssistant: null,
  filter: '',
  files: [],
  attachments: [],
  conversations: [],
  archivedConversations: [],
  conversationId: null,
  isLoadingAssistants: false,
  isLoadingConversations: false,
  labels: {},
  error: null,
};

let mockIsOpen = false;
let mockCloseFn = vi.fn();
let mockToggleFn = vi.fn();

vi.mock('../CopilotContext', () => ({
  useCopilot: () => ({
    isOpen: mockIsOpen,
    close: mockCloseFn,
    toggle: mockToggleFn,
    state: { ...mockState },
    actions: mockActions,
  }),
}));

vi.mock('../CurrentWindowContext', () => ({
  useCurrentWindowContext: () => ({ current: null }),
}));

vi.mock('lucide-react', () => ({
  ArrowLeft: (p) => <span {...p} />,
  Bot: (p) => <span {...p} />,
  History: (p) => <span {...p} />,
  Maximize2: (p) => <span {...p} />,
  Minimize2: (p) => <span {...p} />,
  Sparkles: (p) => <span {...p} />,
  X: (p) => <span {...p} />,
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, ...rest }) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/card.jsx', () => ({
  Card: ({ children, className }) => <div className={className}>{children}</div>,
  CardContent: ({ children, className }) => <div className={className}>{children}</div>,
  CardHeader: ({ children, className }) => <div className={className}>{children}</div>,
  CardTitle: ({ children, className }) => <div className={className}>{children}</div>,
}));

vi.mock('@/components/ui/separator.jsx', () => ({
  Separator: () => <hr />,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('../copilot/AssistantSelector.jsx', () => ({
  AssistantSelector: (props) => <div data-testid="assistant-selector">AssistantSelector</div>,
}));

vi.mock('../copilot/ConversationSidebar.jsx', () => ({
  ConversationSidebar: (props) => <div data-testid="conversation-sidebar">Sidebar</div>,
}));

vi.mock('../copilot/ChatView.jsx', () => ({
  ChatView: (props) => <div data-testid="chat-view">ChatView</div>,
}));

// ── Import under test ───────────────────────────────────────────────────────

import { render, screen, fireEvent } from '@testing-library/react';
import { CopilotWidget } from '../CopilotWidget.jsx';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('CopilotWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOpen = false;
  });

  it('renders the FAB button by default', () => {
    render(<CopilotWidget />);
    const fab = screen.getByRole('button', { name: 'openCopilot' });
    expect(fab).toBeTruthy();
  });

  it('hides FAB when hideTrigger=true', () => {
    render(<CopilotWidget hideTrigger />);
    expect(screen.queryByRole('button', { name: 'openCopilot' })).toBeNull();
  });

  it('calls toggle when FAB is clicked', () => {
    render(<CopilotWidget />);
    fireEvent.click(screen.getByRole('button', { name: 'openCopilot' }));
    expect(mockToggleFn).toHaveBeenCalled();
  });

  it('panel has pointer-events-none when closed', () => {
    const { container } = render(<CopilotWidget />);
    const panel = container.querySelector('.fixed.z-50');
    expect(panel.className).toContain('pointer-events-none');
  });

  it('shows AssistantSelector when no assistant is selected and panel is open', () => {
    mockIsOpen = true;
    render(<CopilotWidget />);
    expect(screen.getByTestId('assistant-selector')).toBeTruthy();
  });

  it('shows panel with pointer-events-auto when open', () => {
    mockIsOpen = true;
    const { container } = render(<CopilotWidget />);
    const panel = container.querySelector('.fixed.z-50');
    expect(panel.className).toContain('pointer-events-auto');
  });

  it('renders close button(s) when open', () => {
    mockIsOpen = true;
    render(<CopilotWidget />);
    const closeBtns = screen.getAllByRole('button', { name: 'closeCopilot' });
    // Header close + FAB (when open, FAB shows X with closeCopilot label)
    expect(closeBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('renders maximize button in header when open', () => {
    mockIsOpen = true;
    render(<CopilotWidget />);
    const maxBtn = screen.getByRole('button', { name: 'copilotMaximize' });
    expect(maxBtn).toBeTruthy();
  });

  it('shows "copilot" title when no assistant selected', () => {
    mockIsOpen = true;
    render(<CopilotWidget />);
    expect(document.body.textContent).toContain('copilot');
  });
});
