// @covers tools/app-shell/src/components/follow-up-documents/followUpDocuments.js
//
// The pure half of the follow-up document flow: reading the backend `followUp` annotation,
// building the action URL, mapping error codes to i18n keys, reading the created document,
// the input-required round-trip (reading the backend `input` block, its labels, and the
// collected values), and the afterProcess → topbar prompt hand-off (queue, consume once, TTL).
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOLLOW_UP_PROMPT_EVENT,
  FOLLOW_UP_PROMPT_TTL_MS,
  buildFollowUpActionUrl,
  consumeFollowUpPrompt,
  createFollowUpAfterProcess,
  followUpErrorMessage,
  followUpInputLabelKeys,
  followUpInputLabels,
  mergeFollowUpInputValues,
  readConfiguredFollowUpEntries,
  readCreatedDocument,
  readFollowUpEntries,
  readFollowUpInputRequest,
  requestFollowUpPrompt,
} from '../followUpDocuments.js';
import enUS from '../../../locales/en_US.json' with { type: 'json' };
import esES from '../../../locales/es_ES.json' with { type: 'json' };
import esAR from '../../../locales/es_AR.json' with { type: 'json' };

const SHIPMENT = { needed: true, pendingLines: 2, action: 'createShipment', targetSpec: 'goods-shipment' };
const RECEIPT = { needed: true, pendingLines: 1, action: 'createReceipt', targetSpec: 'goods-receipt' };

const record = (followUp, id = 'inv-1') => ({ id, followUp });

describe('readFollowUpEntries', () => {
  it('returns the available entries in the order the backend lists them, keyed', () => {
    const entries = readFollowUpEntries(record({ available: ['receipt', 'shipment'], shipment: SHIPMENT, receipt: RECEIPT }));
    assert.deepEqual(entries.map(e => e.key), ['receipt', 'shipment']);
    assert.equal(entries[1].action, 'createShipment');
    assert.equal(entries[1].pendingLines, 2);
  });

  for (const [name, input] of [
    ['a null record', null],
    ['a record without followUp', { id: 'x' }],
    ['a followUp whose available is not an array', record({ available: 'shipment', shipment: SHIPMENT })],
    ['an empty available list', record({ available: [], shipment: SHIPMENT })],
  ]) {
    it(`returns [] for ${name}`, () => {
      assert.deepEqual(readFollowUpEntries(input), []);
    });
  }

  for (const [name, entry] of [
    ['needed: false', { ...SHIPMENT, needed: false }],
    ['a missing action', { needed: true, pendingLines: 2 }],
    ['an empty action', { ...SHIPMENT, action: '' }],
  ]) {
    it(`drops an available key with ${name}`, () => {
      const entries = readFollowUpEntries(record({ available: ['shipment', 'receipt'], shipment: entry, receipt: RECEIPT }));
      assert.deepEqual(entries.map(e => e.key), ['receipt']);
    });
  }

  it('drops a key listed in available that has no detail object at all', () => {
    assert.deepEqual(readFollowUpEntries(record({ available: ['shipment'] })), []);
  });
});

describe('readConfiguredFollowUpEntries', () => {
  it('ignores a key the window has not configured (server-side rollout first)', () => {
    const rec = record({ available: ['invoice', 'shipment'], invoice: { needed: true, action: 'createInvoice' }, shipment: SHIPMENT });
    assert.deepEqual(readConfiguredFollowUpEntries(rec, { shipment: {} }).map(e => e.key), ['shipment']);
  });

  it('returns nothing when the window configures no option', () => {
    assert.deepEqual(readConfiguredFollowUpEntries(record({ available: ['shipment'], shipment: SHIPMENT })), []);
  });
});

