import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const flag = { on: true };
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
vi.mock('@/lib/flags', () => ({ useFeatureFlag: () => flag.on, WEBMCP_AGENT_CHAT: 'webmcp-agent-chat' }));

import { CopilotProvider, useCopilot } from '../CopilotContext.jsx';

const wrapper = ({ children }) => <CopilotProvider>{children}</CopilotProvider>;

describe('CopilotProvider history wiring', () => {
  beforeEach(() => { flag.on = true; });

  it('agent mode exposes the real conversations, ids and history actions', () => {
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

  it('legacy mode keeps the legacy state and actions untouched', () => {
    flag.on = false;
    const { result } = renderHook(() => useCopilot(), { wrapper });
    expect(result.current.state.conversations).toEqual(legacy.state.conversations);
    expect(result.current.actions.selectConversation).toBe(legacy.actions.selectConversation);
  });
});
