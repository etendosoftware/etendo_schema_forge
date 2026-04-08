import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import Ajv from 'ajv';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROCESSES_PATH = resolve(__dirname, '../../artifacts/sales-order/processes.json');
const hasProcesses = existsSync(PROCESSES_PATH);
const hasProcessEntries = hasProcesses &&
  JSON.parse(readFileSync(PROCESSES_PATH, 'utf8')).processes?.length > 0;

describe('processes.json', () => {
  it('is valid against processes.schema.json', { skip: !hasProcessEntries && 'no processes defined yet' }, async () => {
    const schema = JSON.parse(await readFile(resolve(__dirname, '../../schemas/processes.schema.json'), 'utf8'));
    const stepOpSchema = JSON.parse(await readFile(resolve(__dirname, '../../schemas/step-operation.schema.json'), 'utf8'));
    const data = JSON.parse(await readFile(PROCESSES_PATH, 'utf8'));
    const ajv = new Ajv({ allErrors: true, validateSchema: false });
    ajv.addSchema(stepOpSchema, 'step-operation.schema.json');
    const validate = ajv.compile(schema);
    const valid = validate(data);
    if (!valid) console.error(validate.errors);
    assert.ok(valid, `Validation errors: ${JSON.stringify(validate.errors, null, 2)}`);
  });

  it('defines completeOrder with >= 3 edge cases', { skip: !hasProcessEntries && 'no processes defined yet' }, async () => {
    const data = JSON.parse(await readFile(PROCESSES_PATH, 'utf8'));
    const complete = data.processes.find(p => p.name === 'completeOrder');
    assert.ok(complete, 'completeOrder process must exist');
    assert.ok(complete.edgeCases.length >= 3, `Need >= 3 edge cases, has ${complete.edgeCases.length}`);
    assert.ok(complete.preconditions.length >= 1, 'Must have preconditions');
  });

  it('defines voidOrder with >= 3 edge cases', { skip: !hasProcessEntries && 'no processes defined yet' }, async () => {
    const data = JSON.parse(await readFile(PROCESSES_PATH, 'utf8'));
    const voidProc = data.processes.find(p => p.name === 'voidOrder');
    assert.ok(voidProc, 'voidOrder process must exist');
    assert.ok(voidProc.edgeCases.length >= 3, `Need >= 3 edge cases, has ${voidProc.edgeCases.length}`);
  });

  it('all steps use only validate|mutation|forEach types', { skip: !hasProcessEntries && 'no processes defined yet' }, async () => {
    const data = JSON.parse(await readFile(PROCESSES_PATH, 'utf8'));
    const allowed = ['validate', 'mutation', 'forEach'];
    for (const proc of data.processes) {
      for (const step of proc.steps) {
        assert.ok(allowed.includes(step.type), `Step "${step.name}" in "${proc.name}" uses disallowed type: ${step.type}`);
      }
    }
  });
});
