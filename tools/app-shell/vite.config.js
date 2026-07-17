import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import schemaApiPlugin from './vite-plugins/schema-api.js';
import reportApiPlugin from './vite-plugins/report-api.js';
import mcpRetryProxy from './vite-plugins/mcp-proxy.js';
import appsSpikePlugin from './vite-plugins/apps-spike.js';
import sliceLabelsPlugin from './vite-plugins/slice-labels.js';

// Read ETENDO_URL from .env.local for proxy config only (not exposed to client)
function readEnvFile() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    const match = content.match(/^ETENDO_URL=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch { return null; }
}

/**
 * Build the RFC 9728 / RFC 8414 discovery payloads.
 * `base` is an absolute origin like `https://go.experimental.etendo.cloud`.
 *
 * All URLs are root-relative to `base` and deliberately DO NOT reference the
 * Etendo Tomcat context path (`/etendo`). That prefix is backend config and
 * can change per deployment — baking it into static files that ship with the
 * SPA would make every deploy coupled to the backend context name.
 *
 * Path mapping to the actual backend is done at the edge by the CloudFront
 * Function `infra/cloudfront-functions/etendo-path-rewrite.js`:
 *
 *   /mcp        →  /etendo/sws/mcp
 *   /oauth2/*   →  /etendo/oauth2/*
 *   /authorize  →  (SPA route — served by S3 fallback + React Router)
 *
 * In dev, the equivalent mapping happens through the Vite proxies in the
 * `server.proxy` block below (`/oauth2`, `/sws`) and the MCP retry proxy
 * (`/mcp` → `/sws/mcp` → `ETENDO_URL`).
 */
