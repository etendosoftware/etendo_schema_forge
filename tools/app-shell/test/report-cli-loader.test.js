/**
 * ETP-5460 — `loadReportCli(name)` gated loader (design id 455, "Local
 * verification of the plugin" / tasks id 458 WU3.1).
 *
 * report-api.js needs to consume the still-unpublished core work landed in
 * this change (report-auth.js) BEFORE it is published as a
 * `@etendosoftware/schema-forge-cli` preview version. A node_modules symlink
 * was rejected in the design (`npm install` silently undoes it), so instead
 * `loadReportCli` is opt-in via the `LOCAL_CORE` env var: with it set, it
 * imports the sibling `schema_forge_core` repo's own `cli/src/<name>.js`
 * source directly; without it, it imports the published package exactly as
 * every report-api.js import already does today.
 *
 * `report-sql.js` is used as the probe module for the "published vs. local"
 * cases below because it already ships in the currently-published
 * `@etendosoftware/schema-forge-cli@0.3.58` AND exists in the local core
 * checkout, so both branches can be exercised without depending on
 * report-auth.js (new in this change, not yet published).
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadReportCli } from '../vite-plugins/report-cli.js';

const CORE_REPO = resolve(fileURLToPath(new URL('../../../../schema_forge_core', import.meta.url)));
const CORE_PRESENT = existsSync(resolve(CORE_REPO, 'cli/src/report-sql.js'));

describe('loadReportCli — gated local-core loader (ETP-5460)', () => {
  let originalLocalCore;
  let originalCoreOverride;

  beforeEach(() => {
    originalLocalCore = process.env.LOCAL_CORE;
    originalCoreOverride = process.env.SCHEMA_FORGE_CORE;
  });

  afterEach(() => {
    if (originalLocalCore === undefined) delete process.env.LOCAL_CORE;
    else process.env.LOCAL_CORE = originalLocalCore;
    if (originalCoreOverride === undefined) delete process.env.SCHEMA_FORGE_CORE;
    else process.env.SCHEMA_FORGE_CORE = originalCoreOverride;
  });

  it('with LOCAL_CORE unset, imports the published @etendosoftware/schema-forge-cli package', async () => {
    delete process.env.LOCAL_CORE;
    delete process.env.SCHEMA_FORGE_CORE;
    const mod = await loadReportCli('report-sql');
    assert.equal(typeof mod.applyPlaceholders, 'function');
  });

  it('with LOCAL_CORE set and the core repo present, imports the sibling schema_forge_core source', { skip: !CORE_PRESENT && 'sibling schema_forge_core checkout not present' }, async () => {
    process.env.LOCAL_CORE = '1';
    delete process.env.SCHEMA_FORGE_CORE;
    const mod = await loadReportCli('report-sql');
    assert.equal(typeof mod.applyPlaceholders, 'function');
  });

  it('honors SCHEMA_FORGE_CORE as an override of the default sibling path', { skip: !CORE_PRESENT && 'sibling schema_forge_core checkout not present' }, async () => {
    process.env.LOCAL_CORE = '1';
    process.env.SCHEMA_FORGE_CORE = CORE_REPO;
    const mod = await loadReportCli('report-sql');
    assert.equal(typeof mod.applyPlaceholders, 'function');
  });

  it('with LOCAL_CORE set and the module missing from the local core checkout, throws an explicit error (not a bare module-not-found)', async () => {
    process.env.LOCAL_CORE = '1';
    process.env.SCHEMA_FORGE_CORE = resolve(CORE_REPO, '../does-not-exist-schema-forge-core');
    await assert.rejects(
      loadReportCli('report-sql'),
      (err) => {
        assert.match(err.message, /LOCAL_CORE is set/);
        assert.match(err.message, /does-not-exist-schema-forge-core/);
        return true;
      },
    );
  });

  it('LOCAL_CORE-loaded report-auth.js (new in this change, not yet published) exposes the real exports', { skip: !CORE_PRESENT && 'sibling schema_forge_core checkout not present' }, async () => {
    process.env.LOCAL_CORE = '1';
    delete process.env.SCHEMA_FORGE_CORE;
    const mod = await loadReportCli('report-auth');
    assert.equal(typeof mod.resolveReportSession, 'function');
    assert.equal(typeof mod.reportAuthErrorBody, 'function');
    assert.equal(typeof mod.extractSessionCookie, 'function');
    assert.equal(typeof mod.ReportAuthError, 'function');
  });
});
