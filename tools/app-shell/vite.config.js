import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import schemaApiPlugin from './vite-plugins/schema-api.js';
import reportApiPlugin from './vite-plugins/report-api.js';
import mcpRetryProxy from './vite-plugins/mcp-proxy.js';

// Read ETENDO_URL from .env.local for proxy config only (not exposed to client)
function readEnvFile() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    const match = content.match(/^ETENDO_URL=(.+)$/m);
    return match ? match[1].trim() : null;
  } catch { return null; }
}

function mcpWellKnownPlugin() {
  return {
    name: 'mcp-well-known',
    configureServer(server) {
      const port = server.config.server.port || 3100;
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/.well-known/oauth-protected-resource')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({
            resource: `http://localhost:${port}/mcp`,
            authorization_servers: [`http://localhost:${port}/oauth2`],
            scopes_supported: ['neo:read', 'neo:write', 'neo:process', 'neo:report', 'neo:*'],
            bearer_methods_supported: ['header'],
          }));
          return;
        }
        if (req.url?.startsWith('/.well-known/oauth-authorization-server')) {
          const base = `http://localhost:${port}`;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({
            issuer: `${base}/oauth2`,
            authorization_endpoint: `${base}/authorize`,
            token_endpoint: `${base}/oauth2/token`,
            registration_endpoint: `${base}/oauth2/register`,
            scopes_supported: ['neo:read', 'neo:write', 'neo:process', 'neo:report', 'neo:*'],
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
            token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
            code_challenge_methods_supported: ['S256'],
          }));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Target Etendo instance for dev proxy. Override via ETENDO_URL in .env.local
  // if your instance uses a different context.name (e.g. ETENDO_URL=http://localhost:8080/mycontext)
  const ETENDO_URL = env.ETENDO_URL || process.env.ETENDO_URL || readEnvFile() || 'http://localhost:8080/etendo';

  return {
  base: './',
  plugins: [
    react(),
    schemaApiPlugin(),
    reportApiPlugin(),
    mcpWellKnownPlugin(),
    mcpRetryProxy(ETENDO_URL),
    VitePWA({
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
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
            src: '/favicon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@generated': resolve(__dirname, '../../artifacts'),
    },
  },
  server: {
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
