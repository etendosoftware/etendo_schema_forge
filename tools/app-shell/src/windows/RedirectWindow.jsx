import { Navigate, useLocation, useParams } from 'react-router-dom';

/**
 * Builds the component for a menu.json item declared `hidden: true` + `"redirect": "<path>"`
 * (ETP-5795). Keeps old bookmarks/deep-links of a retired window working by replacing the URL
 * with the window that superseded it.
 *
 * `keepPath` (menu item `"redirectKeepPath": true`, ETP-5720) carries the record ID, query string
 * and hash over, for a window that was only renamed. Opt-in: a redirect to a different window
 * (e.g. `/fiscal-calendar` → `/calendar`) must not carry a foreign record ID.
 */
export function makeRedirectWindow(to, keepPath = false) {
  if (keepPath) {
    return function RedirectWindowKeepPath() {
      const { recordId } = useParams();
      const { search, hash } = useLocation();
      const path = recordId ? `${to}/${encodeURIComponent(recordId)}` : to;
      return <Navigate to={`${path}${search}${hash}`} replace data-testid="Navigate__windowRedirect" />;
    };
  }
  return function RedirectWindow() {
    return <Navigate to={to} replace data-testid="Navigate__windowRedirect" />;
  };
}
