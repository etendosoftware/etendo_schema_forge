import { useLocale } from './LocaleProvider.jsx';

/**
 * Hook that returns a translator function for generic UI labels.
 * Resolves keys from the `genericLabels` section of the locale dictionary.
 *
 * Usage:
 *   const ui = useUI();
 *   ui('save')          // "Save" (en_US) or "Guardar" (es_ES)
 *   ui('newRecord')     // "New" (en_US) or "Nuevo" (es_ES)
 */
export function useUI() {
  const dictionary = useLocale();
  return (key, params = {}) => {
    let text = dictionary?.genericLabels?.[key] ?? key;
    if (params && typeof params === 'object') {
      Object.keys(params).forEach((p) => {
        text = text.replace(`{${p}}`, params[p]);
      });
    }
    return text;
  };
}
