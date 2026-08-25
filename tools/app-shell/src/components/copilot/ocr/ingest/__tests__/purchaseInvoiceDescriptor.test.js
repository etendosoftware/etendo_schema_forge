import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTaxSearchTerm,
  buildLineOps,
  resolveTaxesForLines,
  toIsoDate,
  nonBlank,
} from '../purchaseInvoiceDescriptor.js';

/* -------------------------------------------------------------------------- */
/* buildTaxSearchTerm                                                         */
/* -------------------------------------------------------------------------- */

describe('buildTaxSearchTerm', () => {
  it('returns the textual label when present', () => {
    assert.equal(buildTaxSearchTerm({ tax_label: 'IVA 21%', tax_rate: 21 }), 'IVA 21%');
    assert.equal(buildTaxSearchTerm({ tax_label: 'Exento', tax_rate: null }), 'Exento');
    assert.equal(buildTaxSearchTerm({ tax_label: 'IVA Compras 21%' }), 'IVA Compras 21%');
  });

  it('falls back to "<rate>%" when only the rate is provided', () => {
    assert.equal(buildTaxSearchTerm({ tax_label: null, tax_rate: 21 }), '21%');
    assert.equal(buildTaxSearchTerm({ tax_rate: 12 }), '12%');
  });

  it('returns null when no tax info is present', () => {
    assert.equal(buildTaxSearchTerm({}), null);
    assert.equal(buildTaxSearchTerm({ tax_label: '', tax_rate: null }), null);
    assert.equal(buildTaxSearchTerm({ tax_label: '   ', tax_rate: null }), null);
  });

  it('ignores non-numeric rate values', () => {
    assert.equal(buildTaxSearchTerm({ tax_rate: 'not-a-number' }), null);
    assert.equal(buildTaxSearchTerm({ tax_rate: null, tax_label: null }), null);
  });

  it('prefers label over rate even when both are present', () => {
    // Label carries more trigram signal than a bare percentage.
    assert.equal(
      buildTaxSearchTerm({ tax_label: 'IVA Compras 21%', tax_rate: 21 }),
      'IVA Compras 21%',
    );
  });
});

/* -------------------------------------------------------------------------- */
/* buildLineOps                                                               */
/* -------------------------------------------------------------------------- */

describe('buildLineOps', () => {
  it('drops lines without a resolved product and surfaces the description', () => {
    const lines = [
      { description: 'Cement bag 50kg', quantity: 10, unit_price: 12 },
      { description: 'Mystery item' },
    ];
    const productByIdx = { 0: 'PROD-1' };
    const { lineOps, unmatched } = buildLineOps(lines, productByIdx);
    assert.equal(lineOps.length, 1);
    assert.deepEqual(unmatched, ['Mystery item']);
  });

  it('maps description, quantity, unit_price into the line body (C-15)', () => {
    const lines = [{
      description: 'Cement bag 50kg',
      quantity: 10,
      unit_price: 12.5,
    }];
    const { lineOps } = buildLineOps(lines, { 0: 'PROD-1' });
    assert.equal(lineOps.length, 1);
    assert.equal(lineOps[0].body.product, 'PROD-1');
    assert.equal(lineOps[0].body.description, 'Cement bag 50kg');
    assert.equal(lineOps[0].body.invoicedQuantity, 10);
    assert.equal(lineOps[0].body.unitPrice, 12.5);
    assert.equal(lineOps[0].body.listPrice, 12.5);
  });

  it('sets body.tax when the resolved tax map has the line idx', () => {
    const lines = [{ description: 'Item', quantity: 1, unit_price: 100 }];
    const { lineOps } = buildLineOps(lines, { 0: 'PROD-1' }, { 0: 'TAX-21' });
    assert.equal(lineOps[0].body.tax, 'TAX-21');
  });

  it('omits body.tax when no tax was resolved (lets server callout fill default)', () => {
    const lines = [{ description: 'Item', quantity: 1, unit_price: 100 }];
    const { lineOps } = buildLineOps(lines, { 0: 'PROD-1' }, {});
    assert.equal('tax' in lineOps[0].body, false);
  });

  it('omits body.description when LLM returned blank/null', () => {
    const lines = [{ description: '   ', quantity: 1, unit_price: 1 }];
    const { lineOps } = buildLineOps(lines, { 0: 'PROD-1' });
    assert.equal('description' in lineOps[0].body, false);
  });

  it('emits one batch op per line with parentRef pointing at "inv"', () => {
    const lines = [
      { description: 'A', quantity: 1, unit_price: 10 },
      { description: 'B', quantity: 2, unit_price: 20 },
    ];
    const { lineOps } = buildLineOps(lines, { 0: 'P1', 1: 'P2' }, { 0: 'T1' });
    assert.equal(lineOps[0].id, 'ln0');
    assert.equal(lineOps[1].id, 'ln1');
    assert.equal(lineOps[0].parentRef, 'inv');
    assert.equal(lineOps[0].spec, 'purchase-invoice');
    assert.equal(lineOps[0].entity, 'Lines');
  });
});

/* -------------------------------------------------------------------------- */
/* resolveTaxesForLines — fetch-mocked simSearch                              */
/* -------------------------------------------------------------------------- */

