import { Navigate } from 'react-router-dom';

/**
 * Builds the component for a menu.json item declared `hidden: true` + `"redirect": "<path>"`
 * (ETP-5795). Keeps old bookmarks/deep-links of a retired window working by replacing the URL
 * with the window that superseded it.
 */
export function makeRedirectWindow(to) {
  return function RedirectWindow() {
    return <Navigate to={to} replace data-testid="Navigate__windowRedirect" />;
  };
}
