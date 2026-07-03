# 06 -- Frontend Delivery

How the React SPA reaches end users, performs in production, and stays up to date after deployments.

## SPA Architecture

### Entry Point and Routing

The application has a single entry point:

```
index.html  -->  main.jsx  -->  App.jsx  -->  BrowserRouter  -->  lazy window loading
```

`main.jsx` mounts the root React tree with a `ThemeProvider` (next-themes) and `Toaster` (sonner). `App.jsx` initializes the router, auth provider, locale provider, service worker manager, and the window registry.

The router base path is auto-detected at boot. When the SPA is deployed under Etendo's web directory (e.g., `/etendo_sf/web/app-shell/`), `detectBasePath()` extracts the context path from `window.location.pathname`. In standalone dev mode it falls back to `/`.

### Code Splitting Strategy

Every generated window is a **separate chunk** loaded on demand via dynamic imports in `registry.js`:

```js
'sales-order': () => import('@generated/sales-order/generated/web/sales-order/index.jsx')
```

The `@generated` Vite alias resolves to `../../artifacts`, where generated window components live. Windows not listed in the registry fall back to `PlaceholderWindow.jsx`.

**Chunk types and expected sizes:**

| Chunk Type | Content | Expected Size (gzipped) |
|------------|---------|------------------------|
| Vendor chunk | React, react-dom, react-router-dom | 40-50 KB |
| App shell | Layout, auth, i18n, contract-ui primitives | 30-40 KB |
| UI library | shadcn/ui components, Radix primitives | 20-30 KB |
| Per-window chunk | Entity table + form + page + mock data | 5-15 KB each |
| CSS | TailwindCSS (purged) | 10-20 KB |

With 35+ windows, the total built output (before gzip) is expected in the 2-4 MB range. Each user only loads the chunks for windows they visit.

### Window Loading Flow

1. User navigates to `/:windowName`
2. `WindowLoader.jsx` looks up the slug in `windowMap`
3. If found, calls the loader function (dynamic import)
4. Vite resolves the import to a hashed chunk file (e.g., `sales-order-C4f2aX.js`)
5. Browser fetches the chunk, module executes, `mod.default` is rendered
6. If the loader fails (404, network error), an error message is displayed

### Menu and Registry

`menu.json` defines the two-level navigation structure. `registry.js` reads it and builds:
- `buildMenuGroups()` -- returns the sidebar menu tree
- `buildWindowMap()` -- maps each slug to a `{ name, label, loader }` object
- `getAllWindowNames()` -- flat list of all window slugs

The registry is evaluated once at boot (`useState(() => buildWindowMap())`). Adding a new window requires:
1. Adding the window to `menu.json`
2. Adding a loader entry in `windowLoaders` (or it falls back to `PlaceholderWindow`)

## Asset Delivery

### Serving Model

In production, the frontend bundle is served as **static files**. Two deployment models are supported:

**Option A: Etendo Tomcat (simplest)**
Static files placed in `web/{module}/` under the Tomcat deployment directory. Tomcat serves them directly. No separate server needed, but no CDN edge caching.

**Option B: Reverse proxy with CDN (recommended for scale)**
Static files served by nginx or a CDN (CloudFront, Cloudflare). API requests (`/etendo_sf/*`) proxied to Tomcat. Frontend assets cached at the edge.

### Compression

| Asset Type | Compression | Applied By |
|------------|-------------|-----------|
| JS chunks | gzip or brotli | Reverse proxy / CDN |
| CSS | gzip or brotli | Reverse proxy / CDN |
| HTML | gzip | Reverse proxy / CDN |
| Images (PNG, SVG) | Already compressed | N/A |
| Fonts (WOFF2) | Already compressed | N/A |

Vite does not produce pre-compressed files by default. Compression must be configured at the serving layer (nginx `gzip on; gzip_types text/javascript application/javascript text/css;` or CDN settings).

### Cache Headers

| File | Cache-Control | Rationale |
|------|---------------|-----------|
| `index.html` | `no-cache, no-store, must-revalidate` | Must always fetch latest to pick up new chunk references |
| `sw.js` | `no-cache, max-age=0` | Browsers check for SW updates; must not be cached |
| `manifest.json` | `no-cache` | PWA manifest should reflect current app state |
| `*.js` (hashed) | `public, max-age=31536000, immutable` | Content-hashed filenames; safe to cache forever |
| `*.css` (hashed) | `public, max-age=31536000, immutable` | Same as JS |
| `/favicon.png`, `/logo-etendo.png` | `public, max-age=86400` | Cache for 24h; not hashed |

