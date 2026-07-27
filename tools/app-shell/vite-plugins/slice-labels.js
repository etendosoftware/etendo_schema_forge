import { dirname, join } from 'node:path';
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

export default function sliceLabelsPlugin() {
  return {
    name: 'etp-4300-slice-labels',
    async buildStart() {
      const { sliceAll } = await import(slicerSpecifier());
      const { windows, locales } = await sliceAll(SLICER_PATHS);
      // eslint-disable-next-line no-console
      console.log(`[slice-labels] generated slices for ${windows} windows + core (${locales.join(', ')})`);
    },
  };
}
