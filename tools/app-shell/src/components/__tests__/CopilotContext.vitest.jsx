import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const legacy = {
  state: { conversations: [{ conversation_id: 'LEG' }], archivedConversations: [], attachments: [], labels: {}, conversationId: null },
  actions: { clearAttachments: vi.fn(), loadConversations: vi.fn(), selectConversation: vi.fn() },
};
const aiActions = {
  loadConversations: vi.fn(), loadArchivedConversations: vi.fn(), selectConversation: vi.fn(),
  deleteConversation: vi.fn(), restoreConversation: vi.fn(), permanentDelete: vi.fn(), renameConversation: vi.fn(),
  sendMessage: vi.fn(), setInput: vi.fn(), resetConversation: vi.fn(), startNewConversation: vi.fn(),
  requestPageHelp: vi.fn(), showPageHelp: vi.fn(), retry: vi.fn(), dismissError: vi.fn(),
};
const ai = {
  messages: [], input: '', isSending: false, error: '', pageHelpSuggestion: '', pageHelpError: '',
  pageHelpActive: false, pageHelpLoading: false, conversationId: 'AGENT-1',
  conversations: [{ conversation_id: 'AGENT-1', title: 'hola' }],
  archivedConversations: [{ conversation_id: 'ARC' }],
  isLoadingConversations: false, isLoadingArchivedConversations: false, isLoadingMessages: false,
  actions: aiActions,
};

vi.mock('../copilot/useCopilotChat.js', () => ({ useCopilotChat: () => legacy }));
vi.mock('../copilot/useAiCopilotChat.js', () => ({ useAiCopilotChat: () => ai }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ token: 'tk' }) }));

import { CopilotProvider, useCopilot } from '../CopilotContext.jsx';

const wrapper = ({ children }) => <CopilotProvider>{children}</CopilotProvider>;

describe('CopilotProvider history wiring', () => {
  it('exposes the real conversations, ids and history actions', () => {
    const { result } = renderHook(() => useCopilot(), { wrapper });
    expect(result.current.state.conversations).toEqual(ai.conversations);
    expect(result.current.state.archivedConversations).toEqual(ai.archivedConversations);
    expect(result.current.state.conversationId).toBe('AGENT-1');
    expect(result.current.state.selectedAssistant.name).toBe('Etendo AI');
    for (const name of ['loadConversations', 'loadArchivedConversations', 'selectConversation', 'deleteConversation',
      'restoreConversation', 'permanentDelete', 'renameConversation', 'startNewConversation', 'retry', 'dismissError']) {
      expect(result.current.actions[name]).toBe(aiActions[name]);
    }
  });

  it('clears attached context when the panel closes', () => {
    legacy.actions.clearAttachments.mockClear();
    const { result } = renderHook(() => useCopilot(), { wrapper });
    act(() => result.current.close());
    expect(legacy.actions.clearAttachments).toHaveBeenCalledTimes(1);
  });

  it('clears attached context when toggling the panel closed, not when opening it', () => {
    legacy.actions.clearAttachments.mockClear();
    const { result } = renderHook(() => useCopilot(), { wrapper });
    act(() => result.current.open());
    expect(legacy.actions.clearAttachments).not.toHaveBeenCalled();
    act(() => result.current.toggle());
    expect(legacy.actions.clearAttachments).toHaveBeenCalledTimes(1);
  });
});
