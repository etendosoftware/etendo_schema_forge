/**
 * report-cli.js — gated loader for the shared @etendosoftware/schema-forge-cli
 * report modules (report-auth.js, report-sql.js, report-branding.js, ...)
 * consumed by report-api.js (ETP-5460).
 *
 * Local verification of report-api.js against the core work landed in this
 * change (report-auth.js) needs a way to import schema_forge_core's SOURCE
 * directly, before it is published as a `@etendosoftware/schema-forge-cli`
 * preview version. A node_modules symlink was rejected in design id 455
 * ("Local verification of the plugin"): `npm install` silently undoes it,
 * and it is easy to leave a stale symlink behind unnoticed. This loader is
 * the alternative: strictly opt-in via the `LOCAL_CORE` env var (the same
 * flag `make dev-local-core` and `vite.config.js` already gate local-core
 * resolution on), byte-identical behavior otherwise — every existing
 * report-api.js import keeps resolving to the published package exactly as
 * before.
 *
 * See design id 455 / tasks id 458 (WU3.1).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Default sibling location of the core repo checkout. This file lives one
// level deeper (vite-plugins/) than vite.config.js's own CORE_REPO
// resolution (tools/app-shell/), hence the extra '../' below —
// tools/app-shell/vite-plugins/ -> ../../../../schema_forge_core resolves to
// the same EtendoGO/schema_forge_core sibling directory vite.config.js's
// '../../../schema_forge_core' (from tools/app-shell/) resolves to.
const DEFAULT_CORE_REPO = resolve(import.meta.dirname, '../../../../schema_forge_core');

/**
 * Loads a shared report module (e.g. 'report-auth', 'report-sql',
 * 'report-branding') by name.
 *
 * With `LOCAL_CORE` set, imports `${SCHEMA_FORGE_CORE || <sibling>}/cli/src/<name>.js`
 * directly via `pathToFileURL` and throws an explicit, actionable error if
 * that file does not exist (never a bare `ERR_MODULE_NOT_FOUND`). Without
 * `LOCAL_CORE`, imports `@etendosoftware/schema-forge-cli/src/<name>.js` —
 * the published package, exactly as report-api.js always has.
 *
 * `SCHEMA_FORGE_CORE` overrides the default sibling path — same override
 * `cli/sf-local` and `vite.config.js`'s own `CORE_REPO` resolution honor, so
 * a core checkout under a non-default name/path still resolves.
 */
export async function loadReportCli(name) {
  if (process.env.LOCAL_CORE) {
    const coreRepo = process.env.SCHEMA_FORGE_CORE || DEFAULT_CORE_REPO;
    const modulePath = resolve(coreRepo, 'cli/src', `${name}.js`);
    if (!existsSync(modulePath)) {
      throw new Error(
        `loadReportCli: LOCAL_CORE is set but '${modulePath}' does not exist. ` +
        `Clone schema_forge_core as a sibling of this repo (${DEFAULT_CORE_REPO}), ` +
        `or set SCHEMA_FORGE_CORE to point at your checkout.`,
      );
    }
    return import(pathToFileURL(modulePath).href);
  }
  return import(/* @vite-ignore */ `@etendosoftware/schema-forge-cli/src/${name}.js`);
}
