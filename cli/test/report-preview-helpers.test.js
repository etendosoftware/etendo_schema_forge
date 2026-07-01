import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  resolveLabel,
  parsePreviewArgs,
  resolveTemplateFiles,
  buildJsreportPayload,
} from '../src/report-preview.js';

// ---------------------------------------------------------------------------
// resolveLabel (not covered in main test file)
// ---------------------------------------------------------------------------

describe('resolveLabel', () => {
  it('returns the string as-is when given a plain string', () => {
    assert.equal(resolveLabel('hello', 'en_US'), 'hello');
  });

  it('returns the requested locale when available', () => {
    const obj = { en_US: 'Name', es_ES: 'Nombre' };
    assert.equal(resolveLabel(obj, 'es_ES'), 'Nombre');
  });

  it('falls back to en_US when requested locale is missing', () => {
    const obj = { en_US: 'Name' };
    assert.equal(resolveLabel(obj, 'fr_FR'), 'Name');
  });

  it('falls back to first value when en_US is also missing', () => {
    const obj = { es_ES: 'Nombre' };
    assert.equal(resolveLabel(obj, 'fr_FR'), 'Nombre');
  });

  it('returns empty string for null input', () => {
    assert.equal(resolveLabel(null, 'en_US'), '');
  });

  it('returns empty string for undefined input', () => {
    assert.equal(resolveLabel(undefined, 'en_US'), '');
  });

  it('returns empty string for empty object', () => {
    assert.equal(resolveLabel({}, 'en_US'), '');
  });

  it('returns empty string for non-object, non-string input', () => {
    assert.equal(resolveLabel(42, 'en_US'), '');
  });
});

// ---------------------------------------------------------------------------
// parsePreviewArgs — edge cases not covered in main test
// ---------------------------------------------------------------------------

describe('parsePreviewArgs edge cases', () => {
  it('returns defaults when no arguments provided', () => {
    const opts = parsePreviewArgs([]);
    assert.equal(opts.artifact, null);
    assert.equal(opts.report, null);
    assert.equal(opts.format, 'pdf');
    assert.equal(opts.locale, 'en_US');
    assert.equal(opts.data, null);
    assert.equal(opts.port, 5488);
    assert.equal(opts.open, false);
  });

  it('parses --port flag', () => {
    const opts = parsePreviewArgs(['--artifact', 'bp', '--report', 'listing', '--port', '5500']);
    assert.equal(opts.port, 5500);
  });

  it('parses --open flag', () => {
    const opts = parsePreviewArgs(['--artifact', 'bp', '--report', 'listing', '--open']);
    assert.equal(opts.open, true);
  });

  it('parses --data flag', () => {
    const opts = parsePreviewArgs(['--artifact', 'bp', '--report', 'listing', '--data', '/tmp/rows.json']);
    assert.equal(opts.data, '/tmp/rows.json');
  });

  it('ignores unknown flags gracefully', () => {
    const opts = parsePreviewArgs(['--artifact', 'bp', '--unknown', 'value', '--report', 'listing']);
    assert.equal(opts.artifact, 'bp');
    assert.equal(opts.report, 'listing');
  });

  it('handles all flags combined', () => {
    const opts = parsePreviewArgs([
      '--artifact', 'sales-order',
      '--report', 'detail',
      '--format', 'xlsx',
      '--locale', 'es_ES',
      '--data', '/tmp/data.json',
      '--port', '9999',
      '--open',
    ]);
    assert.equal(opts.artifact, 'sales-order');
    assert.equal(opts.report, 'detail');
    assert.equal(opts.format, 'xlsx');
    assert.equal(opts.locale, 'es_ES');
    assert.equal(opts.data, '/tmp/data.json');
    assert.equal(opts.port, 9999);
    assert.equal(opts.open, true);
  });
});

// ---------------------------------------------------------------------------
// resolveTemplateFiles — additional path checks
// ---------------------------------------------------------------------------

describe('resolveTemplateFiles edge cases', () => {
  it('constructs correct artifact-specific paths', () => {
    const files = resolveTemplateFiles('/project', 'sales-order', 'detail');
    assert.ok(files.template.includes('artifacts/sales-order/reports/detail/template.hbs'));
    assert.ok(files.overrideCss.includes('artifacts/sales-order/reports/detail/style.css'));
    assert.ok(files.mockData.includes('artifacts/sales-order/reports/detail/mockData.js'));
  });

  it('constructs correct shared template paths', () => {
    const files = resolveTemplateFiles('/project', 'any', 'listing');
    assert.ok(files.css.includes('templates/reports/base.css'));
    assert.ok(files.helpers.includes('templates/reports/helpers/common.js'));
  });
});

// ---------------------------------------------------------------------------
// buildJsreportPayload — edge cases
// ---------------------------------------------------------------------------

describe('buildJsreportPayload edge cases', () => {
  it('handles contract with no columns', () => {
    const contract = { title: 'Empty', columns: [], summary: {} };
    const payload = buildJsreportPayload(contract, [], {
      locale: 'en_US', css: '', templateContent: '',
    });
    assert.deepEqual(payload.data.columns, []);
    assert.deepEqual(payload.data.rows, []);
    assert.deepEqual(payload.data.summary, {});
  });

  it('handles contract with undefined columns (defaults to empty)', () => {
    const contract = { title: 'No Cols', summary: {} };
    const payload = buildJsreportPayload(contract, [], {
      locale: 'en_US', css: '', templateContent: '',
    });
    assert.deepEqual(payload.data.columns, []);
  });

  it('includes helpersCode in template when provided', () => {
    const contract = { title: 'Test', columns: [], summary: {} };
    const payload = buildJsreportPayload(contract, [], {
      locale: 'en_US', css: '', templateContent: '<html></html>',
      helpersCode: 'function formatDate(d) { return d; }',
    });
    assert.equal(payload.template.helpers, 'function formatDate(d) { return d; }');
  });

  it('omits helpers key when helpersCode is falsy', () => {
    const contract = { title: 'Test', columns: [], summary: {} };
    const payload = buildJsreportPayload(contract, [], {
      locale: 'en_US', css: '', templateContent: '',
    });
    assert.equal(payload.template.helpers, undefined);
  });

  it('maps column sortable to false by default', () => {
    const contract = {
      title: 'Test',
      columns: [{ field: 'name', label: 'Name', type: 'string', width: '20%' }],
      summary: {},
    };
    const payload = buildJsreportPayload(contract, [], {
      locale: 'en_US', css: '', templateContent: '',
    });
    assert.equal(payload.data.columns[0].sortable, false);
  });

  it('sets generatedAt in ISO format', () => {
    const contract = { title: 'Test', columns: [], summary: {} };
    const payload = buildJsreportPayload(contract, [], {
      locale: 'en_US', css: '', templateContent: '',
    });
    assert.ok(payload.data.meta.generatedAt);
    // Should parse as a valid date
    assert.ok(!isNaN(Date.parse(payload.data.meta.generatedAt)));
  });
});
