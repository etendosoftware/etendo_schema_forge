import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { QUERIES, rowsToCsv, buildProcessRaw } from '../src/extract-from-process.js';
import {
  validatePipelineInput,
  buildProcessPipelineSteps,
} from '../src/pipeline.js';

describe('extract-from-process QUERIES', () => {
  it('has process-metadata query', () => {
    assert.ok(QUERIES['process-metadata']);
    assert.ok(QUERIES['process-metadata'].includes('AD_Process'));
    assert.ok(QUERIES['process-metadata'].includes('AD_Process_ID'));
  });

  it('has process-parameters query', () => {
    assert.ok(QUERIES['process-parameters']);
    assert.ok(QUERIES['process-parameters'].includes('AD_Process_Para'));
    assert.ok(QUERIES['process-parameters'].includes('AD_Reference'));
    assert.ok(QUERIES['process-parameters'].includes('ORDER BY'));
  });

  it('both queries use parameterized $1 placeholder', () => {
    assert.ok(QUERIES['process-metadata'].includes('$1'));
    assert.ok(QUERIES['process-parameters'].includes('$1'));
  });

  it('both queries filter by IsActive', () => {
    assert.ok(QUERIES['process-metadata'].includes("IsActive = 'Y'"));
    assert.ok(QUERIES['process-parameters'].includes("IsActive = 'Y'"));
  });
});

describe('rowsToCsv', () => {
  it('returns empty string for empty array', () => {
    assert.equal(rowsToCsv([]), '');
  });

  it('converts rows to CSV with headers', () => {
    const rows = [{ name: 'foo', value: '1' }, { name: 'bar', value: '2' }];
    const csv = rowsToCsv(rows);
    const lines = csv.trim().split('\n');
    assert.equal(lines[0], 'name,value');
    assert.equal(lines[1], 'foo,1');
    assert.equal(lines[2], 'bar,2');
  });

  it('quotes values with commas', () => {
    const rows = [{ name: 'foo,bar', value: '1' }];
    const csv = rowsToCsv(rows);
    assert.ok(csv.includes('"foo,bar"'));
  });
});

describe('buildProcessRaw', () => {
  const mockMetadata = [{
    ad_process_id: 'TEST123',
    name: 'Test Process',
    description: 'A test',
    help: null,
    uipattern: 'S',
    javaclassname: 'com.test.Proc',
    procedurename: null,
    isreport: 'N',
    isbackground: 'N',
  }];

  const mockParams = [
    {
      ad_process_para_id: 'P1',
      name: 'dateFrom',
      columnname: 'DateFrom',
      description: 'Start date',
      ad_reference_id: '15',
      ad_reference_value_id: null,
      ismandatory: 'Y',
      isrange: 'N',
      defaultvalue: '@#Date@',
      seqno: '10',
      fieldlength: '0',
      ad_val_rule_id: null,
      reference_name: 'Date',
    },
    {
      ad_process_para_id: 'P2',
      name: 'partner',
      columnname: 'C_BPartner_ID',
      description: null,
      ad_reference_id: '19',
      ad_reference_value_id: null,
      ismandatory: 'N',
      isrange: 'N',
      defaultvalue: null,
      seqno: '20',
      fieldlength: '32',
      ad_val_rule_id: null,
      reference_name: 'TableDir',
    },
  ];

  it('builds correct process structure', () => {
    const result = buildProcessRaw(mockMetadata, mockParams);
    assert.equal(result.process.id, 'TEST123');
    assert.equal(result.process.name, 'Test Process');
    assert.equal(result.process.uiPattern, 'S');
    assert.equal(result.process.isReport, false);
    assert.equal(result.process.isBackground, false);
  });

  it('builds correct parameter structure', () => {
    const result = buildProcessRaw(mockMetadata, mockParams);
    assert.equal(result.parameters.length, 2);
    assert.equal(result.parameters[0].name, 'dateFrom');
    assert.equal(result.parameters[0].column, 'DateFrom');
    assert.equal(result.parameters[0].referenceId, '15');
    assert.equal(result.parameters[0].mandatory, true);
    assert.equal(result.parameters[0].defaultValue, '@#Date@');
    assert.equal(result.parameters[0].seqNo, 10);
  });

  it('handles non-mandatory parameters', () => {
    const result = buildProcessRaw(mockMetadata, mockParams);
    assert.equal(result.parameters[1].mandatory, false);
    assert.equal(result.parameters[1].defaultValue, null);
  });

  it('throws for empty metadata', () => {
    assert.throws(() => buildProcessRaw([], mockParams), /not found/);
  });
});

describe('validatePipelineInput — process mode', () => {
  it('accepts valid process input', () => {
    const result = validatePipelineInput({ processId: '123', processName: 'test' });
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'process');
  });

  it('rejects process input without processName', () => {
    const result = validatePipelineInput({ processId: '123' });
    assert.equal(result.valid, false);
    assert.ok(result.error.includes('processName'));
  });

  it('still accepts window input (backwards compat)', () => {
    const result = validatePipelineInput({ windowId: '143', windowName: 'sales-order' });
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'window');
  });

  it('process mode takes priority over window mode', () => {
    const result = validatePipelineInput({ processId: '123', processName: 'test', windowId: '143', windowName: 'so' });
    assert.equal(result.mode, 'process');
  });

  it('menu mode takes priority over process mode', () => {
    const result = validatePipelineInput({ menuId: '123', processId: '456', processName: 'test' });
    assert.equal(result.mode, 'menu');
  });
});

describe('buildProcessPipelineSteps', () => {
  it('returns 5 steps', () => {
    const steps = buildProcessPipelineSteps();
    assert.equal(steps.length, 5);
  });

  it('starts with extract-process', () => {
    const steps = buildProcessPipelineSteps();
    assert.equal(steps[0].name, 'extract-process');
    assert.equal(steps[0].phase, 'P1');
  });

  it('ends with run-tests', () => {
    const steps = buildProcessPipelineSteps();
    assert.equal(steps[steps.length - 1].name, 'run-tests');
  });

  it('has correct step names in order', () => {
    const steps = buildProcessPipelineSteps();
    const names = steps.map(s => s.name);
    assert.deepEqual(names, [
      'extract-process',
      'generate-process-contract',
      'push-process-to-neo',
      'generate-process-frontend',
      'run-tests',
    ]);
  });

  it('all steps have name, description, and phase', () => {
    for (const step of buildProcessPipelineSteps()) {
      assert.ok(step.name);
      assert.ok(step.description);
      assert.ok(step.phase);
    }
  });

  it('no steps are interactive', () => {
    const steps = buildProcessPipelineSteps();
    assert.ok(steps.every(s => !s.interactive));
  });
});
