import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useCopilotChat } from './copilot/useCopilotChat.js';
import { useAiCopilotChat } from './copilot/useAiCopilotChat.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useFeatureFlag, WEBMCP_AGENT_CHAT } from '@/lib/flags';

const CopilotContext = createContext(null);

/**
 * @param {object} props
 * @param {Array} [props.menuGroups] — the access-filtered menu groups the
 *   sidebar renders. They are the allow-list the agent's navigation tools
 *   resolve window names against (see copilot/windowRoutes.js).
 */
export function CopilotProvider({ children, menuGroups }) {
  const [isOpen, setIsOpen] = useState(false);
  const { token } = useAuth();
  const legacy = useCopilotChat({ token });
  const open = useCallback(() => setIsOpen(true), []);
  const agentEnabled = useFeatureFlag(WEBMCP_AGENT_CHAT);
  const ai = useAiCopilotChat({ onOpenCopilot: open, menuGroups });
  const state = useMemo(() => {
    if (!agentEnabled) return legacy.state;
    return {
      ...legacy.state,
      conversations: ai.conversations,
      archivedConversations: ai.archivedConversations,
      conversationId: ai.conversationId,
      isLoadingConversations: ai.isLoadingConversations,
      isLoadingArchivedConversations: ai.isLoadingArchivedConversations,
      isLoadingMessages: ai.isLoadingMessages,
      selectedAssistant: {
        app_id: 'etendo-go-ai',
        name: 'Etendo AI',
      },
      messages: ai.messages,
      input: ai.input,
      isSending: ai.isSending,
      error: ai.error,
      pageHelpSuggestion: ai.pageHelpSuggestion,
      pageHelpError: ai.pageHelpError,
      pageHelpActive: ai.pageHelpActive,
      pageHelpLoading: ai.pageHelpLoading,
    };
  }, [agentEnabled, ai.archivedConversations, ai.conversationId, ai.conversations, ai.error, ai.input, ai.isLoadingArchivedConversations, ai.isLoadingConversations, ai.isLoadingMessages, ai.isSending, ai.messages, ai.pageHelpActive, ai.pageHelpError, ai.pageHelpLoading, ai.pageHelpSuggestion, legacy.state]);
  const actions = useMemo(() => {
    if (!agentEnabled) return legacy.actions;
    return {
      ...legacy.actions,
      loadBootstrap: () => {},
      // History: same backend and list shape as the legacy copilot, driven by the agent chat.
      loadConversations: ai.actions.loadConversations,
      loadArchivedConversations: ai.actions.loadArchivedConversations,
      selectConversation: ai.actions.selectConversation,
      deleteConversation: ai.actions.deleteConversation,
      restoreConversation: ai.actions.restoreConversation,
      permanentDelete: ai.actions.permanentDelete,
      renameConversation: ai.actions.renameConversation,
      retry: ai.actions.retry,
      dismissError: ai.actions.dismissError,
      sendMessage: ai.actions.sendMessage,
      setInput: ai.actions.setInput,
      resetConversation: ai.actions.resetConversation,
      startNewConversation: ai.actions.startNewConversation,
      requestPageHelp: ai.actions.requestPageHelp,
      showPageHelp: ai.actions.showPageHelp,
    };
  }, [agentEnabled, ai.actions, legacy.actions]);

  const close = useCallback(() => {
    setIsOpen(false);
    // Closing the panel (not minimize/maximize) clears any auto-attached context.
    actions.clearAttachments();
  }, [actions]);
  const toggle = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      if (!next) {
        actions.clearAttachments();
      }
      return next;
    });
  }, [actions]);

  const value = useMemo(
    () => ({ isOpen, open, close, toggle, state, actions, token }),
    [isOpen, open, close, toggle, state, actions, token, agentEnabled],
  );

  return (
    <CopilotContext.Provider value={value}>
      {children}
    </CopilotContext.Provider>
  );
}

export function useCopilot() {
  const ctx = useContext(CopilotContext);
  if (!ctx) throw new Error('useCopilot must be used within CopilotProvider');
  return ctx;
}
