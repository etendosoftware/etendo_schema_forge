import { registerErrorTranslator } from '@etendosoftware/app-shell-core/auth';
import { resolveUI } from '@etendosoftware/app-shell-core/i18n';

/**
 * ETP-5424 — registers the app's translator for the errors core builds outside React, most
 * importantly the `NetworkError` apiFetch throws for a dropped connection or a timeout. Its
 * `.message` is what ~150 call sites render as-is, so it has to resolve against the same
 * dictionary `useUI` reads: the one for the RENDERED locale.
 *
 * Lookup is `resolveUI`, which returns the key unchanged when the entry is missing — the signal
 * core reads as "untranslated" and answers with its English fallback. A `null` dictionary (the
 * locale is still loading) resolves every key to itself, so the fallback applies until it lands.
 *
 * Called from an effect in `App.jsx` and re-run on every locale change; the returned function
 * unregisters it, and only if it is still the active one.
 *
 * @param {object|null|undefined} dictionary the rendered locale's dictionary
 * @returns {() => void} unregister
 */
export function installErrorTranslator(dictionary) {
  return registerErrorTranslator((key) => resolveUI(dictionary, key));
}
