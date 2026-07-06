import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCAL_CORE = process.env.LOCAL_CORE === '1';
const CORE_REPO = process.env.SCHEMA_FORGE_CORE || resolve(__dirname, '../../../schema_forge_core');
const CORE_APP_SHELL_SRC = resolve(CORE_REPO, 'packages/app-shell-core/src');

export default defineConfig({
  plugins: [react()],
  ssr: {
    noExternal: LOCAL_CORE ? true : [],
  },
  resolve: {
    alias: [
      { find: '@generated', replacement: resolve(__dirname, '../../artifacts') },
      { find: '@', replacement: resolve(__dirname, './src') },
      ...(LOCAL_CORE ? [
        { find: /^@etendosoftware\/app-shell-core$/, replacement: resolve(CORE_APP_SHELL_SRC, 'index.js') },
        { find: /^@etendosoftware\/app-shell-core\/(.*)$/, replacement: resolve(CORE_APP_SHELL_SRC, '$1') },
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
      ] : []),
    ],
    // `dedupe` is Vite's mechanism for collapsing every resolution of a package name to
    // one instance regardless of who imports it — matches the fix already applied in
    // vite.config.js for the real dev server; this file never had the equivalent for
    // tests. Kept alongside the explicit react-remove-scroll alias above since dedupe
    // alone (tested) does not intercept that package's own nested `require('react')`.
    dedupe: LOCAL_CORE ? ['react', 'react-dom'] : [],
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
