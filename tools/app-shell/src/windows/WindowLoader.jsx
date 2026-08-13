import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext.jsx';
import { LocaleProvider, useLocale, useLocaleSwitch } from '@/i18n';

/**
 * ETP-4300: at the window boundary, load the window's per-window field-label
 * slice (`labels.js`, a gitignored build artifact) in parallel with its component,
 * then re-provide the locale dictionary for the window subtree as
 * `core + this window's fields`. The boot bundle only carries the sliced `core`
 * (no `fields` monolith); each window brings its own field labels in its lazy chunk.
 */
export default function WindowLoader({ windowMap, apiBaseUrl }) {
  const { windowName, recordId } = useParams();
  const { token } = useAuth();
  const coreDict = useLocale();
  const { locale, setLocale } = useLocaleSwitch();
  const [Component, setComponent] = useState(null);
  const [slice, setSlice] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setComponent(null);
    setSlice(null);

    const windowConfig = windowMap[windowName];
    if (!windowConfig) {
      setError(`Window "${windowName}" not found`);
      setLoading(false);
      return;
    }

    // Load the component and its per-window label slice in parallel. A window
    // without a slice (e.g. absent/failed labels.js) simply gets null and resolves
    // field labels from the shared core (or the raw AD label), as before.
    const loadSlice = import(
      `@generated/${windowName}/generated/web/${windowName}/labels.js`
    ).then(mod => mod.default).catch(() => null);

    Promise.all([windowConfig.loader(), loadSlice])
      .then(([mod, sliceData]) => {
        setComponent(() => mod.default);
        setSlice(sliceData);
        setLoading(false);
      })
      .catch(err => {
        setError(`Failed to load window "${windowName}": ${err.message}`);
        setLoading(false);
      });
  }, [windowName, windowMap]);

  // Merge the window's field labels into the active-locale core dictionary. The
  // slice is `{ <locale>: { <column>: <label> } }`; `useLabel`/`resolveLabel` read
  // `dictionary.fields[column].label`, so wrap each label as `{ label }`.
  const windowDictionaries = useMemo(() => {
    const base = coreDict || {};
    const localeSlice = (slice && slice[locale]) || {};
    const fields = { ...(base.fields || {}) };
    for (const [column, label] of Object.entries(localeSlice)) {
      fields[column] = { label };
    }
    return { [locale]: { ...base, fields } };
  }, [coreDict, slice, locale]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive font-medium">{error}</p>
          <p className="text-sm text-muted-foreground mt-2">Check that the component has been generated.</p>
        </div>
      </div>
    );
  }

  if (!Component) return null;

  // Re-provide the locale for the window subtree (generated component + custom
  // siblings) so its field labels resolve from the merged dictionary.
  return (
    <LocaleProvider
      dictionaries={windowDictionaries}
      locale={locale}
      setLocale={setLocale}
      data-testid="LocaleProvider__f59d7c">
      <Component
        token={token}
        apiBaseUrl={`${apiBaseUrl}/${windowName}`}
        window={windowMap[windowName]}
        windowName={windowName}
        recordId={recordId}
        data-testid="Component__f59d7c" />
    </LocaleProvider>
  );
}
