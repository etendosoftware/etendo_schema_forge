import { createContext, useContext } from 'react';

/**
 * Marks a subtree as an application window rendered inside a host dialog rather than as the
 * page itself, so its chrome — sidebar, topbar, palette, widgets, side panels and its own
 * "cancel back to the list" — is dropped.
 *
 * A CONTEXT, not the URL, is the carrier, and that is the whole point. The flag was first
 * kept on `window.name` (iframe era) and then on the embedded router's search params, and
 * both were lost the same way: the window NAVIGATES when it saves, `/<spec>/new` →
 * `/<spec>/<id>`, and a query string does not survive that. Re-applying it from an effect is
 * a race the user sees — the Products window's stock side panel reappeared inside the dialog
 * the moment the product was saved. A context is set by the host above the router and cannot
 * be dropped by anything the window does to its own location.
 */
export const EmbeddedWindowContext = createContext(false);

/**
 * Whether the chrome should be dropped: either an ancestor declared this subtree embedded, or
 * the URL asks for it.
 *
 * `embedded=1` is the pre-existing read-only preview and stays URL-driven — it is opened by
 * link, with no host component above it. `interactive` is the usable embed. Both strip chrome;
 * only the first also disables pointer events, which is why callers keep the two apart.
 */
export function useChromelessEmbed(embeddedParam) {
  return useContext(EmbeddedWindowContext) || isChromelessEmbed(embeddedParam);
}

/** URL-only form, for callers outside React or with no host context to read. */
export function isChromelessEmbed(embeddedParam) {
  return embeddedParam === '1' || embeddedParam === 'interactive';
}
