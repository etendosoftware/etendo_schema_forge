import { useLocale } from './LocaleProvider.jsx';

/**
 * Hook that returns a translator function for menu group names and tab labels.
 * Looks up keys in the `menus` section first, then `ui`, then falls back to the raw key.
 *
 * Usage:
 *   const tMenu = useMenuLabel();
 *   tMenu('Home')         // "Inicio" (es_ES) or "Home" (en_US)
 *   tMenu('Dashboard')    // "Panel" (es_ES) or "Dashboard" (en_US)
 */
export function useMenuLabel() {
  const dictionary = useLocale();
  return (key) =>
    dictionary?.ui?.[key]?.label ??
    dictionary?.menus?.[key]?.label ??
    dictionary?.windows?.[key]?.label ??
    key;
}
