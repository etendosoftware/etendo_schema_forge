import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useCopilotChat } from './copilot/useCopilotChat.js';

const CopilotContext = createContext(null);

export function CopilotProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  // ETP-4576 — no token read and none handed down. useCopilotChat's requests take
  // their credential from the active session scheme; this used to pass
  // useAuth().token, which the cookie scheme never populates, and the hook's own
  // `!token` gates then disabled the entire panel in silence.
  const { state, actions } = useCopilotChat();

  const open = useCallback(() => setIsOpen(true), []);
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
    () => ({ isOpen, open, close, toggle, state, actions }),
    [isOpen, open, close, toggle, state, actions],
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
