import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import appShellCorePreset from '@etendosoftware/app-shell-core/tailwind-preset';

// Resolve a published package's src/ glob via its own export map instead of a
// hardcoded '../../node_modules/<pkg>/src/**/*.{js,jsx}' relative path. npm
// workspace hoisting is NOT guaranteed to place a package at the repo root's
// node_modules — observed live: @etendosoftware/etendo-go-core landed under
// tools/app-shell/node_modules instead after a plain `npm install`, which
// silently purged every onboarding/auth utility below (ETP-5031 QA round).
// `require.resolve` follows the real resolution algorithm, so it finds the
// package wherever npm actually put it. Not `import.meta.resolve`: this file
// also loads through Vitest's Vite-based module runner (for
// tailwind-purge-guard.vitest.js), which does not support it.
const require = createRequire(import.meta.url);
function packageSrcGlob(pkgName) {
  const entryPath = require.resolve(pkgName);
  return resolve(dirname(entryPath), '**/*.{js,jsx}');
}

const APP_SHELL_CORE_SRC_GLOB = packageSrcGlob('@etendosoftware/app-shell-core');
const ETENDO_GO_CORE_SRC_GLOB = packageSrcGlob('@etendosoftware/etendo-go-core');

// LOCAL_CORE dev mode (`make dev-local-core`): app-shell-core resolves to the
// sibling ../schema_forge_core source (see vite.config.js/vitest.config.js),
// so Tailwind must scan THAT source too, or any class introduced only in a
// core-package file (nothing in the published node_modules copy below, nothing
// in this app's own src/) silently never compiles — confirmed live: a
// freshly-added `max-h-[70vh]` on an ImportDialog.jsx step wrapper rendered
// with computed max-height "none" until swapped for an already-scanned value.
const LOCAL_CORE = process.env.LOCAL_CORE === '1';
const CORE_REPO = process.env.SCHEMA_FORGE_CORE || resolve(import.meta.dirname, '../../../schema_forge_core');
const CORE_APP_SHELL_SRC_GLOB = resolve(CORE_REPO, 'packages/app-shell-core/src/**/*.{js,jsx}');
const CORE_ETENDO_GO_SRC_GLOB = resolve(CORE_REPO, 'packages/etendo-go-core/src/**/*.{js,jsx}');

/** @type {import('tailwindcss').Config} */
export default {
  presets: [appShellCorePreset],
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
    // Custom artifact components are live frontend sources resolved through the
    // @generated alias. Scan them so their semantic utilities are retained.
    '../../artifacts/**/custom/**/*.{js,jsx}',
    '../../artifacts/**/generated/**/*.{js,jsx}',
    // UI components live in the installed @etendosoftware/app-shell-core package
    // and carry classes like `bg-popover` that exist nowhere in this app's own
    // files — without scanning them Tailwind purges those utilities and the
    // popover/calendar surfaces render with a transparent background (ETP-4083).
    // `packages/*` no longer exists locally after the core/functional split —
    // this now scans the installed dependency's source directly.
    APP_SHELL_CORE_SRC_GLOB,
    // Onboarding/login components live in the installed etendo-go-core package.
    // Scan them too; otherwise Tailwind purges layout and auth-form utilities
    // after the core/functional package split.
    ETENDO_GO_CORE_SRC_GLOB,
    // LOCAL_CORE only — scan the live sibling source in addition to (not
    // instead of) the published copy above, so classes work under both dev
    // profiles without needing a publish/reinstall cycle.
    ...(LOCAL_CORE ? [CORE_APP_SHELL_SRC_GLOB, CORE_ETENDO_GO_SRC_GLOB] : []),
  ],
  plugins: [],
};
