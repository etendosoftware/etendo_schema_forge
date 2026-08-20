import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

/**
 * Behavioural unit tests for the save/validation helpers exported by
 * useEntity.js — `getReadOnly`, `getVisible`, the required/format/numeric
 * collectors, the payload builders and the post-save resolution helpers.
 *
 * They are exported from useEntity.js, so — same as
 * useEntity-delete-errors.test.js — the real module is imported and exercised
 * for real (no mirror/re-implementation). See that file's header comment for
 * why the module-customization-hooks dance below is needed (Vite `@/` alias +
 * JSX in the transitive import graph).
 */
const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT_URL = pathToFileURL(resolve(SRC_DIR, '..', '..', '..') + '/').href;
const APP_SHELL_CORE_URL = pathToFileURL(
  resolve(SRC_DIR, '..', '..', '..', 'node_modules', '@etendosoftware', 'app-shell-core') + '/'
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      let target = resolve(SRC_DIR, specifier.slice(2));
      if (!extname(target) && existsSync(`${target}/index.js`)) {
        target = `${target}/index.js`;
      }
      return nextResolve(pathToFileURL(target).href, context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const isWorkspace = url.startsWith(REPO_ROOT_URL) && !url.includes('/node_modules/');
    const isAppShellCore = url.startsWith(APP_SHELL_CORE_URL);
    if (url.endsWith('.jsx') || ((isWorkspace || isAppShellCore) && url.endsWith('.js'))) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      const { code } = transformSync(source, {
        loader: url.endsWith('.jsx') ? 'jsx' : 'js',
        format: 'esm',
        sourcefile: url,
        define: {
          'import.meta.env': '{}',
          'import.meta.glob': '__viteGlobStub__',
        },
      });
      return { format: 'module', shortCircuit: true, source: code };
    }
    return nextLoad(url, context);
  },
});

