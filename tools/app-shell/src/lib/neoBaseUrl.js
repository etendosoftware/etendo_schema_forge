/**
 * ETP-5371 — the single source of truth for "where does NEO live?".
 *
 * Every backend URL in the app comes from the same two facts: the deployment's context path,
 * and whether the app runs against the mock server. Before this module each caller re-derived
 * them, and `FirstStepsImportButton` got it wrong in a way nothing could catch — it handed the
 * bare context path (`/etendo`) to consumers that expect a full spec URL (`/etendo/sws/neo/
 * product`, which is what `WindowLoader` passes `ListView`). Both are non-empty strings, so
 * every consumer went on to build a plausible URL that pointed nowhere: the batch POST landed
 * on `/batch` (CloudFront answered 403, which read like an infrastructure outage) and the
 * duplicate pre-check on `/etendo/product` (404, swallowed, so no row was ever marked as
 * already existing). Nothing logged a cause, and the import worked from the Products window
 * in the very same deployment.
 *
 * So: ask this module for a base URL, and never derive one base from another by string
 * surgery. A wrong URL built that way is indistinguishable from a right one.
 */

/**
 * Splits `window.location.pathname` into the two bases the app runs on.
 *
 * - `apiBase` — the backend context path (`/etendo`), or `''` when the app is served from the
 *   domain root. `VITE_API_BASE` overrides it, which is how the standalone dev server and the
 *   deployed SPA container reach a backend that is not a prefix of their own URL.
 * - `routerBase` — the React Router `basename`. `'/'` rather than `''` at the root, because
 *   that is what the `basename` prop expects.
 *
 * Deliberately located by the `/web/` marker rather than by counting path segments: the app
 * is mounted at `<context>/web/<module>/`, and a route can sit any number of segments deeper.
 */
export function detectBasePath() {
  const envBase = import.meta.env.VITE_API_BASE;
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');

  if (envBase) {
    const routerBase = webIdx !== -1
      ? `${path.substring(0, webIdx)}/${path.substring(webIdx + 1).split('/').slice(0, 2).join('/')}`
      : '/';
    return { apiBase: envBase, routerBase };
  }

  if (webIdx === -1) return { apiBase: '', routerBase: '/' };
  const contextPath = path.substring(0, webIdx);
  const moduleSegment = path.substring(webIdx + 1).split('/').slice(0, 2).join('/');
  return {
    apiBase: contextPath,
    routerBase: `${contextPath}/${moduleSegment}`,
  };
}

/**
 * The NEO Headless root — the prefix every spec, and `/batch` itself, hangs off.
 *
 * `/etendo/sws/neo` in a normal deployment, `/sws/neo` at the domain root, `<base>/api`
 * against the mock server.
 */
export function getNeoBaseUrl() {
  const { apiBase } = detectBasePath();
  return import.meta.env.VITE_MOCK === 'true'
    ? `${apiBase}/api`
    : `${apiBase}/sws/neo`;
}

/**
 * Where one spec lives: `/etendo/sws/neo/product`.
 *
 * This is the shape `WindowLoader` hands `ListView`, and therefore the shape every consumer
 * downstream of it (`useApiFetch`, the import dialog's existing-record lookup) is written
 * against. Any surface that drives a window's data outside the `:windowName` route — the
 * First Steps checklist being the first — must build its base here rather than approximate it.
 *
 * @param {string} spec the kebab-case spec name, i.e. the artifact directory name
 */
export function getSpecBaseUrl(spec) {
  return `${getNeoBaseUrl()}/${spec}`;
}