Vite's build output includes content hashes in filenames (e.g., `index-BeTaPoxF.js`), making immutable caching safe.

### CORS

When the SPA and API are served from the **same origin** (same reverse proxy), no CORS configuration is needed. This is the recommended setup.

If served from different origins (e.g., CDN domain for static assets, different domain for API), the Tomcat backend must return:
```
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Credentials: true
```

## PWA Behavior

### Service Worker Configuration

The service worker is generated by `vite-plugin-pwa` with `registerType: 'autoUpdate'` and `injectRegister: 'auto'`:
```js
VitePWA({
  registerType: 'autoUpdate',
  injectRegister: 'auto',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: true,
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  },
})
```

This means:
- Registration is injected by the plugin in the built HTML; the app entrypoint does not call `navigator.serviceWorker.register(...)` directly
- New service workers activate immediately once installed
- `cleanupOutdatedCaches: true` removes old precache entries on activation
- `maximumFileSizeToCacheInBytes` is raised to 8 MiB because the app-shell bundle includes generated runtime and injected locale dictionaries
- The app polls `registration.update()` on tab focus and route changes; once the controller changes, it reloads automatically

### Service Worker Lifecycle

```
1. First Visit
   Browser fetches index.html --> injected registerSW.js registers /sw.js
   --> SW installs and precaches all globPattern assets
   --> SW activates and claims the page
   --> App runs normally

2. Subsequent Visit (no update)
   SW intercepts precached assets --> serves from cache
   --> API calls still go to network

3. Deploy New Version
   New sw.js contains a new precache manifest
   --> Browser refetches sw.js (no-cache) on navigation/update checks
   --> New SW installs and activates immediately
   --> controllerchange fires in useServiceWorker hook
   --> window.location.reload() reloads the page
   --> New hashed assets are loaded from the updated precache

4. Tab Regains Focus / Route Changes
   visibilitychange and route changes call registration.update()
   --> Handles deployments that happen while the tab stays open
```

### Update Detection Triggers

The app checks for service worker updates in three situations:
1. **Initial load**: the plugin-injected registration checks `/sw.js`
2. **Tab focus**: `visibilitychange` triggers `registration.update()` when the tab becomes visible
3. **Route change**: `ServiceWorkerManager` calls `checkForUpdate()` on every `location.pathname` change

### Caching Strategy (Workbox Defaults)

| Resource | Strategy | Behavior |
|----------|----------|----------|
| Precached assets (JS, CSS, HTML, images, fonts) | Precache (revision-based) | Served from cache; updated in background during SW install |
| API calls (`/etendo_sf/*`) | Not intercepted by SW | Always go to network |
| Non-precached resources | Network only | SW does not cache dynamic resources |

### Offline Capability

| Feature | Offline? | Notes |
|---------|----------|-------|
| App shell (layout, navigation) | Yes | Precached |
| Window components (UI) | Yes | Precached as chunks |
| Data display (cached views) | No | API calls fail offline |
| Data entry and save | No | Requires API |
| Login | No | Requires API |

The app is usable offline only to the extent that previously cached UI renders. All data operations require the API backend.

### Cache Size Management

- `cleanupOutdatedCaches: true` removes old precache entries when a new SW activates
- Each deploy replaces the entire precache manifest (old chunks are evicted)
- Expected cache size: 2-5 MB (all static assets for 35+ windows)
- No explicit cache quota management needed at current scale

### Login Cache Clearing

On successful environment login, `OnboardingPage.jsx` deletes all SW caches:
```js
const names = await caches.keys();
await Promise.all(names.map((n) => caches.delete(n)));
```
This ensures the user session starts with fresh resources, preventing stale-cache issues after deployments that coincide with re-authentication.

### Manual Recovery

For QA and support scenarios, the authenticated user context switcher exposes a **Force app refresh** action. It deletes every Cache Storage entry, unregisters the current service worker, and reloads the page. This is a recovery path for stale local state, not the normal deployment flow.

## Performance Budget

### Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| First Contentful Paint (FCP) | < 1.5s | Lighthouse, 4G throttle |
| Time to Interactive (TTI) | < 3.0s | Lighthouse, 4G throttle |
| Largest Contentful Paint (LCP) | < 2.5s | Lighthouse, 4G throttle |
| Per-window load time | < 500ms | From route change to rendered content (dynamic import + render) |
| Total bundle size (gzipped) | < 500 KB | All shared chunks + app shell |
| Per-window chunk (gzipped) | < 20 KB | Individual window chunk |
| CSS (gzipped) | < 25 KB | Purged TailwindCSS |

