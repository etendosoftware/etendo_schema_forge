// ETP-5083 — shared helper for building an absolute, deployment-shape-safe URL
// prefix (e.g. for `window.open(...)` links that must open a NEW browser tab
// rather than navigate via `useNavigate()`).
//
// Mirrors `detectBasePath()` in `tools/app-shell/src/App.jsx`: same `/web/`
// marker detection in `window.location.pathname`, same `contextPath` /
// `moduleSegment` extraction. The one deliberate difference is the domain-root
// case — `App.jsx` returns `'/'` there because that value feeds a router
// `basename` prop, but this helper's result is always used as a bare prefix
// immediately before a leading-slash path (`${origin}${getRouterBase()}/win/id`),
// so it returns `''` at the root to avoid a double slash (`//win/id`).
//
// Deliberately NOT implemented by stripping N trailing segments off the
// current pathname — that was the original, WRONG approach taken by
// `ReportViewerPage.jsx`'s own `window.open` helper, and it breaks for any
// route more than one segment past the app root (e.g. `/warehouse/:recordId`).
// Locating the `/web/` marker instead makes this deployment-shape-based
// rather than route-depth-based, so it works regardless of how deep the
// current route is.
export function getRouterBase() {
  const path = window.location.pathname;
  const webIdx = path.indexOf('/web/');

  if (webIdx === -1) return '';

  const contextPath = path.substring(0, webIdx);
  const moduleSegment = path.substring(webIdx + 1).split('/').slice(0, 2).join('/');
  return `${contextPath}/${moduleSegment}`;
}
