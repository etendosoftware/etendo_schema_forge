import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
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
    // Both packages ship raw .jsx source (no pre-build step). Vitest's SSR
    // loader treats node_modules as pre-built by default and hands .jsx
    // straight to Node's native loader, which can't parse JSX syntax at all
    // ("Unknown file extension .jsx"). Inlining forces these through Vite's
    // own transform (the react() plugin above) instead.
    server: {
      deps: {
        inline: ['@etendosoftware/app-shell-core', '@etendosoftware/etendo-go-core'],
      },
    },
    alias: {
      '@': resolve(__dirname, './src'),
      '@generated': resolve(__dirname, '../../artifacts'),
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