describe('buildFollowUpActionUrl', () => {
  for (const [name, apiBaseUrl] of [
    ['the spec-scoped base', '/sws/neo/sales-invoice'],
    ['a base with a trailing slash', '/sws/neo/sales-invoice/'],
    ['a base with several trailing slashes', '/sws/neo/sales-invoice///'],
    ['another window base (spec segment replaced)', '/sws/neo/purchase-invoice'],
  ]) {
    it(`builds the POST action URL from ${name}`, () => {
      assert.equal(
        buildFollowUpActionUrl({ apiBaseUrl, spec: 'sales-invoice', recordId: 'inv-1', action: 'createShipment' }),
        '/sws/neo/sales-invoice/header/inv-1/action/createShipment',
      );
    });
  }

  // Degenerate bases: the NEO prefix collapses exactly as the former regex pair did.
  for (const [name, apiBaseUrl, expectedPrefix] of [
    ['an undefined base', undefined, ''],
    ['an empty base', '', ''],
    ['a base that is only slashes', '///', ''],
    ['a base with no slash at all (kept as is)', 'neo', 'neo'],
  ]) {
    it(`builds the POST action URL from ${name}`, () => {
      assert.equal(
        buildFollowUpActionUrl({ apiBaseUrl, spec: 'sales-invoice', recordId: 'inv-1', action: 'createShipment' }),
        `${expectedPrefix}/sales-invoice/header/inv-1/action/createShipment`,
      );
    });
  }

  it('honours a custom entity and URL-encodes the id and the action', () => {
    assert.equal(
      buildFollowUpActionUrl({ apiBaseUrl: '/sws/neo/x', spec: 'sales-order', entity: 'order', recordId: 'a/b', action: 'do it' }),
      '/sws/neo/sales-order/order/a%2Fb/action/do%20it',
    );
  });
});

describe('followUpErrorMessage', () => {
  const ui = (key) => `t:${key}`;

  for (const [code, key] of [
    ['FOLLOW_UP_SOURCE_NOT_FOUND', 'followUpErrorSourceNotFound'],
    ['FOLLOW_UP_WRONG_DIRECTION', 'followUpErrorWrongDirection'],
    ['FOLLOW_UP_SOURCE_NOT_COMPLETED', 'followUpErrorSourceNotCompleted'],
    ['FOLLOW_UP_SOURCE_TYPE_NOT_ELIGIBLE', 'followUpErrorSourceTypeNotEligible'],
    ['FOLLOW_UP_NOTHING_PENDING', 'followUpErrorNothingPending'],
    ['FOLLOW_UP_DRAFT_IN_PROGRESS', 'followUpErrorDraftInProgress'],
    ['FOLLOW_UP_MISSING_SETUP', 'followUpErrorMissingSetup'],
    ['FOLLOW_UP_WAREHOUSE_REQUIRED', 'followUpErrorWarehouseRequired'],
    ['FOLLOW_UP_INVALID_INPUT', 'followUpErrorInvalidInput'],
  ]) {
    it(`translates ${code} to ${key}`, () => {
      assert.equal(followUpErrorMessage({ error: { code } }, ui), `t:${key}`);
    });
  }

  it('reads the code from the older { response: { error } } shape too', () => {
    assert.equal(
      followUpErrorMessage({ response: { error: { code: 'FOLLOW_UP_NOTHING_PENDING' } } }, ui),
      't:followUpErrorNothingPending',
    );
  });

  for (const [name, body] of [
    ['an unknown code', { error: { code: 'SOMETHING_ELSE', message: 'raw backend text' } }],
    ['a body without code', { error: { message: 'raw backend text' } }],
    ['a null body (unparseable response)', null],
  ]) {
    it(`falls back to the generic key for ${name}, never the raw backend text`, () => {
      assert.equal(followUpErrorMessage(body, ui), 't:followUpErrorGeneric');
    });
  }

  it('returns the key itself when no translator is available', () => {
    assert.equal(followUpErrorMessage({ error: { code: 'FOLLOW_UP_MISSING_SETUP' } }), 'followUpErrorMissingSetup');
  });

  // Every key the mapping can produce must resolve in the three catalogs, or the user sees
  // the raw key (the translator echoes it back silently).
  for (const [locale, dictionary] of Object.entries({ en_US: enUS, es_ES: esES, es_AR: esAR })) {
    it(`${locale} translates every error key the mapping can produce`, () => {
      const labels = dictionary.genericLabels;
      const translate = (key) => labels[key];
      const codes = [
        'FOLLOW_UP_SOURCE_NOT_FOUND', 'FOLLOW_UP_WRONG_DIRECTION', 'FOLLOW_UP_SOURCE_NOT_COMPLETED',
        'FOLLOW_UP_SOURCE_TYPE_NOT_ELIGIBLE', 'FOLLOW_UP_NOTHING_PENDING', 'FOLLOW_UP_DRAFT_IN_PROGRESS',
        'FOLLOW_UP_MISSING_SETUP', 'FOLLOW_UP_WAREHOUSE_REQUIRED', 'FOLLOW_UP_INVALID_INPUT', 'UNKNOWN',
      ];
      for (const code of codes) {
        const message = followUpErrorMessage({ error: { code } }, translate);
        assert.ok(message && !message.startsWith('followUpError'), `${locale}: ${code} → ${message}`);
      }
    });

    it(`${locale} translates the warehouse input label, its helper text and the generic fallback`, () => {
      const labels = dictionary.genericLabels;
      const translate = (key) => labels[key] ?? key;
      const known = followUpInputLabels('warehouseId', translate);
      const unknown = followUpInputLabels('somethingNew', translate);
      for (const text of [known.label, known.help, unknown.label]) {
        assert.ok(text && !text.startsWith('followUpInput'), `${locale}: ${text}`);
      }
    });
  }
});

