/**
 * Dev server only: one module instance per published app-shell-core source file.
 *
 * The package is served as raw source (`optimizeDeps.exclude`, see below), and Vite stamps those
 * URLs with the deps hash (`?v=`). A relative import from a core `.jsx` file comes back WITHOUT
 * the stamp, while `index.js` imports the same file WITH it, so the browser instantiates the file
 * twice. For a context module that is fatal: `WalkthroughLauncher.jsx` imports
 * `./WalkthroughProvider.jsx` unstamped, reads a context no provider fills, and renders nothing,
 * so the topbar guide launcher never appeared under `make dev` (LOCAL_CORE serves the core from
 * outside node_modules, unstamped everywhere, and was unaffected). Every served module outside
 * node_modules, plus the core itself, gets its unstamped core imports stamped, so every importer
 * asks for the same URL (missing the app's own shims left the dashboard stuck on a null currency).
 * A redirect does not work: the browser keys modules by the requested URL. Builds bundle each file
 * once.
 */
export default function singleCoreInstancePlugin() {
  const CORE_SRC = '/@etendosoftware/app-shell-core/src/';
  const UNSTAMPED_CORE_IMPORT =
    /(["'])(\/@fs\/[^"'?]*\/@etendosoftware\/app-shell-core\/src\/[^"'?]+\.jsx?)\1/g;
  return {
    name: 'single-app-shell-core-instance',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const hash = server.environments?.client?.depsOptimizer?.metadata?.browserHash;
        // App/artifact modules too: a local shim re-exporting a core `.jsx` (src/hooks/useCurrency.jsx)
        // gets the import unstamped, while core's own importers now get it stamped.
        if (!hash || (req.url.includes('/node_modules/') && !req.url.includes(CORE_SRC))) {
          next();
          return;
        }
        const chunks = [];
        const { write, end } = res;
        // Public files and proxied (possibly streamed) responses are not JS modules: pass them through.
        const passThrough = () => res.headersSent || res.getHeader('Content-Encoding')
          || !/javascript/.test(res.getHeader('Content-Type') ?? '');
        const restore = () => { res.write = write; res.end = end; };
        res.write = (chunk, ...rest) => {
          if (passThrough()) { restore(); return res.write(chunk, ...rest); }
          chunks.push(Buffer.from(chunk));
          return true;
        };
        res.end = (chunk, ...rest) => {
          restore();
          if (passThrough()) return res.end(chunk, ...rest);
          if (chunk && typeof chunk !== 'function') chunks.push(Buffer.from(chunk));
          const body = Buffer.concat(chunks).toString('utf8')
            .replace(UNSTAMPED_CORE_IMPORT, `$1$2?v=${hash}$1`);
          res.removeHeader('Content-Length');
          res.removeHeader('Etag');
          return res.end(body, ...rest);
        };
        next();
      });
    },
  };
}
