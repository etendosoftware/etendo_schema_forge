import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: [
      'src/**/*.vitest.{js,jsx}',
      'src/**/*.spec.{js,jsx}',
      // app-shell-core ships React i18n tests as .vitest.jsx but has no runner
      // of its own; this vitest config is the project's only JSX-test runner, so
      // it also executes the core package's i18n component/hook tests (ETP-4300).
      resolve(__dirname, '../../packages/app-shell-core/src/i18n/__tests__/*.vitest.{js,jsx}'),
    ],
    css: false,
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
