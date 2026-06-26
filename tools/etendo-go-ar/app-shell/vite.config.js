import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @generated/purchase-order/... → artifacts/purchase-order/...
      '@generated': resolve(__dirname, '../artifacts'),
    },
  },
  server: {
    port: 5200,
    proxy: {
      '/api': 'http://localhost:4200',
    },
  },
  build: { outDir: 'dist' },
});
