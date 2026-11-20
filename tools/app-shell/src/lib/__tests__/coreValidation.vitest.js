// @covers tools/app-shell/src/lib/coreValidation.js
import { describe, it, expect } from 'vitest';
import {
  getFieldError, getFieldErrors, getFirstViolation, getNativeInputProps, mapBackendFieldErrors, structuredBackendMessage, safeBackendMessage, ERROR_CODES,
} from '../coreValidation.js';
import { validateRow } from '@etendosoftware/app-shell-core/lib/import/validateRows.js';

const name = { key: 'name', type: 'text', maxLength: 5 };
const email = { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'text' };
const age = { key: 'age', type: 'number', validation: { minimum: 1, maximum: 10 } };

describe('coreValidation — one contract, one code', () => {
  it('returns the same code for the same value on a flat-maxLength field and a declared one', () => {
    const declared = { key: 'name', validation: { maxLength: 5 } };
    expect(getFieldError(name, 'abcdefg').code).toBe(ERROR_CODES.MAX_LENGTH);
    expect(getFieldError(declared, 'abcdefg').code).toBe(ERROR_CODES.MAX_LENGTH);
  });
  it('maps MAX_LENGTH to a localizable descriptor with params', () => {
    expect(getFieldError(name, 'abcdefg')).toMatchObject({ key: 'fieldMaxLengthError', params: { maxLength: 5 } });
  });
  it('treats optional empty values as valid', () => {
    expect(getFieldError(name, '')).toBeNull();
    expect(getFieldError(email, '  ')).toBeNull();
    expect(getFieldError(age, null)).toBeNull();
  });
  it('infers email format through the engine and clears on a valid correction', () => {
    expect(getFieldError(email, 'nope')).toMatchObject({ key: 'sendModalInvalidEmail', code: ERROR_CODES.INVALID_FORMAT });
    expect(getFieldError(email, 'a@b.co')).toBeNull();
  });
  it('enforces declared minimum / maximum', () => {
    expect(getFieldError(age, 0).code).toBe(ERROR_CODES.MINIMUM);
    expect(getFieldError(age, 11).code).toBe(ERROR_CODES.MAXIMUM);
    expect(getFieldError(age, 5)).toBeNull();
  });
  it('does not emit a native max from the flat max, only from a declared maximum', () => {
    expect(getNativeInputProps({ key: 'pct', max: 100 })).not.toHaveProperty('max');
  });
  it('does not promote the flat max (silently clamped elsewhere)', () => {
    expect(getFieldError({ key: 'pct', max: 100 }, 150)).toBeNull();
  });
  it('rejects a website that is not a secure, domain-shaped URL, honouring inputPrefix', () => {
    const web = { key: 'etgoWeb', column: 'EM_Etgo_Web', type: 'text', inputPrefix: 'https://' };
    expect(getFieldError(web, 'asda')).not.toBeNull();
    expect(getFieldError(web, 'example.com')).toBeNull();
  });
  it('legacy-invalid untouched value is skipped, changed invalid value is blocked', () => {
    expect(getFieldErrors(name, 'abcdefg', { hasPrevious: true, previous: 'abcdefg' })).toEqual([]);
    expect(getFieldErrors(name, 'abcdefgh', { hasPrevious: true, previous: 'abcdefg' })).toHaveLength(1);
  });
  it('legacy contracts without constraint metadata never fail', () => {
    expect(getFieldError({ key: 'x', type: 'text' }, 'anything'.repeat(100))).toBeNull();
  });
  it('record-level violation points at the offending field key', () => {
    expect(getFirstViolation([name, email], { name: 'ok', etgoEmail: 'bad' }))
      .toMatchObject({ key: 'etgoEmail', errorKey: 'sendModalInvalidEmail', code: 'INVALID_FORMAT' });
    expect(getFirstViolation([name, email], { name: 'ok', etgoEmail: 'a@b.co' })).toBeNull();
  });
});

describe('coreValidation — native attributes', () => {
  it('exposes maxLength, min, max and inputMode when declared', () => {
    expect(getNativeInputProps({ ...email, maxLength: 60 })).toEqual({ maxLength: 60, inputMode: 'email' });
    expect(getNativeInputProps(age)).toEqual({ min: 1, max: 10 });
    expect(getNativeInputProps({ key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'text' })).toEqual({ inputMode: 'tel' });
  });
  it('emits nothing when nothing is declared', () => {
    expect(getNativeInputProps({ key: 'x', type: 'text' })).toEqual({});
  });
});

describe('coreValidation — backend structured errors', () => {
  it('maps codes to field descriptors and drops raw internal messages', () => {
    const out = mapBackendFieldErrors({ fieldErrors: [
      { field: 'name', code: 'MAX_LENGTH', max: 5 },
      { field: 'etgoEmail', code: 'SQL_STATE_23505', message: 'ERROR: duplicate key at org.hibernate...' },
    ] });
    expect(out).toEqual({ name: { key: 'fieldMaxLengthError', params: { maxLength: 5 } } });
    expect(JSON.stringify(out)).not.toMatch(/hibernate|duplicate/);
  });
});