globalThis.__viteGlobStub__ = () => ({});

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { pathname: '/', origin: 'http://localhost', href: 'http://localhost/' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = globalThis.window.localStorage;
}
if (typeof globalThis.document === 'undefined') {
  const noopEl = {
    setAttribute: () => {},
    appendChild: () => {},
    insertBefore: () => {},
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
  };
  globalThis.document = {
    documentElement: { lang: 'en', style: {} },
    head: noopEl,
    body: noopEl,
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({ ...noopEl }),
    createTextNode: () => ({}),
    getElementsByTagName: () => [noopEl],
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

const mod = await import('../useEntity.js');
const {
  pickMessage,
  pickMessageFromObject,
  extractErrorMessage,
  parseCriteriaInto,
  normalizeDefaultValue,
  shouldSkipPayloadField,
  getReadOnly,
  getVisible,
  getMissingRequiredFields,
  getInvalidFormatFields,
  getInvalidEmailFields,
  getInvalidWebsiteFields,
  getInvalidPhoneFields,
  getNumericFieldViolation,
  reportInvalidFormatField,
  reportInvalidEmailFields,
  getUrl,
  getMethod,
  buildPatchPayload,
  buildSavePayload,
  handleSaveErrorResponse,
  getSaveSuccessMessage,
  buildCreatePayload,
  reportMissingRequiredFields,
  shouldRefetchAfterSave,
  resolveSavedRecordAfterSave,
  showSaveSuccessToast,
  isEmailField,
} = mod;

/** Identity-ish i18n stub: returns the key, interpolating `{param}` placeholders. */
function interpolatingUi(dictionary = {}) {
  return (key, params) => {
    let text = dictionary[key] ?? key;
    if (params) {
      Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
    }
    return text;
  };
}

/** Minimal call-recording spy for the plain node:test runner. */
function spy(impl = () => {}) {
  const fn = (...args) => { fn.calls.push(args); return impl(...args); };
  fn.calls = [];
  return fn;
}

/** Fake NEO Headless error response — read through `data.error.message`. */
function neoErrorRes(message, status = 500) {
  return { status, json: async () => ({ error: { message } }) };
}

// ---------------------------------------------------------------------------
// Message extraction
// ---------------------------------------------------------------------------

describe('pickMessage / pickMessageFromObject', () => {
  it('returns null for empty-ish nodes', () => {
    assert.equal(pickMessage(null), null);
    assert.equal(pickMessage(undefined), null);
    assert.equal(pickMessage(''), null);
    assert.equal(pickMessage(0), null);
  });

  it('trims plain strings and rejects whitespace-only ones', () => {
    assert.equal(pickMessage('  boom  '), 'boom');
    assert.equal(pickMessage('   '), null);
  });

  it('walks arrays and returns the first usable message', () => {
    assert.equal(pickMessage(['', null, '  second  ']), 'second');
    assert.equal(pickMessage([]), null);
    assert.equal(pickMessage([null, '']), null);
  });

  it('prefers the documented keys over arbitrary ones', () => {
    assert.equal(pickMessageFromObject({ other: 'z', message: 'a' }), 'a');
    assert.equal(pickMessageFromObject({ other: 'z', errorMessage: 'b' }), 'b');
    assert.equal(pickMessageFromObject({ other: 'z', text: 'c' }), 'c');
    assert.equal(pickMessageFromObject({ other: 'z', description: 'd' }), 'd');
    assert.equal(pickMessageFromObject({ other: 'z', title: 'e' }), 'e');
  });

  it('falls back to any nested value when no preferred key matches', () => {
    assert.equal(pickMessageFromObject({ deep: { nested: ['found'] } }), 'found');
    assert.equal(pickMessageFromObject({}), null);
  });

  it('returns null for non-object nodes', () => {
    assert.equal(pickMessageFromObject(42), null);
  });
});

describe('extractErrorMessage', () => {
  it('maps a Postgres not-null column error to the labelled required message', async () => {
    const res = neoErrorRes('ERROR: null value in column "name" of relation "c_bpartner" violates not-null constraint');
    const msg = await extractErrorMessage(res, interpolatingUi({
      validationFieldName: 'Name',
      validationRequiredField: 'The field "{field}" is required.',
    }));
    assert.equal(msg, 'The field "Name" is required.');
  });

  it('uses the per-table label map when the relation declares one', async () => {
    const res = neoErrorRes('null value in column "em_obtik_tax_id_key" of relation "c_bpartner" violates not-null constraint');
    const msg = await extractErrorMessage(res, interpolatingUi({
      validationFieldNifCountryKey: 'NIF / Country key',
      validationRequiredField: 'The field "{field}" is required.',
    }));
    assert.equal(msg, 'The field "NIF / Country key" is required.');
  });

  it('humanizes an unmapped column name instead of leaking the raw column', async () => {
    const res = neoErrorRes('null value in column "em_custom_field" of relation "c_order" violates not-null constraint');
    const msg = await extractErrorMessage(res, interpolatingUi({
      validationRequiredField: 'The field "{field}" is required.',
    }));
    assert.equal(msg, 'The field "Em Custom Field" is required.');
  });

  it('falls back to the generic required message for a bare not-null constraint', async () => {
    const res = neoErrorRes('violates not-null constraint');
    const msg = await extractErrorMessage(res, interpolatingUi({
      validationRequiredGeneric: 'A required field is missing.',
    }));
    assert.equal(msg, 'A required field is missing.');
  });

  it('maps a raw unique-constraint violation to the duplicate-record message', async () => {
    const res = neoErrorRes('duplicate key value violates unique constraint "c_bpartner_value_uk"');
    const msg = await extractErrorMessage(res, interpolatingUi({
      validationDuplicateRecord: 'A record with the same value already exists.',
    }));
    assert.equal(msg, 'A record with the same value already exists.');
  });

  it('maps the Spanish AD "relacionado con otros elementos" wording to the delete-blocked key', async () => {
    const res = neoErrorRes('No se puede eliminar este registro porque está relacionado con otros elementos existentes.');
    const msg = await extractErrorMessage(res, interpolatingUi({
      deleteBlockedByReferences: 'This record cannot be deleted because it has associated records.',
    }));
    assert.equal(msg, 'This record cannot be deleted because it has associated records.');
  });

  it('maps the Spanish AD-translated unique sentence without leaking field names (ETP-4597)', async () => {
    const res = neoErrorRes(
      'Ya existe un/a Categoría del producto con el mismo (Entidad, Organización, Identificador). '
      + '(Entidad, Organización, Identificador) debe ser único. Cambie los valores introducidos'
    );
    const msg = await extractErrorMessage(res, interpolatingUi({
      validationDuplicateIdentifier: 'A record with the same identifier already exists. Please enter a different one.',
    }));
    assert.equal(msg, 'A record with the same identifier already exists. Please enter a different one.');
    assert.ok(!/Entidad/.test(msg));
  });

  it('maps the English AD-translated unique sentence as well', async () => {
    const res = neoErrorRes(
      'There is already a Product Category with the same (Client, Organization, Identifier). '
      + '(Client, Organization, Identifier) must be unique. Change the entered values'
    );
    const msg = await extractErrorMessage(res, interpolatingUi({
      validationDuplicateIdentifier: 'Duplicate identifier',
    }));
    assert.equal(msg, 'Duplicate identifier');
  });

  it('collapses whitespace on an unrecognized backend message', async () => {
    const res = neoErrorRes('Some\n  unmapped\tbackend   failure');
    const msg = await extractErrorMessage(res, interpolatingUi());
    assert.equal(msg, 'Some unmapped backend failure');
  });

  it('decodes HTML entities before matching', async () => {
    const res = neoErrorRes('null value in column &quot;value&quot; of relation &quot;c_bpartner&quot; violates not-null constraint');
    const msg = await extractErrorMessage(res, interpolatingUi({
      validationFieldSearchKey: 'Search key',
      validationRequiredField: 'The field "{field}" is required.',
    }));
    assert.equal(msg, 'The field "Search key" is required.');
  });

  it('reads the Etendo JsonDataService response.error wrapper', async () => {
    const res = { status: 500, json: async () => ({ response: { error: { message: 'service exploded' } } }) };
    assert.equal(await extractErrorMessage(res, interpolatingUi()), 'service exploded');
  });

  it('reads SmartClient response.errors payloads', async () => {
    const res = { status: 400, json: async () => ({ response: { errors: [{ errorMessage: 'bad field' }] } }) };
    assert.equal(await extractErrorMessage(res, interpolatingUi()), 'bad field');
  });

  it('reads a bare top-level message', async () => {
    const res = { status: 400, json: async () => ({ message: 'top level' }) };
    assert.equal(await extractErrorMessage(res, interpolatingUi()), 'top level');
  });

  it('maps the SmartClient status -4 payload to the validation message', async () => {
    const res = { status: 200, json: async () => ({ response: { status: -4 } }) };
    assert.equal(
      await extractErrorMessage(res, interpolatingUi({ validationError: 'Validation error' })),
      'Validation error',
    );
  });

  it('falls back to "Error <status>" when the body is not JSON', async () => {
    const res = { status: 502, json: async () => { throw new Error('not json'); } };
    assert.equal(await extractErrorMessage(res, interpolatingUi({ error: 'Error' })), 'Error 502');
  });

  it('falls back to the English default when no ui function is supplied', async () => {
    const res = { status: 503, json: async () => { throw new Error('not json'); } };
    assert.equal(await extractErrorMessage(res, undefined), 'Error 503');
  });

  it('falls back to the English default when ui echoes the key back', async () => {
    // A `ui` that returns the key unchanged means "no translation registered" —
    // the hardcoded fallback (with its params interpolated) must win.
    const res = neoErrorRes('null value in column "name" of relation "c_order" violates not-null constraint');
    const echoUi = (key) => key;
    const msg = await extractErrorMessage(res, echoUi);
    assert.equal(msg, 'The field "Name" is required.');
  });

  it('interpolates params into the hardcoded fallback when ui is not a function', async () => {
    const res = neoErrorRes('null value in column "name" of relation "c_order" violates not-null constraint');
    const msg = await extractErrorMessage(res, null);
    assert.equal(msg, 'The field "Name" is required.');
  });

  it('ignores an unnamed column and keeps the generic not-null message', async () => {
    // The column capture group requires at least one character, so a quoted
    // empty column name never reaches the labelled branch — it must degrade to
    // the generic required message rather than emitting an empty field name.
    const res = neoErrorRes('null value in column "" of relation "c_order" violates not-null constraint');
    const msg = await extractErrorMessage(res, interpolatingUi({
      validationRequiredGeneric: 'A required field is missing.',
      validationRequiredField: 'The field "{field}" is required.',
    }));
    assert.equal(msg, 'A required field is missing.');
  });
});

// ---------------------------------------------------------------------------
// Criteria / defaults helpers
// ---------------------------------------------------------------------------

describe('parseCriteriaInto', () => {
  it('spreads an array payload into the accumulator', () => {
    const out = [];
    parseCriteriaInto('[{"fieldName":"a"},{"fieldName":"b"}]', out);
    assert.deepEqual(out, [{ fieldName: 'a' }, { fieldName: 'b' }]);
  });

  it('pushes a single object payload', () => {
    const out = [];
    parseCriteriaInto('{"fieldName":"a"}', out);
    assert.deepEqual(out, [{ fieldName: 'a' }]);
  });

  it('silently skips malformed JSON', () => {
    const out = [];
    parseCriteriaInto('{not json', out);
    assert.deepEqual(out, []);
  });
});

describe('normalizeDefaultValue', () => {
  it('converts a dd-MM-yyyy default into an ISO date', () => {
    const normalized = {};
    normalizeDefaultValue('05-03-2026', normalized, 'orderDate');
    assert.equal(normalized.orderDate, '2026-03-05');
  });

  it('unquotes a single-quoted SQL literal and unescapes doubled quotes', () => {
    const normalized = {};
    normalizeDefaultValue("'O''Brien'", normalized, 'name');
    assert.equal(normalized.name, "O'Brien");
  });

  it('stringifies integer enum defaults', () => {
    const normalized = {};
    normalizeDefaultValue(5, normalized, 'priority');
    assert.equal(normalized.priority, '5');
  });

  it('leaves other values untouched', () => {
    const normalized = {};
    normalizeDefaultValue(1.5, normalized, 'qty');
    normalizeDefaultValue('plain', normalized, 'note');
    assert.deepEqual(normalized, {});
  });
});

// ---------------------------------------------------------------------------
// Payload field filtering
// ---------------------------------------------------------------------------

describe('shouldSkipPayloadField', () => {
  const refs = (defaults = [], changed = []) => ({
    backendDefaultKeysRef: { current: new Set(defaults) },
    userChangedKeysRef: { current: new Set(changed) },
  });

  const call = (key, value, opts = {}) => {
    const { backendDefaultKeysRef, userChangedKeysRef } = refs(opts.defaults, opts.changed);
    return shouldSkipPayloadField(
      key,
      value,
      backendDefaultKeysRef,
      userChangedKeysRef,
      new Set(opts.required ?? []),
      opts.contactsBp ?? false,
      opts.editing ?? {},
    );
  };

  it('skips ids, identifier companions and legacy FK keys', () => {
    assert.equal(call('id', 'X'), true);
    assert.equal(call('businessPartner$_identifier', 'ACME'), true);
    // Legacy FK keys are matched by the `<word>_<UPPER>` shape (e.g. organization_ID).
    assert.equal(call('organization_ID', '0'), true);
  });

  it('keeps an all-lowercase key that only looks like a legacy FK', () => {
    assert.equal(call('ad_org_id', '0'), false);
  });

  it('skips empty and nullish values', () => {
    assert.equal(call('name', ''), true);
    assert.equal(call('name', null), true);
    assert.equal(call('name', undefined), true);
  });

  it('skips NEO sequence placeholders', () => {
    assert.equal(call('documentNo', '<10000000>'), true);
    assert.equal(call('documentNo', 'SO-1'), false);
  });

  it('skips untouched short numeric backend defaults', () => {
    assert.equal(call('language', '181', { defaults: ['language'] }), true);
  });

  it('keeps a short numeric default the user explicitly changed', () => {
    assert.equal(call('language', '181', { defaults: ['language'], changed: ['language'] }), false);
  });

  it('keeps a short numeric default when the field is required', () => {
    assert.equal(call('language', '181', { defaults: ['language'], required: ['language'] }), false);
  });

  it('skips contacts billing fields on business-partner create only', () => {
    assert.equal(call('priceList', 'PL', { contactsBp: true }), true);
    assert.equal(call('priceList', 'PL', { contactsBp: false }), false);
  });

  it('skips SmartClient temporary import references on FK-like fields', () => {
    const editing = { businessPartner: '100_BusinessPartner', 'businessPartner$_identifier': 'ACME' };
    assert.equal(call('businessPartner', '100_BusinessPartner', { editing }), true);
  });

  it('keeps a real FK id even when an identifier companion exists', () => {
    const editing = { businessPartner: 'ABC123', 'businessPartner$_identifier': 'ACME' };
    assert.equal(call('businessPartner', 'ABC123', { editing }), false);
  });
});

// ---------------------------------------------------------------------------
// Field predicates and validation collectors
// ---------------------------------------------------------------------------

describe('getReadOnly', () => {
  it('honours the static readOnly flag', () => {
    assert.equal(getReadOnly({})({ key: 'a', readOnly: true }), true);
  });

  it('evaluates readOnlyLogic against the editing record', () => {
    const isReadOnly = getReadOnly({ status: 'CO' });
    assert.equal(isReadOnly({ key: 'a', readOnlyLogic: (r) => r.status === 'CO' }), true);
    assert.equal(isReadOnly({ key: 'b', readOnlyLogic: (r) => r.status === 'DR' }), false);
  });

  it('treats a throwing readOnlyLogic as editable', () => {
    assert.equal(getReadOnly({})({ key: 'a', readOnlyLogic: () => { throw new Error('boom'); } }), false);
  });

  it('defaults to editable when no logic is declared', () => {
    assert.equal(getReadOnly({})({ key: 'a' }), false);
  });
});

describe('getVisible', () => {
  it('defaults to visible when no displayLogic is declared', () => {
    assert.equal(getVisible({})({ key: 'a' }), true);
  });

  it('evaluates displayLogic against the editing record', () => {
    const isVisible = getVisible({ type: 'X' });
    assert.equal(isVisible({ key: 'a', displayLogic: (r) => r.type === 'X' }), true);
    assert.equal(isVisible({ key: 'b', displayLogic: (r) => r.type === 'Y' }), false);
  });

  it('treats a throwing displayLogic as visible (fail-open)', () => {
    assert.equal(getVisible({})({ key: 'a', displayLogic: () => { throw new Error('boom'); } }), true);
  });

  it('passes an empty object to displayLogic when editing is nullish', () => {
    let received = 'unset';
    getVisible(null)({ key: 'a', displayLogic: (r) => { received = r; return true; } });
    assert.deepEqual(received, {});
  });
});

describe('getMissingRequiredFields', () => {
  const fields = [
    { key: 'name', required: true },
    { key: 'optional' },
    { key: 'flag', required: true, type: 'checkbox' },
    { key: 'total', required: true, section: 'summary' },
    { key: 'locked', required: true, readOnly: true },
    { key: 'hidden', required: true, displayLogic: () => false },
  ];

  it('reports only visible, editable, non-checkbox, non-summary empties', () => {
    assert.deepEqual(getMissingRequiredFields(fields, {}), ['name']);
  });

  it('treats whitespace-only strings as missing', () => {
    assert.deepEqual(getMissingRequiredFields(fields, { name: '   ' }), ['name']);
  });

  it('returns an empty list once every required field is filled', () => {
    assert.deepEqual(getMissingRequiredFields(fields, { name: 'ACME' }), []);
  });

  it('tolerates a nullish editing record', () => {
    assert.deepEqual(getMissingRequiredFields(fields, null), ['name']);
  });
});

describe('format collectors', () => {
  it('re-exports isEmailField from recipientEdits', () => {
    assert.equal(isEmailField({ key: 'email' }), true);
    assert.equal(isEmailField({ key: 'name' }), false);
  });

  it('collects malformed emails and ignores empty ones', () => {
    const fields = [{ key: 'email' }, { key: 'altEmail' }, { key: 'name' }];
    assert.deepEqual(getInvalidEmailFields(fields, { email: 'nope', altEmail: '', name: 'x' }), ['email']);
  });

  it('collects insecure website URLs', () => {
    const fields = [{ key: 'website' }];
    assert.deepEqual(getInvalidWebsiteFields(fields, { website: 'http://acme.com' }), ['website']);
    assert.deepEqual(getInvalidWebsiteFields(fields, { website: 'https://acme.com' }), []);
  });

  it('collects phone numbers with invalid characters', () => {
    const fields = [{ key: 'phone' }];
    assert.deepEqual(getInvalidPhoneFields(fields, { phone: 'call me' }), ['phone']);
    assert.deepEqual(getInvalidPhoneFields(fields, { phone: '+34 600 123 456' }), []);
  });

  it('skips readOnly and hidden fields', () => {
    const fields = [
      { key: 'email', readOnly: true },
      { key: 'altEmail', displayLogic: () => false },
    ];
    assert.deepEqual(getInvalidEmailFields(fields, { email: 'nope', altEmail: 'nope' }), []);
  });

  it('accepts a custom error probe through getInvalidFormatFields', () => {
    const fields = [{ key: 'a' }, { key: 'b' }];
    const getError = (f) => (f.key === 'b' ? 'someErrorKey' : null);
    assert.deepEqual(getInvalidFormatFields(fields, {}, getError), ['b']);
  });
});

describe('getNumericFieldViolation', () => {
  it('returns the first violating field with its interpolation params', () => {
    const fields = [{ key: 'qty', min: 1 }, { key: 'other', min: 1 }];
    assert.deepEqual(
      getNumericFieldViolation(fields, { qty: 0, other: 0 }),
      { key: 'qty', errorKey: 'fieldMinValueError', errorParams: { min: 1 } },
    );
  });

  it('reports a decimal on an integer-constrained field', () => {
    const fields = [{ key: 'months', integer: true }];
    assert.deepEqual(
      getNumericFieldViolation(fields, { months: 1.5 }),
      { key: 'months', errorKey: 'fieldIntegerError', errorParams: {} },
    );
  });

  it('returns null when every field is within its constraints', () => {
    const fields = [{ key: 'qty', min: 1 }, { key: 'plain' }];
    assert.equal(getNumericFieldViolation(fields, { qty: 5, plain: 'text' }), null);
  });

  it('skips readOnly and hidden fields', () => {
    const fields = [
      { key: 'qty', min: 1, readOnly: true },
      { key: 'other', min: 1, displayLogic: () => false },
    ];
    assert.equal(getNumericFieldViolation(fields, { qty: 0, other: 0 }), null);
  });
});

// ---------------------------------------------------------------------------
// Save reporting helpers
// ---------------------------------------------------------------------------

describe('reportInvalidFormatField', () => {
  it('sets the save error, stops the spinner and returns null', () => {
    const setSaveError = spy();
    const setIsSaving = spy();
    const result = reportInvalidFormatField('websiteInsecureUrl', interpolatingUi(), setSaveError, setIsSaving);
    assert.equal(result, null);
    assert.deepEqual(setSaveError.calls, [['websiteInsecureUrl']]);
    assert.deepEqual(setIsSaving.calls, [[false]]);
  });

  it('interpolates params into the message', () => {
    const setSaveError = spy();
    reportInvalidFormatField(
      'fieldMinValueError',
      interpolatingUi({ fieldMinValueError: 'At least {min}' }),
      setSaveError,
      spy(),
      'numeric-field-qty',
      { min: 1 },
    );
    assert.deepEqual(setSaveError.calls, [['At least 1']]);
  });
});

describe('reportInvalidEmailFields', () => {
  it('delegates to the shared reporter with the email message key', () => {
    const setSaveError = spy();
    const setIsSaving = spy();
    assert.equal(reportInvalidEmailFields(interpolatingUi(), setSaveError, setIsSaving), null);
    assert.deepEqual(setSaveError.calls, [['sendModalInvalidEmail']]);
    assert.deepEqual(setIsSaving.calls, [[false]]);
  });
});

describe('reportMissingRequiredFields', () => {
  it('marks every missing key inline and surfaces the summary error', () => {
    const setFieldErrors = spy();
    const setSaveError = spy();
    const setIsSaving = spy();
    const result = reportMissingRequiredFields(
      ['name', 'value'],
      interpolatingUi({ fieldRequired: 'Required', requiredFieldsMissing: 'Missing fields' }),
      setFieldErrors,
      setSaveError,
      setIsSaving,
    );
    assert.equal(result, null);
    assert.deepEqual(setFieldErrors.calls[0][0], { name: 'Required', value: 'Required' });
    assert.deepEqual(setSaveError.calls, [['Missing fields']]);
    assert.deepEqual(setIsSaving.calls, [[false]]);
  });
});

// ---------------------------------------------------------------------------
// Request shape helpers
// ---------------------------------------------------------------------------

describe('getUrl / getMethod', () => {
  it('targets the collection on create and the record on update', () => {
    assert.equal(getUrl(true, '/api', 'header', { id: 'X' }), '/api/header');
    assert.equal(getUrl(false, '/api', 'header', { id: 'X' }), '/api/header/X');
  });

  it('maps create to POST and update to PATCH', () => {
    assert.equal(getMethod(true), 'POST');
    assert.equal(getMethod(false), 'PATCH');
  });
});

describe('buildPatchPayload', () => {
  it('sends only the changed fields and never the id', () => {
    const payload = buildPatchPayload(
      { id: '1', name: 'new', note: 'same' },
      { id: '1', name: 'old', note: 'same' },
    );
    assert.deepEqual(payload, { name: 'new' });
  });

  it('returns an empty payload when nothing changed', () => {
    assert.deepEqual(buildPatchPayload({ id: '1', name: 'a' }, { id: '1', name: 'a' }), {});
  });

  it('includes a field cleared to an empty string', () => {
    assert.deepEqual(buildPatchPayload({ id: '1', note: '' }, { id: '1', note: 'x' }), { note: '' });
  });
});

describe('buildCreatePayload', () => {
  it('copies through only the fields that survive the skip filter', () => {
    const payload = {};
    buildCreatePayload(
      { id: '1', name: 'ACME', empty: '', documentNo: '<10000000>' },
      { current: new Set() },
      { current: new Set() },
      new Set(),
      false,
      payload,
    );
    assert.deepEqual(payload, { name: 'ACME' });
  });
});

describe('buildSavePayload', () => {
  const refs = () => ({
    backendDefaultKeysRef: { current: new Set() },
    userChangedKeysRef: { current: new Set() },
    formFieldsRef: { current: new Map([['header', [{ key: 'name', required: true }]]]) },
  });

  it('produces a diff patch for an existing record', () => {
    const payload = buildSavePayload({
      isNew: false,
      selected: { id: '1', name: 'old' },
      editing: { id: '1', name: 'new' },
      entity: 'header',
      apiBaseUrl: '/api',
      ...refs(),
    });
    assert.deepEqual(payload, { name: 'new' });
  });

  it('produces a full create payload when there is no selected record', () => {
    const payload = buildSavePayload({
      isNew: true,
      selected: null,
      editing: { name: 'ACME', empty: '' },
      entity: 'header',
      apiBaseUrl: '/api',
      ...refs(),
    });
    assert.deepEqual(payload, { name: 'ACME' });
  });

  it('drops the contacts billing fields on a business-partner create', () => {
    const payload = buildSavePayload({
      isNew: true,
      selected: null,
      editing: { name: 'ACME', priceList: 'PL-1', paymentTerms: 'PT-1' },
      entity: 'businessPartner',
      apiBaseUrl: '/sws/neo/contacts',
      ...refs(),
    });
    assert.deepEqual(payload, { name: 'ACME' });
  });

  it('keeps the billing fields for a non-contacts business-partner window', () => {
    const payload = buildSavePayload({
      isNew: true,
      selected: null,
      editing: { name: 'ACME', priceList: 'PL-1' },
      entity: 'businessPartner',
      apiBaseUrl: '/sws/neo/vendors',
      ...refs(),
    });
    assert.deepEqual(payload, { name: 'ACME', priceList: 'PL-1' });
  });

  it('keeps a required short numeric default declared in the form fields', () => {
    const payload = buildSavePayload({
      isNew: true,
      selected: null,
      editing: { name: '181' },
      entity: 'header',
      apiBaseUrl: '/api',
      backendDefaultKeysRef: { current: new Set(['name']) },
      userChangedKeysRef: { current: new Set() },
      formFieldsRef: { current: new Map([['header', [{ key: 'name', required: true }]]]) },
    });
    assert.deepEqual(payload, { name: '181' });
  });
});

// ---------------------------------------------------------------------------
// Save response handling
// ---------------------------------------------------------------------------

describe('handleSaveErrorResponse', () => {
  it('maps a structured MISSING_REQUIRED_FIELDS 400 onto inline field errors', async () => {
    const body = { error: { code: 'MISSING_REQUIRED_FIELDS', fields: ['name', 'value'] } };
    const res = { status: 400, clone: () => ({ json: async () => body }), json: async () => body };
    const setFieldErrors = spy();
    const setSaveError = spy();
    await handleSaveErrorResponse(
      res,
      interpolatingUi({ fieldRequired: 'Required', requiredFieldsMissing: 'Missing fields' }),
      setFieldErrors,
      setSaveError,
    );
    assert.deepEqual(setFieldErrors.calls[0][0], { name: 'Required', value: 'Required' });
    assert.deepEqual(setSaveError.calls, [['Missing fields']]);
  });

  it('falls back to the generic extractor for any other error shape', async () => {
    const body = { error: { message: 'plain failure' } };
    const res = { status: 500, clone: () => ({ json: async () => body }), json: async () => body };
    const setFieldErrors = spy();
    const setSaveError = spy();
    await handleSaveErrorResponse(res, interpolatingUi(), setFieldErrors, setSaveError);
    assert.deepEqual(setFieldErrors.calls, []);
    assert.deepEqual(setSaveError.calls, [['plain failure']]);
  });

  it('falls back to the generic extractor when the clone cannot be parsed', async () => {
    const res = {
      status: 500,
      clone: () => ({ json: async () => { throw new Error('not json'); } }),
      json: async () => ({ error: { message: 'plain failure' } }),
    };
    const setSaveError = spy();
    await handleSaveErrorResponse(res, interpolatingUi(), spy(), setSaveError);
    assert.deepEqual(setSaveError.calls, [['plain failure']]);
  });

  it('ignores a MISSING_REQUIRED_FIELDS code without a fields array', async () => {
    const body = { error: { code: 'MISSING_REQUIRED_FIELDS', message: 'nope' } };
    const res = { status: 400, clone: () => ({ json: async () => body }), json: async () => body };
    const setFieldErrors = spy();
    const setSaveError = spy();
    await handleSaveErrorResponse(res, interpolatingUi(), setFieldErrors, setSaveError);
    assert.deepEqual(setFieldErrors.calls, []);
    assert.deepEqual(setSaveError.calls, [['nope']]);
  });
});

describe('getSaveSuccessMessage / showSaveSuccessToast', () => {
  it('distinguishes create from update', () => {
    assert.equal(getSaveSuccessMessage(true, interpolatingUi()), 'recordCreated');
    assert.equal(getSaveSuccessMessage(false, interpolatingUi()), 'recordSaved');
  });

  it('resolves the message only when not silent', () => {
    const ui = spy((key) => key);
    showSaveSuccessToast(true, true, ui);
    assert.deepEqual(ui.calls, []);
    showSaveSuccessToast(false, true, ui);
    assert.deepEqual(ui.calls, [['recordCreated']]);
  });
});

describe('shouldRefetchAfterSave', () => {
  it('requires both a saved id and the opt-in flag', () => {
    assert.ok(shouldRefetchAfterSave({ id: '1' }, true));
    assert.ok(!shouldRefetchAfterSave({ id: '1' }, false));
    assert.ok(!shouldRefetchAfterSave({}, true));
    assert.ok(!shouldRefetchAfterSave(null, true));
  });
});

describe('resolveSavedRecordAfterSave', () => {
  const opts = (extra = {}) => ({
    apiBaseUrl: '/api',
    entity: 'header',
    headers: { Authorization: 'Bearer t' },
    refetchAfterSave: true,
    ...extra,
  });

  it('returns the saved record untouched when refetch is disabled', async () => {
    const saved = { id: '1', name: 'a' };
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => { throw new Error('must not be called'); };
    try {
      assert.equal(await resolveSavedRecordAfterSave(saved, opts({ refetchAfterSave: false })), saved);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns the refetched record from the NEO response envelope', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ response: { data: [{ id: '1', name: 'fresh' }] } }) });
    try {
      const result = await resolveSavedRecordAfterSave({ id: '1', name: 'stale' }, opts());
      assert.deepEqual(result, { id: '1', name: 'fresh' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('derives the id from $ref when the refetched record has none', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ $ref: '/sws/neo/spec/header/ABC', name: 'fresh' }) });
    try {
      const result = await resolveSavedRecordAfterSave({ id: 'ABC' }, opts());
      assert.equal(result.id, 'ABC');
      assert.equal(result.name, 'fresh');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps the saved record when the refetch responds non-ok', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });
    const saved = { id: '1', name: 'stale' };
    try {
      assert.deepEqual(await resolveSavedRecordAfterSave(saved, opts()), saved);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps the saved record when the refetch throws', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('network down'); };
    const saved = { id: '1', name: 'stale' };
    try {
      assert.equal(await resolveSavedRecordAfterSave(saved, opts()), saved);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('requests the record by id with the supplied headers', async () => {
    const originalFetch = globalThis.fetch;
    const seen = [];
    globalThis.fetch = async (url, init) => {
      seen.push([url, init]);
      return { ok: true, json: async () => ({ response: { data: [{ id: '1' }] } }) };
    };
    try {
      await resolveSavedRecordAfterSave({ id: '1' }, opts());
      assert.equal(seen[0][0], '/api/header/1');
      // ETP-4576 — `credentials: 'include'` is now unconditional on this refetch, so
      // the session cookie travels cross-origin too (the dev setup, :3100 → :8080,
      // and any split-origin deploy; same-origin sends it by default anyway). The
      // Authorization header here is supplied BY THIS TEST through opts() — the
      // helper forwards whatever headers it is handed and builds none itself.
      assert.deepEqual(seen[0][1], {
        headers: { Authorization: 'Bearer t' },
        credentials: 'include',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
