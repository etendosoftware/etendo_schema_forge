/**
 * Tests for exported pure helpers from useEntity.js.
 * The hook itself (useEntity) needs full React + auth context — tested indirectly.
 * These tests cover the utility functions that are exported independently.
 */
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { toast } from 'sonner';
import {
  pickMessage,
  pickMessageFromObject,
  extractErrorMessage,
  applyContactNameDefaults,
  parseCriteriaInto,
  normalizeDefaultValue,
  shouldSkipPayloadField,
  getReadOnly,
  getVisible,
  getUrl,
  getMethod,
  buildPatchPayload,
  handleSaveErrorResponse,
  getSaveSuccessMessage,
  buildCreatePayload,
  reportMissingRequiredFields,
  shouldRefetchAfterSave,
  showSaveSuccessToast,
} from '../useEntity';

describe('useEntity helpers', () => {
  describe('pickMessage', () => {
    it('returns null for falsy input', () => {
      expect(pickMessage(null)).toBeNull();
      expect(pickMessage(undefined)).toBeNull();
      expect(pickMessage('')).toBeNull();
      expect(pickMessage(0)).toBeNull();
    });

    it('returns trimmed string for string input', () => {
      expect(pickMessage('Error occurred')).toBe('Error occurred');
      expect(pickMessage('  spaced  ')).toBe('spaced');
    });

    it('returns null for whitespace-only string', () => {
      expect(pickMessage('   ')).toBeNull();
    });

    it('extracts message from array (first non-null)', () => {
      expect(pickMessage([null, '', 'Found it'])).toBe('Found it');
    });

    it('extracts message from nested arrays', () => {
      expect(pickMessage([null, ['deep message']])).toBe('deep message');
    });

    it('extracts from object via preferred keys', () => {
      expect(pickMessage({ message: 'The error' })).toBe('The error');
      expect(pickMessage({ errorMessage: 'Bad thing' })).toBe('Bad thing');
      expect(pickMessage({ text: 'Info' })).toBe('Info');
    });

    it('falls back to any string value in object', () => {
      expect(pickMessage({ customKey: 'fallback msg' })).toBe('fallback msg');
    });

    it('returns null for empty object', () => {
      expect(pickMessage({})).toBeNull();
    });
  });

  describe('pickMessageFromObject', () => {
    it('prefers message key', () => {
      expect(pickMessageFromObject({ message: 'Main', description: 'Alt' })).toBe('Main');
    });

    it('tries keys in order: message > errorMessage > text > description > title', () => {
      expect(pickMessageFromObject({ title: 'T', description: 'D' })).toBe('D');
      expect(pickMessageFromObject({ title: 'T' })).toBe('T');
    });

    it('falls back to iterating values', () => {
      expect(pickMessageFromObject({ x: null, y: 'found' })).toBe('found');
    });

    it('returns null for undefined', () => {
      expect(pickMessageFromObject(undefined)).toBeNull();
    });

    it('throws on null (typeof null === object — known JS quirk)', () => {
      // pickMessageFromObject does `if (typeof node === 'object')` which is true for null
      // Then Object.values(null) throws. pickMessage guards against this by checking !node first.
      expect(() => pickMessageFromObject(null)).toThrow();
    });
  });

  describe('extractErrorMessage', () => {
    function mockResponse(data, status = 400) {
      return {
        json: async () => data,
        status,
      };
    }

    const ui = vi.fn((key, params) => {
      if (params) {
        let text = key;
        Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
        return text;
      }
      return key;
    });

    beforeEach(() => { ui.mockClear(); });

    it('extracts message from simple error object', async () => {
      const msg = await extractErrorMessage(mockResponse({ message: 'Something failed' }));
      expect(msg).toContain('Something failed');
    });

    it('extracts from nested error structures', async () => {
      const msg = await extractErrorMessage(mockResponse({
        response: { error: { message: 'Deep error' } },
      }));
      expect(msg).toBeTruthy();
    });

    it('handles response.json() failure — throws ReferenceError (known bug: translate not in scope)', async () => {
      const badRes = { json: async () => { throw new Error('parse fail'); }, status: 500 };
      await expect(extractErrorMessage(badRes)).rejects.toThrow();
    });

    it('uses ui translate function when provided', async () => {
      const msg = await extractErrorMessage(mockResponse({ message: 'err' }), ui);
      expect(msg).toBeTruthy();
    });

    // --- null value in column branch (with table-specific labels) ---
    it('detects null value in column of known table (c_bpartner.value)', async () => {
      const data = { error: { message: 'null value in column "value" of relation "c_bpartner" violates not-null constraint' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      // translate falls back to 'The field "{field}" is required.'
      expect(msg).toContain('is required');
    });

    it('detects null value in column of known table (c_bpartner.name)', async () => {
      const data = { error: { message: 'null value in column "name" of relation "c_bpartner" violates not-null' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('is required');
    });

    it('detects null value in column of unknown table', async () => {
      const data = { error: { message: 'null value in column "somefield" of relation "unknown_table"' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('is required');
    });

    it('detects null value in column with global label (ad_org_id)', async () => {
      const data = { error: { message: 'null value in column "ad_org_id" of relation "some_table"' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      // ui returns key as-is, translate falls through to fallback with field param
      expect(msg).toContain('is required');
    });

    // --- violates not-null (generic, without column name) ---
    it('detects generic not-null constraint violation', async () => {
      const data = { error: { message: 'ERROR: violates not-null constraint on some column' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      // ui mock returns key as-is, but translate() sees key === translated so uses fallback
      expect(msg).toBe('A required field is missing.');
    });

    // --- duplicate key ---
    it('detects duplicate key violation', async () => {
      const data = { error: { message: 'duplicate key value violates unique constraint "pk_something"' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      // ui mock returns key as-is, translate falls back to literal string
      expect(msg).toBe('A record with the same value already exists.');
    });

    // --- response.status -4 branch ---
    it('returns validationError when response.status is -4', async () => {
      const data = { response: { status: -4 } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      // translate returns fallback since ui(key) === key
      expect(msg).toBe('Validation error');
    });

    // --- NEO error path (data.error) ---
    it('extracts NEO top-level error message', async () => {
      const data = { error: { message: 'Record not found' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('Record not found');
    });

    // --- service error (data.response.error) ---
    it('extracts Etendo service error from response.error', async () => {
      const data = { response: { error: { message: 'Service unavailable' } } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('Service unavailable');
    });

    // --- validation error (data.response.errors) ---
    it('extracts validation error from response.errors', async () => {
      const data = { response: { errors: { message: 'Invalid field value' } } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('Invalid field value');
    });

    it('extracts validation error from response.errors array', async () => {
      const data = { response: { errors: ['Field X is invalid'] } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toBe('Field X is invalid');
    });

    // --- fallback: data.message ---
    it('uses data.message as fallback', async () => {
      const data = { message: 'Top-level fallback' };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('Top-level fallback');
    });

    // --- ultimate fallback: Error + status ---
    // translate() is defined inside the try block. When json() succeeds but no
    // message is found, the code exits the try normally and reaches line 167
    // which calls translate() — translate IS still in scope because it was defined
    // earlier in the same try block and the try completed normally (no throw).
    // But wait — re-reading the code: the `return` on line 167 is OUTSIDE the try.
    // `translate` was declared with `const` inside the try block, so it IS in scope
    // only inside that try. This means the return on line 167 hits a ReferenceError.
    // This is a known source bug — document the behavior.
    it('throws ReferenceError for fallback path (translate out of scope bug)', async () => {
      const data = { someIrrelevantKey: 42 };
      await expect(extractErrorMessage(mockResponse(data, 422), ui)).rejects.toThrow();
    });

    // --- translate without ui function ---
    it('falls back to fallback text when ui is not a function', async () => {
      const data = { error: { message: 'duplicate key value violates unique constraint' } };
      const msg = await extractErrorMessage(mockResponse(data));
      // Without ui, translate uses the fallback string
      expect(msg).toBe('A record with the same value already exists.');
    });

    // --- HTML entity decoding ---
    it('decodes HTML entities in error messages', async () => {
      const data = { error: { message: 'Field &quot;Name&quot; can&apos;t be &lt;empty&gt; &amp; null' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('Field "Name" can\'t be <empty> & null');
    });

    it('decodes &#34; and &#39; numeric entities', async () => {
      const data = { error: { message: 'Value &#34;test&#34; with &#39;quotes&#39;' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('"test"');
      expect(msg).toContain("'quotes'");
    });

    // --- translate with ui function that returns key (missing translation) ---
    it('uses fallback when ui returns the key unchanged', async () => {
      const keyPassthrough = (key) => key;
      const data = { error: { message: 'duplicate key value violates unique constraint "x"' } };
      const msg = await extractErrorMessage(mockResponse(data), keyPassthrough);
      expect(msg).toBe('A record with the same value already exists.');
    });
  });

  // -------------------------------------------------------------------
  // pickMessage with deeply nested structures
  // -------------------------------------------------------------------
  describe('pickMessage — deep nesting', () => {
    it('handles array of objects', () => {
      expect(pickMessage([{ message: 'found in array obj' }])).toBe('found in array obj');
    });

    it('handles nested object in object', () => {
      expect(pickMessage({ outer: { inner: { message: 'deeply nested' } } })).toBe('deeply nested');
    });

    it('handles mixed arrays and objects', () => {
      expect(pickMessage([null, { x: [{ text: 'deep' }] }])).toBe('deep');
    });

    it('returns null for empty arrays', () => {
      expect(pickMessage([])).toBeNull();
    });

    it('returns null for array of nulls', () => {
      expect(pickMessage([null, null])).toBeNull();
    });

    it('returns null for object with all-null values', () => {
      expect(pickMessage({ a: null, b: undefined })).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // applyContactNameDefaults
  // -------------------------------------------------------------------
  describe('applyContactNameDefaults', () => {
    it('derives name from firstName + lastName', () => {
      const payload = { firstName: 'John', lastName: 'Doe' };
      applyContactNameDefaults(payload, {});
      expect(payload.name).toBe('John Doe');
    });

    it('derives name from source when payload has no firstName/lastName', () => {
      const payload = {};
      applyContactNameDefaults(payload, { firstName: 'Jane', lastName: 'Smith' });
      expect(payload.name).toBe('Jane Smith');
    });

    it('does not overwrite existing name', () => {
      const payload = { name: 'Already Set', firstName: 'John', lastName: 'Doe' };
      applyContactNameDefaults(payload, {});
      expect(payload.name).toBe('Already Set');
    });

    it('sets username to name when username is empty', () => {
      const payload = { firstName: 'John', lastName: 'Doe' };
      applyContactNameDefaults(payload, {});
      expect(payload.username).toBe('John Doe');
    });

    it('does not set username when name is empty', () => {
      const payload = {};
      applyContactNameDefaults(payload, {});
      expect(payload.username).toBeUndefined();
    });

    it('handles only firstName (no lastName)', () => {
      const payload = { firstName: 'Solo' };
      applyContactNameDefaults(payload, {});
      expect(payload.name).toBe('Solo');
    });

    it('handles only lastName (no firstName)', () => {
      const payload = { lastName: 'Only' };
      applyContactNameDefaults(payload, {});
      expect(payload.name).toBe('Only');
    });

    it('truncates name to 60 chars', () => {
      const payload = { firstName: 'A'.repeat(40), lastName: 'B'.repeat(40) };
      applyContactNameDefaults(payload, {});
      expect(payload.name.length).toBe(60);
    });
  });

  // -------------------------------------------------------------------
  // parseCriteriaInto
  // -------------------------------------------------------------------
  describe('parseCriteriaInto', () => {
    it('parses a JSON object and pushes it', () => {
      const out = [];
      parseCriteriaInto('{"fieldName":"x","operator":"equals","value":"1"}', out);
      expect(out).toHaveLength(1);
      expect(out[0].fieldName).toBe('x');
    });

    it('parses a JSON array and spreads into out', () => {
      const out = [];
      parseCriteriaInto('[{"fieldName":"a"},{"fieldName":"b"}]', out);
      expect(out).toHaveLength(2);
    });

    it('silently skips malformed JSON', () => {
      const out = [];
      parseCriteriaInto('not-json', out);
      expect(out).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  // normalizeDefaultValue
  // -------------------------------------------------------------------
  describe('normalizeDefaultValue', () => {
    it('converts dd-MM-yyyy to yyyy-MM-dd', () => {
      const n = {};
      normalizeDefaultValue('25-12-2024', n, 'date');
      expect(n.date).toBe('2024-12-25');
    });

    it('strips surrounding single quotes', () => {
      const n = {};
      normalizeDefaultValue("'hello world'", n, 'val');
      expect(n.val).toBe('hello world');
    });

    it('unescapes escaped quotes inside single-quoted strings', () => {
      const n = {};
      normalizeDefaultValue("'it''s fine'", n, 'val');
      expect(n.val).toBe("it's fine");
    });

    it('converts integer to string (enum coercion)', () => {
      const n = {};
      normalizeDefaultValue(5, n, 'priority');
      expect(n.priority).toBe('5');
    });

    it('does not convert float to string', () => {
      const n = {};
      normalizeDefaultValue(5.5, n, 'amount');
      expect(n.amount).toBeUndefined();
    });

    it('does not modify a plain string', () => {
      const n = {};
      normalizeDefaultValue('hello', n, 'val');
      expect(n.val).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------
  // shouldSkipPayloadField
  // -------------------------------------------------------------------
  describe('shouldSkipPayloadField', () => {
    const defaultRefs = {
      current: new Set(),
    };
    const userRefs = { current: new Set() };
    const reqKeys = new Set();

    it('skips id field', () => {
      expect(shouldSkipPayloadField('id', 'xxx', defaultRefs, userRefs, reqKeys, false, {})).toBe(true);
    });

    it('skips $_identifier companion fields', () => {
      expect(shouldSkipPayloadField('bp$_identifier', 'Acme', defaultRefs, userRefs, reqKeys, false, {})).toBe(true);
    });

    it('skips empty string values', () => {
      expect(shouldSkipPayloadField('name', '', defaultRefs, userRefs, reqKeys, false, {})).toBe(true);
    });

    it('skips null values', () => {
      expect(shouldSkipPayloadField('name', null, defaultRefs, userRefs, reqKeys, false, {})).toBe(true);
    });

    it('skips NEO sequence placeholders', () => {
      expect(shouldSkipPayloadField('docNo', '<10000000>', defaultRefs, userRefs, reqKeys, false, {})).toBe(true);
    });

    it('skips short numeric legacy FK IDs from backend defaults', () => {
      const bRef = { current: new Set(['language']) };
      expect(shouldSkipPayloadField('language', '181', bRef, { current: new Set() }, new Set(), false, {})).toBe(true);
    });

    it('does not skip numeric FK ID if user changed it', () => {
      const bRef = { current: new Set(['language']) };
      const uRef = { current: new Set(['language']) };
      expect(shouldSkipPayloadField('language', '181', bRef, uRef, new Set(), false, {})).toBe(false);
    });

    it('does not skip numeric FK ID if it is a required field', () => {
      const bRef = { current: new Set(['language']) };
      expect(shouldSkipPayloadField('language', '181', bRef, { current: new Set() }, new Set(['language']), false, {})).toBe(false);
    });

    it('skips contacts billing fields on create', () => {
      expect(shouldSkipPayloadField('priceList', 'someVal', defaultRefs, userRefs, reqKeys, true, {})).toBe(true);
      expect(shouldSkipPayloadField('paymentMethod', 'someVal', defaultRefs, userRefs, reqKeys, true, {})).toBe(true);
    });

    it('does not skip billing fields when not contacts create', () => {
      expect(shouldSkipPayloadField('priceList', 'someVal', defaultRefs, userRefs, reqKeys, false, {})).toBe(false);
    });

    it('skips SmartClient temporary import references', () => {
      const editing = { 'bp$_identifier': 'Acme Corp' };
      expect(shouldSkipPayloadField('bp', '100_BusinessPartner', defaultRefs, userRefs, reqKeys, false, editing)).toBe(true);
    });

    it('does not skip non-temporary FK values', () => {
      const editing = { 'bp$_identifier': 'Acme Corp' };
      expect(shouldSkipPayloadField('bp', 'valid-uuid-123', defaultRefs, userRefs, reqKeys, false, editing)).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // getReadOnly
  // -------------------------------------------------------------------
  describe('getReadOnly', () => {
    it('returns true when field.readOnly is true', () => {
      const isRO = getReadOnly({});
      expect(isRO({ readOnly: true })).toBe(true);
    });

    it('returns false when field.readOnly is false and no logic', () => {
      const isRO = getReadOnly({});
      expect(isRO({ readOnly: false })).toBe(false);
    });

    it('evaluates readOnlyLogic function', () => {
      const editing = { documentStatus: 'CO' };
      const isRO = getReadOnly(editing);
      expect(isRO({ readOnlyLogic: (row) => row.documentStatus === 'CO' })).toBe(true);
      expect(isRO({ readOnlyLogic: (row) => row.documentStatus === 'DR' })).toBe(false);
    });

    it('returns false when readOnlyLogic throws', () => {
      const isRO = getReadOnly({});
      expect(isRO({ readOnlyLogic: () => { throw new Error('boom'); } })).toBe(false);
    });

    it('returns false when readOnlyLogic is not a function', () => {
      const isRO = getReadOnly({});
      expect(isRO({ readOnlyLogic: 'not-a-function' })).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // getVisible
  // -------------------------------------------------------------------
  describe('getVisible', () => {
    it('returns true when no displayLogic', () => {
      const isVis = getVisible({});
      expect(isVis({})).toBe(true);
    });

    it('evaluates displayLogic function', () => {
      const editing = { showField: true };
      const isVis = getVisible(editing);
      expect(isVis({ displayLogic: (row) => row.showField })).toBe(true);
      expect(isVis({ displayLogic: (row) => !row.showField })).toBe(false);
    });

    it('returns true when displayLogic throws', () => {
      const isVis = getVisible({});
      expect(isVis({ displayLogic: () => { throw new Error('boom'); } })).toBe(true);
    });

    it('handles null editing', () => {
      const isVis = getVisible(null);
      expect(isVis({ displayLogic: (row) => !!row })).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // getUrl / getMethod
  // -------------------------------------------------------------------
  describe('getUrl', () => {
    it('returns POST url for new record', () => {
      expect(getUrl(true, '/api', 'order', {})).toBe('/api/order');
    });

    it('returns PATCH url for existing record', () => {
      expect(getUrl(false, '/api', 'order', { id: '123' })).toBe('/api/order/123');
    });
  });

  describe('getMethod', () => {
    it('returns POST for new', () => {
      expect(getMethod(true)).toBe('POST');
    });

    it('returns PATCH for existing', () => {
      expect(getMethod(false)).toBe('PATCH');
    });
  });

  // -------------------------------------------------------------------
  // buildPatchPayload
  // -------------------------------------------------------------------
  describe('buildPatchPayload', () => {
    it('includes only changed fields', () => {
      const editing = { id: '1', name: 'New Name', status: 'DR' };
      const selected = { id: '1', name: 'Old Name', status: 'DR' };
      const payload = buildPatchPayload(editing, selected, 'order');
      expect(payload).toEqual({ name: 'New Name' });
    });

    it('returns empty object when nothing changed', () => {
      const record = { id: '1', name: 'Same' };
      expect(buildPatchPayload(record, record, 'order')).toEqual({});
    });

    it('skips id field', () => {
      const editing = { id: '2', name: 'X' };
      const selected = { id: '1', name: 'X' };
      const payload = buildPatchPayload(editing, selected, 'order');
      expect(payload.id).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------
  // handleSaveErrorResponse
  // -------------------------------------------------------------------
  describe('handleSaveErrorResponse', () => {
    it('parses MISSING_REQUIRED_FIELDS and sets field errors', async () => {
      const res = {
        clone: () => ({
          json: async () => ({
            error: {
              code: 'MISSING_REQUIRED_FIELDS',
              fields: ['name', 'bp'],
            },
          }),
        }),
        json: async () => ({ error: { message: 'Required fields missing' } }),
        status: 400,
      };
      const uiFn = (key) => key;
      const setFieldErrors = vi.fn();
      const setSaveError = vi.fn();
      await handleSaveErrorResponse(res, uiFn, setFieldErrors, setSaveError);
      expect(setFieldErrors).toHaveBeenCalledWith({
        name: 'fieldRequired',
        bp: 'fieldRequired',
      });
      expect(setSaveError).toHaveBeenCalledWith('requiredFieldsMissing');
    });

    it('falls back to extractErrorMessage for other error shapes', async () => {
      const res = {
        clone: () => ({
          json: async () => ({ error: { message: 'Generic error' } }),
        }),
        json: async () => ({ error: { message: 'Generic error' } }),
        status: 500,
      };
      const uiFn = (key) => key;
      const setFieldErrors = vi.fn();
      const setSaveError = vi.fn();
      await handleSaveErrorResponse(res, uiFn, setFieldErrors, setSaveError);
      expect(setFieldErrors).not.toHaveBeenCalled();
      expect(setSaveError).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // getSaveSuccessMessage
  // -------------------------------------------------------------------
  describe('getSaveSuccessMessage', () => {
    it('returns recordCreated for new', () => {
      expect(getSaveSuccessMessage(true, (k) => k)).toBe('recordCreated');
    });

    it('returns recordSaved for existing', () => {
      expect(getSaveSuccessMessage(false, (k) => k)).toBe('recordSaved');
    });
  });

  // -------------------------------------------------------------------
  // buildCreatePayload
  // -------------------------------------------------------------------
  describe('buildCreatePayload', () => {
    it('builds payload skipping internal fields', () => {
      const editing = { id: '1', name: 'Test', bp$_identifier: 'Acme', status: 'DR' };
      const payload = {};
      buildCreatePayload(editing, { current: new Set() }, { current: new Set() }, new Set(), false, payload);
      expect(payload.name).toBe('Test');
      expect(payload.status).toBe('DR');
      expect(payload.id).toBeUndefined();
      expect(payload['bp$_identifier']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------
  // reportMissingRequiredFields
  // -------------------------------------------------------------------
  describe('reportMissingRequiredFields', () => {
    it('sets field errors, save error, and calls setIsSaving(false)', () => {
      const uiFn = (key) => key;
      const setFieldErrors = vi.fn();
      const setSaveError = vi.fn();
      const setIsSaving = vi.fn();
      const result = reportMissingRequiredFields(['name', 'bp'], uiFn, setFieldErrors, setSaveError, setIsSaving);
      expect(result).toBeNull();
      expect(setFieldErrors).toHaveBeenCalledWith({ name: 'fieldRequired', bp: 'fieldRequired' });
      expect(setSaveError).toHaveBeenCalledWith('requiredFieldsMissing');
      expect(setIsSaving).toHaveBeenCalledWith(false);
    });
  });

  // -------------------------------------------------------------------
  // shouldRefetchAfterSave
  // -------------------------------------------------------------------
  describe('shouldRefetchAfterSave', () => {
    it('returns true when saved has id and refetchAfterSave is true', () => {
      expect(shouldRefetchAfterSave({ id: '1' }, true)).toBe(true);
    });

    it('returns false when refetchAfterSave is false', () => {
      expect(shouldRefetchAfterSave({ id: '1' }, false)).toBe(false);
    });

    it('returns falsy when saved has no id', () => {
      expect(shouldRefetchAfterSave({}, true)).toBeFalsy();
      expect(shouldRefetchAfterSave(null, true)).toBeFalsy();
    });
  });

  // -------------------------------------------------------------------
  // showSaveSuccessToast
  // -------------------------------------------------------------------
  describe('showSaveSuccessToast', () => {
    it('shows toast when not silent', () => {
      showSaveSuccessToast(false, true, (k) => k);
      expect(toast.success).toHaveBeenCalledWith('recordCreated');
    });

    it('does not show toast when silent', () => {
      toast.success.mockClear();
      showSaveSuccessToast(true, true, (k) => k);
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('shows recordSaved for existing record', () => {
      toast.success.mockClear();
      showSaveSuccessToast(false, false, (k) => k);
      expect(toast.success).toHaveBeenCalledWith('recordSaved');
    });
  });

  // -------------------------------------------------------------------
  // applyContactNameDefaults — additional branches
  // -------------------------------------------------------------------
  describe('applyContactNameDefaults — edge cases', () => {
    it('derives name from source firstName only', () => {
      const payload = {};
      applyContactNameDefaults(payload, { firstName: 'Jane' });
      expect(payload.name).toBe('Jane');
      expect(payload.username).toBe('Jane');
    });

    it('derives name from source lastName only', () => {
      const payload = {};
      applyContactNameDefaults(payload, { lastName: 'Doe' });
      expect(payload.name).toBe('Doe');
      expect(payload.username).toBe('Doe');
    });

    it('does not set username when existing name is present', () => {
      const payload = { name: 'Existing', username: 'ExistingUser' };
      applyContactNameDefaults(payload, { firstName: 'A', lastName: 'B' });
      expect(payload.name).toBe('Existing');
      expect(payload.username).toBe('ExistingUser');
    });

    it('does nothing when neither payload nor source have names', () => {
      const payload = {};
      applyContactNameDefaults(payload, {});
      expect(payload.name).toBeUndefined();
      expect(payload.username).toBeUndefined();
    });

    it('uses payload firstName with source lastName when payload has no lastName', () => {
      const payload = { firstName: 'PayloadFirst' };
      applyContactNameDefaults(payload, { firstName: 'SourceFirst', lastName: 'SourceLast' });
      expect(payload.name).toBe('PayloadFirst SourceLast');
    });

    it('mixes payload firstName with source lastName', () => {
      const payload = { firstName: 'John' };
      applyContactNameDefaults(payload, { lastName: 'Smith' });
      expect(payload.name).toBe('John Smith');
    });
  });

  // -------------------------------------------------------------------
  // parseCriteriaInto — additional branches
  // -------------------------------------------------------------------
  describe('parseCriteriaInto — edge cases', () => {
    it('handles empty JSON object', () => {
      const out = [];
      parseCriteriaInto('{}', out);
      expect(out).toHaveLength(1);
      expect(out[0]).toEqual({});
    });

    it('handles empty JSON array', () => {
      const out = [];
      parseCriteriaInto('[]', out);
      expect(out).toHaveLength(0);
    });

    it('handles nested criteria object', () => {
      const out = [];
      parseCriteriaInto('{"_constructor":"AdvancedCriteria","operator":"and","criteria":[]}', out);
      expect(out).toHaveLength(1);
      expect(out[0]._constructor).toBe('AdvancedCriteria');
    });

    it('handles empty string', () => {
      const out = [];
      parseCriteriaInto('', out);
      expect(out).toHaveLength(0);
    });

    it('parses null JSON literal (pushes null)', () => {
      const out = [];
      parseCriteriaInto(null, out);
      // JSON.parse(null) returns null, which gets pushed as a single element
      expect(out).toHaveLength(1);
      expect(out[0]).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // normalizeDefaultValue — additional branches
  // -------------------------------------------------------------------
  describe('normalizeDefaultValue — edge cases', () => {
    it('converts dd-MM-yyyy format at boundaries', () => {
      const n = {};
      normalizeDefaultValue('01-01-2000', n, 'd');
      expect(n.d).toBe('2000-01-01');
    });

    it('does not convert yyyy-MM-dd format (not dd-MM-yyyy)', () => {
      const n = {};
      normalizeDefaultValue('2024-12-25', n, 'd');
      expect(n.d).toBeUndefined();
    });

    it('strips quotes from single-char value', () => {
      const n = {};
      normalizeDefaultValue("'Y'", n, 'flag');
      expect(n.flag).toBe('Y');
    });

    it('handles single-quoted empty string', () => {
      const n = {};
      normalizeDefaultValue("''", n, 'val');
      expect(n.val).toBe('');
    });

    it('converts integer zero to string', () => {
      const n = {};
      normalizeDefaultValue(0, n, 'priority');
      expect(n.priority).toBe('0');
    });

    it('converts negative integer to string', () => {
      const n = {};
      normalizeDefaultValue(-3, n, 'offset');
      expect(n.offset).toBe('-3');
    });

    it('does not convert boolean values', () => {
      const n = {};
      normalizeDefaultValue(true, n, 'active');
      expect(n.active).toBeUndefined();
    });

    it('does not convert null', () => {
      const n = {};
      normalizeDefaultValue(null, n, 'val');
      expect(n.val).toBeUndefined();
    });

    it('does not convert undefined', () => {
      const n = {};
      normalizeDefaultValue(undefined, n, 'val');
      expect(n.val).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------
  // shouldSkipPayloadField — additional branches
  // -------------------------------------------------------------------
  describe('shouldSkipPayloadField — additional branches', () => {
    const emptyRefs = { current: new Set() };
    const emptyReq = new Set();

    it('skips legacy FK pattern fields (e.g. adOrg_ID)', () => {
      // The regex ^[a-zA-Z]+_[A-Z]{2,4}$ matches single-word prefix + uppercase suffix
      expect(shouldSkipPayloadField('adOrg_ID', 'some-value', emptyRefs, emptyRefs, emptyReq, false, {})).toBe(true);
    });

    it('skips fields matching legacy FK pattern (e.g. language_ID)', () => {
      expect(shouldSkipPayloadField('language_ID', 'val', emptyRefs, emptyRefs, emptyReq, false, {})).toBe(true);
    });

    it('does not skip regular field names that look similar', () => {
      expect(shouldSkipPayloadField('description', 'text', emptyRefs, emptyRefs, emptyReq, false, {})).toBe(false);
    });

    it('skips undefined values', () => {
      expect(shouldSkipPayloadField('name', undefined, emptyRefs, emptyRefs, emptyReq, false, {})).toBe(true);
    });

    it('does not skip contacts billing fields when not contacts create', () => {
      expect(shouldSkipPayloadField('account', 'val', emptyRefs, emptyRefs, emptyReq, false, {})).toBe(false);
    });

    it('skips contacts account field on create', () => {
      expect(shouldSkipPayloadField('account', 'val', emptyRefs, emptyRefs, emptyReq, true, {})).toBe(true);
    });

    it('skips contacts customerBlocking field on create', () => {
      expect(shouldSkipPayloadField('customerBlocking', 'val', emptyRefs, emptyRefs, emptyReq, true, {})).toBe(true);
    });

    it('skips contacts purchasePricelist field on create', () => {
      expect(shouldSkipPayloadField('purchasePricelist', 'val', emptyRefs, emptyRefs, emptyReq, true, {})).toBe(true);
    });

    it('does not skip SmartClient ref when no identifier companion', () => {
      expect(shouldSkipPayloadField('bp', '100_BusinessPartner', emptyRefs, emptyRefs, emptyReq, false, {})).toBe(false);
    });

    it('does not skip valid UUID even with identifier companion', () => {
      const editing = { 'bp$_identifier': 'Acme' };
      expect(shouldSkipPayloadField('bp', 'A1B2C3D4E5F6', emptyRefs, emptyRefs, emptyReq, false, editing)).toBe(false);
    });

    it('skips 4-digit numeric FK from backend defaults', () => {
      const bRef = { current: new Set(['warehouse']) };
      expect(shouldSkipPayloadField('warehouse', '1234', bRef, { current: new Set() }, new Set(), false, {})).toBe(true);
    });

    it('does not skip 2-digit numeric value (too short for FK pattern)', () => {
      const bRef = { current: new Set(['x']) };
      expect(shouldSkipPayloadField('x', '12', bRef, { current: new Set() }, new Set(), false, {})).toBe(false);
    });

    it('does not skip 10-digit numeric value (too long for FK pattern)', () => {
      const bRef = { current: new Set(['x']) };
      expect(shouldSkipPayloadField('x', '1234567890', bRef, { current: new Set() }, new Set(), false, {})).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // extractErrorMessage — decodeHtml branch coverage
  // -------------------------------------------------------------------
  describe('extractErrorMessage — decodeHtml edge cases', () => {
    const ui = vi.fn((key, params) => {
      if (params) {
        let text = key;
        Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
        return text;
      }
      return key;
    });

    function mockResponse(data, status = 400) {
      return { json: async () => data, status };
    }

    beforeEach(() => { ui.mockClear(); });

    it('decodes &lt; and &gt; HTML entities', async () => {
      const data = { error: { message: 'Value must be &lt;100&gt;' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('<100>');
    });

    it('decodes &amp; entity', async () => {
      const data = { error: { message: 'A &amp; B' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('A & B');
    });

    it('decodes mixed entities in one string', async () => {
      const data = { error: { message: '&lt;b&gt;Error&lt;/b&gt; &amp; &quot;details&quot;' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('<b>Error</b>');
      expect(msg).toContain('& "details"');
    });
  });

  // -------------------------------------------------------------------
  // extractErrorMessage — toReadableLabel branch coverage
  // -------------------------------------------------------------------
  describe('extractErrorMessage — toReadableLabel', () => {
    const ui = vi.fn((key, params) => {
      if (params) {
        let text = key;
        Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
        return text;
      }
      return key;
    });

    function mockResponse(data, status = 400) {
      return { json: async () => data, status };
    }

    beforeEach(() => { ui.mockClear(); });

    it('converts underscore_column to Title Case', async () => {
      const data = { error: { message: 'null value in column "first_name" of relation "unknown_table"' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('First Name');
    });

    it('converts camelCase column to Title Case', async () => {
      const data = { error: { message: 'null value in column "firstName" of relation "unknown_table"' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('First Name');
    });

    it('handles empty column name gracefully', async () => {
      const data = { error: { message: 'null value in column "" of relation "some_table"' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      // Empty column triggers the fallback validationFieldGeneric → 'Field'
      expect(msg).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------
  // extractErrorMessage — REQUIRED_LABELS_BY_TABLE c_bpartner entries
  // -------------------------------------------------------------------
  describe('extractErrorMessage — REQUIRED_LABELS_BY_TABLE entries', () => {
    const ui = vi.fn((key, params) => {
      if (params) {
        let text = key;
        Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
        return text;
      }
      return key;
    });

    function mockResponse(data, status = 400) {
      return { json: async () => data, status };
    }

    beforeEach(() => { ui.mockClear(); });

    it('maps c_bpartner.c_bp_group_id to validationFieldBusinessPartnerCategory', async () => {
      const data = { error: { message: 'null value in column "c_bp_group_id" of relation "c_bpartner" violates not-null' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('is required');
      // ui should have been called with validationFieldBusinessPartnerCategory
      expect(ui).toHaveBeenCalledWith('validationFieldBusinessPartnerCategory', expect.anything());
    });

    it('maps c_bpartner.em_obtik_tax_id_key to validationFieldNifCountryKey', async () => {
      const data = { error: { message: 'null value in column "em_obtik_tax_id_key" of relation "c_bpartner" violates not-null' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('is required');
      expect(ui).toHaveBeenCalledWith('validationFieldNifCountryKey', expect.anything());
    });

    it('maps global ad_client_id to validationFieldClient', async () => {
      const data = { error: { message: 'null value in column "ad_client_id" of relation "some_random_table"' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('is required');
      expect(ui).toHaveBeenCalledWith('validationFieldClient', expect.anything());
    });
  });

  // -------------------------------------------------------------------
  // extractErrorMessage — normalizeServerError with translateBackendError fallback
  // -------------------------------------------------------------------
  describe('extractErrorMessage — normalizeServerError fallthrough', () => {
    const ui = vi.fn((key, params) => {
      if (params) {
        let text = key;
        Object.keys(params).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
        return text;
      }
      return key;
    });

    function mockResponse(data, status = 400) {
      return { json: async () => data, status };
    }

    beforeEach(() => { ui.mockClear(); });

    it('passes through unrecognized error message as-is', async () => {
      const data = { error: { message: 'Something completely unexpected happened' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      expect(msg).toContain('Something completely unexpected happened');
    });

    it('handles multiline whitespace in error messages', async () => {
      const data = { error: { message: 'Error   with   extra    spaces' } };
      const msg = await extractErrorMessage(mockResponse(data), ui);
      // normalizeServerError collapses whitespace
      expect(msg).toContain('Error with extra spaces');
    });
  });

  // -------------------------------------------------------------------
  // getReadOnly — additional branches
  // -------------------------------------------------------------------
  describe('getReadOnly — additional branches', () => {
    it('returns false for undefined readOnly and no logic', () => {
      const isRO = getReadOnly({});
      expect(isRO({})).toBe(false);
    });

    it('evaluates readOnlyLogic with different editing state', () => {
      const editing = { documentStatus: 'DR', processed: false };
      const isRO = getReadOnly(editing);
      expect(isRO({ readOnlyLogic: (row) => row.processed })).toBe(false);
    });

    it('returns true for readOnly true even with readOnlyLogic', () => {
      const isRO = getReadOnly({});
      expect(isRO({ readOnly: true, readOnlyLogic: () => false })).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // getVisible — additional branches
  // -------------------------------------------------------------------
  describe('getVisible — additional branches', () => {
    it('handles displayLogic as non-function (returns true)', () => {
      const isVis = getVisible({});
      expect(isVis({ displayLogic: 'not-a-function' })).toBe(true);
    });

    it('handles undefined editing', () => {
      const isVis = getVisible(undefined);
      expect(isVis({ displayLogic: (row) => !!row })).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // buildPatchPayload — additional branches
  // -------------------------------------------------------------------
  describe('buildPatchPayload — additional branches', () => {
    it('detects changes in boolean values', () => {
      const editing = { id: '1', active: false };
      const selected = { id: '1', active: true };
      const payload = buildPatchPayload(editing, selected, 'order');
      expect(payload).toEqual({ active: false });
    });

    it('detects changes from null to value', () => {
      const editing = { id: '1', name: 'New' };
      const selected = { id: '1', name: null };
      const payload = buildPatchPayload(editing, selected, 'order');
      expect(payload).toEqual({ name: 'New' });
    });

    it('detects changes from value to null', () => {
      const editing = { id: '1', name: null };
      const selected = { id: '1', name: 'Old' };
      const payload = buildPatchPayload(editing, selected, 'order');
      expect(payload).toEqual({ name: null });
    });

    it('includes multiple changed fields', () => {
      const editing = { id: '1', name: 'New', status: 'CO', amount: 100 };
      const selected = { id: '1', name: 'Old', status: 'DR', amount: 100 };
      const payload = buildPatchPayload(editing, selected, 'order');
      expect(payload).toEqual({ name: 'New', status: 'CO' });
    });
  });

  // -------------------------------------------------------------------
  // buildCreatePayload — additional branches
  // -------------------------------------------------------------------
  describe('buildCreatePayload — additional branches', () => {
    it('skips null and empty fields', () => {
      const editing = { id: '1', name: 'Test', empty: '', nullish: null };
      const payload = {};
      buildCreatePayload(editing, { current: new Set() }, { current: new Set() }, new Set(), false, payload);
      expect(payload.name).toBe('Test');
      expect(payload.empty).toBeUndefined();
      expect(payload.nullish).toBeUndefined();
    });

    it('skips NEO sequence placeholders', () => {
      const editing = { id: '1', docNo: '<10000000>', name: 'Test' };
      const payload = {};
      buildCreatePayload(editing, { current: new Set() }, { current: new Set() }, new Set(), false, payload);
      expect(payload.docNo).toBeUndefined();
      expect(payload.name).toBe('Test');
    });

    it('includes required fields even if they look like numeric FK', () => {
      const editing = { id: '1', warehouse: '181' };
      const payload = {};
      buildCreatePayload(
        editing,
        { current: new Set(['warehouse']) },
        { current: new Set() },
        new Set(['warehouse']),
        false,
        payload
      );
      expect(payload.warehouse).toBe('181');
    });
  });

  // -------------------------------------------------------------------
  // handleSaveErrorResponse — additional branches
  // -------------------------------------------------------------------
  describe('handleSaveErrorResponse — additional branches', () => {
    it('calls toast.error on generic errors', async () => {
      toast.error.mockClear();
      const res = {
        clone: () => ({
          json: async () => ({ error: { message: 'Server failed' } }),
        }),
        json: async () => ({ error: { message: 'Server failed' } }),
        status: 500,
      };
      const uiFn = (key) => key;
      const setFieldErrors = vi.fn();
      const setSaveError = vi.fn();
      await handleSaveErrorResponse(res, uiFn, setFieldErrors, setSaveError);
      expect(toast.error).toHaveBeenCalled();
    });

    it('handles clone().json() throwing (falls back to legacy extractor)', async () => {
      const res = {
        clone: () => ({
          json: async () => { throw new Error('clone parse fail'); },
        }),
        json: async () => ({ error: { message: 'Fallback error' } }),
        status: 400,
      };
      const uiFn = (key) => key;
      const setFieldErrors = vi.fn();
      const setSaveError = vi.fn();
      await handleSaveErrorResponse(res, uiFn, setFieldErrors, setSaveError);
      expect(setFieldErrors).not.toHaveBeenCalled();
      expect(setSaveError).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // reportMissingRequiredFields — additional branches
  // -------------------------------------------------------------------
  describe('reportMissingRequiredFields — additional branches', () => {
    it('shows toast.error with the missing fields message', () => {
      toast.error.mockClear();
      const uiFn = (key) => key;
      reportMissingRequiredFields(['field1'], uiFn, vi.fn(), vi.fn(), vi.fn());
      expect(toast.error).toHaveBeenCalledWith('requiredFieldsMissing');
    });

    it('handles single missing field', () => {
      const setFieldErrors = vi.fn();
      reportMissingRequiredFields(['onlyOne'], (k) => k, setFieldErrors, vi.fn(), vi.fn());
      expect(setFieldErrors).toHaveBeenCalledWith({ onlyOne: 'fieldRequired' });
    });

    it('handles many missing fields', () => {
      const setFieldErrors = vi.fn();
      reportMissingRequiredFields(['a', 'b', 'c', 'd'], (k) => k, setFieldErrors, vi.fn(), vi.fn());
      expect(setFieldErrors).toHaveBeenCalledWith({
        a: 'fieldRequired', b: 'fieldRequired', c: 'fieldRequired', d: 'fieldRequired',
      });
    });
  });

  // -------------------------------------------------------------------
  // getUrl — additional branches
  // -------------------------------------------------------------------
  describe('getUrl — additional branches', () => {
    it('handles complex base URL', () => {
      expect(getUrl(true, '/etendo/sws/neo', 'header', {})).toBe('/etendo/sws/neo/header');
    });

    it('handles entity with dashes', () => {
      expect(getUrl(false, '/api', 'sales-order', { id: 'abc-123' })).toBe('/api/sales-order/abc-123');
    });
  });

  // -------------------------------------------------------------------
  // shouldRefetchAfterSave — additional branches
  // -------------------------------------------------------------------
  describe('shouldRefetchAfterSave — additional branches', () => {
    it('returns falsy when saved is undefined', () => {
      expect(shouldRefetchAfterSave(undefined, true)).toBeFalsy();
    });

    it('returns falsy when saved.id is empty string', () => {
      expect(shouldRefetchAfterSave({ id: '' }, true)).toBeFalsy();
    });

    it('returns true with non-empty id and refetchAfterSave', () => {
      expect(shouldRefetchAfterSave({ id: 'uuid-123' }, true)).toBe(true);
    });
  });
});
