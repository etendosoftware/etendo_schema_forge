import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * ETP-4300 — Build-time label slicer (Vite plugin).
 *
 * Per-window label slices (`labels.js`) and the shared `core.<locale>.json` are
 * gitignored build-time artifacts: the runtime imports them, so they must exist
 * on disk before Vite bundles (build) or serves (dev). This plugin regenerates
 * them in `buildStart`, which runs for both `vite` and `vite build`.
 *
 * The slicer itself lives in the core package `@etendosoftware/schema-forge-cli`
 * (`sf-slice-labels` bin / `./slice-labels` export). This plugin is only the app-side
 * adapter: it resolves schema_forge's own directories and hands them to the pure,
 * path-agnostic `sliceAll()`. The import is dynamic so this module loads without the
 * package present (e.g. in unit tests that never run `buildStart`).
 *
 * Dev profiles (see docs/repo-topology.md): by default the slicer resolves from the
 * PUBLISHED package. With `LOCAL_CORE=1` it resolves from the sibling
 * `schema_forge_core` source, mirroring the CLI / app-shell-core local profile.
 *
 * ETP-4830 regression fix — `buildStart` only fires once, at dev-server boot. Editing
 * a top-level locale file (`src/locales/en_US.json`/`es_ES.json`/`es_AR.json`) — e.g.
 * adding a new `genericLabels` key for a window under active development — while the
 * dev server is ALREADY running never re-triggers it: Vite's own HMR watches source
 * modules, not this plugin's derived, gitignored `core.<locale>.json` output. The
 * result is a silently stale `core.<locale>.json` that keeps missing the new key for
 * the rest of that dev-server session, so every `ui('theNewKey')` call falls back to
 * echoing the raw key — indistinguishable, at the call site, from a genuinely missing
 * translation. `configureServer` below closes that gap by watching the top-level
 * locale files directly and re-running the slicer (+ a full client reload) on change,
 * so a locale-only edit takes effect without restarting the dev server.
 */
const __dirname = dirname(fileURLToPath(import.meta.url)); // tools/app-shell/vite-plugins
const APP_SHELL_DIR = join(__dirname, '..'); // tools/app-shell
const APP_ROOT = join(__dirname, '..', '..', '..'); // schema_forge root

const SLICER_PATHS = {
  localesDir: join(APP_SHELL_DIR, 'src', 'locales'),
  generatedLocalesDir: join(APP_SHELL_DIR, 'src', 'locales', 'generated'),
  artifactsDir: join(APP_ROOT, 'artifacts'),
};

/** Where to import the slicer from: configured core source under LOCAL_CORE, else the published package. */
function slicerSpecifier() {
  if (process.env.LOCAL_CORE === '1') {
    const coreRepo = process.env.SCHEMA_FORGE_CORE || join(APP_ROOT, '..', 'schema_forge_core');
    return pathToFileURL(join(coreRepo, 'cli', 'src', 'slice-labels.js')).href;
  }
  return '@etendosoftware/schema-forge-cli/slice-labels';
}

/** Matches loadLocales()'s own discovery pattern (e.g. en_US.json, es_ES.json). */
const LOCALE_FILE_RE = /^[a-z]{2}_[A-Z]{2}\.json$/;

export default function sliceLabelsPlugin() {
  return {
    name: 'etp-4300-slice-labels',
    async buildStart() {
      const { sliceAll } = await import(slicerSpecifier());
      const { windows, locales } = await sliceAll(SLICER_PATHS);
      // eslint-disable-next-line no-console
      console.log(`[slice-labels] generated slices for ${windows} windows + core (${locales.join(', ')})`);
    },
    // Dev-server only (Vite never calls this for `vite build`). Re-slices on every
    // top-level locale file save so a running `make dev` session picks up new/edited
    // keys without a restart — see this file's own doc comment for why buildStart
    // alone isn't enough. Scoped to files directly under `localesDir` matching the
    // `xx_XX.json` naming convention, so writes to `localesDir/generated/*` (the
    // slicer's OWN output) are never watched — that would otherwise re-trigger itself.
    configureServer(server) {
      const localesDir = SLICER_PATHS.localesDir;
      server.watcher.add(join(localesDir, '*.json'));

      // In-flight/pending guard: some editors fire multiple `change` events per save
      // (e.g. atomic write via temp-file-then-rename). Without this, overlapping
      // `sliceAll()` calls could race writes to the shared generated slice files and
      // spam `full-reload` messages. A change that arrives while a slice is already
      // running is coalesced into a single trailing re-run instead of firing again.
      let slicing = false;
      let pending = false;

      const runSlice = async (file) => {
        slicing = true;
        try {
          const { sliceAll } = await import(slicerSpecifier());
          const { windows, locales } = await sliceAll(SLICER_PATHS);
          // eslint-disable-next-line no-console
          console.log(`[slice-labels] ${basename(file)} changed — re-sliced ${windows} windows + core (${locales.join(', ')})`);
          server.ws.send({ type: 'full-reload' });
        } finally {
          slicing = false;
          if (pending) {
            pending = false;
            await runSlice(file);
          }
        }
      };

      server.watcher.on('change', (file) => {
        if (dirname(file) !== localesDir || !LOCALE_FILE_RE.test(basename(file))) return;
        if (slicing) {
          pending = true;
          return;
        }
        runSlice(file).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[slice-labels] re-slice failed:', err);
        });
      });
    },
  };
}
