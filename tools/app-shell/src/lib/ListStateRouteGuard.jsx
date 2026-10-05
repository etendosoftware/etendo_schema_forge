import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { pruneListStateOnNavigation } from './listViewSession.js';

/**
 * ETP-4994 — drops a window's saved grid state as soon as the user navigates out of it.
 * Renders nothing; mounted once inside the router (see `App.jsx`). The lifetime rule itself
 * lives in `pruneListStateOnNavigation` (`listViewSession.js`).
 */
export function ListStateRouteGuard() {
  const location = useLocation();
  const prevPathRef = useRef(null);

  useEffect(() => {
    const nextPath = location.pathname;
    pruneListStateOnNavigation(prevPathRef.current, nextPath);
    prevPathRef.current = nextPath;
  }, [location.pathname]);

  return null;
}