describe('readFollowUpInputRequest', () => {
  const WAREHOUSES = [{ id: 'wh-1', name: 'Central' }, { id: 'wh-2', name: 'Norte' }];
  const inputError = (input, code = 'FOLLOW_UP_WAREHOUSE_REQUIRED') => ({ error: { code, status: 409, message: 'raw', input } });

  for (const [name, body, expected] of [
    ['the documented 409 body', inputError({ key: 'warehouseId', options: WAREHOUSES }), { key: 'warehouseId', options: WAREHOUSES }],
    ['the older { response: { error } } shape', { response: { error: { input: { key: 'warehouseId', options: WAREHOUSES } } } },
      { key: 'warehouseId', options: WAREHOUSES }],
    ['any input key (nothing warehouse-specific)', inputError({ key: 'locationId', options: [{ id: 'l-1', name: 'Dock' }] }, 'OTHER'),
      { key: 'locationId', options: [{ id: 'l-1', name: 'Dock' }] }],
    ['options without id dropped, numeric ids stringified, a missing name falls back to the id',
      inputError({ key: 'warehouseId', options: [null, { name: 'no id' }, { id: '' }, { id: 7 }, { id: 'wh-9', name: 'Sur' }] }),
      { key: 'warehouseId', options: [{ id: '7', name: '7' }, { id: 'wh-9', name: 'Sur' }] }],
  ]) {
    it(`reads ${name}`, () => {
      assert.deepEqual(readFollowUpInputRequest(body), expected);
    });
  }

  for (const [name, body] of [
    ['a null body', null],
    ['an error without input', { error: { code: 'FOLLOW_UP_WAREHOUSE_REQUIRED' } }],
    ['an input without key', inputError({ options: WAREHOUSES })],
    ['an input whose key is not an identifier', inputError({ key: '__proto__', options: WAREHOUSES })],
    ['an input whose key is inherited from Object.prototype', inputError({ key: 'constructor', options: WAREHOUSES })],
    ['an input with a dotted key', inputError({ key: 'a.b', options: WAREHOUSES })],
    ['an input with empty options', inputError({ key: 'warehouseId', options: [] })],
    ['an input whose options are not an array', inputError({ key: 'warehouseId', options: 'wh-1' })],
    ['an input whose options all lack an id', inputError({ key: 'warehouseId', options: [{ name: 'x' }] })],
  ]) {
    it(`returns null for ${name}`, () => {
      assert.equal(readFollowUpInputRequest(body), null);
    });
  }
});

