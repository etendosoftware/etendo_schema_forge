import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * ETP-6013 — publishes the document printables next to the SPA bundle.
 *
 * The backend (com.etendoerp.go `NeoPrintableTemplates`) renders a completed document's PDF
 * without a browser, so the MCP can return or email a document nobody opened in the UI. It
 * must produce the SAME PDF the browser produces, and it must not carry a hand-copied
 * template that drifts. So the build publishes, per document, exactly what the browser
 * sends to jsreport — template, CSS, helpers, chrome options and the resolved labels per
 * locale — as `dist/printables/<document>.json`, and the backend fetches it from the public
 * app URL at render time.
 *
 * The manifests are built by `buildPrintableManifest()` in
 * `src/windows/custom/shared/printableSources.js`, the very module the browser renders from.
 * Labels come from `src/locales/generated/core.<locale>.json`, the dictionaries `useUI()`
 * reads — written by `slice-labels.js` in `buildStart`, so they exist by `generateBundle`.
 *
 * Dev: `make dev` serves the same payloads at `/printables/<document>.json`, so a local
 * backend can point `ETGO_PRINTABLES_URL` at `http://localhost:3100/printables`.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_SHELL_DIR = join(__dirname, '..');
const GENERATED_LOCALES_DIR = join(APP_SHELL_DIR, 'src', 'locales', 'generated');
const SOURCES_MODULE = join(APP_SHELL_DIR, 'src', 'windows', 'custom', 'shared', 'printableSources.js');
const CORE_LOCALE_RE = /^core\.([a-z]{2}_[A-Z]{2})\.json$/;

/** The URL path every manifest is served under, in dev and in the deployed bundle. */
export const PRINTABLES_PATH = 'printables';

/**
 * Reads the generated core dictionary of every locale.
 *
 * @param {string} [dir]
 * @returns {Record<string, object>} locale code → dictionary
 */
export function readCoreDictionaries(dir = GENERATED_LOCALES_DIR) {
  const dictionaries = {};
  let files = [];
  try {
    files = readdirSync(dir);
  } catch {
    return dictionaries;
  }
  for (const file of files) {
    const match = CORE_LOCALE_RE.exec(file);
    if (match) dictionaries[match[1]] = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  }
  return dictionaries;
}

/**
 * Every manifest the build publishes, keyed by its file name under `printables/`.
 *
 * @param {{ PRINTABLE_DOCUMENTS: object, buildPrintableManifest: Function }} sources
 *        the loaded `printableSources.js`
 * @param {Record<string, object>} dictionaries
 * @param {number} builtAt
 * @returns {Record<string, object>}
 */
export function buildAllManifests(sources, dictionaries, builtAt) {
  const out = {};
  for (const document of Object.keys(sources.PRINTABLE_DOCUMENTS)) {
    out[`${document}.json`] = sources.buildPrintableManifest(document, dictionaries, { builtAt });
  }
  return out;
}

export default function printablesPublishPlugin() {
  let loadSources;
  return {
    name: 'etp-6013-printables-publish',

    configResolved() {
      // Loaded lazily and through Node, not through the app bundle: the module is alias-free
      // by contract (see its header), which is what makes this import possible at all.
      loadSources = () => import(/* @vite-ignore */ pathToFileURL(SOURCES_MODULE).href);
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = /^\/printables\/([a-z0-9-]+)\.json(?:\?.*)?$/.exec(req.url || '');
        if (!match) return next();
        try {
          const sources = await server.ssrLoadModule(SOURCES_MODULE);
          if (!sources.PRINTABLE_DOCUMENTS[match[1]]) return next();
          const manifest = sources.buildPrintableManifest(match[1], readCoreDictionaries(), { builtAt: Date.now() });
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(manifest));
        } catch (err) {
          next(err);
        }
      });
    },

    async generateBundle() {
      const dictionaries = readCoreDictionaries();
      if (Object.keys(dictionaries).length === 0) {
        // Without dictionaries every label would be its raw key: publishing that would print
        // keys on server-rendered PDFs. Fail the build instead of shipping it silently.
        this.error('[printables-publish] no src/locales/generated/core.<locale>.json found — '
          + 'slice-labels must run before this plugin');
      }
      const sources = await loadSources();
      const manifests = buildAllManifests(sources, dictionaries, Date.now());
      for (const [fileName, manifest] of Object.entries(manifests)) {
        this.emitFile({
          type: 'asset',
          fileName: `${PRINTABLES_PATH}/${fileName}`,
          source: `${JSON.stringify(manifest)}\n`,
        });
      }
    },
  };
}
