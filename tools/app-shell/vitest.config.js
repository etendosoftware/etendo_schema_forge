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
  resolve: {
    alias: [
      { find: '@generated', replacement: resolve(__dirname, '../../artifacts') },
      { find: '@', replacement: resolve(__dirname, './src') },
      ...(LOCAL_CORE ? [
        { find: /^@etendosoftware\/app-shell-core$/, replacement: resolve(CORE_APP_SHELL_SRC, 'index.js') },
        { find: /^@etendosoftware\/app-shell-core\/(.*)$/, replacement: resolve(CORE_APP_SHELL_SRC, '$1') },
        { find: 'react-dom', replacement: resolve(__dirname, '../../node_modules/react-dom') },
        { find: 'react', replacement: resolve(__dirname, '../../node_modules/react') },
      ] : []),
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
    server: {
      deps: {
        inline: [
          '@etendosoftware/app-shell-core',
          '@etendosoftware/etendo-go-core',
          ...(LOCAL_CORE ? ['react', 'react-dom'] : []),
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
