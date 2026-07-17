import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';

/**
 * Unit tests for the helper functions extracted (and exported) from useEntity.js.
 * These are pure functions, so they are imported and exercised directly
 * (no mirror / re-implementation).
 *
 * useEntity.js is a Vite/React module: it uses `@/` path aliases and pulls in
 * `.jsx` transitive dependencies (AuthContext, i18n). Plain `node --test` knows
 * neither the alias nor how to parse JSX, so before importing the module we
 * install two synchronous module customization hooks:
 *   - resolve: rewrites `@/foo` → <app-shell>/src/foo (dir specifiers → /index.js)
 *   - load:    transpiles `.jsx` source to plain JS via esbuild on the fly
 * This lets the test import the REAL exported helpers without modifying source.
 */
const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Monorepo root (schema_forge/) — workspace packages live under it, e.g.
// tools/app-shell/src and packages/app-shell-core/src.
const REPO_ROOT_URL = pathToFileURL(resolve(SRC_DIR, '..', '..', '..') + '/').href;
// @etendosoftware/app-shell-core is Vite-authored library code published to
// npm (formerly local workspace code under this repo, moved out as part of
// the Schema Forge repo split — ETP-4346). It uses the same Vite-only
// constructs (import.meta.env, import.meta.glob) as workspace sources, so it
// needs the same esbuild transform even though it now lives under
// node_modules. Every other node_modules package is left on the default loader.
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
    // Transpile workspace JSX, and any workspace JS that uses Vite-only
    // constructs (import.meta.env). node_modules are left to the default
    // loader, EXCEPT @etendosoftware/app-shell-core (see comment above).
    const isWorkspace = url.startsWith(REPO_ROOT_URL) && !url.includes('/node_modules/');
    const isAppShellCore = url.startsWith(APP_SHELL_CORE_URL);
    if (url.endsWith('.jsx') || ((isWorkspace || isAppShellCore) && url.endsWith('.js'))) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      const { code } = transformSync(source, {
        loader: url.endsWith('.jsx') ? 'jsx' : 'js',
        format: 'esm',
        sourcefile: url,
        // Vite-only construct: replace `import.meta.env` with an empty object
        // so import-time reads (e.g. VITE_API_BASE) resolve to undefined, not throw.
        define: {
          'import.meta.env': '{}',
          // import.meta.glob (Vite) inlines matched modules; route it to a
          // global no-op stub (define values must be identifiers/literals).
          'import.meta.glob': '__viteGlobStub__',
        },
      });
      return { format: 'module', shortCircuit: true, source: code };
    }
    return nextLoad(url, context);
  },
});

// Vite's import.meta.glob is rewritten to this global no-op (returns {}).
globalThis.__viteGlobStub__ = () => ({});

// Minimal browser-global stubs: transitive deps (auth/api.js) read
// window.location at import time. The helpers under test never use these.
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

const {
  pickMessage,
  pickMessageFromObject,
  applyContactNameDefaults,
  applyContactsRequiredFields,
  parseCriteriaInto,
  normalizeDefaultValue,
  shouldSkipPayloadField,
  getReadOnly,
  getVisible,
  getUrl,
  getMethod,
  buildPatchPayload,
  getSaveSuccessMessage,
  buildCreatePayload,
  shouldRefetchAfterSave,
  reportMissingRequiredFields,
  showSaveSuccessToast,
  handleSaveErrorResponse,
} = await import('../useEntity.js');

