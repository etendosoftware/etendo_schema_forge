import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  toSpecName,
  mapVisibility,
  buildWebhookUrl,
  extractFieldsFromContract,
  formatDuplicateFieldsError,
  loadConfig,
} from '../src/push-to-neo.js';

describe('toSpecName', () => {
  it('converts simple display name to kebab-case', () => {
    assert.equal(toSpecName('Sales Order'), 'sales-order');
  });

  it('converts multi-word name', () => {
    assert.equal(toSpecName('Business Partner'), 'business-partner');
  });

  it('handles single word', () => {
    assert.equal(toSpecName('Product'), 'product');
  });

  it('trims whitespace', () => {
    assert.equal(toSpecName('  Sales Order  '), 'sales-order');
  });

  it('splits camelCase', () => {
    assert.equal(toSpecName('salesOrder'), 'sales-order');
  });

  it('handles PascalCase', () => {
    assert.equal(toSpecName('PurchaseOrder'), 'purchase-order');
  });

  it('replaces multiple non-alphanumeric chars with single dash', () => {
    assert.equal(toSpecName('Sales  /  Order'), 'sales-order');
  });

  it('removes leading and trailing dashes', () => {
    assert.equal(toSpecName('-Sales Order-'), 'sales-order');
  });

  it('handles already kebab-case', () => {
    assert.equal(toSpecName('sales-order'), 'sales-order');
  });

  it('handles names with numbers', () => {
    assert.equal(toSpecName('Report 2024'), 'report-2024');
  });

  it('handles special characters', () => {
    assert.equal(toSpecName('Sales & Purchase (Orders)'), 'sales-purchase-orders');
  });

  it('handles empty string after trim', () => {
    assert.equal(toSpecName('   '), '');
  });
});

describe('mapVisibility', () => {
  it('maps editable to included and not readOnly', () => {
    assert.deepEqual(mapVisibility('editable'), { isIncluded: 'Y', isReadOnly: 'N' });
  });

  it('maps readOnly to included and readOnly', () => {
    assert.deepEqual(mapVisibility('readOnly'), { isIncluded: 'Y', isReadOnly: 'Y' });
  });

  it('maps system to included and readOnly', () => {
    assert.deepEqual(mapVisibility('system'), { isIncluded: 'Y', isReadOnly: 'Y' });
  });

  it('maps discarded to not included', () => {
    assert.deepEqual(mapVisibility('discarded'), { isIncluded: 'N', isReadOnly: 'N' });
  });

  it('maps unknown visibility to not included', () => {
    assert.deepEqual(mapVisibility('unknown'), { isIncluded: 'N', isReadOnly: 'N' });
  });

  it('maps undefined to not included', () => {
    assert.deepEqual(mapVisibility(undefined), { isIncluded: 'N', isReadOnly: 'N' });
  });

  it('maps null to not included', () => {
    assert.deepEqual(mapVisibility(null), { isIncluded: 'N', isReadOnly: 'N' });
  });
});

describe('buildWebhookUrl', () => {
  it('builds URL from base and webhook name', () => {
    assert.equal(
      buildWebhookUrl('https://etendo.example.com', 'ConfigureNEO'),
      'https://etendo.example.com/sws/webhooks/ConfigureNEO',
    );
  });

  it('strips trailing slashes from base URL', () => {
    assert.equal(
      buildWebhookUrl('https://etendo.example.com/', 'ConfigureNEO'),
      'https://etendo.example.com/sws/webhooks/ConfigureNEO',
    );
  });

  it('strips multiple trailing slashes', () => {
    assert.equal(
      buildWebhookUrl('https://etendo.example.com///', 'MyHook'),
      'https://etendo.example.com/sws/webhooks/MyHook',
    );
  });
});