describe('coreValidation — same code across form, grid and import (ETP-4557)', () => {
  const legacy = [
    { key: 'website', column: 'Website', type: 'text' },
    { key: 'phone', column: 'Phone', type: 'text' },
    { key: 'etgoEmail', column: 'EM_Etgo_Email', type: 'text' },
  ];
  const declared = legacy.map((f, i) => ({ ...f, validation: { format: ['url', 'phone', 'email'][i], ...(i === 0 ? { allowedSchemes: ['https'] } : {}) } }));
  const values = { website: 'https://asda', phone: 'abc', etgoEmail: 'bad' };
  const identities = Object.fromEntries(legacy.map((f) => [f.key, { column: f.column, type: f.type }]));

  for (const [label, fields] of [['legacy contract (inferred)', legacy], ['contract declaring format', declared]]) {
    it(`form, grid and import agree: ${label}`, () => {
      const importConstraints = label.startsWith('contract')
        ? Object.fromEntries(declared.map((f) => [f.key, f.validation])) : {};
      const imp = validateRow(values, { fieldConstraints: importConstraints, fieldIdentities: identities });
      for (const f of fields) {
        const gridCode = getFieldError(f, values[f.key]).code;
        const formCode = getFirstViolation([f], values).code;
        const importCodes = imp.errors.filter((e) => e.target === f.key).map((e) => e.code);
        expect(formCode).toBe(gridCode);
        // A website import cell is a bare host ("acme.com", the descriptor prefixes the scheme),
        // so the strict https rule is the form/grid's; every other format agrees in import.
        if (f.key !== 'website') expect(importCodes).toContain(gridCode);
      }
    });
  }
  it('a 16-character Contacts phone fails with the same code in form, grid and import (declared maxLength 15)', () => {
    const phone = { key: 'etgoPhone', column: 'EM_Etgo_Phone', type: 'text', maxLength: 15, validation: { maxLength: 15 } };
    const value = '1234567890123456';
    const formCode = getFirstViolation([phone], { etgoPhone: value }).code;
    const gridCode = getFieldError(phone, value).code;
    const imp = validateRow({ etgoPhone: value }, { fieldConstraints: { etgoPhone: phone.validation } });
    expect([formCode, gridCode]).toEqual(['MAX_LENGTH', 'MAX_LENGTH']);
    expect(imp.errors.map((e) => e.code)).toContain('MAX_LENGTH');
  });
  it('valid values pass everywhere', () => {
    const ok = { website: 'https://acme.com', phone: '+34 910', etgoEmail: 'a@b.co' };
    expect(legacy.every((f) => getFieldError(f, ok[f.key]) === null)).toBe(true);
    expect(validateRow(ok, { fieldIdentities: identities }).valid).toBe(true);
  });
});

describe('coreValidation — error association and backend responses', () => {
  it('adds aria-invalid / aria-describedby only when an error is present', () => {
    expect(getNativeInputProps({ key: 'name', maxLength: 5 })).not.toHaveProperty('aria-invalid');
    expect(getNativeInputProps({ key: 'name', maxLength: 5 }, { key: 'x' }))
      .toMatchObject({ 'aria-invalid': true, 'aria-describedby': 'error-name-msg' });
  });
  it('structuredBackendMessage localizes a known code and hides SQL/stack text', async () => {
    const ui = (k, p) => `${k}:${JSON.stringify(p)}`;
    const known = new Response(JSON.stringify({ error: { fieldErrors: [{ field: 'name', code: 'MAX_LENGTH', max: 5 }] } }), { status: 400 });
    expect(await structuredBackendMessage(known, ui)).toBe('fieldMaxLengthError:{"maxLength":5}');
    const leaky = new Response(JSON.stringify({ error: { message: 'ERROR: duplicate key org.hibernate.exception at Foo.java:12' } }), { status: 500 });
    expect(await structuredBackendMessage(leaky, ui)).toBeNull();
  });
});

describe('safeBackendMessage', () => {
  const ui = (k) => `[${k}]`;
  it('replaces SQL / stack / internal text with the localized generic message', () => {
    for (const leak of [
      'ERROR: duplicate key value violates unique constraint (SQLException)',
      'org.hibernate.exception.ConstraintViolationException: could not execute statement',
      'java.lang.NullPointerException at com.foo.Bar.run(Bar.java:42)',
      'INSERT INTO c_bpartner (a) VALUES (1) WHERE x',
    ]) expect(safeBackendMessage(leak, ui)).toBe('[backendGenericError]');
  });
  it('catches real PostgreSQL / Hibernate / stack payloads without help from keywords', () => {
    for (const leak of [
      'ERROR: duplicate key value violates unique constraint "c_bpartner_key"',
      'ERROR: null value in column "name" violates not-null constraint',
      'could not execute statement; SQL [n/a]; constraint [c_bpartner_key]',
      'ConstraintViolationException: could not execute statement',
      'Detail: Key (value)=(ACME) already exists.\nDETAIL: Key (value)=(ACME) already exists.',
      '\tat org.openbravo.dal.service.OBDal.save(OBDal.java:221)',
      'org.postgresql.util.PSQLException: ERROR: insert or update on table "c_order" violates foreign key constraint "c_order_bp"',
      'ORA-00001: unique constraint (SYS.C001) violated',
      'insert o update en la tabla «pedido_linea» viola la llave foránea «fk_producto» en la tabla «producto»',
    ]) expect(safeBackendMessage(leak, ui)).toBe('[backendGenericError]');
  });
  it('keeps business messages that merely contain SQL-like or diagnostic words', () => {
    for (const ok of [
      'Cannot delete a line from a processed order',
      'You cannot select a product from another organization',
      'Unable to update the order. Set a warehouse first',
      'Error: select a warehouse',
      'See the detail of the shipment before continuing',
      'Give a hint to the customer',
    ]) expect(safeBackendMessage(ok, ui)).toBe(ok);
  });
  it('keeps ordinary messages, including ones that contain the word "error"', () => {
    expect(safeBackendMessage('Network error, please retry', ui)).toBe('Network error, please retry');
    expect(safeBackendMessage('The tax ID check digit does not match. Review the number.', ui)).toContain('tax ID');
  });
  it('keeps an ordinary business message', () => {
    expect(safeBackendMessage('Country is required', ui)).toBe('Country is required');
  });
});
