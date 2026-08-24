import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * ETP-4899 — cross-repo parity guard for the `GET /api/reports` descriptor.
 *
 * The report list is produced by TWO code paths that must stay identical:
 *
 *   DEV     → tools/app-shell/vite-plugins/report-api.js  → listReports()   (this repo)
 *   DEPLOY  → @etendosoftware/schema-forge-cli             → listReportDescriptors()
 *             (generate-reports-manifest.js writes the static manifest;
 *              tools/report-server/server.js serves it live)
 *
 * They diverged once already: `sections` was added to the contracts and to the
 * DEV plugin only. Every developer saw a working accordion sidebar locally
 * while every server dropped `sections` silently, so ReportViewerPage's
 * `useAccordion` was permanently false in production — 0 of 11 reports carried
 * the field. No error, no warning.
 *
 * This test compares the field list the DEV plugin builds against the field set
 * the INSTALLED core package actually emits, so the next time someone teaches
 * the dev plugin a new field without updating the shared module, this goes red
 * here instead of shipping.
 */

const REPORT_API_PLUGIN = fileURLToPath(
  new URL('../vite-plugins/report-api.js', import.meta.url)
);

// The shared module lives in the core package. Resolved from the repo root
// node_modules (this repo consumes core as a published package).
const CORE_DESCRIPTOR_MODULE = fileURLToPath(
  new URL(
    '../../../node_modules/@etendosoftware/schema-forge-cli/src/report-descriptor.js',
    import.meta.url
  )
);

const SKIP_REASON =
  'The installed @etendosoftware/schema-forge-cli does not expose ' +
  'src/report-descriptor.js yet (expected at ' +
  CORE_DESCRIPTOR_MODULE +
  '). The shared descriptor module was introduced in schema_forge_core for ' +
  'ETP-4899; this repo is still pinned to a core version that predates it ' +
  '(pin at the time of writing: 0.3.34). Publish the new core version and bump ' +
  'the "@etendosoftware/schema-forge-cli" pin in the root package.json — this ' +
  'test then starts enforcing dev/deploy field parity for real, instead of skipping.';

/**
 * Extract the descriptor field names the Vite dev plugin's `listReports()`
 * pushes — i.e. the keys of the object literal inside its `reports.push({...})`.
 * Read from source text on purpose: the plugin is a Vite plugin that touches the
 * DB/env on import, so it cannot simply be imported here.
 */
function devPluginDescriptorFields() {
  const src = readFileSync(REPORT_API_PLUGIN, 'utf8');
  const fnStart = src.indexOf('function listReports()');
  assert.notEqual(
    fnStart,
    -1,
    'could not find listReports() in vite-plugins/report-api.js — if it was renamed, ' +
      'update this parity test rather than deleting it'
  );
  const pushStart = src.indexOf('reports.push({', fnStart);
  assert.notEqual(
    pushStart,
    -1,
    'could not find the `reports.push({...})` descriptor literal inside listReports()'
  );
  const literal = src.slice(pushStart, src.indexOf('});', pushStart));
  const fields = [...literal.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]);
  assert.ok(fields.length > 0, 'parsed zero fields out of the dev plugin descriptor literal');
  return [...new Set(fields)].sort();
}

describe('report list descriptor — dev plugin ↔ installed core parity (ETP-4899)', () => {
  it('the dev plugin still exposes a parseable descriptor literal', () => {
    const fields = devPluginDescriptorFields();
    // `sections` is the field that was lost on the deploy path. Pin it here so
    // the dev side can never quietly stop sending it either.
    assert.ok(
      fields.includes('sections'),
      'the dev plugin no longer emits `sections` — ReportViewerPage derives ' +
        '`useAccordion` from it, so the accordion sidebar would silently disappear in dev'
    );
  });

  it('emits exactly the same field set as the installed core descriptor', async (t) => {
    if (!existsSync(CORE_DESCRIPTOR_MODULE)) {
      t.skip(SKIP_REASON);
      return;
    }

    const { buildReportDescriptor } = await import(CORE_DESCRIPTOR_MODULE);
    const coreFields = Object.keys(
      buildReportDescriptor({
        reportId: 'parity-probe',
        title: 'Parity Probe',
        type: 'listing',
        source: 'manual',
        outputs: ['pdf'],
      })
    ).sort();

    assert.deepEqual(
      devPluginDescriptorFields(),
      coreFields,
      'the Vite dev plugin and the installed core descriptor disagree on the ' +
        '/api/reports field set. A field present only in the dev plugin works ' +
        'perfectly on every developer machine and is missing on every server — ' +
        'that is exactly how `sections` was lost (ETP-4899). Move the field into ' +
        'report-descriptor.js in schema_forge_core, publish, and bump the pin.'
    );
  });

  it('the installed core descriptor carries sections', async (t) => {
    if (!existsSync(CORE_DESCRIPTOR_MODULE)) {
      t.skip(SKIP_REASON);
      return;
    }

    const { buildReportDescriptor } = await import(CORE_DESCRIPTOR_MODULE);
    const descriptor = buildReportDescriptor({
      reportId: 'parity-probe',
      title: 'Parity Probe',
      type: 'listing',
      source: 'manual',
      outputs: ['pdf'],
      sections: [{ id: 'assets', title: 'Assets' }],
    });
    assert.ok(
      Object.hasOwn(descriptor, 'sections'),
      'the installed core package builds report descriptors without `sections` — ' +
        'every server would render the legacy flat sidebar (ETP-4899)'
    );
    assert.deepEqual(descriptor.sections, [{ id: 'assets', title: 'Assets' }]);
  });
});
