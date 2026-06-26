import React, { createContext, useContext, useMemo } from 'react';
import { useLocaleSwitch } from './LocaleProvider.jsx';

/**
 * Per-window field-label slice context (ETP-4300).
 *
 * Holds the full bilingual slice emitted by a window's generated `labels.js`
 * (shape: `{ en_US: { <column>: <label> }, es_ES: { ... } }`), or null when no
 * provider is mounted. Default null keeps `useLabel` falling through to the
 * monolith dictionary, so mounting the provider is purely additive.
 */
const WindowLabelsContext = createContext(null);

/**
 * Provides a window's label slice to its subtree.
 *
 * Mount this at the window's render boundary (the registry/route loader) so the
 * whole window — generated components AND custom siblings — can resolve its
 * sliced labels. `slice` is the default export of the window's `labels.js`.
 *
 * @param {{ slice: object|null, children: React.ReactNode }} props
 */
export function WindowLabelsProvider({ slice, children }) {
  return (
    <WindowLabelsContext.Provider value={slice ?? null}>
      {children}
    </WindowLabelsContext.Provider>
  );
}

/**
 * Returns the active-locale label map (`{ <column>: <label> }`) for the current
 * window slice, or null when no provider is mounted (or the slice lacks the
 * active locale). Resolves the active locale from {@link useLocaleSwitch}.
 *
 * Memoized on (slice, locale) so the returned reference is stable across
 * renders — `useLabel` depends on it in a `useCallback`, so an unstable identity
 * here would defeat that memoization.
 */
export function useWindowLabels() {
  const slice = useContext(WindowLabelsContext);
  const { locale } = useLocaleSwitch();
  return useMemo(() => (slice ? (slice[locale] ?? null) : null), [slice, locale]);
}