describe('followUpInputLabelKeys / followUpInputLabels', () => {
  it('derives the label and helper keys from the input key', () => {
    assert.deepEqual(followUpInputLabelKeys('warehouseId'), {
      labelKey: 'followUpInputWarehouseId', helpKey: 'followUpInputWarehouseIdHelp',
    });
  });

  const catalog = { followUpInputWarehouseId: 'Almacén', followUpInputWarehouseIdHelp: 'Elige', followUpInputGeneric: 'Selecciona' };
  const echoing = (key) => catalog[key] ?? key;

  for (const [name, inputKey, ui, expected] of [
    ['a translated key', 'warehouseId', echoing, { label: 'Almacén', help: 'Elige' }],
    ['an untranslated key: generic label, no raw helper key', 'binId', echoing, { label: 'Selecciona', help: null }],
    ['no translator at all', 'warehouseId', undefined, { label: 'followUpInputGeneric', help: null }],
  ]) {
    it(`labels ${name}`, () => {
      assert.deepEqual(followUpInputLabels(inputKey, ui), expected);
    });
  }
});

describe('mergeFollowUpInputValues', () => {
  const ONE = { key: 'warehouseId', options: [{ id: 'wh-1' }] };
  const TWO = { key: 'warehouseId', options: [{ id: 'wh-1' }, { id: 'wh-2' }] };

  for (const [name, request, previous, expected] of [
    ['preselects the only option', ONE, {}, { warehouseId: 'wh-1' }],
    ['leaves the value empty with several options', TWO, {}, {}],
    ['keeps a previous choice that is still offered', TWO, { warehouseId: 'wh-2' }, { warehouseId: 'wh-2' }],
    ['drops a previous choice that is no longer offered', TWO, { warehouseId: 'wh-gone' }, {}],
    ['replaces a stale choice with the only option', ONE, { warehouseId: 'wh-gone' }, { warehouseId: 'wh-1' }],
    ['keeps the values already collected for other keys', TWO, { binId: 'b-1' }, { binId: 'b-1' }],
  ]) {
    it(name, () => {
      assert.deepEqual(mergeFollowUpInputValues(request, previous), expected);
    });
  }

  it('does not mutate the previous values', () => {
    const previous = { warehouseId: 'wh-gone' };
    mergeFollowUpInputValues(TWO, previous);
    assert.deepEqual(previous, { warehouseId: 'wh-gone' });
  });
});

describe('readCreatedDocument', () => {
  const doc = { id: 'sh-1', documentNo: 'ALB-1' };
  for (const [name, body, expected] of [
    ['an object data', { response: { data: doc } }, doc],
    ['an array data (first element)', { response: { data: [doc, { id: 'other' }] } }, doc],
    ['a data without id', { response: { data: { documentNo: 'ALB-1' } } }, null],
    ['an empty array', { response: { data: [] } }, null],
    ['a null body', null, null],
  ]) {
    it(`reads ${name}`, () => {
      assert.deepEqual(readCreatedDocument(body), expected);
    });
  }
});

