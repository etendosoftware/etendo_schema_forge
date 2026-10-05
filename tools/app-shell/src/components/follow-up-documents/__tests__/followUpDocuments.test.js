// @covers tools/app-shell/src/components/follow-up-documents/followUpDocuments.js
//
// The pure half of the follow-up document flow: reading the backend `followUp` annotation,
// building the action URL, mapping error codes to i18n keys, reading the created document,
// and the afterProcess → topbar prompt hand-off (queue, consume once, TTL).
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOLLOW_UP_PROMPT_EVENT,
  FOLLOW_UP_PROMPT_TTL_MS,
  buildFollowUpActionUrl,
  consumeFollowUpPrompt,
  createFollowUpAfterProcess,
  followUpErrorMessage,
  readConfiguredFollowUpEntries,
  readCreatedDocument,
  readFollowUpEntries,
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
        'FOLLOW_UP_MISSING_SETUP', 'UNKNOWN',
      ];
      for (const code of codes) {
        const message = followUpErrorMessage({ error: { code } }, translate);
        assert.ok(message && !message.startsWith('followUpError'), `${locale}: ${code} → ${message}`);
      }
    });
  }
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
