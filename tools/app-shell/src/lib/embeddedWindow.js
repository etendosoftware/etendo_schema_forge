/**
 * Marker that says "this document is an application window hosted inside a dialog".
 *
 * It lives on `window.name` rather than in the query string for one reason that only shows
 * up once the embed is actually used: the hosted window NAVIGATES — it goes to
 * `/<spec>/<id>` when it saves — and a query parameter does not survive that. The first
 * save would silently drop the flag and the full app chrome would come back inside the
 * dialog. `window.name` is per-document, set by the host before the frame loads, and
 * survives same-document client-side navigation.
 *
 * The query parameter is still honoured for the first paint (and for opening an embedded
 * URL directly), so both signals are checked.
 */
export const EMBEDDED_WINDOW_NAME = 'etendo-embedded-window';

/** True when the current document is a window embedded in a host dialog. */
export function isEmbeddedWindowDocument() {
  try {
    return typeof window !== 'undefined' && window.name === EMBEDDED_WINDOW_NAME;
  } catch {
    return false;
  }
}

/**
 * Whether the chrome (sidebar, topbar, palette, widgets, side panels, the window's own
 * "cancel back to list") should be dropped.
 *
 * `embedded=1` is the pre-existing read-only preview; `interactive` is the usable embed.
 * Both strip chrome — only the first also disables pointer events, which is why callers
 * keep those two apart.
 */
export function isChromelessEmbed(embeddedParam) {
  return embeddedParam === '1' || embeddedParam === 'interactive' || isEmbeddedWindowDocument();
}
