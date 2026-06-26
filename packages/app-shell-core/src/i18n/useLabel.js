import { useCallback } from 'react';
import { useLocale, useLocaleSwitch } from './LocaleProvider.jsx';
import { useWindowLabels } from './WindowLabelsProvider.jsx';
import { resolveLabel } from './resolveLabel.js';

/**
 * Hook that returns a label resolver function.
 * t(columnName) returns the localized label string, or null if not found.
 *
 * Accepts an optional labelOverrides map (from decisions.json window.labelOverrides).
 * The overrides are keyed by locale (e.g. "es_ES") and then by columnName.
 *
 * Resolution chain: labelOverrides[locale][column] → dictionary.fields[column] → null
 *
 * The returned function is memoized so it stays stable across renders as long
 * as the dictionary and overrides do not change. See useUI for the rationale.
 *
 * Usage:
 *   const t = useLabel();
 *   t('C_BPartner_ID')   // "Business Partner"
 *
 *   const t = useLabel(spec?.window?.labelOverrides);
 *   t('C_BPartner_ID')   // "Cliente" (if overridden for current locale)
 *
 * Resolution chain: labelOverrides[locale][column] → window slice (ETP-4300) →
 * dictionary.fields[column] → null. The window slice comes from a mounted
 * WindowLabelsProvider; when none is mounted it is null and behavior is unchanged.
 */
export function useLabel(labelOverrides) {
  const dictionary = useLocale();
  const { locale } = useLocaleSwitch();
  const langOverrides = labelOverrides?.[locale] ?? null;
  const windowSlice = useWindowLabels();
  return useCallback(
    (columnName) => resolveLabel(dictionary, columnName, langOverrides, windowSlice),
    [dictionary, langOverrides, windowSlice],
  );
}
