// @covers tools/app-shell/src/lib/coreValidation.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateRow } from '@etendosoftware/app-shell-core/lib/import/validateRows.js';
import { buildFieldConstraints, buildFieldIdentities } from '@etendosoftware/app-shell-core/lib/import/fieldConstraints.js';

/**
 * ETP-4557 — the review queue (`ImportDialog.revalidate`) builds `fieldConstraints` /
 * `fieldIdentities` from the window's import fields and hands them to `validateRow`. This runs
 * exactly that pipeline against the Contacts import descriptor, with the descriptor's own
 * example values (the case a length constraint copied from the stored column would break).
 */
const contract = JSON.parse(readFileSync(
  resolve(import.meta.dirname, '../../../../../artifacts/contacts/contract.json'), 'utf8'));
const fields = contract.frontendContract.window.import.fields;
const options = {
  requiredTargets: [],
  emailTargets: fields.filter((f) => f.isEmail).map((f) => f.target),
  phoneTargets: [],
  fieldConstraints: buildFieldConstraints(fields),
  fieldIdentities: buildFieldIdentities(fields),
};
const exampleRow = Object.fromEntries(fields.filter((f) => f.example != null).map((f) => [f.target, f.example]));

describe('import review queue validation built from the Contacts contract (ETP-4557)', () => {
  it('a row built from the descriptor examples is valid', () => {
    const { valid, errors } = validateRow(exampleRow, options);
    expect(errors).toEqual([]);
    expect(valid).toBe(true);
  });

  it('boolean, enum and foreign-key columns carry no length constraint (their cells are labels)', () => {
    const constraints = buildFieldConstraints(fields);
    for (const f of fields.filter((x) => ['boolean', 'enum', 'foreignKey'].includes(x.type))) {
      expect(constraints[f.target]).toBeUndefined();
    }
  });

  it('flags an over-length phone with the same MAX_LENGTH code the form and grid return', () => {
    const { valid, errors } = validateRow({ ...exampleRow, etgoPhone: '1234567890123456' }, options);
    expect(valid).toBe(false);
    expect(errors.filter((e) => e.target === 'etgoPhone').map((e) => e.code)).toContain('MAX_LENGTH');
  });

  it('reports several simultaneous errors on one row and clears them after correction', () => {
    const bad = { ...exampleRow, etgoPhone: '1234567890123456', name: 'x'.repeat(61), etgoEmail: 'nope' };
    const first = validateRow(bad, options);
    expect(new Set(first.errors.map((e) => e.target))).toEqual(new Set(['etgoPhone', 'name', 'etgoEmail']));
    expect(validateRow({ ...bad, etgoPhone: '910000001', name: 'ok', etgoEmail: 'a@b.co' }, options).valid).toBe(true);
  });
});
