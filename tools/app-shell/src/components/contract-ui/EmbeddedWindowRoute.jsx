import { cloneElement, useEffect } from 'react';
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
  useParams,
  UNSAFE_LocationContext as LocationContext,
  UNSAFE_RouteContext as RouteContext,
} from 'react-router-dom';
import { PageMetaProvider } from '@/components/layout/PageMetaContext.jsx';
import { EmbeddedWindowContext } from '@/lib/embeddedWindow.js';

/**
 * Mounts a real application window inside the host's React tree, with its own routing.
 *
 * ── Why the context resets ──
 * React Router refuses to nest routers, and the first attempt at this feature read that as
 * "impossible" and fell back to an iframe. The invariant is narrower than it looks:
 *
 *     invariant(!useInRouterContext(), 'You cannot render a <Router> inside another <Router>')
 *     function useInRouterContext() { return useContext(LocationContext) != null; }
 *
 * It asks only whether `LocationContext` is non-null AT THAT POINT. Re-providing `null`
 * (its own default) satisfies it. `RouteContext` is reset too, or the inner routes would be
 * matched relative to the host's current match (`/sales-order/:id`) instead of from the root.
 *
 * These are `UNSAFE_` exports — unsupported API. Two things make that acceptable here: the
 * version is pinned, and the failure mode is loud (an invariant throw at mount, which any
 * smoke test catches) rather than silent.
 *
 * ── Why this instead of an iframe ──
 * The iframe cost a second cold boot of the whole app — entry chunk, session refresh, window
 * access map, then the window — roughly 460 ms against 180 ms for navigating to the same
 * window in-app. A memory router costs none of that: the providers, the session and the
 * already-parsed chunks are the host's. The window's `navigate()` calls run against
 * `createMemoryHistory`, which never touches `window.history`, so they cannot move the
 * document underneath the dialog — the original fear, and the reason the iframe existed.
 *
 * ── What else has to be isolated ──
 * Three host-wide channels the iframe used to cut for free, and that an in-tree mount would
 * otherwise write straight through:
 *
 *  - `PageMetaProvider`. Both `ListView` and `DetailView` publish their title, breadcrumb and
 *    record count through `useSetPageMeta`, which the host's TopBar reads. Without a nested
 *    provider the dialog rewrites the document's own header — the invoice's breadcrumb turned
 *    into "Inventario / Producto" while the invoice was still open behind the dialog.
 *  - `EmbeddedWindowContext`. The chromeless flag CANNOT ride on the URL: the window navigates
 *    to `/<spec>/<id>` when it saves and drops the query string with it, which put the stock
 *    side panel back inside the dialog at the exact moment the product was created.
 *  - The `recordId` PROP. Windows switch list-vs-detail on the prop that `WindowLoader` reads
 *    from the route (`WindowLoader.jsx`), not on the route param themselves — so a child
 *    mounted without it renders the product LIST, however correct the inner URL is. The route
 *    elements below inject it, which also means the window flips to the saved record by
 *    itself when it navigates from `/<spec>/new` to `/<spec>/<id>`.
 */
export default function EmbeddedWindowRoute({ windowName, initialPath, onRecordId, children }) {
  const element = <EmbeddedWindowElement data-testid="EmbeddedWindowElement__route">{children}</EmbeddedWindowElement>;
  return (
    <LocationContext.Provider value={null}>
      <RouteContext.Provider value={{ outlet: null, matches: [], isDataRoute: false }}>
        <EmbeddedWindowContext.Provider value={true}>
          <MemoryRouter initialEntries={[initialPath]} data-testid="MemoryRouter__b45f45">
            <PageMetaProvider data-testid="PageMetaProvider__route">
              <EmbeddedLocationWatcher
                windowName={windowName}
                onRecordId={onRecordId}
                data-testid="EmbeddedLocationWatcher__b45f45" />
              <Routes data-testid="Routes__b45f45">
                <Route path={`/${windowName}`} element={element} data-testid="Route__b45f45" />
                <Route
                  path={`/${windowName}/:recordId`}
                  element={element}
                  data-testid="Route__b45f45" />
              </Routes>
            </PageMetaProvider>
          </MemoryRouter>
        </EmbeddedWindowContext.Provider>
      </RouteContext.Provider>
    </LocationContext.Provider>
  );
}

/** Hands the window the route's `recordId` as a prop, the way `WindowLoader` does. */
function EmbeddedWindowElement({ children }) {
  const { recordId } = useParams();
  return cloneElement(children, { recordId });
}

/** Reports the record id as soon as the window navigates to the record it just saved. */
function EmbeddedLocationWatcher({ windowName, onRecordId }) {
  const location = useLocation();

  useEffect(() => {
    const id = new RegExp(`^/${windowName}/([^/?#]+)`).exec(location.pathname || '')?.[1];
    if (id && id !== 'new') onRecordId(id);
  }, [location.pathname, windowName, onRecordId]);

  return null;
}
