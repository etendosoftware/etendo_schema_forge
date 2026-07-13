import { sliceAll } from '../../../cli/src/slice-labels.js';

/**
 * ETP-4300 — Build-time label slicer.
 *
 * Per-window label slices (`labels.js`) and the shared `core.<locale>.json` are
 * gitignored build-time artifacts: the runtime imports them, so they must exist
 * on disk before Vite bundles (build) or serves (dev). This plugin regenerates
 * them in `buildStart`, which runs for both `vite` and `vite build`.
 *
 * The slicer is a pure transform over the committed locale dictionaries +
 * contracts (no DB), so it is fast and offline-safe. It is intentionally
 * decoupled from `make regen` — see docs/superpowers/specs/2026-06-23-efficient-localization-design.md.
 */
export default function sliceLabelsPlugin() {
  return {
    name: 'etp-4300-slice-labels',
    async buildStart() {
      const { windows, locales } = await sliceAll();
      // eslint-disable-next-line no-console
      console.log(`[slice-labels] generated slices for ${windows} windows + core (${locales.join(', ')})`);
    },
  };
}
