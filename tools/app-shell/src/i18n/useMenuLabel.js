import { useLocale } from './LocaleProvider.jsx';

/**
 * Hook that returns a translator function for menu group names, tab labels,
 * and other UI strings.
 * Looks up keys in: ui → menus → windows → tabs → genericLabels → raw key.
 *
 * Usage:
 *   const tMenu = useMenuLabel();
 *   tMenu('Home')         // "Inicio" (es_ES) or "Home" (en_US)
 *   tMenu('Dashboard')    // "Panel" (es_ES) or "Dashboard" (en_US)
 *   tMenu('Complete')     // "Completar" (es_ES) or "Complete" (en_US)
 */
export function useMenuLabel() {
  const dictionary = useLocale();
  return (key) =>
    dictionary?.ui?.[key]?.label ??
    dictionary?.menus?.[key]?.label ??
    dictionary?.windows?.[key]?.label ??
    dictionary?.tabs?.[key]?.label ??
    dictionary?.genericLabels?.[key] ??
    key;
}
