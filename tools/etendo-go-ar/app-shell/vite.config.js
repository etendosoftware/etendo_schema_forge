import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readEtendoUrl() {
  // switch-to-ar copies .env.local to tools/etendo-go-ar/ (parent of app-shell/)
  for (const dir of [__dirname, resolve(__dirname, '..')]) {
    try {
      const content = readFileSync(resolve(dir, '.env.local'), 'utf-8');
      const match = content.match(/^ETENDO_URL=(.+)$/m);
      if (match) return match[1].trim();
    } catch { /* continue */ }
  }
  return null;
}

export default defineConfig(({ mode }) => {
  // Read from parent dir (tools/etendo-go-ar/) where switch-to-ar copies .env.local
  const env = loadEnv(mode, resolve(__dirname, '..'), '');
  const ETENDO_URL = env.ETENDO_URL || process.env.ETENDO_URL || readEtendoUrl() || 'http://localhost:8080/etendo_ar';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@generated': resolve(__dirname, '../artifacts'),
      },
    },
    server: {
      port: 5200,
      proxy: {
        '/sws': { target: ETENDO_URL, changeOrigin: true },
        '/oauth2': { target: ETENDO_URL, changeOrigin: true },
        '/webhooks': { target: ETENDO_URL, changeOrigin: true },
      },
    },
    build: { outDir: 'dist' },
  };
});
