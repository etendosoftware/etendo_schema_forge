// @covers tools/app-shell/src/windows/custom/fiscal-models/models/390/fileValidation390.js
//
// Modelo 390 — the AEAT validator's answer about the generated file, as the page reads it: a
// known outcome is kept, anything else is "not validated" (an unchecked file is never presented
// as a validated one), and errors / warnings are normalised to `{ code, message }`.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FILE_VALIDATION, fileValidationOf } from '../fileValidation390.js';

describe('fileValidationOf', () => {
  it('keeps each known outcome', () => {
    for (const outcome of ['accepted', 'rejected', 'connection_failure', 'not_validated']) {
      assert.deepEqual(fileValidationOf({ outcome }), { outcome, errors: [], warnings: [] });
    }
    assert.deepEqual(Object.values(FILE_VALIDATION).sort(), ['accepted', 'connection_failure', 'not_validated', 'rejected']);
  });

  it('reads an unknown outcome as not validated', () => {
    for (const outcome of ['ACCEPTED', 'ok', '', null, 1, true]) {
      assert.equal(fileValidationOf({ outcome }).outcome, 'not_validated');
    }
  });

  it('reads a missing or malformed block as not validated, with empty lists', () => {
    for (const raw of [undefined, null, {}, 'accepted', 0, []]) {
      assert.deepEqual(fileValidationOf(raw), { outcome: 'not_validated', errors: [], warnings: [] });
    }
  });

  it('normalises errors and warnings to { code, message } strings, dropping extra fields', () => {
    const res = fileValidationOf({
      outcome: 'rejected',
      errors: [{ code: '390E01', message: 'Casilla 33 incorrecta', box: 33 }, { code: 12, message: 34 }],
      warnings: [{ code: '390A01', message: 'Aviso' }],
    });
    assert.deepEqual(res, {
      outcome: 'rejected',
      errors: [{ code: '390E01', message: 'Casilla 33 incorrecta' }, { code: '12', message: '34' }],
      warnings: [{ code: '390A01', message: 'Aviso' }],
    });
  });

  it('keeps an entry with only a code or only a message and drops the empty ones', () => {
    const res = fileValidationOf({
      outcome: 'accepted',
      errors: [{ code: 'E1' }, { message: 'only text' }, {}, null, { code: null, message: undefined }],
      warnings: [null, undefined, { code: '', message: '' }],
    });
    assert.deepEqual(res.errors, [{ code: 'E1', message: '' }, { code: '', message: 'only text' }]);
    assert.deepEqual(res.warnings, []);
  });

  it('ignores errors / warnings that are not lists', () => {
    const res = fileValidationOf({ outcome: 'rejected', errors: 'boom', warnings: { code: 'x' } });
    assert.deepEqual(res, { outcome: 'rejected', errors: [], warnings: [] });
  });
});
