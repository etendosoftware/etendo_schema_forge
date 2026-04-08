import { useLocale, useLocaleSwitch } from './LocaleProvider.jsx';
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
 * Usage:
 *   const t = useLabel();
 *   t('C_BPartner_ID')   // "Business Partner"
 *
 *   const t = useLabel(spec?.window?.labelOverrides);
 *   t('C_BPartner_ID')   // "Cliente" (if overridden for current locale)
 */
export function useLabel(labelOverrides) {
  const dictionary = useLocale();
  const { locale } = useLocaleSwitch();
  const langOverrides = labelOverrides?.[locale] ?? null;
  return (columnName) => resolveLabel(dictionary, columnName, langOverrides);
}
