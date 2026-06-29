import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';

const LocaleContext = createContext(null);

// ETP-4300 build-time flag. Vite replaces import.meta.env.VITE_SLICED_LABELS with
// a literal at build, so SLICED_LABELS is a compile-time constant — that is what
// lets Rollup tree-shake away whichever loading path is unused (see below).
const SLICED_LABELS = import.meta.env.VITE_SLICED_LABELS === 'true';

// Flag OFF (default): eager-load BOTH full locale dictionaries, exactly as before
// (synchronous, no behavior change). When SLICED_LABELS is the constant `true`,
// this branch is dead code, so the (side-effect-free) monolithic JSON imports it
// generates are tree-shaken out — they never reach the boot chunk.
const eagerModules = SLICED_LABELS
  ? {}
  : import.meta.glob('../locales/*.json', { eager: true });

// Flag ON: lazy per-locale loaders for the "core" dictionary (full dict minus
// `fields`), generated as gitignored build artifacts by the slice-labels prebuild.
// Non-eager glob → each locale is a separate chunk; only the active one is fetched.
const coreLoaders = SLICED_LABELS
  ? import.meta.glob('../locales/generated/core.*.json')
  : {};

/**
 * Provides the locale dictionary to the component tree via React context.
 *
 * Two modes, selected at build time by VITE_SLICED_LABELS:
 *  - OFF (default): the full active-locale dictionary, loaded eagerly/synchronously.
 *  - ON: only the active locale's `core` (no `fields`), loaded lazily. Field labels
 *    come from per-window slices via WindowLabelsProvider. During the async load the
 *    dictionary is `{}` — consumers (useUI/useMenuLabel) echo the key, so first paint
 *    is never blocked; the real dictionary swaps in when it resolves.
 */
export function LocaleProvider({ locale = 'es_ES', setLocale, children }) {
  // Eager path (flag off): synchronous dictionary, identical to the prior behavior.
  const eagerDict = useMemo(() => {
    if (SLICED_LABELS) return null;
    const key = `../locales/${locale}.json`;
    return eagerModules[key]?.default ?? eagerModules[key] ?? {};
  }, [locale]);

  // Lazy path (flag on): load the active locale's core asynchronously.
  const [lazyDict, setLazyDict] = useState({});
  useEffect(() => {
    if (!SLICED_LABELS) return undefined;
    let cancelled = false;
    const loader = coreLoaders[`../locales/generated/core.${locale}.json`];
    if (!loader) {
      setLazyDict({});
      return undefined;
    }
    loader()
      .then((mod) => { if (!cancelled) setLazyDict(mod?.default ?? mod ?? {}); })
      .catch(() => { if (!cancelled) setLazyDict({}); });
    return () => { cancelled = true; };
  }, [locale]);

  const dictionary = SLICED_LABELS ? lazyDict : eagerDict;

  const value = useMemo(() => ({
    dictionary,
    locale,
    setLocale: setLocale || null,
  }), [dictionary, locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  );
}

/**
 * Returns the raw locale dictionary from context.
 * For backward compatibility, returns just the dictionary object.
 */
export function useLocale() {
  const ctx = useContext(LocaleContext);
  // Backward compat: if context is the old shape (plain dict), return it as-is
  if (ctx && ctx.dictionary) return ctx.dictionary;
  return ctx;
}

/**
 * Returns { locale, setLocale } for components that need to switch locales.
 */
export function useLocaleSwitch() {
  const ctx = useContext(LocaleContext);
  return { locale: ctx?.locale ?? 'es_ES', setLocale: ctx?.setLocale ?? null };
}