describe('resolveTaxesForLines', () => {
  let originalFetch;
  let originalWindow;
  let fetchUrls;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalWindow = globalThis.window;
    // simSearch reads window.location.pathname to derive the Etendo base URL.
    // Stub it so the helper doesn't blow up under node:test (no DOM).
    globalThis.window = { location: { pathname: '/web/com.etendoerp.go/index.html' } };
    fetchUrls = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  function mockSimSearchFetch(envelopeByCall) {
    let callIdx = 0;
    globalThis.fetch = async (url) => {
      fetchUrls.push(String(url));
      const envelope = Array.isArray(envelopeByCall) ? envelopeByCall[callIdx++] : envelopeByCall;
      return {
        ok: true,
        status: 200,
        json: async () => envelope,
      };
    };
  }

  // simSearch response shape (native /sws/neo/simsearch): the raw object IS the
  // JSON body — no more { message: "<JSON-string>" } double-encoded wrapper.
  function envelopeWith(matches) {
    return Object.fromEntries(
      matches.map((value, idx) => [
        `item_${idx}`,
        value ? { data: [{ id: value.id, name: value.name, similarity_percent: '90' }] } : { data: [] },
      ]),
    );
  }

  it('returns matched tax ids in the same order as the input lines', async () => {
    mockSimSearchFetch(envelopeWith([
      { id: 'TAX-21', name: 'IVA Compras 21%' },
      { id: 'TAX-12', name: 'IVA Compras 12%' },
    ]));
    const result = await resolveTaxesForLines({
      lines: [
        { tax_label: 'IVA 21%', tax_rate: 21 },
        { tax_label: null, tax_rate: 12 },
      ],
    });
    assert.deepEqual(result, ['TAX-21', 'TAX-12']);
    assert.equal(fetchUrls.length, 1, 'one batched simSearch call for all lines');
    assert.match(fetchUrls[0], /entityName=FinancialMgmtTaxRate/);
    // Native NEO Headless endpoint — no more generic Webhooks dispatcher.
    assert.match(fetchUrls[0], /\/sws\/neo\/simsearch(\?|$)/);
    assert.doesNotMatch(fetchUrls[0], /\/webhooks\//);
    assert.doesNotMatch(fetchUrls[0], /name=SimSearch/);
  });

  it('returns null for lines that simSearch did not match', async () => {
    mockSimSearchFetch(envelopeWith([
      { id: 'TAX-21', name: 'IVA 21%' },
      null,  // no match for the second line
    ]));
    const result = await resolveTaxesForLines({
      lines: [
        { tax_label: 'IVA 21%' },
        { tax_label: 'Unknown weird tax' },
      ],
    });
    assert.deepEqual(result, ['TAX-21', null]);
  });

  it('returns all-null when no line has tax info (no fetch performed)', async () => {
    let fetched = false;
    globalThis.fetch = async () => { fetched = true; return { ok: true, json: async () => ({}) }; };
    const result = await resolveTaxesForLines({
      lines: [
        { description: 'A' },
        { description: 'B', tax_label: '', tax_rate: null },
      ],
    });
    assert.deepEqual(result, [null, null]);
    assert.equal(fetched, false, 'no terms → no network call');
  });

  // ETP-4576 — a fourth case here passed `token: null` and expected `[]`. Under
  // the cookie scheme no token is ever held, so that branch swallowed every tax
  // resolution: an invoice came back with all its taxes silently dropped. Only
  // the "no lines at all" cases legitimately short-circuit.
  it('returns empty array when lines are missing', async () => {
    let fetched = false;
    globalThis.fetch = async () => { fetched = true; return { ok: true, json: async () => ({}) }; };
    assert.deepEqual(await resolveTaxesForLines({ lines: [] }), []);
    assert.deepEqual(await resolveTaxesForLines({}), []);
    assert.equal(fetched, false);
  });

  it('uses "<rate>%" when only tax_rate is provided (no label)', async () => {
    mockSimSearchFetch(envelopeWith([{ id: 'TAX-21', name: 'IVA 21%' }]));
    const result = await resolveTaxesForLines({
      lines: [{ tax_rate: 21 }],
    });
    assert.deepEqual(result, ['TAX-21']);
    // The query must include the constructed "21%" term.
    const url = fetchUrls[0];
    assert.match(decodeURIComponent(url), /\["21%"\]/);
  });
});

/* -------------------------------------------------------------------------- */
/* sanity checks on existing helpers (regression guard)                        */
/* -------------------------------------------------------------------------- */

describe('descriptor helpers (regression)', () => {
  it('toIsoDate normalises DD/MM/YYYY → YYYY-MM-DD', () => {
    assert.equal(toIsoDate('08/05/2026'), '2026-05-08');
    assert.equal(toIsoDate('8-5-26'), '2026-05-08');
    assert.equal(toIsoDate('2026-05-08'), '2026-05-08');
    assert.equal(toIsoDate(null), null);
  });

  it('nonBlank handles null, undefined, and whitespace', () => {
    assert.equal(nonBlank(null), false);
    assert.equal(nonBlank(undefined), false);
    assert.equal(nonBlank(''), false);
    assert.equal(nonBlank('  '), false);
    assert.equal(nonBlank('x'), true);
    assert.equal(nonBlank(0), true);
  });
});
