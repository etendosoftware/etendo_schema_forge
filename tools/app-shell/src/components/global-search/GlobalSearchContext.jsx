import { createContext, useContext, useMemo, useRef, useState } from 'react';

const GlobalSearchContext = createContext(null);

export function GlobalSearchProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const keyboardHandlerRef = useRef(null);
  const lastKeyRef = useRef({ key: null, time: 0 });

  const value = useMemo(() => ({
    open,
    setOpen,
    query,
    setQuery,
    inputRef,
    registerKeyboardHandler(handler) {
      keyboardHandlerRef.current = handler;
      return () => {
        if (keyboardHandlerRef.current === handler) keyboardHandlerRef.current = null;
      };
    },
    handleKeyDown(event) {
      if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
      const now = Date.now();
      if (lastKeyRef.current.key === event.key && now - lastKeyRef.current.time < 40) return;
      lastKeyRef.current = { key: event.key, time: now };
      if (import.meta.env.DEV) console.debug('[GlobalSearch] keydown', { key: event.key, open, hasHandler: Boolean(keyboardHandlerRef.current) });
      if (!open) return;
      event.preventDefault();
      keyboardHandlerRef.current?.(event.key);
    },
  }), [open, query]);

  return <GlobalSearchContext.Provider value={value}>{children}</GlobalSearchContext.Provider>;
}

export function useGlobalSearch() {
  const context = useContext(GlobalSearchContext);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fallbackQuery, setFallbackQuery] = useState('');
  const fallbackInputRef = useRef(null);
  const fallbackHandlerRef = useRef(null);
  if (context) return context;
  return {
    open: fallbackOpen,
    setOpen: setFallbackOpen,
    query: fallbackQuery,
    setQuery: setFallbackQuery,
    inputRef: fallbackInputRef,
    registerKeyboardHandler(handler) {
      fallbackHandlerRef.current = handler;
      return () => { if (fallbackHandlerRef.current === handler) fallbackHandlerRef.current = null; };
    },
    handleKeyDown(event) {
      if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
      if (!fallbackOpen) return;
      event.preventDefault();
      fallbackHandlerRef.current?.(event.key);
    },
  };
}
