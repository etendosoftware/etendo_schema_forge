import { useEffect, useState } from 'react';

// ETP-4300: lazy-load only the active locale's core dictionary.
// ETP-4663: dictionaries accumulate per locale (never cleared) and
// `renderedLocale` only advances once its dictionary is cached, so the UI
// keeps rendering the previous locale's strings — instead of a blank `{}`
// dictionary that made ui() echo raw keys — until the new one is ready.
export function useLocaleDictionaries(locale, loaders) {
  const [dictionaries, setDictionaries] = useState({});
  const [renderedLocale, setRenderedLocale] = useState(locale);

  useEffect(() => {
    if (dictionaries[locale]) {
      setRenderedLocale(locale);
      return undefined;
    }
    let cancelled = false;
    const loadCore = loaders[`./locales/generated/core.${locale}.json`];
    if (!loadCore) {
      setDictionaries((prev) => ({ ...prev, [locale]: {} }));
      setRenderedLocale(locale);
      return undefined;
    }
    loadCore().then((mod) => {
      if (cancelled) return;
      setDictionaries((prev) => ({ ...prev, [locale]: mod.default ?? mod }));
      setRenderedLocale(locale);
    });
    return () => { cancelled = true; };
  }, [locale, dictionaries, loaders]);

  return { dictionaries, renderedLocale };
}
