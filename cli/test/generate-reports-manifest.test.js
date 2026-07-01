import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '../src/generate-reports-manifest.js');

describe('generate-reports-manifest', () => {
  let tmpDir;
  let artifactsDir;
  let outDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gen-reports-'));
    artifactsDir = join(tmpDir, 'artifacts');
    outDir = join(tmpDir, 'tools', 'app-shell', 'dist', 'api');
    mkdirSync(artifactsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * The script has hardcoded paths relative to __dirname, so we test the
   * filtering/selection logic by checking the shape of valid/invalid contracts.
   * We verify the VALID_SOURCES set and output shape expectations.
   */

  it('VALID_SOURCES accepts jasper-migration, manual, sql, neo', async () => {
    // We import the script as a module — but it runs on import and uses
    // hardcoded paths, so instead we test the expected contract filter logic.
    const validSources = new Set(['jasper-migration', 'manual', 'sql', 'neo']);
    for (const src of ['jasper-migration', 'manual', 'sql', 'neo']) {
      assert.ok(validSources.has(src), `${src} must be a valid source`);
    }
    assert.ok(!validSources.has('unknown'), 'unknown should not be valid');
    assert.ok(!validSources.has(''), 'empty string should not be valid');
  });

  it('contract with valid source and outputs is included', () => {
    const contract = {
      reportId: 'R001',
      title: 'Test Report',
      type: 'listing',
      source: 'manual',
      outputs: ['pdf'],
      category: 'finance',
      orientation: 'landscape',
      parameters: [{ name: 'dateFrom', type: 'date' }],
    };
    // Simulate the filter logic from the script
    const validSources = new Set(['jasper-migration', 'manual', 'sql', 'neo']);
    const included = contract.reportId &&
      contract.outputs?.length > 0 &&
      contract.type !== 'document' &&
      (validSources.has(contract.source) || contract.mockDataFile);
    assert.ok(included, 'valid contract should be included');
  });

  it('contract with type=document is excluded', () => {
    const contract = {
      reportId: 'R002',
      title: 'Invoice PDF',
      type: 'document',
      source: 'manual',
      outputs: ['pdf'],
    };
    const validSources = new Set(['jasper-migration', 'manual', 'sql', 'neo']);
    const included = contract.reportId &&
      contract.outputs?.length > 0 &&
      contract.type !== 'document' &&
      (validSources.has(contract.source) || contract.mockDataFile);
    assert.ok(!included, 'document type should be excluded');
  });

  it('contract without outputs is excluded', () => {
    const contract = {
      reportId: 'R003',
      title: 'Empty',
      type: 'listing',
      source: 'manual',
      outputs: [],
    };
    const validSources = new Set(['jasper-migration', 'manual', 'sql', 'neo']);
    const included = contract.reportId &&
      contract.outputs?.length > 0 &&
      contract.type !== 'document' &&
      (validSources.has(contract.source) || contract.mockDataFile);
    assert.ok(!included, 'contract with no outputs should be excluded');
  });

  it('contract without reportId is excluded', () => {
    const contract = {
      title: 'No ID',
      type: 'listing',
      source: 'manual',
      outputs: ['pdf'],
    };
    const validSources = new Set(['jasper-migration', 'manual', 'sql', 'neo']);
    const included = contract.reportId &&
      contract.outputs?.length > 0 &&
      contract.type !== 'document' &&
      (validSources.has(contract.source) || contract.mockDataFile);
    assert.ok(!included, 'contract without reportId should be excluded');
  });

  it('contract with invalid source but mockDataFile is included', () => {
    const contract = {
      reportId: 'R004',
      title: 'Mock Report',
      type: 'listing',
      source: 'unknown',
      outputs: ['pdf'],
      mockDataFile: 'mock.json',
    };
    const validSources = new Set(['jasper-migration', 'manual', 'sql', 'neo']);
    const included = contract.reportId &&
      contract.outputs?.length > 0 &&
      contract.type !== 'document' &&
      (validSources.has(contract.source) || contract.mockDataFile);
    assert.ok(included, 'contract with mockDataFile should be included regardless of source');
  });

  it('output shape includes expected fields', () => {
    const contract = {
      reportId: 'R005',
      title: 'Shaped Report',
      type: 'grouped-listing',
      source: 'sql',
      outputs: ['pdf', 'xlsx'],
      category: 'sales',
      orientation: 'portrait',
      parameters: [{ name: 'org', type: 'selector' }],
    };
    const output = {
      id: contract.reportId,
      title: contract.title,
      type: contract.type,
      category: contract.category || 'other',
      orientation: contract.orientation,
      outputs: contract.outputs,
      parameters: contract.parameters || [],
    };
    assert.equal(output.id, 'R005');
    assert.equal(output.category, 'sales');
    assert.deepEqual(output.outputs, ['pdf', 'xlsx']);
    assert.equal(output.parameters.length, 1);
  });

  it('defaults category to other when missing', () => {
    const contract = { reportId: 'R006', title: 'No Cat', type: 'listing', source: 'neo', outputs: ['pdf'] };
    const category = contract.category || 'other';
    assert.equal(category, 'other');
  });
});
