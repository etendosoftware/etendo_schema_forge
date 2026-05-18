import { createProxyMiddleware } from 'http-proxy-middleware';
import { Readable } from 'node:stream';

/**
 * BFF proxy to Etendo upstream (/sws/*).
 *
 * The inbound request carries an RS256 app JWT; NEO Headless does not verify
 * those, so we swap it for a cached service-account token before forwarding.
 *
 * Returns an array of TWO middlewares — mount them with spread:
 *   app.use('/api/etendo', ...createEtendoProxy({ target, etendoAuth }));
 *
 * On 401/403 from upstream the service token is force-refreshed and the
 * request is retried once. This covers stale cached tokens and the ~164 s
 * post-restart window where Etendo's JWT subsystem (SWSConfig) has not yet
 * loaded its signing key.
 *
 * Note: request bodies are not replayed on retry; GET requests are unaffected.
 */
export function createEtendoProxy({ target, etendoAuth }) {
  if (!target) throw new Error('createEtendoProxy: target is required');
  if (!etendoAuth?.getToken) throw new Error('createEtendoProxy: etendoAuth.getToken is required');

  const cleanTarget = target.replace(/\/+$/, '');

  async function attachServiceToken(req, res, next) {
    try {
      req.etendoServiceToken = await etendoAuth.getToken();
      next();
    } catch (err) {
      console.error('[apps-sdk-bff] failed to obtain service token:', err.message);
      res.status(502).json({ error: 'upstream_auth_failed', detail: err.message });
    }
  }

  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    selfHandleResponse: true,
    // Express strips the mount prefix before the middleware runs, so req.url
    // enters as `/neo/...`. Prefix `/sws` to reach NEO Headless.
    pathRewrite: (path) => `/sws${path}`,
    on: {
      proxyReq: (proxyReq, req) => {
        if (req.etendoServiceToken) {
          proxyReq.setHeader('Authorization', `Bearer ${req.etendoServiceToken}`);
        }
      },
      proxyRes: async (proxyRes, req, res) => {
        if ((proxyRes.statusCode === 401 || proxyRes.statusCode === 403) && !req._etendoRetried) {
          req._etendoRetried = true;
          try {
            const freshToken = await etendoAuth.forceRefresh();
            const url = `${cleanTarget}/sws${req.url}`;
            const retryRes = await fetch(url, {
              method: req.method,
              headers: { Authorization: `Bearer ${freshToken}` },
            });
            const safeHeaders = Object.fromEntries(
              [...retryRes.headers.entries()].filter(
                ([k]) => !['content-encoding', 'transfer-encoding', 'connection'].includes(k.toLowerCase())
              )
            );
            res.writeHead(retryRes.status, safeHeaders);
            Readable.fromWeb(retryRes.body).pipe(res);
            return;
          } catch (_e) {
            // retry failed — fall through to original upstream response
          }
        }
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      },
    },
  });

  return [attachServiceToken, proxy];
}