describe('extractFieldsFromContract', () => {
  it('extracts fields from single entity', () => {
    const contract = {
      entities: {
        header: {
          tabId: 'tab1',
          tableName: 'C_Order',
          fields: [
            { name: 'documentNo', column: 'DocumentNo', visibility: 'readOnly' },
            { name: 'dateOrdered', column: 'DateOrdered', visibility: 'editable' },
          ],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields.length, 2);
    assert.equal(fields[0].entityName, 'header');
    assert.equal(fields[0].fieldName, 'documentNo');
    assert.equal(fields[0].column, 'DocumentNo');
    assert.equal(fields[0].visibility, 'readOnly');
    assert.equal(fields[0].tabId, 'tab1');
    assert.equal(fields[0].tableName, 'C_Order');
  });

  it('extracts fields from multiple entities', () => {
    const contract = {
      entities: {
        header: {
          fields: [{ name: 'a', column: 'A', visibility: 'editable' }],
        },
        lines: {
          fields: [
            { name: 'b', column: 'B', visibility: 'readOnly' },
            { name: 'c', column: 'C', visibility: 'discarded' },
          ],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields.length, 3);
    assert.equal(fields[0].entityName, 'header');
    assert.equal(fields[1].entityName, 'lines');
    assert.equal(fields[2].entityName, 'lines');
  });

  it('handles entity without tabId or tableName', () => {
    const contract = {
      entities: {
        header: {
          fields: [{ name: 'x', column: 'X', visibility: 'editable' }],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields[0].tabId, null);
    assert.equal(fields[0].tableName, null);
  });

  it('returns empty array for entity with no fields', () => {
    const contract = { entities: { header: { fields: [] } } };
    assert.deepEqual(extractFieldsFromContract(contract), []);
  });

  it('handles empty entities object', () => {
    assert.deepEqual(extractFieldsFromContract({ entities: {} }), []);
  });
});

describe('formatDuplicateFieldsError', () => {
  it('formats a single duplicate correctly', () => {
    const duplicates = [
      { entityName: 'header', columnName: 'DocumentNo', fieldIds: ['ID1', 'ID2'] },
    ];
    const msg = formatDuplicateFieldsError('sales-order', duplicates);
    assert.ok(msg.includes("spec 'sales-order'"));
    assert.ok(msg.includes("entity='header'"));
    assert.ok(msg.includes("column='DocumentNo'"));
    assert.ok(msg.includes('keep:    ID1'));
    assert.ok(msg.includes('delete:  ID2'));
    assert.ok(msg.includes('DELETE FROM etgo_sf_field'));
    assert.ok(msg.includes("'ID2'"));
  });

  it('formats multiple duplicates', () => {
    const duplicates = [
      { entityName: 'header', columnName: 'Col1', fieldIds: ['A', 'B'] },
      { entityName: 'lines', columnName: 'Col2', fieldIds: ['C', 'D', 'E'] },
    ];
    const msg = formatDuplicateFieldsError('test-spec', duplicates);
    assert.ok(msg.includes("entity='header'"));
    assert.ok(msg.includes("entity='lines'"));
    assert.ok(msg.includes('keep:    A'));
    assert.ok(msg.includes('delete:  B'));
    assert.ok(msg.includes('keep:    C'));
    assert.ok(msg.includes('delete:  D'));
    assert.ok(msg.includes('delete:  E'));
    // SQL should list B, D, E for deletion
    assert.ok(msg.includes("'B'"));
    assert.ok(msg.includes("'D'"));
    assert.ok(msg.includes("'E'"));
  });

  it('includes regen hint in the message', () => {
    const msg = formatDuplicateFieldsError('my-window', [
      { entityName: 'e', columnName: 'c', fieldIds: ['x', 'y'] },
    ]);
    assert.ok(msg.includes('make regen ONLY=my-window PUSH_TO_NEO=1'));
  });

  it('handles single field (no duplicates to delete)', () => {
    const msg = formatDuplicateFieldsError('test', [
      { entityName: 'header', columnName: 'Col', fieldIds: ['ONLY'] },
    ]);
    assert.ok(msg.includes('keep:    ONLY'));
    assert.ok(!msg.includes('delete:'));
  });
});

// ---------------------------------------------------------------------------
// toSpecName — additional edge cases
// ---------------------------------------------------------------------------
describe('toSpecName — additional', () => {
  it('handles names with dots', () => {
    assert.equal(toSpecName('Sales.Order'), 'sales-order');
  });

  it('handles names with underscores', () => {
    assert.equal(toSpecName('sales_order'), 'sales-order');
  });

  it('handles consecutive uppercase (acronyms)', () => {
    const result = toSpecName('HTMLParser');
    assert.ok(result.includes('html'));
  });

  it('returns empty for empty string', () => {
    assert.equal(toSpecName(''), '');
  });

  it('handles names with parentheses and ampersands', () => {
    assert.equal(toSpecName('A & B (Test)'), 'a-b-test');
  });
});

// ---------------------------------------------------------------------------
// mapVisibility — additional
// ---------------------------------------------------------------------------
describe('mapVisibility — additional', () => {
  it('maps empty string to not included', () => {
    assert.deepEqual(mapVisibility(''), { isIncluded: 'N', isReadOnly: 'N' });
  });

  it('maps number to not included', () => {
    assert.deepEqual(mapVisibility(0), { isIncluded: 'N', isReadOnly: 'N' });
  });
});

// ---------------------------------------------------------------------------
// buildWebhookUrl — additional
// ---------------------------------------------------------------------------
describe('buildWebhookUrl — additional', () => {
  it('handles URL with path', () => {
    assert.equal(
      buildWebhookUrl('https://etendo.example.com/etendo', 'ConfigureNEO'),
      'https://etendo.example.com/etendo/sws/webhooks/ConfigureNEO',
    );
  });

  it('handles localhost URL', () => {
    assert.equal(
      buildWebhookUrl('http://localhost:8080', 'Hook'),
      'http://localhost:8080/sws/webhooks/Hook',
    );
  });
});

// ---------------------------------------------------------------------------
// extractFieldsFromContract — additional
// ---------------------------------------------------------------------------
describe('extractFieldsFromContract — additional', () => {
  it('preserves field visibility values', () => {
    const contract = {
      entities: {
        header: {
          tabId: 'tab1',
          tableName: 'C_Order',
          fields: [
            { name: 'f1', column: 'C1', visibility: 'editable' },
            { name: 'f2', column: 'C2', visibility: 'readOnly' },
            { name: 'f3', column: 'C3', visibility: 'system' },
            { name: 'f4', column: 'C4', visibility: 'discarded' },
          ],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields[0].visibility, 'editable');
    assert.equal(fields[1].visibility, 'readOnly');
    assert.equal(fields[2].visibility, 'system');
    assert.equal(fields[3].visibility, 'discarded');
  });

  it('handles three entities', () => {
    const contract = {
      entities: {
        header: { fields: [{ name: 'a', column: 'A', visibility: 'editable' }] },
        lines: { fields: [{ name: 'b', column: 'B', visibility: 'editable' }] },
        tax: { fields: [{ name: 'c', column: 'C', visibility: 'readOnly' }] },
      },
    };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields.length, 3);
    assert.equal(fields[2].entityName, 'tax');
  });

  it('handles entity with many fields', () => {
    const manyFields = Array.from({ length: 50 }, (_, i) => ({
      name: `f${i}`, column: `Col${i}`, visibility: 'editable',
    }));
    const contract = { entities: { header: { fields: manyFields } } };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields.length, 50);
  });
});

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------
describe('loadConfig', () => {
  const tmpBase = join(tmpdir(), `push-neo-test-${Date.now()}`);
  const savedEnv = {};

  before(() => {
    mkdirSync(tmpBase, { recursive: true });
    // Save env vars to restore later
    savedEnv.ETENDO_URL = process.env.ETENDO_URL;
    savedEnv.ETENDO_USER = process.env.ETENDO_USER;
    savedEnv.ETENDO_PASSWORD = process.env.ETENDO_PASSWORD;
  });

  after(() => {
    // Restore env vars
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(tmpBase, { recursive: true, force: true });
  });

  it('loads config from env vars', async () => {
    process.env.ETENDO_URL = 'http://test.local';
    process.env.ETENDO_USER = 'admin';
    process.env.ETENDO_PASSWORD = 'test-val-1';
    const config = await loadConfig(tmpBase);
    assert.equal(config.url, 'http://test.local');
    assert.equal(config.user, 'admin');
    assert.equal(config.password, 'test-val-1');
  });

  it('loads config from properties file', async () => {
    delete process.env.ETENDO_URL;
    delete process.env.ETENDO_USER;
    delete process.env.ETENDO_PASSWORD;
    writeFileSync(join(tmpBase, 'schema_forge.properties'), [
      'etendo.url=http://props.local',
      'etendo.user=propuser',
      'etendo.password=test-val-2',
    ].join('\n'));
    const config = await loadConfig(tmpBase);
    assert.equal(config.url, 'http://props.local');
    assert.equal(config.user, 'propuser');
    assert.equal(config.password, 'test-val-2');
  });

  it('env vars override properties file', async () => {
    process.env.ETENDO_URL = 'http://env.local';
    process.env.ETENDO_USER = 'envuser';
    process.env.ETENDO_PASSWORD = 'test-val-3';
    // Properties file still exists from previous test
    const config = await loadConfig(tmpBase);
    assert.equal(config.url, 'http://env.local');
    assert.equal(config.user, 'envuser');
    assert.equal(config.password, 'test-val-3');
  });

  it('throws when URL is missing', async () => {
    delete process.env.ETENDO_URL;
    delete process.env.ETENDO_USER;
    delete process.env.ETENDO_PASSWORD;
    const noPropsDir = join(tmpBase, 'empty');
    mkdirSync(noPropsDir, { recursive: true });
    await assert.rejects(
      loadConfig(noPropsDir),
      { message: /Missing Etendo URL/ },
    );
  });

  it('throws when user is missing', async () => {
    process.env.ETENDO_URL = 'http://test.local';
    delete process.env.ETENDO_USER;
    delete process.env.ETENDO_PASSWORD;
    const noPropsDir = join(tmpBase, 'nouser');
    mkdirSync(noPropsDir, { recursive: true });
    await assert.rejects(
      loadConfig(noPropsDir),
      { message: /Missing Etendo user/ },
    );
  });

  it('throws when password is missing', async () => {
    process.env.ETENDO_URL = 'http://test.local';
    process.env.ETENDO_USER = 'admin';
    delete process.env.ETENDO_PASSWORD;
    const noPropsDir = join(tmpBase, 'nopw');
    mkdirSync(noPropsDir, { recursive: true });
    await assert.rejects(
      loadConfig(noPropsDir),
      { message: /Missing Etendo password/ },
    );
  });

  it('handles properties file with comments and blank lines', async () => {
    delete process.env.ETENDO_URL;
    delete process.env.ETENDO_USER;
    delete process.env.ETENDO_PASSWORD;
    const commentDir = join(tmpBase, 'comments');
    mkdirSync(commentDir, { recursive: true });
    writeFileSync(join(commentDir, 'schema_forge.properties'), [
      '# This is a comment',
      '',
      'etendo.url=http://comment.local',
      '# Another comment',
      'etendo.user=cuser',
      'etendo.password=test-val-4',
      '',
    ].join('\n'));
    const config = await loadConfig(commentDir);
    assert.equal(config.url, 'http://comment.local');
    assert.equal(config.user, 'cuser');
    assert.equal(config.password, 'test-val-4');
  });

  it('handles properties file with spaces around = sign', async () => {
    delete process.env.ETENDO_URL;
    delete process.env.ETENDO_USER;
    delete process.env.ETENDO_PASSWORD;
    const spacesDir = join(tmpBase, 'spaces');
    mkdirSync(spacesDir, { recursive: true });
    writeFileSync(join(spacesDir, 'schema_forge.properties'), [
      'etendo.url = http://spaced.local',
      'etendo.user = spaceduser',
      'etendo.password = test-val-5',
    ].join('\n'));
    const config = await loadConfig(spacesDir);
    assert.equal(config.url, 'http://spaced.local');
    assert.equal(config.user, 'spaceduser');
    assert.equal(config.password, 'test-val-5');
  });

  it('handles properties file with values containing = sign', async () => {
    delete process.env.ETENDO_URL;
    delete process.env.ETENDO_USER;
    delete process.env.ETENDO_PASSWORD;
    const eqDir = join(tmpBase, 'eqval');
    mkdirSync(eqDir, { recursive: true });
    writeFileSync(join(eqDir, 'schema_forge.properties'), [
      'etendo.url=http://eq.local',
      'etendo.user=admin',
      'etendo.password=t@st=val',
    ].join('\n'));
    const config = await loadConfig(eqDir);
    assert.equal(config.url, 'http://eq.local');
    assert.equal(config.user, 'admin');
    // Password should preserve everything after first =
    assert.equal(config.password, 't@st=val');
  });

  it('env vars override partial properties', async () => {
    const partialDir = join(tmpBase, 'partial');
    mkdirSync(partialDir, { recursive: true });
    writeFileSync(join(partialDir, 'schema_forge.properties'), [
      'etendo.url=http://partial.local',
      'etendo.user=fileuser',
      'etendo.password=test-val-6',
    ].join('\n'));
    // Override only URL from env
    process.env.ETENDO_URL = 'http://env-override.local';
    process.env.ETENDO_USER = 'envuser';
    process.env.ETENDO_PASSWORD = 'test-val-7';
    const config = await loadConfig(partialDir);
    assert.equal(config.url, 'http://env-override.local');
    assert.equal(config.user, 'envuser');
    assert.equal(config.password, 'test-val-7');
  });

  it('handles properties file with lines without = sign', async () => {
    delete process.env.ETENDO_URL;
    delete process.env.ETENDO_USER;
    delete process.env.ETENDO_PASSWORD;
    const noEqDir = join(tmpBase, 'noeq');
    mkdirSync(noEqDir, { recursive: true });
    writeFileSync(join(noEqDir, 'schema_forge.properties'), [
      'this line has no equals sign',
      'etendo.url=http://noeq.local',
      'etendo.user=admin',
      'etendo.password=test-val-8',
    ].join('\n'));
    const config = await loadConfig(noEqDir);
    assert.equal(config.url, 'http://noeq.local');
    assert.equal(config.user, 'admin');
    assert.equal(config.password, 'test-val-8');
  });
});

// ---------------------------------------------------------------------------
// buildWebhookUrl — additional edge cases
// ---------------------------------------------------------------------------
describe('buildWebhookUrl — trailing slash and path edge cases', () => {
  it('handles URL with trailing slash and path', () => {
    assert.equal(
      buildWebhookUrl('https://etendo.example.com/etendo/', 'MyHook'),
      'https://etendo.example.com/etendo/sws/webhooks/MyHook',
    );
  });

  it('handles empty webhook name', () => {
    const url = buildWebhookUrl('https://etendo.example.com', '');
    assert.equal(url, 'https://etendo.example.com/sws/webhooks/');
  });

  it('handles empty base URL', () => {
    const url = buildWebhookUrl('', 'Hook');
    assert.equal(url, '/sws/webhooks/Hook');
  });
});

// ---------------------------------------------------------------------------
// extractFieldsFromContract — more edge cases
// ---------------------------------------------------------------------------
describe('extractFieldsFromContract — edge cases', () => {
  it('handles entity with empty fields array', () => {
    const contract = { entities: { header: { tabId: 't1', tableName: 'T1', fields: [] } } };
    const fields = extractFieldsFromContract(contract);
    assert.deepEqual(fields, []);
  });

  it('handles entity with single field', () => {
    const contract = {
      entities: {
        header: {
          tabId: 't1',
          tableName: 'T1',
          fields: [{ name: 'x', column: 'X', visibility: 'editable' }],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields.length, 1);
    assert.equal(fields[0].entityName, 'header');
  });

  it('returns flat list across multiple entities', () => {
    const contract = {
      entities: {
        header: { fields: [{ name: 'a', column: 'A', visibility: 'editable' }] },
        lines: { fields: [{ name: 'b', column: 'B', visibility: 'readOnly' }] },
        tax: { fields: [{ name: 'c', column: 'C', visibility: 'system' }] },
        schedule: { fields: [{ name: 'd', column: 'D', visibility: 'discarded' }] },
      },
    };
    const fields = extractFieldsFromContract(contract);
    assert.equal(fields.length, 4);
    assert.equal(fields[3].entityName, 'schedule');
  });

  it('field output only includes known properties', () => {
    const contract = {
      entities: {
        header: {
          tabId: 't1',
          tableName: 'T1',
          fields: [
            { name: 'f1', column: 'C1', visibility: 'editable' },
          ],
        },
      },
    };
    const fields = extractFieldsFromContract(contract);
    // extractFieldsFromContract returns fixed keys: entityName, tabId, tableName, fieldName, column, visibility
    assert.equal(fields[0].fieldName, 'f1');
    assert.equal(fields[0].column, 'C1');
    assert.equal(fields[0].visibility, 'editable');
    assert.equal(fields[0].entityName, 'header');
  });
});
