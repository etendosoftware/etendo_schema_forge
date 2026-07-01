import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contract = JSON.parse(
  readFileSync(join(__dirname, '..', 'contract.json'), 'utf8'),
);
const pageSrc = readFileSync(
  join(
    __dirname,
    '..',
    'generated',
    'web',
    'monitor-verifactu',
    'CabeceraDeEmisorPage.jsx',
  ),
  'utf8',
);

const entity = 'cabeceraDeEmisor';
const frontendFields = contract.frontendContract.entities[entity].fields;
const backendFields = contract.backendContract.entities[entity].fields;
const frontendActions = contract.frontendContract.actions ?? [];

describe('monitor-verifactu contract integrity (ETP-4237 remove refreshData)', () => {
  it('refreshData is absent from frontendContract fields', () => {
    const field = frontendFields.find((f) => f.name === 'refreshData');
    assert.equal(field, undefined, 'refreshData must not appear in frontend fields');
  });

  it('if refreshData is in backendContract it must be discarded', () => {
    const field = backendFields.find((f) => f.name === 'refreshData');
    if (field) {
      assert.equal(field.visibility, 'discarded', 'refreshData must be discarded, not exposed');
    }
  });

  it('refreshData action is not exposed in the frontend actions', () => {
    const refresh = frontendActions.filter(
      (a) => a.entity === entity && a.field === 'refreshData',
    );
    assert.equal(refresh.length, 0, 'refreshData action must not be in frontendContract.actions');
  });

  it('refreshData is not listed in the generated processes array', () => {
    const processesBlock = pageSrc.match(
      /\/\/ @sf-generated-start processes:cabeceraDeEmisor([\s\S]*?)\/\/ @sf-generated-end processes:cabeceraDeEmisor/,
    );
    assert.ok(processesBlock, 'processes block must be present in CabeceraDeEmisorPage.jsx');
    assert.doesNotMatch(processesBlock[1], /refreshData/);
  });

  it('core frontend fields are still present (regression guard)', () => {
    const names = frontendFields.map((f) => f.name);
    for (const expected of ['active', 'tAXType', 'issuerNIF', 'nextSendWaitTime']) {
      assert.ok(names.includes(expected), `frontend field '${expected}' must remain`);
    }
  });
});
