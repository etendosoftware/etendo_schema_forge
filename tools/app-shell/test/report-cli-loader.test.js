/**
 * ETP-5460 — Hermetic coverage of the opt-in local core loader.
 * Published modules are checked against the installed package. A temporary core
 * fixture proves local selection and path overrides without requiring a sibling
 * checkout or depending on its branch age. Missing local modules must still fail.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { loadReportCli } from '../vite-plugins/report-cli.js';

describe('loadReportCli — gated local-core loader (ETP-5460)', () => {
  let originalLocalCore;
  let fixtureCore;
  let originalCoreOverride;

  beforeEach(() => {
    fixtureCore = mkdtempSync(resolve(tmpdir(), 'report-cli-loader-'));
    mkdirSync(resolve(fixtureCore, 'cli/src'), { recursive: true });
    writeFileSync(resolve(fixtureCore, 'package.json'), JSON.stringify({ type: 'module' }));
    writeFileSync(resolve(fixtureCore, 'cli/src/report-sql.js'),
      "export const source = 'local-fixture'; export const applyPlaceholders = () => 'fixture';\n");
    originalLocalCore = process.env.LOCAL_CORE;
    originalCoreOverride = process.env.SCHEMA_FORGE_CORE;
  });

  afterEach(() => {
    rmSync(fixtureCore, { recursive: true, force: true });
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

  it('with LOCAL_CORE set, imports the configured local source rather than the published package', async () => {
    process.env.LOCAL_CORE = '1';
    process.env.SCHEMA_FORGE_CORE = fixtureCore;
    const mod = await loadReportCli('report-sql');
    assert.equal(typeof mod.applyPlaceholders, 'function');
    assert.equal(mod.source, 'local-fixture');
  });

  it('honors SCHEMA_FORGE_CORE as an override of the default sibling path', async () => {
    process.env.LOCAL_CORE = '1';
    process.env.SCHEMA_FORGE_CORE = fixtureCore;
    const mod = await loadReportCli('report-sql');
    assert.equal(typeof mod.applyPlaceholders, 'function');
  });

  it('with LOCAL_CORE set and the module missing from the local core checkout, throws an explicit error (not a bare module-not-found)', async () => {
    process.env.LOCAL_CORE = '1';
    process.env.SCHEMA_FORGE_CORE = resolve(fixtureCore, 'does-not-exist-schema-forge-core');
    await assert.rejects(
      loadReportCli('report-sql'),
      (err) => {
        assert.match(err.message, /LOCAL_CORE is set/);
        assert.match(err.message, /does-not-exist-schema-forge-core/);
        return true;
      },
    );
  });

  it('published report-auth exposes its real exports without requiring a sibling checkout', async () => {
    delete process.env.LOCAL_CORE;
    delete process.env.SCHEMA_FORGE_CORE;
    const mod = await loadReportCli('report-auth');
    assert.equal(typeof mod.resolveReportSession, 'function');
    assert.equal(typeof mod.reportAuthErrorBody, 'function');
    assert.equal(typeof mod.extractSessionCookie, 'function');
    assert.equal(typeof mod.ReportAuthError, 'function');
  });
});