### Optimization Strategies

1. **Code splitting**: Each window is a separate chunk; only loaded when visited
2. **Shared chunks**: Vite automatically deduplicates shared dependencies (React, contract-ui, shadcn)
3. **Tree shaking**: Vite/Rollup eliminates unused exports from ES modules
4. **TailwindCSS purging**: Only used utility classes are included in production CSS
5. **Dynamic imports for non-critical routes**: `OnboardingPage` and `SmartScanPage` use `lazy()`
6. **Image optimization**: Icons via lucide-react (SVG, tree-shakeable); logos are small PNGs
7. **Font loading**: WOFF2 format (smallest); included in precache glob pattern

## Critical Failure Points

### CRITICAL

**Index.html cached by CDN/browser -- stale app after deploy**
If `index.html` is served with long cache headers, users get the old version that references old chunk hashes. The old chunks may have been deleted, causing the app to break.
- **Prevention**: Always serve `index.html` with `no-cache` headers. Validate cache headers during deployment.
- **Recovery**: Purge CDN cache for `index.html`. Users can hard-refresh (Ctrl+Shift+R).

**Dynamic import fails (404 for chunk that was renamed in new build)**
When a new build produces different chunk hashes, users with the old `index.html` (or old SW cache) will request chunks that no longer exist on the server.
- **Prevention**: Keep old chunk files on the server for at least one deployment cycle. Use the SW update flow to move users to the new version.
- **Recovery**: `clearCacheAndReload()` in `useServiceWorker` deletes all caches and unregisters the SW, forcing a clean load.

**Service worker serves old chunks indefinitely (broken update flow)**
If the SW update detection fails (e.g., `sw.js` itself is cached, or the `updatefound` event never fires), users are stuck on the old version.
- **Prevention**: Never cache `sw.js` (`max-age=0`). The browser spec requires checking for SW updates at least every 24 hours.
- **Recovery**: User can clear site data in browser settings. Admin can deploy a "self-destruct" SW that unregisters itself.

### WARNING

**Bundle too large (no tree-shaking on contract-ui, all windows in single chunk)**
If the build configuration breaks code splitting (e.g., a circular import pulls all windows into one chunk), the initial load becomes unacceptable.
- **Prevention**: Monitor bundle size in CI. Use `rollup-plugin-visualizer` to audit chunk composition after each build.

**Window loads but API schema mismatch (frontend expects field that backend doesn't serve)**
After a backend deploy that changes the DTO, the cached frontend may reference fields that no longer exist or have different shapes.
- **Prevention**: Coordinated deploys (see 08-continuous-delivery.md). API versioning ensures old frontends work with new backends within the same API version.

**i18n labels missing for new fields (shows raw field name)**
When a new field is added to a window but not added to `en_US.json` or `es_ES.json`, the label resolver returns `null` and the UI falls back to the raw column name.
- **Prevention**: Contract tests should verify that every editable/readOnly field has a label in all supported locales.

**Mobile performance (35+ windows registry parsed on load)**
The full `menu.json` and `windowLoaders` map are evaluated at boot, even on mobile where most windows are never visited.
- **Prevention**: The registry is lightweight (only import functions, not actual modules). Monitor boot time on low-end devices. If needed, lazy-load the registry itself.

## CD Gates for Frontend

These gates must pass before a frontend build is promoted to staging/production:

| # | Gate | Pass Criteria | Fail Action |
|---|------|--------------|-------------|
| 1 | **Build succeeds** | `vite build` exits with code 0, zero warnings | Fix build errors |
| 2 | **Bundle size within budget** | Total gzipped < 500 KB; no single chunk > 50 KB | Investigate unexpected imports; check for broken code splitting |
| 3 | **All registered windows resolve** | Every entry in `windowLoaders` can be dynamically imported without error | Fix missing or broken generated component |
| 4 | **Lighthouse audit** | Performance >= 80, Accessibility >= 90 | Optimize identified bottlenecks |
| 5 | **i18n coverage** | Every field in every window schema has a label in all supported locales | Add missing labels to locale JSON files |
| 6 | **No secrets in bundle** | No API keys, credentials, or internal URLs in JS output | Remove hardcoded secrets; use environment variables |
