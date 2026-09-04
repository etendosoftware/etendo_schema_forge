import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const GlobalSearchContext = createContext(null);

export function GlobalSearchProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const keyboardHandlerRef = useRef(null);
  const lastKeyRef = useRef({ key: null, time: 0 });
  const registerKeyboardHandler = useCallback((handler) => {
    keyboardHandlerRef.current = handler;
    return () => {
      if (keyboardHandlerRef.current === handler) keyboardHandlerRef.current = null;
    };
  }, []);
  const handleKeyDown = useCallback((event) => {
    if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
    const now = Date.now();
    if (lastKeyRef.current.key === event.key && now - lastKeyRef.current.time < 40) return;
    lastKeyRef.current = { key: event.key, time: now };
    if (!open) return;
    event.preventDefault();
    const result = keyboardHandlerRef.current?.(event.key);
    if (event.key === 'Enter' && !result?.keepOpen) setOpen(false);
    return result;
  }, [open]);

  const value = useMemo(() => ({
    open,
    setOpen,
    query,
    setQuery,
    inputRef,
    registerKeyboardHandler,
    handleKeyDown,
  }), [open, query, registerKeyboardHandler, handleKeyDown]);

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
      if (event.key === 'Escape') {
        if (fallbackOpen) {
          event.preventDefault();
          setFallbackOpen(false);
        }
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
      if (!fallbackOpen) return;
      event.preventDefault();
      return fallbackHandlerRef.current?.(event.key);
    },
  };
}
