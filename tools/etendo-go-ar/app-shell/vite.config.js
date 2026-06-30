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
  const fromEnvFile = readEtendoUrl();
  const ETENDO_URL = env.ETENDO_URL || process.env.ETENDO_URL || fromEnvFile || 'http://localhost:8080/etendo';

  console.log('[vite-proxy] cwd          :', process.cwd());
  console.log('[vite-proxy] loadEnv result:', env.ETENDO_URL || '(not set)');
  console.log('[vite-proxy] readEtendoUrl :', fromEnvFile || '(not found)');
  console.log('[vite-proxy] ETENDO_URL    :', ETENDO_URL);

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
        '/sws': {
          target: ETENDO_URL,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              console.log('[proxy →]', req.method, req.url, '→', ETENDO_URL + req.url);
            });
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log('[proxy ←]', proxyRes.statusCode, req.url);
            });
            proxy.on('error', (err, req) => {
              console.log('[proxy ERR]', req.url, err.message);
            });
          },
        },
        '/oauth2': { target: ETENDO_URL, changeOrigin: true },
        '/webhooks': { target: ETENDO_URL, changeOrigin: true },
      },
    },
    build: { outDir: 'dist' },
  };
});