function buildWellKnownPayloads(base) {
  const protectedResource = {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: ['neo:read', 'neo:write', 'neo:process', 'neo:report', 'neo:*'],
    bearer_methods_supported: ['header'],
  };
  const oauthServerMeta = {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/oauth2/token`,
    registration_endpoint: `${base}/oauth2/register`,
    scopes_supported: ['neo:read', 'neo:write', 'neo:process', 'neo:report', 'neo:*'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
  };
  const openidConfiguration = {
    ...oauthServerMeta,
    userinfo_endpoint: `${base}/oauth2/userinfo`,
    jwks_uri: `${base}/oauth2/jwks`,
  };
  return { protectedResource, oauthServerMeta, openidConfiguration };
}

/**
 * Serves RFC 9728 (Protected Resource Metadata) and RFC 8414 (Authorization
 * Server Metadata) so MCP clients can auto-discover OAuth2 endpoints.
 *
 * - Dev: middleware answers dynamically using the request Host header.
 * - Build: emits static JSON files under `dist/.well-known/` using
 *   `VITE_PUBLIC_ORIGIN` (set by the deploy workflow per environment).
 *
 * This replaces the legacy `oauth-discovery-war` Java module.
 */
function mcpWellKnownPlugin() {
  return {
    name: 'mcp-well-known',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host || `localhost:${server.config.server.port || 3100}`;
        const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
        const proto = req.headers['x-forwarded-proto'] || (isLocalhost ? 'http' : 'https');
        const base = `${proto}://${host}`;
        const { protectedResource, oauthServerMeta, openidConfiguration } =
          buildWellKnownPayloads(base);

        const sendJson = (payload) => {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify(payload));
        };

        if (req.url?.startsWith('/.well-known/oauth-protected-resource')) {
          return sendJson(protectedResource);
        }
        if (req.url?.startsWith('/.well-known/oauth-authorization-server')) {
          return sendJson(oauthServerMeta);
        }
        if (req.url?.startsWith('/.well-known/openid-configuration')) {
          return sendJson(openidConfiguration);
        }
        next();
      });
    },

    generateBundle() {
      const origin = process.env.VITE_PUBLIC_ORIGIN;
      if (!origin) {
        this.warn(
          '[mcp-well-known] VITE_PUBLIC_ORIGIN is not set — skipping static .well-known emission. ' +
          'Set VITE_PUBLIC_ORIGIN=https://your-host in the deploy workflow to emit RFC 9728 assets.'
        );
        return;
      }
      if (!/^https?:\/\//.test(origin)) {
        this.error(
          `[mcp-well-known] VITE_PUBLIC_ORIGIN must be an absolute origin (got "${origin}")`
        );
      }
      const base = origin.replace(/\/+$/, '');
      const { protectedResource, oauthServerMeta, openidConfiguration } =
        buildWellKnownPayloads(base);

      const assets = [
        ['.well-known/oauth-protected-resource', protectedResource],
        ['.well-known/oauth-authorization-server', oauthServerMeta],
        ['.well-known/openid-configuration', openidConfiguration],
      ];
      for (const [fileName, payload] of assets) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: `${JSON.stringify(payload, null, 2)}\n`,
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Target Etendo instance for dev proxy. Override via ETENDO_URL in .env.local
  // if your instance uses a different context.name (e.g. ETENDO_URL=http://localhost:8080/mycontext)
  const ETENDO_URL = env.ETENDO_URL || process.env.ETENDO_URL || readEnvFile() || 'http://localhost:8080/etendo';

  // LOCAL_CORE dev mode: when set (via `make dev-local-core`), resolve
  // @etendosoftware/app-shell-core from the sibling ../schema_forge_core source
  // instead of the published node_modules package, for live hot-reload while
  // developing the shared React runtime. Strictly opt-in and env-gated — when
  // LOCAL_CORE is unset (servers, CI, normal `make dev`) this adds nothing and
  // the published package is used exactly as before.
  const LOCAL_CORE = !!process.env.LOCAL_CORE;
  // Core repo location: honor SCHEMA_FORGE_CORE (same override cli/sf-local uses)
  // so a core checkout under a non-default name/path still resolves; fall back to
  // the default sibling ../schema_forge_core.
  const CORE_REPO = process.env.SCHEMA_FORGE_CORE || resolve(__dirname, '../../../schema_forge_core');
  const CORE_APP_SHELL_SRC = resolve(CORE_REPO, 'packages/app-shell-core/src');
  const CORE_ETENDO_GO_SRC = resolve(CORE_REPO, 'packages/etendo-go-core/src');

  return {
  base: '/',
  plugins: [
    react(),
    sliceLabelsPlugin(),
    schemaApiPlugin(),
    reportApiPlugin(),
    mcpWellKnownPlugin(),
    mcpRetryProxy(ETENDO_URL),
    appsSpikePlugin({
      privateKeyPath: resolve(__dirname, '../../etendo_core/modules/com.etendoerp.go/config/apps-spike/private-key.pem'),
      publicKeyPath: resolve(__dirname, '../../etendo_core/modules/com.etendoerp.go/config/apps-spike/public-key.pem'),
    }),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [
          /^\/etendo\//,
          /^\/mcp(?:\/|$)/,
          /^\/\.well-known\//,
        ],
      },
      manifest: {
        name: 'Etendo',
        short_name: 'Etendo',
        description: 'Etendo ERP',
        theme_color: '#1863DC',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'favicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
    sentryVitePlugin({
      org: 'etendo-22',
      project: 'schema_forge',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
      silent: !process.env.SENTRY_AUTH_TOKEN,
    }),
  ],
  build: {
    sourcemap: 'hidden',
  },
  resolve: {
    alias: [
      { find: '@generated', replacement: resolve(__dirname, '../../artifacts') },
      { find: '@', replacement: resolve(__dirname, './src') },
      // LOCAL_CORE dev mode only — point the shared runtime at local core source.
      ...(LOCAL_CORE ? [
        { find: /^@etendosoftware\/app-shell-core$/, replacement: resolve(CORE_APP_SHELL_SRC, 'index.js') },
        { find: /^@etendosoftware\/app-shell-core\/(.*)$/, replacement: resolve(CORE_APP_SHELL_SRC, '$1') },
        // etendo-go-core (onboarding / auth screens) from local source — mirrors app-shell-core.
        // Its exports map two kebab-case subpaths to camelCase files, so those need explicit
        // aliases before the generic catch-all (which handles onboarding/api|sso|state as-is).
        { find: /^@etendosoftware\/etendo-go-core$/, replacement: resolve(CORE_ETENDO_GO_SRC, 'index.js') },
        { find: /^@etendosoftware\/etendo-go-core\/onboarding\/password-policy$/, replacement: resolve(CORE_ETENDO_GO_SRC, 'onboarding/passwordPolicy.js') },
        { find: /^@etendosoftware\/etendo-go-core\/onboarding\/oauth-return-to$/, replacement: resolve(CORE_ETENDO_GO_SRC, 'onboarding/oauthReturnTo.js') },
        { find: /^@etendosoftware\/etendo-go-core\/onboarding$/, replacement: resolve(CORE_ETENDO_GO_SRC, 'onboarding/index.js') },
        { find: /^@etendosoftware\/etendo-go-core\/(.*)$/, replacement: resolve(CORE_ETENDO_GO_SRC, '$1') },
        // Force a single React instance: the linked source would otherwise resolve
        // react/react-dom from schema_forge_core's own node_modules (a separate
        // install tree) → two React copies → "Invalid hook call". Pin both to this
        // repo's copy. String finds match on module boundaries, so subpaths like
        // react/jsx-runtime are redirected too, without catching react-router-dom.
        { find: 'react-dom', replacement: resolve(__dirname, '../../node_modules/react-dom') },
        { find: 'react', replacement: resolve(__dirname, '../../node_modules/react') },
      ] : []),
    ],
    // Single-instance guarantee. The first five are always relevant; the rest are
    // the shared runtime deps that @etendosoftware/app-shell-core imports. In
    // LOCAL_CORE dev mode the linked core source is served from the sibling
    // ../schema_forge_core tree, which has no node_modules of its own — listing
    // these in dedupe forces Vite to resolve them from THIS repo's root
    // node_modules (same mechanism that already makes react-router-dom resolve).
    // Harmless when LOCAL_CORE is unset: these deps already resolve from root.
    dedupe: [
      'react', 'react-dom', 'react-router-dom', 'sonner', 'lucide-react',
      'clsx', 'cmdk', 'next-themes', 'date-fns', 'react-day-picker',
      'class-variance-authority', 'tailwind-merge',
      '@radix-ui/react-collapsible', '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu', '@radix-ui/react-label',
      '@radix-ui/react-popover', '@radix-ui/react-select',
      '@radix-ui/react-separator', '@radix-ui/react-slot',
      '@radix-ui/react-switch', '@radix-ui/react-tooltip',
    ],
    // Ensure modules imported from artifacts/ resolve to app-shell node_modules
    modules: [resolve(__dirname, 'node_modules'), 'node_modules'],
  },
  optimizeDeps: {
    // `@etendosoftware/app-shell-core` gets pre-bundled for its `/runtime` and `.`
    // entry points (discovered via static imports), but this repo's local shims
    // (src/hooks/useCurrency.jsx, src/hooks/use-mobile.jsx) reach the package via
    // deep subpath imports esbuild's `include` cannot pre-bundle on their own
    // (Vite logs "Cannot optimize dependency: ... present in client
    // 'optimizeDeps.include'" and silently drops them). Left as-is, the package
    // ends up loaded TWICE — once pre-bundled (used internally by CurrencyProvider
    // inside `/runtime`) and once as raw, un-optimized source for the direct hook
    // import — two separate module instantiations. `createContext(null)` in
    // useCurrency.jsx then runs twice, so CurrencyProvider updates one Context
    // instance while every consumer's `useCurrency()` reads the other, permanently
    // unmatched, instance (dashboard and any other consumer stays stuck reading a
    // currency that never "arrives"). Excluding the whole package keeps every
    // subpath on the same raw-source resolution path, so there is only one
    // instance to begin with. Unconditional (not gated on LOCAL_CORE): it fixes
    // the currency double-instantiation in the DEFAULT published-package path,
    // and also gives LOCAL_CORE the exclude it needs for live HMR.
    exclude: LOCAL_CORE
      ? ['@etendosoftware/app-shell-core', '@etendosoftware/etendo-go-core']
      : ['@etendosoftware/app-shell-core'],
    // react-day-picker (used by app-shell-core's Calendar) ships ~87 translated
    // per-locale wrapper files, each importing the date-fns/locale barrel. Since
    // it's only reachable through the excluded app-shell-core, Vite never
    // discovers it for pre-bundling either, so on a cold dev cache it's served
    // raw and loads every locale for every one of its own wrappers — ~1000+
    // extra requests, 30+ seconds just for page.goto() to settle in CI (ETP-4431
    // / ETP-4433). Explicitly including it forces pre-bundling (and therefore
    // tree-shaking) regardless of the exclusion above.
    include: ['react-day-picker'],
  },
  server: {
    allowedHosts: env.VITE_ALLOWED_HOSTS ? env.VITE_ALLOWED_HOSTS.split(',') : [],
    port: 3100,
    proxy: {
      '/etendo_sf': {
        target: ETENDO_URL,
        changeOrigin: true,
      },
      '/oauth2': {
        target: ETENDO_URL,
        changeOrigin: true,
      },
      '/sws': {
        target: ETENDO_URL,
        changeOrigin: true,
      },
      '/webhooks': {
        target: ETENDO_URL,
        changeOrigin: true,
      },
      '/jsreport': {
        target: 'http://localhost:5488',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jsreport/, ''),
      },
    },
  },
  };
});
