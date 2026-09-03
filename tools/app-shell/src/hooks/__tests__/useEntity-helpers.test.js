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
      // Only pay for the esbuild transform when the module actually needs it:
      // JSX syntax, or the Vite-only `import.meta.env` / `import.meta.glob`.
      // A plain ESM `.js` module is handed to node verbatim (just tagged as a
      // module, which is the other reason this hook exists). Transforming it
      // anyway would strip its comments, and the resulting line shift makes
      // V8 emit a SECOND coverage record for the same file path whose 0-hit
      // function ranges bleed onto unrelated lines of the real file — which
      // silently deflates that file's reported line coverage.
      const needsTransform = url.endsWith('.jsx') || /import\.meta\.(env|glob)/.test(source);
      if (!needsTransform) {
        return { format: 'module', shortCircuit: true, source };
      }
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
  getNumericFieldViolation,
  getContactsTextFieldViolation,
  reportInvalidFormatField,
  extractErrorMessage,
} = await import('../useEntity.js');

// `sonner`'s `toast` export is a plain mutable object (Object.assign(basicToast,
// {...})), so its methods can be monkeypatched for the duration of a test
// without a module mock — no ESM mock loader is wired up for third-party
// packages in this file (only `@/` workspace specifiers are intercepted).
const { toast } = await import('sonner');

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
    const result = buildPatchPayload(editing, selected);
    assert.deepEqual(result, { name: 'New' });
  });

  it('returns an empty object when nothing changed (id ignored)', () => {
    const editing = { id: '1', name: 'Same' };
    const selected = { id: '1', name: 'Same' };
    const result = buildPatchPayload(editing, selected);
    assert.deepEqual(result, {});
  });

  it('includes a field present in editing but absent from selected', () => {
    const editing = { id: '1', extra: 'value' };
    const selected = { id: '1' };
    const result = buildPatchPayload(editing, selected);
    assert.deepEqual(result, { extra: 'value' });
  });

  // ETP-4156: a contact PATCH now carries only the changed fields. Deriving `name` from
  // firstName/lastName is the backend's job (ContactHandler), so the payload must stay
  // free of entity-specific extras.
  it('does not inject entity-specific derived fields for a contact entity', () => {
    const editing = { id: '1', firstName: 'John', lastName: 'Doe' };
    const selected = { id: '1' };
    const result = buildPatchPayload(editing, selected);
    assert.deepEqual(result, { firstName: 'John', lastName: 'Doe' });
  });

  it('returns a fresh object, not the editing reference', () => {
    const editing = { id: '1', name: 'New' };
    const selected = { id: '1', name: 'Old' };
    const result = buildPatchPayload(editing, selected);
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

describe('getNumericFieldViolation (ETP-4542 — generic min/integer save block)', () => {
  // Assets usableLife contract: min 1, integer, conditional visibility.
  const USABLE_LIFE_FIELDS = [
    {
      key: 'usableLifeMonths',
      min: 1,
      integer: true,
      displayLogic: (record) => record.calculateType === 'TI' && record.amortize !== 'YE',
    },
    {
      key: 'usableLifeYears',
      min: 1,
      integer: true,
      displayLogic: (record) => record.calculateType === 'TI' && record.amortize === 'YE',
    },
  ];

  it('blocks save with fieldMinValueError (min param) when a visible min-constrained field is zero', () => {
    const editing = { calculateType: 'TI', amortize: 'MO', usableLifeMonths: 0 };
    assert.deepEqual(getNumericFieldViolation(USABLE_LIFE_FIELDS, editing), {
      key: 'usableLifeMonths', errorKey: 'fieldMinValueError', errorParams: { min: 1 },
    });
  });

  it('blocks save with fieldMinValueError when the value is negative', () => {
    const editing = { calculateType: 'TI', amortize: 'MO', usableLifeMonths: -3 };
    assert.deepEqual(getNumericFieldViolation(USABLE_LIFE_FIELDS, editing), {
      key: 'usableLifeMonths', errorKey: 'fieldMinValueError', errorParams: { min: 1 },
    });
  });

  it('blocks save with fieldIntegerError (no params) when the value is decimal', () => {
    const editing = { calculateType: 'TI', amortize: 'MO', usableLifeMonths: 5.5 };
    assert.deepEqual(getNumericFieldViolation(USABLE_LIFE_FIELDS, editing), {
      key: 'usableLifeMonths', errorKey: 'fieldIntegerError', errorParams: {},
    });
  });

  it('blocks save on the years field when it is the visible one', () => {
    const editing = { calculateType: 'TI', amortize: 'YE', usableLifeYears: 0 };
    assert.deepEqual(getNumericFieldViolation(USABLE_LIFE_FIELDS, editing), {
      key: 'usableLifeYears', errorKey: 'fieldMinValueError', errorParams: { min: 1 },
    });
  });

  it('does NOT block on an empty value (required mechanism owns emptiness)', () => {
    const editing = { calculateType: 'TI', amortize: 'MO', usableLifeMonths: '' };
    assert.equal(getNumericFieldViolation(USABLE_LIFE_FIELDS, editing), null);
  });

  it('allows save when the value is a valid positive integer', () => {
    const editing = { calculateType: 'TI', amortize: 'MO', usableLifeMonths: 12 };
    assert.equal(getNumericFieldViolation(USABLE_LIFE_FIELDS, editing), null);
  });

  it('does NOT block when the invalid field is hidden by displayLogic', () => {
    const editing = { calculateType: 'TI', amortize: 'MO', usableLifeMonths: 12, usableLifeYears: -1 };
    assert.equal(getNumericFieldViolation(USABLE_LIFE_FIELDS, editing), null);
  });

  it('does NOT block when the field is read-only (completed document)', () => {
    const fields = [{
      key: 'usableLifeMonths',
      min: 1,
      integer: true,
      readOnlyLogic: (record) => record.processed === true,
      displayLogic: () => true,
    }];
    const editing = { processed: true, usableLifeMonths: -5 };
    assert.equal(getNumericFieldViolation(fields, editing), null);
  });

  it('accepts a decimal on a field that declares min but NOT integer (default allows decimals)', () => {
    const fields = [{ key: 'discount', min: 0, displayLogic: () => true }];
    assert.equal(getNumericFieldViolation(fields, { discount: 2.5 }), null);
  });

  it('is a no-op for windows whose fields declare neither min nor integer', () => {
    const fields = [{ key: 'businessPartner' }, { key: 'orderDate' }];
    const editing = { businessPartner: '', orderDate: -5 };
    assert.equal(getNumericFieldViolation(fields, editing), null);
  });

  it('is a no-op on an empty fields array', () => {
    assert.equal(getNumericFieldViolation([], {}), null);
  });
});

describe('getContactsTextFieldViolation (ETP-5031 — Contacts-only save-block wiring)', () => {
  // Mirrors getNumericFieldViolation's fixture shape: a small fields array plus an
  // `editing` record. This is the exact function useEntity.js's save gate calls —
  // testing it directly here exercises the WIRING (windowName threaded through,
  // readOnly/visible gating applied), not just the pure getContactsTextFieldError
  // helper already covered in contactsFieldValidation.test.js.
  const FIELDS = [
    { key: 'name' },
    { key: 'etgoPhone' },
    { key: 'email' },
  ];

  it('blocks save with fieldMaxLengthError when a changed field exceeds its limit, in the contacts window', () => {
    const editing = { name: 'x'.repeat(61) };
    assert.deepEqual(getContactsTextFieldViolation('contacts', FIELDS, editing), {
      key: 'name', errorKey: 'fieldMaxLengthError', errorParams: { maxLength: 60 },
    });
  });

  it('blocks save with fieldInvalidCharacters for a <script> value, in the contacts window', () => {
    const editing = { etgoPhone: '<script>' };
    assert.deepEqual(getContactsTextFieldViolation('contacts', FIELDS, editing), {
      key: 'etgoPhone', errorKey: 'fieldInvalidCharacters', errorParams: {},
    });
  });

  it('is a no-op for any window other than "contacts" — the critical scoping guarantee', () => {
    const editing = { name: 'x'.repeat(1000), etgoPhone: '<script>alert(1)</script>' };
    assert.equal(getContactsTextFieldViolation('sales-order', FIELDS, editing), null);
    assert.equal(getContactsTextFieldViolation('purchase-order', FIELDS, editing), null);
    assert.equal(getContactsTextFieldViolation(null, FIELDS, editing), null);
  });

  it('does NOT block on a field hidden by displayLogic, even in contacts', () => {
    const fields = [{ key: 'name', displayLogic: () => false }];
    const editing = { name: 'x'.repeat(1000) };
    assert.equal(getContactsTextFieldViolation('contacts', fields, editing), null);
  });

  it('does NOT block on a read-only field, even in contacts', () => {
    const fields = [{ key: 'name', readOnlyLogic: () => true }];
    const editing = { name: 'x'.repeat(1000) };
    assert.equal(getContactsTextFieldViolation('contacts', fields, editing), null);
  });

  it('allows save when every field is valid', () => {
    const editing = { name: 'Acme Corp.', etgoPhone: '+54 11 5555-1234', email: 'user@example.com' };
    assert.equal(getContactsTextFieldViolation('contacts', FIELDS, editing), null);
  });

  it('is a no-op on an empty fields array (e.g. no field was touched this session)', () => {
    assert.equal(getContactsTextFieldViolation('contacts', [], {}), null);
  });
});

describe('reportInvalidFormatField (ETP-4542, bug 2/3 — toast dedup id)', () => {
  const ui = (key, params = {}) => `${key}:${JSON.stringify(params)}`;
  const noop = () => {};

  // Monkeypatch toast.error around each test, restoring the original after —
  // toast is a real sonner instance here (no mock loader for node_modules),
  // and its methods are plain mutable object properties.
  const withCapturedToastError = (fn) => {
    const original = toast.error;
    const calls = [];
    toast.error = (...args) => calls.push(args);
    try {
      fn(calls);
    } finally {
      toast.error = original;
    }
  };

  it('passes { id: toastId } to toast.error when a toastId is given', () => {
    withCapturedToastError((calls) => {
      reportInvalidFormatField('fieldMinValueError', ui, noop, noop, 'numeric-field-qty', { min: 1 });
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], [ui('fieldMinValueError', { min: 1 }), { id: 'numeric-field-qty' }]);
    });
  });

  it('calls toast.error with a single arg when no toastId is given (email/website/phone gates, unchanged)', () => {
    withCapturedToastError((calls) => {
      reportInvalidFormatField('sendModalInvalidEmail', ui, noop, noop);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], [ui('sendModalInvalidEmail', {})]);
    });
  });

  it('returns null and flips isSaving to false regardless of toastId', () => {
    const isSavingCalls = [];
    let result;
    withCapturedToastError(() => {
      result = reportInvalidFormatField('fieldMinValueError', ui, noop, (v) => isSavingCalls.push(v), 'numeric-field-qty', { min: 1 });
    });
    assert.equal(result, null);
    assert.deepEqual(isSavingCalls, [false]);
  });

  it('the id derived from getNumericFieldViolation.key matches EntityForm\'s numericFieldToastId for the same field', async () => {
    // Cross-file contract: EntityForm's blur toast and this save-gate toast
    // MUST compute the identical id for the same field key so sonner dedupes
    // a near-simultaneous blur+click into a single toast instead of stacking.
    const { numericFieldToastId } = await import('../../lib/numericValidation.js');
    const fields = [{ key: 'usableLifeMonths', min: 1, integer: true, displayLogic: () => true }];
    const violation = getNumericFieldViolation(fields, { usableLifeMonths: 0 });
    assert.equal(numericFieldToastId(violation.key), 'numeric-field-usableLifeMonths');
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

describe('extractErrorMessage — AD-translated duplicate-identifier error (ETP-4597)', () => {
  // Bug: Etendo AD's backend core sometimes already rewrites a raw Postgres
  // unique-constraint violation into a human-readable-but-still-technical
  // sentence that names the AD entity's technical field group — e.g. (in
  // Spanish) "Ya existe un/a Categoría del producto con el mismo (Entidad,
  // Organización, Identificador). (Entidad, Organización, Identificador) debe
  // ser único. Cambie los valores introducidos" — or the English equivalent
  // naming (Client, Organization, Identifier). normalizeServerError (private
  // to useEntity.js, exercised here through the exported extractErrorMessage)
  // only recognizes the RAW Postgres wording ("duplicate key value violates
  // unique constraint"); this AD-translated sentence falls through untouched
  // to the raw-message passthrough, so the technical field names leak to the
  // end user.
  //
  // Contract asserted here (the eventual fix must satisfy this test, not the
  // other way around): extractErrorMessage(res, ui) must rewrite this sentence
  // into a short, generic, user-friendly message, and it must never leak
  // "Entidad/Organización/Identificador" (or the EN equivalents
  // Client/Organization/Identifier). The Spanish copy the end user actually
  // sees lives in es_ES.json under the validationDuplicateIdentifier key (per
  // the project i18n policy); this test exercises the untranslated code-level
  // fallback default, which follows the English convention used by every
  // sibling translate() call in this same function (validationRequiredField,
  // validationRequiredGeneric, validationDuplicateRecord).
  //
  // `ui` is mocked as identity (i.e. "no translation available"), same
  // convention already used by the handleSaveErrorResponse tests above.
  const ui = (key) => key;
  const FRIENDLY_MESSAGE = 'A record with the same identifier already exists. Please enter a different one.';
  const AD_MESSAGE_ES = 'Ya existe un/a Categoría del producto con el mismo (Entidad, Organización, Identificador). '
    + '(Entidad, Organización, Identificador) debe ser único. Cambie los valores introducidos';

  const fakeResponse = (body, status = 400) => ({
    status,
    json: async () => body,
  });

  it('rewrites the AD-translated unique-constraint sentence into a generic friendly message', async () => {
    const res = fakeResponse({ error: { message: AD_MESSAGE_ES } });

    const result = await extractErrorMessage(res, ui);

    assert.equal(result, FRIENDLY_MESSAGE);
    // Guards against leaking the AD's technical field-group fingerprint
    // (the parenthesized listing, e.g. "(Entidad, Organización, Identificador)"
    // or "(Client, Organization, Identifier)") — not the word "identificador"
    // in natural prose, which the mandated friendly message itself contains.
    assert.doesNotMatch(
      result,
      /\(Entidad[,)]|\(Organizaci[oó]n[,)]|\(Client[,)]|\(Organization[,)]/i,
    );
  });
});