describe('pickMessage', () => {
  it('returns the trimmed string for a string input', () => {
    assert.equal(pickMessage('  hello  '), 'hello');
  });

  it('returns null for a whitespace-only string', () => {
    assert.equal(pickMessage('   '), null);
  });

  it('returns null for null', () => {
    assert.equal(pickMessage(null), null);
  });

  it('returns null for undefined', () => {
    assert.equal(pickMessage(undefined), null);
  });

  it('returns null for 0 (falsy)', () => {
    assert.equal(pickMessage(0), null);
  });

  it('returns null for empty string', () => {
    assert.equal(pickMessage(''), null);
  });

  it('returns the first non-empty message in a nested array', () => {
    assert.equal(pickMessage(['', '  ', 'first', 'second']), 'first');
  });

  it('returns null for an array of empty values', () => {
    assert.equal(pickMessage(['', '   ', null]), null);
  });

  it('honors preferredKeys priority (message wins over other keys)', () => {
    assert.equal(
      pickMessage({ description: 'desc', message: 'msg', title: 'ttl' }),
      'msg'
    );
  });

  it('falls through to Object.values for objects with only non-preferred keys', () => {
    assert.equal(pickMessage({ foo: 'bar' }), 'bar');
  });

  it('returns null for a fully empty object', () => {
    assert.equal(pickMessage({}), null);
  });

  it('recurses into nested objects and arrays', () => {
    assert.equal(
      pickMessage({ wrapper: { items: ['', { message: 'deep' }] } }),
      'deep'
    );
  });
});

describe('pickMessageFromObject', () => {
  it('returns null for a string (non-object)', () => {
    assert.equal(pickMessageFromObject('hello'), null);
  });

  it('returns null for a number (non-object)', () => {
    assert.equal(pickMessageFromObject(42), null);
  });

  it('honors preferredKeys order', () => {
    assert.equal(
      pickMessageFromObject({ text: 'text-val', errorMessage: 'err', message: 'm' }),
      'm'
    );
  });

  it('uses errorMessage when message is absent', () => {
    assert.equal(
      pickMessageFromObject({ text: 'text-val', errorMessage: 'err' }),
      'err'
    );
  });

  it('falls back to arbitrary values when no preferred key matches', () => {
    assert.equal(pickMessageFromObject({ random: 'value' }), 'value');
  });

  it('returns null for an empty object', () => {
    assert.equal(pickMessageFromObject({}), null);
  });
});

describe('applyContactNameDefaults', () => {
  it('derives name from payload firstName/lastName', () => {
    const payload = { firstName: 'John', lastName: 'Doe' };
    applyContactNameDefaults(payload, {});
    assert.equal(payload.name, 'John Doe');
  });

  it('falls back to source firstName/lastName when payload lacks them', () => {
    const payload = {};
    applyContactNameDefaults(payload, { firstName: 'Jane', lastName: 'Roe' });
    assert.equal(payload.name, 'Jane Roe');
  });

  it('prefers payload names over source names', () => {
    const payload = { firstName: 'Pay' };
    applyContactNameDefaults(payload, { firstName: 'Src', lastName: 'Last' });
    assert.equal(payload.name, 'Pay Last');
  });

  it('does NOT overwrite an existing name', () => {
    const payload = { name: 'Existing', firstName: 'John', lastName: 'Doe' };
    applyContactNameDefaults(payload, {});
    assert.equal(payload.name, 'Existing');
  });

  it('sets username from name', () => {
    const payload = { firstName: 'John', lastName: 'Doe' };
    applyContactNameDefaults(payload, {});
    assert.equal(payload.username, 'John Doe');
  });

  it('does not set username when name is absent', () => {
    const payload = {};
    applyContactNameDefaults(payload, {});
    assert.equal(payload.name, undefined);
    assert.equal(payload.username, undefined);
  });

  it('does not overwrite an existing username', () => {
    const payload = { name: 'Some Name', username: 'keepme' };
    applyContactNameDefaults(payload, {});
    assert.equal(payload.username, 'keepme');
  });

  it('slices a long derived name to 60 chars (name and username)', () => {
    const longFirst = 'a'.repeat(40);
    const longLast = 'b'.repeat(40);
    const payload = { firstName: longFirst, lastName: longLast };
    applyContactNameDefaults(payload, {});
    // "aaa... aaa bbb...": joined with a space then sliced to 60
    const expected = `${longFirst} ${longLast}`.slice(0, 60);
    assert.equal(payload.name, expected);
    assert.equal(payload.name.length, 60);
    assert.equal(payload.username, expected.slice(0, 60));
    assert.equal(payload.username.length, 60);
  });
});

