import { createContext, useContext, useMemo, useRef, useState } from 'react';

const GlobalSearchContext = createContext(null);

export function GlobalSearchProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const keyboardHandlerRef = useRef(null);

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
      if (!open || document.activeElement !== inputRef.current) return;
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
      if (!fallbackOpen || document.activeElement !== fallbackInputRef.current) return;
      event.preventDefault();
      fallbackHandlerRef.current?.(event.key);
    },
  };
}