describe('prompt hand-off (requestFollowUpPrompt / consumeFollowUpPrompt)', () => {
  const realNow = Date.now;
  afterEach(() => { Date.now = realNow; });

  it('is consumed exactly once and returns the queued record snapshot', () => {
    const rec = { id: 'once-1', documentNo: 'F-1' };
    requestFollowUpPrompt('sales-invoice', rec);
    assert.equal(consumeFollowUpPrompt('sales-invoice', 'once-1'), rec);
    assert.equal(consumeFollowUpPrompt('sales-invoice', 'once-1'), null);
  });

  it('is isolated by spec and by record id', () => {
    requestFollowUpPrompt('sales-invoice', { id: 'iso-1' });
    assert.equal(consumeFollowUpPrompt('purchase-invoice', 'iso-1'), null);
    assert.equal(consumeFollowUpPrompt('sales-invoice', 'iso-2'), null);
    assert.ok(consumeFollowUpPrompt('sales-invoice', 'iso-1'));
  });

  it('honours a prompt up to the TTL and discards (and removes) an older one', () => {
    Date.now = () => 1_000_000;
    requestFollowUpPrompt('sales-invoice', { id: 'ttl-ok' });
    requestFollowUpPrompt('sales-invoice', { id: 'ttl-old' });
    assert.ok(consumeFollowUpPrompt('sales-invoice', 'ttl-ok', 1_000_000 + FOLLOW_UP_PROMPT_TTL_MS));
    assert.equal(consumeFollowUpPrompt('sales-invoice', 'ttl-old', 1_000_000 + FOLLOW_UP_PROMPT_TTL_MS + 1), null);
    // The expired entry is gone, not merely hidden: a later consume within the window
    // must not resurrect it.
    assert.equal(consumeFollowUpPrompt('sales-invoice', 'ttl-old', 1_000_000), null);
  });

  it('purges a stale, never-consumed prompt when a new one is queued', () => {
    Date.now = () => 2_000_000;
    requestFollowUpPrompt('sales-invoice', { id: 'stale-1' });
    Date.now = () => 2_000_000 + FOLLOW_UP_PROMPT_TTL_MS + 1;
    requestFollowUpPrompt('sales-invoice', { id: 'fresh-1' });
    // Read with a clock at which stale-1 would still be valid: it was purged anyway.
    assert.equal(consumeFollowUpPrompt('sales-invoice', 'stale-1', 2_000_000), null);
    assert.ok(consumeFollowUpPrompt('sales-invoice', 'fresh-1', 2_000_000 + FOLLOW_UP_PROMPT_TTL_MS + 1));
  });

  for (const [name, spec, rec] of [
    ['no spec', '', { id: 'nospec-1' }],
    ['a record without id', 'sales-invoice', { documentNo: 'F-1' }],
  ]) {
    it(`queues nothing with ${name}`, () => {
      requestFollowUpPrompt(spec, rec);
      assert.equal(consumeFollowUpPrompt(spec, rec.id), null);
    });
  }

  it('announces the prompt with the spec and record id on the window event', () => {
    const target = new EventTarget();
    const received = [];
    target.addEventListener(FOLLOW_UP_PROMPT_EVENT, (e) => received.push(e.detail));
    globalThis.window = target;
    try {
      requestFollowUpPrompt('purchase-invoice', { id: 'evt-1' });
    } finally {
      delete globalThis.window;
    }
    assert.deepEqual(received, [{ spec: 'purchase-invoice', recordId: 'evt-1' }]);
    assert.ok(consumeFollowUpPrompt('purchase-invoice', 'evt-1'));
  });
});

describe('createFollowUpAfterProcess', () => {
  const OPTIONS = { shipment: { labelKey: 'x' } };
  const afterProcess = createFollowUpAfterProcess('sales-invoice', OPTIONS);

  it('keeps the user on the record and queues the prompt when a configured follow-up is pending', () => {
    const rec = record({ available: ['shipment'], shipment: SHIPMENT }, 'ap-1');
    assert.deepEqual(afterProcess(rec), { stay: true });
    assert.equal(consumeFollowUpPrompt('sales-invoice', 'ap-1'), rec);
  });

  for (const [name, rec] of [
    ['nothing is pending', record({ available: [] }, 'ap-2')],
    ['only an unconfigured key is pending', record({ available: ['receipt'], receipt: RECEIPT }, 'ap-3')],
    ['the record has no id', { followUp: { available: ['shipment'], shipment: SHIPMENT } }],
    ['there is no record', null],
  ]) {
    it(`returns null and queues nothing when ${name}`, () => {
      assert.equal(afterProcess(rec), null);
      if (rec?.id) assert.equal(consumeFollowUpPrompt('sales-invoice', rec.id), null);
    });
  }
});
