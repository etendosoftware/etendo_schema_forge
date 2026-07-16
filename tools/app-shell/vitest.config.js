import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// LOCAL_CORE dev mode: when set, resolve @etendosoftware/app-shell-core (and
// etendo-go-core) from the sibling ../schema_forge_core source instead of the
// published node_modules package — mirrors the same block in vite.config.js so
// the test runner exercises local core source under the LOCAL_CORE profile.
// Strictly opt-in and env-gated: when LOCAL_CORE is unset (servers, CI, normal
// `npm run test:vitest`) this adds nothing and the published package is used
// exactly as before, via server.deps.inline.
const LOCAL_CORE = !!process.env.LOCAL_CORE;
// Core repo location: honor SCHEMA_FORGE_CORE (same override cli/sf-local uses)
// so a core checkout under a non-default name/path still resolves; fall back to
// the default sibling ../schema_forge_core.
const CORE_REPO = process.env.SCHEMA_FORGE_CORE || resolve(__dirname, '../../../schema_forge_core');
const CORE_APP_SHELL_SRC = resolve(CORE_REPO, 'packages/app-shell-core/src');
const CORE_ETENDO_GO_SRC = resolve(CORE_REPO, 'packages/etendo-go-core/src');

export default defineConfig({
  plugins: [react()],
  ssr: {
    noExternal: LOCAL_CORE ? true : [],
  },
  resolve: {
    alias: [
      { find: '@generated', replacement: resolve(__dirname, '../../artifacts') },
      { find: '@', replacement: resolve(__dirname, './src') },
      // LOCAL_CORE dev mode only — point the shared runtime at local core source.
      // Mirrors the vite.config.js LOCAL_CORE alias block (incl. the etendo-go-core
      // kebab-case subpath rules and the single-React pin) so tests resolve exactly
      // like the dev server does under the local-core profile.
      ...(LOCAL_CORE ? [
        { find: /^@etendosoftware\/app-shell-core$/, replacement: resolve(CORE_APP_SHELL_SRC, 'index.js') },
        { find: /^@etendosoftware\/app-shell-core\/(.*)$/, replacement: resolve(CORE_APP_SHELL_SRC, '$1') },
        { find: /^@etendosoftware\/etendo-go-core$/, replacement: resolve(CORE_ETENDO_GO_SRC, 'index.js') },
        { find: /^@etendosoftware\/etendo-go-core\/onboarding\/password-policy$/, replacement: resolve(CORE_ETENDO_GO_SRC, 'onboarding/passwordPolicy.js') },
        { find: /^@etendosoftware\/etendo-go-core\/onboarding\/oauth-return-to$/, replacement: resolve(CORE_ETENDO_GO_SRC, 'onboarding/oauthReturnTo.js') },
        { find: /^@etendosoftware\/etendo-go-core\/onboarding$/, replacement: resolve(CORE_ETENDO_GO_SRC, 'onboarding/index.js') },
        { find: /^@etendosoftware\/etendo-go-core\/(.*)$/, replacement: resolve(CORE_ETENDO_GO_SRC, '$1') },
        // packages/app-shell-core is aliased straight to raw source above, so its own
        // dependencies (react-remove-scroll, pulled in by every Radix Dialog/Popover)
        // resolve via plain node_modules walk-up from that source directory and land on
        // schema_forge_core's own hoisted copy — a second, uninitialized React instance
        // ("Cannot read properties of null, reading 'useRef'") since that copy's own
        // nested `require('react')` never sees this repo's deduped React. Verified via
        // `find . -iname react-remove-scroll` that this repo already hoists its own
        // correct copy at the schema-forge root (tools/app-shell declares the same Radix
        // peer deps app-shell-core does) — force every resolution of the package onto it,
        // the same way react/react-dom are already pinned below.
        { find: 'react-remove-scroll', replacement: resolve(__dirname, '../../node_modules/react-remove-scroll') },
        // Same issue, different package: react-router-dom re-exports from react-router,
        // and react-router itself hits the identical duplicate-instance failure
        // ("Cannot read properties of null, reading 'useRef'") inside BrowserRouter.
        { find: 'react-router-dom', replacement: resolve(__dirname, '../../node_modules/react-router-dom') },
        { find: 'react-router', replacement: resolve(__dirname, '../../node_modules/react-router') },
        // Force a single React instance: the linked source would otherwise resolve
        // react/react-dom from schema_forge_core's own node_modules (a separate
        // install tree) → two React copies → "Invalid hook call". Pin both to this
        // repo's copy.
        { find: 'react-dom', replacement: resolve(__dirname, '../../node_modules/react-dom') },
        { find: 'react', replacement: resolve(__dirname, '../../node_modules/react') },
      ] : []),
    ],
    // Single-instance guarantee. In LOCAL_CORE dev mode the linked core source
    // is served from the sibling ../schema_forge_core tree, which has no
    // node_modules of its own — listing these in dedupe forces resolution from
    // THIS repo's node_modules. Harmless when LOCAL_CORE is unset: these deps
    // already resolve from a single location. Mirrors vite.config.js.
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
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.vitest.{js,jsx}', 'src/**/*.spec.{js,jsx}'],
    css: false,
    // Both packages ship raw .jsx source (no pre-build step). Vitest's SSR
    // loader treats node_modules as pre-built by default and hands .jsx
    // straight to Node's native loader, which can't parse JSX syntax at all
    // ("Unknown file extension .jsx"). Inlining forces these through Vite's
    // own transform (the react() plugin above) instead.
    //
    // Under LOCAL_CORE, inlining just react/react-dom/app-shell-core isn't
    // enough: packages/app-shell-core/src is aliased straight to source, so
    // its own transitive deps (e.g. react-remove-scroll, pulled in by Radix's
    // Dialog) resolve via Node's normal node_modules walk-up and land on
    // schema_forge_core's *own* hoisted copies — a second, uninitialized
    // React instance ("Cannot read properties of null, reading 'useRef'")
    // since those packages are never routed through Vite's alias resolution
    // when left external. Inlining everything sidesteps the whole class of
    // "which transitive dep also needs naming here" bugs — acceptable since
    // LOCAL_CORE is an opt-in dev/test workflow, not the default perf-
    // sensitive path.
    server: {
      deps: {
        inline: LOCAL_CORE ? true : [
          '@etendosoftware/app-shell-core',
          '@etendosoftware/etendo-go-core',
        ],
      },
    },
    // threads pool: workers run as ESM workers, so @exodus/bytes (pure ESM) is importable natively —
    // no --experimental-require-module needed. Much faster than forks (one thread vs one process per file).
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      reportsDirectory: resolve(__dirname, 'coverage/vitest'),
      include: ['src/**/*.{js,jsx}'],
      exclude: [
        'src/**/__tests__/**',
        'src/test/**',
        'node_modules/**',
      ],
    },
  },
});
