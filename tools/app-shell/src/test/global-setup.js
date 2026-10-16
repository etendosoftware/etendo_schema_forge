// Vitest global setup: runs once, in the main process, before any test file is collected.
//
// Many components import their window's label slice (`@generated/<window>/generated/web/<window>/
// labels.js`) and the core locale files (`src/locales/generated/`). Both are gitignored outputs of
// the slice-labels Vite plugin, written only by `vite build` or the dev server. Vitest does not run
// that plugin, so a checkout that had never built the app failed ~140 test files with "Failed to
// resolve import", and CI passed only because tools/app-shell/test/pwa.test.js happened to run
// `vite build` earlier in the same job. Slicing here makes every vitest run self-sufficient and
// keeps the slices in step with the locale files instead of whatever an old build left behind.
import { sliceAllLabels } from '../../vite-plugins/slice-labels.js';

export default async function setup() {
  await sliceAllLabels();
}
