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
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host || `localhost:${server.config.server.port || 3100}`;
        const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
        const proto = req.headers['x-forwarded-proto'] || (isLocalhost ? 'http' : 'https');
        const base = `${proto}://${host}`;

        if (req.url?.startsWith('/.well-known/oauth-protected-resource')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({
            resource: `${base}/mcp`,
            authorization_servers: [`${base}/oauth2`],
            scopes_supported: ['neo:read', 'neo:write', 'neo:process', 'neo:report', 'neo:*'],
            bearer_methods_supported: ['header'],
          }));
          return;
        }

        const oauthServerMeta = {
          issuer: `${base}/oauth2`,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/oauth2/token`,
          registration_endpoint: `${base}/oauth2/register`,
          scopes_supported: ['neo:read', 'neo:write', 'neo:process', 'neo:report', 'neo:*'],
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
          token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
          code_challenge_methods_supported: ['S256'],
        };

        if (req.url?.startsWith('/.well-known/oauth-authorization-server')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify(oauthServerMeta));
          return;
        }
        if (req.url?.startsWith('/.well-known/openid-configuration')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end(JSON.stringify({
            ...oauthServerMeta,
            userinfo_endpoint: `${base}/oauth2/userinfo`,
            jwks_uri: `${base}/oauth2/jwks`,
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
  base: '/',
  plugins: [
    react(),
    schemaApiPlugin(),
    reportApiPlugin(),
    mcpWellKnownPlugin(),
    mcpRetryProxy(ETENDO_URL),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
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
            src: 'favicon.png',
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
    dedupe: ['react', 'react-dom', 'react-router-dom', 'sonner', 'lucide-react'],
    // Ensure modules imported from artifacts/ resolve to app-shell node_modules
    modules: [resolve(__dirname, 'node_modules'), 'node_modules'],
  },
  server: {
    allowedHosts: env.VITE_ALLOWED_HOSTS ? env.VITE_ALLOWED_HOSTS.split(',') : [],
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