describe('applyContactsRequiredFields', () => {
  it('applies contact name defaults for a "contact" entity', () => {
    const payload = { firstName: 'John', lastName: 'Doe' };
    applyContactsRequiredFields('contact', payload, {});
    assert.equal(payload.name, 'John Doe');
  });

  it('falls back businessPartner.name to source.name when payload lacks it', () => {
    const payload = {};
    applyContactsRequiredFields('businessPartner', payload, { name: 'Acme Corp' });
    assert.equal(payload.name, 'Acme Corp');
  });

  it('defaults businessPartner.searchKey from source.name when absent', () => {
    const payload = {};
    applyContactsRequiredFields('businessPartner', payload, { name: 'Acme Corp' });
    assert.equal(payload.searchKey, 'Acme Corp');
  });

  it('does NOT overwrite an existing searchKey', () => {
    const payload = { searchKey: 'EXISTING' };
    applyContactsRequiredFields('businessPartner', payload, { name: 'Acme Corp' });
    assert.equal(payload.searchKey, 'EXISTING');
  });

  it('regression: truncates a long derived searchKey to 40 chars (C_BPartner.Value AD column limit)', () => {
    // Reproduced via a real create with a 48-char commercial name:
    // "Value too long. Length 48, maximum allowed 40".
    const longName = 'a'.repeat(48);
    const payload = {};
    applyContactsRequiredFields('businessPartner', payload, { name: longName });
    assert.equal(payload.searchKey, longName.slice(0, 40));
    assert.equal(payload.searchKey.length, 40);
  });

  it('regression: does not truncate payload.name itself (only searchKey), Name has more headroom (60)', () => {
    const longName = 'b'.repeat(48);
    const payload = {};
    applyContactsRequiredFields('businessPartner', payload, { name: longName });
    assert.equal(payload.name, longName);
    assert.equal(payload.name.length, 48);
  });

  it('truncates the source.searchKey fallback too (not just source.name)', () => {
    const longSearchKey = 'c'.repeat(45);
    const payload = {};
    applyContactsRequiredFields('businessPartner', payload, { searchKey: longSearchKey, name: 'Short Name' });
    assert.equal(payload.searchKey, longSearchKey.slice(0, 40));
    assert.equal(payload.searchKey.length, 40);
  });

  it('leaves payload untouched for entities that are not contact/businessPartner', () => {
    const payload = { name: 'Product X' };
    const result = applyContactsRequiredFields('product', payload, {});
    assert.deepEqual(result, { name: 'Product X' });
  });

  it('returns payload unchanged for non-object input', () => {
    assert.equal(applyContactsRequiredFields('businessPartner', null, {}), null);
  });
});

describe('parseCriteriaInto', () => {
  it('spreads a valid JSON array into out', () => {
    const out = [];
    parseCriteriaInto('[1, 2, 3]', out);
    assert.deepEqual(out, [1, 2, 3]);
  });

  it('pushes a valid JSON object as a single element', () => {
    const out = [];
    parseCriteriaInto('{"a": 1}', out);
    assert.deepEqual(out, [{ a: 1 }]);
  });

  it('leaves out unchanged for malformed JSON (no throw)', () => {
    const out = [];
    assert.doesNotThrow(() => parseCriteriaInto('{not valid', out));
    assert.deepEqual(out, []);
  });

  it('appends to a pre-populated out array', () => {
    const out = ['existing'];
    parseCriteriaInto('["a", "b"]', out);
    assert.deepEqual(out, ['existing', 'a', 'b']);
  });
});

