import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readEtendoUrl() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    const match = content.match(/^ETENDO_URL=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch { return null; }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
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
