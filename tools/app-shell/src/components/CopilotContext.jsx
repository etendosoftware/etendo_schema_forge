import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useCopilotChat } from './copilot/useCopilotChat.js';
import { useAiCopilotChat } from './copilot/useAiCopilotChat.js';
import { useAuth } from '@/auth/AuthContext.jsx';
import { useFeatureFlag, WEBMCP_AGENT_CHAT } from '@/lib/flags';

const CopilotContext = createContext(null);

export function CopilotProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const { token } = useAuth();
  const legacy = useCopilotChat({ token });
  const open = useCallback(() => setIsOpen(true), []);
  const agentEnabled = useFeatureFlag(WEBMCP_AGENT_CHAT);
  const ai = useAiCopilotChat({ token, onOpenCopilot: open });
  const state = useMemo(() => {
    if (!agentEnabled) return legacy.state;
    return {
      ...legacy.state,
      conversations: [],
      archivedConversations: [],
      selectedAssistant: {
        app_id: 'etendo-go-ai',
        name: 'Etendo Go AI',
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
  }, [agentEnabled, ai.error, ai.input, ai.isSending, ai.messages, ai.pageHelpActive, ai.pageHelpError, ai.pageHelpLoading, ai.pageHelpSuggestion, legacy.state]);
  const actions = useMemo(() => {
    if (!agentEnabled) return legacy.actions;
    return {
      ...legacy.actions,
      loadBootstrap: () => {},
      loadConversations: () => {},
      loadArchivedConversations: () => {},
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