describe('normalizeDefaultValue', () => {
  it('converts dd-mm-yyyy to yyyy-mm-dd', () => {
    const normalized = {};
    normalizeDefaultValue('25-12-2024', normalized, 'orderDate');
    assert.equal(normalized.orderDate, '2024-12-25');
  });

  it('unquotes a quoted string and unescapes doubled single-quotes', () => {
    const normalized = {};
    normalizeDefaultValue("'O''Brien'", normalized, 'name');
    assert.equal(normalized.name, "O'Brien");
  });

  it('converts an integer to a String', () => {
    const normalized = {};
    normalizeDefaultValue(7, normalized, 'lineNo');
    assert.equal(normalized.lineNo, '7');
  });

  it('leaves a non-matching string untouched (key not added)', () => {
    const normalized = {};
    normalizeDefaultValue('plain text', normalized, 'note');
    assert.equal('note' in normalized, false);
  });

  it('leaves a float untouched (key not added)', () => {
    const normalized = {};
    normalizeDefaultValue(3.14, normalized, 'amount');
    assert.equal('amount' in normalized, false);
  });

  it('leaves a boolean untouched (key not added)', () => {
    const normalized = {};
    normalizeDefaultValue(true, normalized, 'active');
    assert.equal('active' in normalized, false);
  });
});

describe('shouldSkipPayloadField', () => {
  const emptyRef = () => ({ current: new Set() });
  const refWith = (...keys) => ({ current: new Set(keys) });

  it('returns true for the id key', () => {
    assert.equal(
      shouldSkipPayloadField('id', 'abc', emptyRef(), emptyRef(), new Set(), false, {}),
      true
    );
  });

  it('returns true for an $_identifier companion key', () => {
    assert.equal(
      shouldSkipPayloadField('product$_identifier', 'Some Product', emptyRef(), emptyRef(), new Set(), false, {}),
      true
    );
  });

  it('returns true for a locale-suffixed legacy key pattern (name_US)', () => {
    // /^[a-zA-Z]+_[A-Z]{2,4}$/ matches keys like name_US, description_EN.
    assert.equal(
      shouldSkipPayloadField('name_US', 'Acme', emptyRef(), emptyRef(), new Set(), false, {}),
      true
    );
  });

  it('returns true for an empty string value', () => {
    assert.equal(
      shouldSkipPayloadField('description', '', emptyRef(), emptyRef(), new Set(), false, {}),
      true
    );
  });

  it('returns true for a null value', () => {
    assert.equal(
      shouldSkipPayloadField('description', null, emptyRef(), emptyRef(), new Set(), false, {}),
      true
    );
  });

  it('returns true for a NEO sequence placeholder', () => {
    assert.equal(
      shouldSkipPayloadField('documentNo', '<10000>', emptyRef(), emptyRef(), new Set(), false, {}),
      true
    );
  });

  it('returns true for a short numeric default that is not user-changed and not required', () => {
    assert.equal(
      shouldSkipPayloadField(
        'businessPartner',
        '12345',
        refWith('businessPartner'),
        emptyRef(),
        new Set(),
        false,
        {}
      ),
      true
    );
  });

  it('returns true for a contacts billing field during business partner create', () => {
    assert.equal(
      shouldSkipPayloadField('priceList', 'SomeList', emptyRef(), emptyRef(), new Set(), true, {}),
      true
    );
  });

  it('returns true for a SmartClient temp import ref when companion identifier exists', () => {
    assert.equal(
      shouldSkipPayloadField(
        'businessPartner',
        '100_BusinessPartner',
        emptyRef(),
        emptyRef(),
        new Set(),
        false,
        { 'businessPartner$_identifier': 'Acme' }
      ),
      true
    );
  });

  it('returns false for a normal user value', () => {
    assert.equal(
      shouldSkipPayloadField('description', 'Hello world', emptyRef(), emptyRef(), new Set(), false, {}),
      false
    );
  });

  it('returns false for a required short-numeric field even if from defaults', () => {
    assert.equal(
      shouldSkipPayloadField(
        'businessPartner',
        '12345',
        refWith('businessPartner'),
        emptyRef(),
        new Set(['businessPartner']),
        false,
        {}
      ),
      false
    );
  });

  it('returns false for a short numeric the user changed', () => {
    assert.equal(
      shouldSkipPayloadField(
        'businessPartner',
        '12345',
        refWith('businessPartner'),
        refWith('businessPartner'),
        new Set(),
        false,
        {}
      ),
      false
    );
  });
});

describe('getReadOnly', () => {
  it('returns a predicate that is true when f.readOnly === true', () => {
    const isReadOnly = getReadOnly({});
    assert.equal(isReadOnly({ readOnly: true }), true);
  });

  it('evaluates readOnlyLogic against editing and coerces the result to Boolean', () => {
    const isReadOnly = getReadOnly({ status: 'CO' });
    assert.equal(isReadOnly({ readOnlyLogic: (e) => e.status === 'CO' }), true);
    assert.equal(isReadOnly({ readOnlyLogic: (e) => e.status === 'DR' }), false);
  });

  it('coerces a truthy non-boolean logic result to true', () => {
    const isReadOnly = getReadOnly({});
    assert.equal(isReadOnly({ readOnlyLogic: () => 'yes' }), true);
  });

  it('returns false when readOnlyLogic throws (fail-closed to editable)', () => {
    const isReadOnly = getReadOnly({});
    assert.equal(isReadOnly({ readOnlyLogic: () => { throw new Error('boom'); } }), false);
  });

  it('returns false when there is no readOnly flag and no logic', () => {
    const isReadOnly = getReadOnly({});
    assert.equal(isReadOnly({ key: 'name' }), false);
  });

  it('returns false when readOnlyLogic is not a function', () => {
    const isReadOnly = getReadOnly({});
    assert.equal(isReadOnly({ readOnlyLogic: 'CO' }), false);
  });
});

describe('getVisible', () => {
  it('returns true when there is no displayLogic function', () => {
    const isVisible = getVisible({});
    assert.equal(isVisible({ key: 'name' }), true);
  });

  it('returns true when displayLogic returns a truthy value', () => {
    const isVisible = getVisible({ type: 'A' });
    assert.equal(isVisible({ displayLogic: (e) => e.type === 'A' }), true);
  });

  it('returns false when displayLogic returns a falsy value', () => {
    const isVisible = getVisible({ type: 'B' });
    assert.equal(isVisible({ displayLogic: (e) => e.type === 'A' }), false);
  });

  it('returns true when displayLogic throws (fail-open)', () => {
    const isVisible = getVisible({});
    assert.equal(isVisible({ displayLogic: () => { throw new Error('boom'); } }), true);
  });

  it('passes an empty object to displayLogic when editing is nullish', () => {
    const isVisible = getVisible(null);
    assert.equal(isVisible({ displayLogic: (e) => e != null && typeof e === 'object' }), true);
  });
});

describe('getUrl', () => {
  it('builds the collection URL for a new record', () => {
    assert.equal(getUrl(true, '/api', 'salesOrder', { id: '99' }), '/api/salesOrder');
  });

  it('builds the record URL with the editing id for an existing record', () => {
    assert.equal(getUrl(false, '/api', 'salesOrder', { id: '99' }), '/api/salesOrder/99');
  });
});

describe('getMethod', () => {
  it('returns POST for a new record', () => {
    assert.equal(getMethod(true), 'POST');
  });

  it('returns PATCH for an existing record', () => {
    assert.equal(getMethod(false), 'PATCH');
  });
});

describe('buildPatchPayload', () => {
  it('includes only changed fields and skips the id key', () => {
    const editing = { id: '1', name: 'New', description: 'Same', qty: 5 };
    const selected = { id: '1', name: 'Old', description: 'Same', qty: 5 };
    const result = buildPatchPayload(editing, selected, 'product');
    assert.deepEqual(result, { name: 'New' });
  });

  it('returns an empty object when nothing changed (id ignored)', () => {
    const editing = { id: '1', name: 'Same' };
    const selected = { id: '1', name: 'Same' };
    const result = buildPatchPayload(editing, selected, 'product');
    assert.deepEqual(result, {});
  });

  it('includes a field present in editing but absent from selected', () => {
    const editing = { id: '1', extra: 'value' };
    const selected = { id: '1' };
    const result = buildPatchPayload(editing, selected, 'product');
    assert.deepEqual(result, { extra: 'value' });
  });

  it('applies contact name defaults for a contact entity', () => {
    const editing = { id: '1', firstName: 'John', lastName: 'Doe' };
    const selected = { id: '1' };
    const result = buildPatchPayload(editing, selected, 'contact');
    assert.equal(result.firstName, 'John');
    assert.equal(result.lastName, 'Doe');
    assert.equal(result.name, 'John Doe');
    assert.equal(result.username, 'John Doe');
  });

  it('returns a fresh object, not the editing reference', () => {
    const editing = { id: '1', name: 'New' };
    const selected = { id: '1', name: 'Old' };
    const result = buildPatchPayload(editing, selected, 'product');
    assert.deepEqual(result, { name: 'New' });
    assert.notEqual(result, editing);
  });
});

describe('getSaveSuccessMessage', () => {
  it('returns the created key for a new record', () => {
    const ui = (key) => key;
    assert.equal(getSaveSuccessMessage(true, ui), 'recordCreated');
  });

  it('returns the saved key for an existing record', () => {
    const ui = (key) => key;
    assert.equal(getSaveSuccessMessage(false, ui), 'recordSaved');
  });
});

describe('buildCreatePayload', () => {
  const emptyRef = () => ({ current: new Set() });

  it('copies kept fields into payload and skips the id key', () => {
    const editing = { id: 'abc', name: 'Acme', description: 'A vendor' };
    const payload = {};
    buildCreatePayload(editing, emptyRef(), emptyRef(), new Set(), false, payload);
    assert.equal('id' in payload, false);
    assert.equal(payload.name, 'Acme');
    assert.equal(payload.description, 'A vendor');
  });

  it('skips empty and identifier-companion fields', () => {
    const editing = {
      id: '1',
      name: 'Acme',
      blank: '',
      'product$_identifier': 'Some Product',
    };
    const payload = {};
    buildCreatePayload(editing, emptyRef(), emptyRef(), new Set(), false, payload);
    assert.deepEqual(payload, { name: 'Acme' });
  });

  it('skips contacts billing fields during a business partner create', () => {
    const editing = { name: 'Acme', priceList: 'SomeList' };
    const payload = {};
    buildCreatePayload(editing, emptyRef(), emptyRef(), new Set(), true, payload);
    assert.deepEqual(payload, { name: 'Acme' });
  });

  it('mutates the provided payload object in place', () => {
    const editing = { name: 'Acme' };
    const payload = { preset: 'keep' };
    buildCreatePayload(editing, emptyRef(), emptyRef(), new Set(), false, payload);
    assert.deepEqual(payload, { preset: 'keep', name: 'Acme' });
  });
});

describe('shouldRefetchAfterSave', () => {
  it('returns falsy when saved is null', () => {
    assert.ok(!shouldRefetchAfterSave(null, true));
  });

  it('returns falsy when saved has no id', () => {
    assert.ok(!shouldRefetchAfterSave({ name: 'Acme' }, true));
  });

  it('returns falsy when refetchAfterSave is false even with an id', () => {
    assert.ok(!shouldRefetchAfterSave({ id: '1' }, false));
  });

  it('returns truthy when saved has an id and refetchAfterSave is true', () => {
    assert.ok(shouldRefetchAfterSave({ id: '1' }, true));
  });
});

describe('reportMissingRequiredFields', () => {
  it('builds a per-field error map, calls all setters, and returns null', () => {
    const ui = (key) => key;
    const fieldErrorCalls = [];
    const saveErrorCalls = [];
    const isSavingCalls = [];
    const setFieldErrors = (v) => fieldErrorCalls.push(v);
    const setSaveError = (v) => saveErrorCalls.push(v);
    const setIsSaving = (v) => isSavingCalls.push(v);

    const result = reportMissingRequiredFields(
      ['name', 'businessPartner'], ui, setFieldErrors, setSaveError, setIsSaving
    );

    assert.equal(result, null);
    assert.deepEqual(fieldErrorCalls, [{ name: 'fieldRequired', businessPartner: 'fieldRequired' }]);
    assert.deepEqual(saveErrorCalls, ['requiredFieldsMissing']);
    assert.deepEqual(isSavingCalls, [false]);
  });

  it('produces an empty error map for an empty missing list', () => {
    const ui = (key) => key;
    let captured;
    reportMissingRequiredFields([], ui, (v) => { captured = v; }, () => {}, () => {});
    assert.deepEqual(captured, {});
  });
});

describe('showSaveSuccessToast', () => {
  it('does not throw when silent is false (new record)', () => {
    const ui = (key) => key;
    assert.doesNotThrow(() => showSaveSuccessToast(false, true, ui));
  });

  it('does not throw and shows nothing when silent is true', () => {
    const ui = (key) => key;
    assert.doesNotThrow(() => showSaveSuccessToast(true, false, ui));
  });

  it('does not throw when silent is false (existing record)', () => {
    const ui = (key) => key;
    assert.doesNotThrow(() => showSaveSuccessToast(false, false, ui));
  });
});

describe('handleSaveErrorResponse', () => {
  const ui = (key) => key;

  // Minimal fake Response: clone() returns an object whose json() resolves to `body`.
  const fakeResponse = (body, status = 400) => ({
    status,
    clone() {
      return { json: async () => body };
    },
    // extractErrorMessage reads res.json() on the original (used in the fallback path).
    json: async () => body,
  });

  it('maps a MISSING_REQUIRED_FIELDS error to per-field errors', async () => {
    const fieldErrorCalls = [];
    const saveErrorCalls = [];
    const res = fakeResponse({
      error: { code: 'MISSING_REQUIRED_FIELDS', fields: ['name', 'value'] },
    });

    const result = await handleSaveErrorResponse(
      res, ui, (v) => fieldErrorCalls.push(v), (v) => saveErrorCalls.push(v)
    );

    assert.equal(result, undefined);
    assert.deepEqual(fieldErrorCalls, [{ name: 'fieldRequired', value: 'fieldRequired' }]);
    assert.deepEqual(saveErrorCalls, ['requiredFieldsMissing']);
  });

  it('falls back to extractErrorMessage for a non-structured error', async () => {
    const saveErrorCalls = [];
    let fieldErrorsCalled = false;
    const res = fakeResponse({ error: { message: 'Something broke' } });

    const result = await handleSaveErrorResponse(
      res, ui, () => { fieldErrorsCalled = true; }, (v) => saveErrorCalls.push(v)
    );

    assert.equal(result, undefined);
    assert.equal(fieldErrorsCalled, false, 'setFieldErrors should not be called on the fallback path');
    assert.deepEqual(saveErrorCalls, ['Something broke']);
  });

  it('ignores a MISSING_REQUIRED_FIELDS code when fields is not an array', async () => {
    const saveErrorCalls = [];
    let fieldErrorsCalled = false;
    const res = fakeResponse({ error: { code: 'MISSING_REQUIRED_FIELDS', message: 'bad' } });

    const result = await handleSaveErrorResponse(
      res, ui, () => { fieldErrorsCalled = true; }, (v) => saveErrorCalls.push(v)
    );

    assert.equal(result, undefined);
    assert.equal(fieldErrorsCalled, false);
    assert.deepEqual(saveErrorCalls, ['bad']);
  });
});
