// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxReviewModel.js
// New file justification: no existing test covers the review-panel model; invoiceInboxFilters.test.js
// is about the list criteria (a different unit) and invoiceInboxMessages.test.js about backend codes.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTotals, documentTotal, totalMismatch, missingSet, lineKey, unresolvedProductCount, hasMissingTax,
  pendingCount, vendorView, productView, linkedProductSimilarity, joinMeta, extractedCountry, isReviewReadOnly, isOpenableRow,
  isSettledStatus, reviewBanners, reviewNeighbors, reviewErrorKey, lineAmount, lineRate,
  initialZoom, stepZoom, PAPER_WIDTH, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP,
  lineUnit6, toScaled, divRoundHalfAway, normalizeNumber, sameNumber, buildOp, applyOperationLocally,
  applyPendingToReview, newProductComplete, newProductName, saveErrorKey, isReloadCode, canMarkReviewed,
  SAVE_ERROR_LABEL_KEYS, NUMBER_FIELDS, currencyScale, lineFieldMissing, hasMissingLineField,
  canConfirm, isConfirmRetry, confirmBlockers,
} from '../invoiceInboxReviewModel.js';
import { readFileSync } from 'node:fs';

const line = (quantity, unitPrice, taxRate, extra = {}) => ({ quantity, unitPrice, taxRate, ...extra });

describe('lineAmount / lineRate', () => {
  it('multiplies quantity by price rounded to the cent', () => {
    assert.equal(lineAmount(line(3, 0.333)), 1);
    assert.equal(lineAmount(line(2, 10.5)), 21);
  });
  it('treats missing or non-numeric sides as 0', () => {
    assert.equal(lineAmount({}), 0);
    assert.equal(lineAmount(null), 0);
    assert.equal(lineAmount(line('abc', 5)), 0);
  });
  it('lineRate reads taxRate, then tax.rate, else null', () => {
    assert.equal(lineRate({ taxRate: 21 }), 21);
    assert.equal(lineRate({ tax: { rate: 10 } }), 10);
    assert.equal(lineRate({ taxRate: 0 }), 0);
    assert.equal(lineRate({}), null);
    assert.equal(lineRate({ taxRate: '' }), null);
    assert.equal(lineRate({ taxRate: 'x' }), null);
  });
});

describe('computeTotals', () => {
  it('no lines: zeros and no tax rows', () => {
    assert.deepEqual(computeTotals([]), { base: 0, taxes: [], linesTotal: 0 });
    assert.deepEqual(computeTotals(undefined), { base: 0, taxes: [], linesTotal: 0 });
  });
  it('groups one VAT row per rate, ascending', () => {
    const t = computeTotals([line(1, 100, 21), line(2, 50, 10), line(1, 100, 21)]);
    assert.equal(t.base, 300);
    assert.deepEqual(t.taxes, [
      { rate: 10, base: 100, amount: 10 },
      { rate: 21, base: 200, amount: 42 },
    ]);
    assert.equal(t.linesTotal, 352);
  });
  it('a line without a rate adds to the base only', () => {
    const t = computeTotals([line(1, 100, null), line(1, 100, 21)]);
    assert.equal(t.base, 200);
    assert.equal(t.taxes.length, 1);
    assert.equal(t.linesTotal, 221);
  });
});

describe('documentTotal', () => {
  const totals = { linesTotal: 121 };
  it('is the lines total, never the printed one (owner decision 2026-11-18)', () => {
    assert.equal(documentTotal(totals), 121);
    assert.equal(documentTotal(totals, null), 121);
  });
  it('is the created invoice grand total when given, rounded to the scale', () => {
    assert.equal(documentTotal(totals, 217.8), 217.8);
    assert.equal(documentTotal(totals, '217.804'), 217.8);
    assert.equal(documentTotal(totals, 0), 0);
  });
  it('ignores an invoice total that is empty or not a number', () => {
    assert.equal(documentTotal(totals, ''), 121);
    assert.equal(documentTotal(totals, 'n/a'), 121);
    assert.equal(documentTotal(totals, undefined), 121);
  });
  it('zero lines give zero', () => {
    assert.equal(documentTotal({ linesTotal: 0 }), 0);
  });
});

describe('totalMismatch', () => {
  const totals = { linesTotal: 100 };
  it('is null unless the total is the printed one', () => {
    assert.equal(totalMismatch({ totalSource: 'lines', totalAmount: 500 }, totals), null);
    assert.equal(totalMismatch({ totalAmount: 500 }, totals), null);
    assert.equal(totalMismatch(undefined, totals), null);
  });
  it('is null when the printed total is not a number', () => {
    assert.equal(totalMismatch({ totalSource: 'printed' }, totals), null);
    assert.equal(totalMismatch({ totalSource: 'printed', totalAmount: 'x' }, totals), null);
  });
  it('a difference of exactly one cent does not warn', () => {
    assert.equal(totalMismatch({ totalSource: 'printed', totalAmount: 100.01 }, totals), null);
    assert.equal(totalMismatch({ totalSource: 'printed', totalAmount: 99.99 }, totals), null);
  });
  it('a difference of two cents warns, with both amounts', () => {
    assert.deepEqual(totalMismatch({ totalSource: 'printed', totalAmount: 100.02 }, totals), { lines: 100, document: 100.02 });
    assert.deepEqual(totalMismatch({ totalSource: 'printed', totalAmount: 99.98 }, totals), { lines: 100, document: 99.98 });
  });
  it('no float drift: 0.1 + 0.2 style totals compare in integer cents', () => {
    assert.equal(totalMismatch({ totalSource: 'printed', totalAmount: 0.3 }, { linesTotal: 0.1 + 0.2 }), null);
  });
});

describe('validation helpers', () => {
  const doc = { validation: { missing: ['vendor', 'line[0].product', 'line[2].product', 'line[1].tax', 'amount'] } };
  it('missingSet is a Set, empty without a verdict', () => {
    assert.equal(missingSet(doc).size, 5);
    assert.equal(missingSet({}).size, 0);
    assert.equal(missingSet(null).size, 0);
    assert.equal(missingSet({ validation: { missing: 'oops' } }).size, 0);
  });
  it('unresolvedProductCount counts only line[i].product codes', () => {
    assert.equal(unresolvedProductCount(doc), 2);
    assert.equal(unresolvedProductCount({}), 0);
  });
  it('hasMissingTax detects line[i].tax', () => {
    assert.equal(hasMissingTax(doc), true);
    assert.equal(hasMissingTax({ validation: { missing: ['vendor'] } }), false);
  });
  it('pendingCount is the number of missing codes', () => {
    assert.equal(pendingCount(doc), 5);
    assert.equal(pendingCount(null), 0);
  });
  it('lineKey prefers the integer index, else the position', () => {
    assert.equal(lineKey({ index: 4 }, 0), 4);
    assert.equal(lineKey({ index: 0 }, 7), 0);
    assert.equal(lineKey({ index: '3' }, 2), 2);
    assert.equal(lineKey({}, 5), 5);
    assert.equal(lineKey(null, 1), 1);
  });
});

describe('vendorView / productView / text helpers', () => {
  it('vendorView falls back to "none" for an unknown or missing state', () => {
    assert.equal(vendorView({}).state, 'none');
    assert.equal(vendorView({ header: { vendor: { state: 'weird' } } }).state, 'none');
    assert.deepEqual(vendorView(null).candidates, []);
  });
  it('vendorView reads details first, then the vendor name', () => {
    const v = vendorView({ header: { vendor: { state: 'linked', name: 'Raw', details: { name: 'ACME SL', taxId: 'B1', city: 'Madrid' }, candidates: [{ id: 1 }] } } });
    assert.deepEqual([v.state, v.name, v.taxId, v.city, v.candidates.length], ['linked', 'ACME SL', 'B1', 'Madrid', 1]);
    assert.equal(vendorView({ header: { vendor: { state: 'new', name: 'Raw' } } }).name, 'Raw');
  });
  it('productView maps the product state', () => {
    assert.equal(productView({ product: { state: 'linked' } }), 'ok');
    assert.equal(productView({ product: { state: 'ambiguous' } }), 'pick');
    assert.equal(productView({ product: { state: 'new' } }), 'new');
    assert.equal(productView({ product: { state: 'zzz' } }), 'none');
    assert.equal(productView({}), 'none');
    assert.equal(productView(null), 'none');
  });
  it('linkedProductSimilarity reads the similarity of the linked candidate (ETP-6051)', () => {
    const product = (id, candidates) => ({ state: 'linked', id, matchedBy: 'suggested', candidates });
    assert.equal(linkedProductSimilarity(product('P1', [{ id: 'P1', similarity: '72' }, { id: 'P2', similarity: '90' }])), 72);
    assert.equal(linkedProductSimilarity(product('P2', [{ id: 'P1', similarity: '72' }, { id: 'P2', similarity: '96.7%' }])), 96.7);
    assert.equal(linkedProductSimilarity(product('P1', [{ id: 'P1', similarity: '88,5' }])), 88.5);
  });
  it('linkedProductSimilarity is null when there is no usable number (ETP-6051)', () => {
    assert.equal(linkedProductSimilarity({ id: 'P1', candidates: [{ id: 'P1' }] }), null);
    assert.equal(linkedProductSimilarity({ id: 'P1', candidates: [{ id: 'P1', similarity: ' ' }] }), null);
    assert.equal(linkedProductSimilarity({ id: 'P1', candidates: [{ id: 'P1', similarity: 'n/a' }] }), null);
    assert.equal(linkedProductSimilarity({ id: 'P1', candidates: [{ id: 'P2', similarity: '80' }] }), null);
    assert.equal(linkedProductSimilarity({ id: 'P1' }), null);
    assert.equal(linkedProductSimilarity(null), null);
  });
  it('joinMeta skips empty parts and trims', () => {
    assert.equal(joinMeta(['B1', ' ', null, ' Madrid ', undefined]), 'B1 · Madrid');
    assert.equal(joinMeta([]), '');
  });
  it('extractedCountry prefers the country name, trimmed', () => {
    assert.equal(extractedCountry({ countryName: ' Francia ', country: 'FR' }), 'Francia');
    assert.equal(extractedCountry({ country: 'FR' }), 'FR');
    assert.equal(extractedCountry({}), '');
    assert.equal(extractedCountry(undefined), '');
  });
});

describe('status helpers', () => {
  it('isSettledStatus: only CONFIRMED and DISCARDED', () => {
    assert.equal(isSettledStatus('CONFIRMED'), true);
    assert.equal(isSettledStatus('DISCARDED'), true);
    for (const s of ['READY', 'ERROR', 'PENDING_REVIEW', 'PROCESSING', undefined]) assert.equal(isSettledStatus(s), false);
  });
  it('isReviewReadOnly: forced, no review, editable false or settled', () => {
    assert.equal(isReviewReadOnly({ status: 'READY', editable: true }, true), true);
    assert.equal(isReviewReadOnly(null), true);
    assert.equal(isReviewReadOnly({ status: 'ERROR', editable: false }), true);
    assert.equal(isReviewReadOnly({ status: 'CONFIRMED' }), true);
    assert.equal(isReviewReadOnly({ status: 'DISCARDED', editable: true }), true);
    assert.equal(isReviewReadOnly({ status: 'READY', editable: true }), false);
    assert.equal(isReviewReadOnly({ status: 'READY' }), false);
  });
  it('isOpenableRow: everything but PROCESSING and nothing', () => {
    assert.equal(isOpenableRow({ status: 'PROCESSING' }), false);
    assert.equal(isOpenableRow(null), false);
    for (const s of ['READY', 'ERROR', 'CONFIRMED', 'DISCARDED', 'PENDING_REVIEW']) assert.equal(isOpenableRow({ status: s }), true);
  });
  it('reviewErrorKey maps codes, unknown codes get the generic text', () => {
    assert.equal(reviewErrorKey('processing'), 'invoiceInboxReviewErrorProcessing');
    assert.equal(reviewErrorKey('not_found'), 'invoiceInboxReviewErrorNotFound');
    assert.equal(reviewErrorKey('feature_disabled'), 'invoiceInboxReviewErrorFeatureDisabled');
    assert.equal(reviewErrorKey('org_not_allowed'), 'invoiceInboxReviewErrorOrg');
    assert.equal(reviewErrorKey('boom'), 'invoiceInboxReviewErrorGeneric');
    assert.equal(reviewErrorKey(null), 'invoiceInboxReviewErrorGeneric');
  });
});

describe('reviewBanners', () => {
  const dup = { state: 'found', invoices: [{ documentNo: 'F-1' }] };
  it('no review: no banners', () => assert.deepEqual(reviewBanners(null), []));
  it('CONFIRMED shows only the confirmed banner, even with a duplicate', () => {
    assert.deepEqual(reviewBanners({ status: 'CONFIRMED', document: { header: { duplicate: dup } } }), [{ kind: 'confirmed' }]);
  });
  it('DISCARDED shows nothing', () => {
    assert.deepEqual(reviewBanners({ status: 'DISCARDED', document: { header: { duplicate: dup } } }), []);
  });
  it('UNREADABLE error shows the unreadable banner only while not adjusted', () => {
    assert.deepEqual(reviewBanners({ status: 'ERROR', errorCode: 'UNREADABLE' }), [{ kind: 'unreadable' }]);
    assert.deepEqual(reviewBanners({ status: 'ERROR', errorCode: 'UNREADABLE', adjusted: true }), []);
  });
  it('other error codes show an error banner with the code; MISSING_FIELDS shows none', () => {
    for (const code of ['SERVICE_FAILURE', 'REFERENCE_TOO_LONG', 'FOREIGN_RECEIVER']) {
      assert.deepEqual(reviewBanners({ status: 'ERROR', errorCode: code }), [{ kind: 'error', code }]);
    }
    assert.deepEqual(reviewBanners({ status: 'ERROR', errorCode: 'MISSING_FIELDS' }), []);
    assert.deepEqual(reviewBanners({ status: 'ERROR' }), []);
  });
  it('an unsettled document with an invoice duplicate and inbox duplicates shows both', () => {
    const b = reviewBanners({ status: 'READY', document: { header: { duplicate: { ...dup, inbox: [{ fileName: 'a.pdf' }] } } } });
    assert.deepEqual(b.map((x) => x.kind), ['duplicate', 'duplicateInbox']);
    assert.deepEqual(b[0].invoice, { documentNo: 'F-1' });
  });
  it('a duplicate state other than found, or without invoices, shows nothing', () => {
    assert.deepEqual(reviewBanners({ status: 'READY', document: { header: { duplicate: { state: 'none' } } } }), []);
    assert.deepEqual(reviewBanners({ status: 'READY', document: { header: { duplicate: { state: 'found', invoices: [] } } } }), []);
  });
});

describe('reviewNeighbors', () => {
  const rows = [
    { id: 'a', status: 'READY' }, { id: 'p', status: 'PROCESSING' }, { id: 'b', status: 'ERROR' }, { id: 'c', status: 'CONFIRMED' },
  ];
  it('skips PROCESSING rows when walking', () => {
    const n = reviewNeighbors(rows, 'a');
    assert.equal(n.nextId, 'b');
    assert.equal(n.prevId, null);
    assert.equal(n.total, 3);
    assert.equal(n.index, 0);
    assert.equal(reviewNeighbors(rows, 'b').prevId, 'a');
  });
  it('the last row has no next', () => {
    const n = reviewNeighbors(rows, 'c');
    assert.equal(n.nextId, null);
    assert.equal(n.prevId, 'b');
  });
  it('an id that is not among the openable rows has index -1 and no neighbours', () => {
    for (const id of ['zzz', 'p', null]) {
      const n = reviewNeighbors(rows, id);
      assert.deepEqual([n.index, n.prevId, n.nextId], [-1, null, null]);
    }
  });
  it('tolerates no rows', () => {
    assert.deepEqual(reviewNeighbors(undefined, 'a').openable, []);
  });
});

describe('zoom', () => {
  it('constants are the design ones', () => {
    assert.deepEqual([ZOOM_MIN, ZOOM_MAX, ZOOM_STEP, PAPER_WIDTH], [40, 160, 15, 595]);
  });
  it('initial zoom is 100 for a wide pane, an unknown width or a nonsense one', () => {
    for (const w of [595, 600, 1200, 0, -5, NaN, undefined]) assert.equal(initialZoom(w), 100, String(w));
  });
  it('fits a narrow pane to the multiple of 5 below, never under 45', () => {
    assert.equal(initialZoom(594), 95);
    assert.equal(initialZoom(400), Math.floor((400 / 595) * 20) * 5);
    assert.equal(initialZoom(300), 50);
    assert.equal(initialZoom(10), 45);
  });
  it('stepZoom moves by 15 and clamps to 40..160', () => {
    assert.equal(stepZoom(100, 1), 115);
    assert.equal(stepZoom(100, -1), 85);
    assert.equal(stepZoom(150, 1), 160);
    assert.equal(stepZoom(160, 1), 160);
    assert.equal(stepZoom(45, -1), 40);
    assert.equal(stepZoom(40, -1), 40);
  });
});

// ── ETP-6050 S2: totals fixture, number helpers, operations, optimistic copy ────────────
const FIXTURE = JSON.parse(readFileSync(new URL('../../../../../__tests__/fixtures/invoice-inbox-totals.json', import.meta.url), 'utf8'));

describe('totals fixture (SPA copy; Java keeps its own, a rounding change updates both)', () => {
  it('carries the 22 agreed cases', () => {
    assert.equal(FIXTURE.cases.length, 22);
  });
  for (const c of FIXTURE.cases) {
    it(`computeTotals: ${c.name}`, () => {
      const scale = c.scale ?? 2;
      const totals = computeTotals(c.lines, scale);
      assert.equal(totals.base, Number(c.expected.base ?? 0));
      assert.equal(totals.linesTotal, Number(c.expected.linesTotal));
      assert.deepEqual(
        totals.taxes.map((t) => [t.rate, t.docTaxAmount ?? 'D', t.base, t.amount]),
        (c.expected.taxes ?? []).map((t) => [t.rate, t.docTaxAmount ?? 'D', Number(t.base), Number(t.amount)]),
      );
      (c.expected.lines ?? []).forEach((expected, i) => {
        assert.equal(lineAmount(c.lines[i], scale), Number(expected.net), 'lineAmount');
        assert.equal(Number(lineUnit6(c.lines[i])) / 1e6, Number(expected.unit6), 'lineUnit6');
      });
    });
  }
});

describe('toScaled / divRoundHalfAway', () => {
  it('rounds HALF_UP away from zero on the decimal text', () => {
    assert.equal(toScaled(0.125, 2), 13n);
    assert.equal(toScaled(-0.125, 2), -13n);
    assert.equal(toScaled(1.005, 2), 101n);
    assert.equal(toScaled(2, 4), 20000n);
  });
  it('expands exponent notation', () => {
    assert.equal(toScaled(1e-7, 6), 0n);
    assert.equal(toScaled(5e-7, 6), 1n);
    assert.equal(toScaled(1e21, 0), 10n ** 21n);
    assert.equal(toScaled(1.5e-7, 7), 2n);
    assert.equal(toScaled(-5e-7, 6), -1n);
    assert.equal(toScaled(1.25e21, 0), 125n * 10n ** 19n);
    assert.equal(toScaled(1.2345e-5, 7), 123n);
  });
  it('returns null for missing or non-finite values', () => {
    for (const v of [null, undefined, '', 'abc', NaN, Infinity]) assert.equal(toScaled(v, 2), null, String(v));
  });
  it('divRoundHalfAway rounds the half away from zero', () => {
    assert.equal(divRoundHalfAway(5n, 10n), 1n);
    assert.equal(divRoundHalfAway(-5n, 10n), -1n);
    assert.equal(divRoundHalfAway(4n, 10n), 0n);
    assert.equal(divRoundHalfAway(-4n, 10n), 0n);
    assert.equal(divRoundHalfAway(15n, 10n), 2n);
  });
});

describe('normalizeNumber / sameNumber', () => {
  const ok = (value) => ({ value, isValid: true });
  it('rounds to the field scale', () => {
    assert.deepEqual(normalizeNumber('quantity', ok(1.23456)), { ok: true, value: 1.2346 });
    assert.deepEqual(normalizeNumber('taxRate', ok(21.005)), { ok: true, value: 21.01 });
  });
  it('empty: null for nullable fields, invalid for the others', () => {
    assert.deepEqual(normalizeNumber('discount', ok(null)), { ok: true, value: null });
    assert.deepEqual(normalizeNumber('taxRate', ok(null)), { ok: true, value: null });
    assert.deepEqual(normalizeNumber('quantity', ok(null)), { ok: false });
    assert.deepEqual(normalizeNumber('unitPrice', ok(null)), { ok: false });
  });
  it('rejects out of range, unparsable and unknown fields', () => {
    assert.deepEqual(normalizeNumber('discount', ok(100.01)), { ok: false });
    assert.deepEqual(normalizeNumber('discount', ok(-1)), { ok: false });
    assert.deepEqual(normalizeNumber('quantity', ok(NUMBER_FIELDS.quantity.max + 1)), { ok: false });
    assert.deepEqual(normalizeNumber('quantity', { value: 3, isValid: false }), { ok: false });
    assert.deepEqual(normalizeNumber('nope', ok(3)), { ok: false });
    assert.deepEqual(normalizeNumber('quantity', undefined), { ok: false });
  });
  it('accepts the bounds', () => {
    assert.deepEqual(normalizeNumber('discount', ok(100)), { ok: true, value: 100 });
    assert.deepEqual(normalizeNumber('discount', ok(0)), { ok: true, value: 0 });
  });
  it('sameNumber compares numerically; an absent discount may equal 0', () => {
    assert.equal(sameNumber(1, '1'), true);
    assert.equal(sameNumber(null, undefined), true);
    assert.equal(sameNumber(null, 0), false);
    assert.equal(sameNumber(undefined, 0, { absentIsZero: true }), true);
    assert.equal(sameNumber('', 0, { absentIsZero: true }), true);
    assert.equal(sameNumber(1, 2), false);
  });
});

describe('buildOp', () => {
  it('builds the contract bodies and drops undefined keys', () => {
    assert.deepEqual(buildOp.setHeader({ documentNo: 'A1', invoiceDate: undefined }), { op: 'setHeader', documentNo: 'A1' });
    assert.deepEqual(buildOp.setLine(2, { discount: null, quantity: undefined }), { op: 'setLine', index: 2, discount: null });
    assert.deepEqual(buildOp.addLine(), { op: 'addLine' });
    assert.deepEqual(buildOp.removeLine(1), { op: 'removeLine', index: 1 });
    assert.deepEqual(buildOp.selectVendor('V1'), { op: 'selectVendor', id: 'V1' });
    assert.deepEqual(buildOp.selectProduct(0, 'P1'), { op: 'selectProduct', index: 0, id: 'P1' });
    assert.deepEqual(buildOp.newProduct(3, { categoryId: 'C', uomId: undefined }), { op: 'newProduct', index: 3, categoryId: 'C' });
    assert.deepEqual(buildOp.newProduct(3), { op: 'newProduct', index: 3 });
  });
  it('newVendor carries fields only when there are some', () => {
    assert.deepEqual(buildOp.newVendor(), { op: 'newVendor' });
    assert.deepEqual(buildOp.newVendor({}), { op: 'newVendor' });
    assert.deepEqual(buildOp.newVendor({ name: 'ACME' }), { op: 'newVendor', fields: { name: 'ACME' } });
  });
});

describe('applyOperationLocally', () => {
  const doc = () => ({
    header: { documentNo: 'X', invoiceDate: '2026-01-01', vendor: { state: 'ambiguous', candidates: [{ id: 'V1' }], extracted: { name: 'ACME' }, id: 'old', name: 'Old' } },
    lines: [
      { index: 0, description: 'A', quantity: 1, unitPrice: 10, taxRate: 21, tax: { rate: 21 }, discount: 5, product: { state: 'ambiguous', candidates: [] } },
      { index: 4, description: 'B', quantity: 2, unitPrice: 5, taxRate: 10, product: { state: 'none' } },
    ],
  });
  it('does not mutate its input and returns it for an unknown op', () => {
    const d = doc();
    const copy = structuredClone(d);
    applyOperationLocally(d, buildOp.setLine(0, { quantity: 9 }));
    assert.deepEqual(d, copy);
    assert.equal(applyOperationLocally(d, { op: 'bogus' }), d);
    assert.equal(applyOperationLocally(d, undefined), d);
  });
  it('setHeader sets documentNo and drops an emptied date', () => {
    const next = applyOperationLocally(doc(), buildOp.setHeader({ documentNo: 'Y', invoiceDate: null }));
    assert.equal(next.header.documentNo, 'Y');
    assert.equal('invoiceDate' in next.header, false);
    assert.equal(applyOperationLocally(doc(), buildOp.setHeader({ invoiceDate: '2026-02-02' })).header.invoiceDate, '2026-02-02');
  });
  it('setLine addresses the line by its stable index, not its position', () => {
    const next = applyOperationLocally(doc(), buildOp.setLine(4, { quantity: 7, description: 'Z', unitPrice: 1 }));
    assert.equal(next.lines[1].quantity, 7);
    assert.equal(next.lines[1].description, 'Z');
    assert.equal(next.lines[0].quantity, 1);
  });
  it('setLine: a null rate clears the resolved tax; a zero or null discount is removed', () => {
    let next = applyOperationLocally(doc(), buildOp.setLine(0, { taxRate: null }));
    assert.equal(next.lines[0].taxRate, null);
    assert.equal(next.lines[0].tax, null);
    next = applyOperationLocally(doc(), buildOp.setLine(0, { taxRate: 10 }));
    assert.equal(next.lines[0].taxRate, 10);
    assert.deepEqual(next.lines[0].tax, { rate: 21 });
    assert.equal('discount' in applyOperationLocally(doc(), buildOp.setLine(0, { discount: 0 })).lines[0], false);
    assert.equal('discount' in applyOperationLocally(doc(), buildOp.setLine(0, { discount: null })).lines[0], false);
    assert.equal(applyOperationLocally(doc(), buildOp.setLine(0, { discount: 12.5 })).lines[0].discount, 12.5);
  });
  it('addLine appends the next free index and inherits the previous line rate', () => {
    const next = applyOperationLocally(doc(), buildOp.addLine());
    assert.equal(next.lines.length, 3);
    assert.equal(next.lines[2].index, 5);
    assert.equal(next.lines[2].taxRate, 10);
    assert.equal(next.lines[2].quantity, 1);
    assert.equal(next.lines[2].unitPrice, 0);
    assert.equal(next.lines[2].product.state, 'none');
  });
  it('addLine on an empty document starts at index 0 without a rate', () => {
    const next = applyOperationLocally({ header: {}, lines: [] }, buildOp.addLine());
    assert.equal(next.lines[0].index, 0);
    assert.equal('taxRate' in next.lines[0], false);
    assert.equal(applyOperationLocally({}, buildOp.addLine()).lines.length, 1);
  });
  it('removeLine drops the line by index and keeps the others index', () => {
    const next = applyOperationLocally(doc(), buildOp.removeLine(0));
    assert.deepEqual(next.lines.map((l) => l.index), [4]);
  });
  it('selectVendor links it as manual with the hint copy', () => {
    const next = applyOperationLocally(doc(), buildOp.selectVendor('V1'), { name: 'ACME SL', taxId: 'B1', city: 'Madrid' });
    assert.equal(next.header.vendor.state, 'linked');
    assert.equal(next.header.vendor.matchedBy, 'manual');
    assert.equal(next.header.vendor.id, 'V1');
    assert.deepEqual(next.header.vendor.details, { name: 'ACME SL', taxId: 'B1', city: 'Madrid' });
  });
  it('newVendor drops the link and merges the extracted fields', () => {
    const next = applyOperationLocally(doc(), buildOp.newVendor({ taxId: 'B9' }));
    const vendor = next.header.vendor;
    assert.equal(vendor.state, 'new');
    assert.equal('id' in vendor, false);
    assert.equal('name' in vendor, false);
    assert.deepEqual(vendor.extracted, { name: 'ACME', taxId: 'B9' });
    assert.deepEqual(vendor.candidates, [{ id: 'V1' }]);
  });
  it('selectProduct links the line product and clears the new-product draft', () => {
    const d = doc();
    d.lines[0].product = { state: 'new', new: { name: 'n' } };
    const next = applyOperationLocally(d, buildOp.selectProduct(0, 'P1'), { name: 'Widget', searchKey: 'W-1' });
    assert.equal(next.lines[0].product.state, 'linked');
    assert.equal(next.lines[0].product.id, 'P1');
    assert.equal('new' in next.lines[0].product, false);
    assert.deepEqual(next.lines[0].product.details, { name: 'Widget', searchKey: 'W-1' });
  });
  it('newProduct starts from the line description and takes category / unit with their hints', () => {
    let next = applyOperationLocally(doc(), buildOp.newProduct(0));
    assert.equal(next.lines[0].product.state, 'new');
    assert.equal(next.lines[0].product.id, null);
    assert.equal(next.lines[0].product.new.name, 'A');
    next = applyOperationLocally(next, buildOp.newProduct(0, { categoryId: 'C1', uomId: 'U1' }), { category: 'Cat', uom: 'Kg' });
    assert.deepEqual(next.lines[0].product.new, { name: 'A', categoryId: 'C1', uomId: 'U1', category: 'Cat', uom: 'Kg', categorySource: 'manual', uomSource: 'manual' });
    next = applyOperationLocally(next, buildOp.newProduct(0, { categoryId: null }));
    assert.equal(next.lines[0].product.new.category, null);
    assert.equal(next.lines[0].product.new.uomId, 'U1');
  });
  it('a different category / unit id flips its pre-fill source to manual; re-sending the committed id keeps the source', () => {
    const prefilled = { lines: [{ index: 0, description: 'A', product: { state: 'new', new: { name: 'A', categoryId: 'C1', category: 'Cat', categorySource: 'ocr', uomId: 'U1', uom: 'Kg', uomSource: 'default' } } }] };
    const same = applyOperationLocally(prefilled, buildOp.newProduct(0, { categoryId: 'C1', uomId: 'U1' }), {});
    assert.equal(same.lines[0].product.new.categorySource, 'ocr');
    assert.equal(same.lines[0].product.new.uomSource, 'default');
    const changed = applyOperationLocally(prefilled, buildOp.newProduct(0, { categoryId: 'C2' }), { category: 'Other' });
    assert.equal(changed.lines[0].product.new.categorySource, 'manual');
    assert.equal(changed.lines[0].product.new.uomSource, 'default');
  });
  it('applyPendingToReview applies each pending op in order and passes through when empty', () => {
    const review = { status: 'PENDING_REVIEW', document: doc() };
    assert.equal(applyPendingToReview(review, []), review);
    assert.equal(applyPendingToReview(review, undefined), review);
    assert.equal(applyPendingToReview(null, [{ op: buildOp.addLine() }]), null);
    const next = applyPendingToReview(review, [
      { op: buildOp.setLine(0, { quantity: 3 }) },
      { op: buildOp.removeLine(4) },
      { op: buildOp.selectVendor('V1'), hint: { name: 'N' } },
    ]);
    assert.equal(next.status, 'PENDING_REVIEW');
    assert.deepEqual(next.document.lines.map((l) => [l.index, l.quantity]), [[0, 3]]);
    assert.equal(next.document.header.vendor.name, 'N');
    assert.equal(review.document.lines.length, 2);
  });
});

describe('newProductComplete / newProductName', () => {
  it('needs a name, a category and a unit', () => {
    assert.equal(newProductComplete({ description: 'D', product: { new: { categoryId: 'C', uomId: 'U' } } }), true);
    assert.equal(newProductComplete({ description: 'D', product: { new: { categoryId: 'C' } } }), false);
    assert.equal(newProductComplete({ description: 'D', product: { new: { uomId: 'U' } } }), false);
    assert.equal(newProductComplete({ description: '  ', product: { new: { categoryId: 'C', uomId: 'U' } } }), false);
    assert.equal(newProductComplete(null), false);
  });
  it('the own name wins over the description', () => {
    assert.equal(newProductName({ description: 'D', product: { new: { name: 'N' } } }), 'N');
    assert.equal(newProductName({ description: 'D' }), 'D');
    assert.equal(newProductName(null), '');
  });
});

describe('saveErrorKey / isReloadCode / canMarkReviewed', () => {
  it('maps every known code to its label key and falls back to the generic one', () => {
    for (const [code, key] of Object.entries(SAVE_ERROR_LABEL_KEYS)) assert.equal(saveErrorKey(code), key, code);
    assert.equal(saveErrorKey('stale_document'), 'invoiceInboxSaveErrorStale');
    assert.equal(saveErrorKey('request_too_large'), 'invoiceInboxSaveErrorTooLarge');
    assert.equal(saveErrorKey('missing_updated'), 'invoiceInboxSaveErrorGeneric');
    assert.equal(saveErrorKey('something_else'), 'invoiceInboxSaveErrorGeneric');
    assert.equal(saveErrorKey(undefined), 'invoiceInboxSaveErrorGeneric');
  });
  it('only the "document is not what you were editing" refusals reload', () => {
    for (const c of ['stale_document', 'processing', 'not_editable', 'not_reviewable']) assert.equal(isReloadCode(c), true, c);
    for (const c of ['invalid_value', 'unknown_vendor', 'not_valid', undefined]) assert.equal(isReloadCode(c), false, String(c));
  });
  it('canMarkReviewed: PENDING_REVIEW, editable and nothing missing', () => {
    const valid = { status: 'PENDING_REVIEW', editable: true, document: { validation: { missing: [] } } };
    assert.equal(canMarkReviewed(valid), true);
    assert.equal(canMarkReviewed({ ...valid, document: { validation: { missing: ['header.vendor'] } } }), false);
    assert.equal(canMarkReviewed({ ...valid, status: 'ERROR' }), false);
    assert.equal(canMarkReviewed({ ...valid, status: 'CONFIRMED' }), false);
    assert.equal(canMarkReviewed({ ...valid, editable: false }), false);
    assert.equal(canMarkReviewed(null), false);
  });
});

describe('ETP-6050 S2 — tax by id and negative lines', () => {
  it('setLine {taxId} shows the chosen tax at once; the rate is only used when the option exposed it', async () => {
    const m = await import('../invoiceInboxReviewModel.js');
    const doc = { lines: [{ index: 0, quantity: 1, unitPrice: 100, taxRate: 21, tax: { id: 'T21', rate: 21 } }] };
    const unknown = m.applyOperationLocally(doc, m.buildOp.setLine(0, { taxId: 'T10' }), { taxName: 'IVA 10%' });
    assert.equal(unknown.lines[0].tax.id, 'T10');
    assert.equal(unknown.lines[0].tax.state, 'pending');
    assert.equal(m.lineRate(unknown.lines[0]), null, 'the rate is never guessed');
    const known = m.applyOperationLocally(doc, m.buildOp.setLine(0, { taxId: 'T10' }), { taxName: 'IVA 10%', taxRate: 10 });
    assert.equal(m.lineRate(known.lines[0]), 10);
    const cleared = m.applyOperationLocally(doc, m.buildOp.setLine(0, { taxId: null }));
    assert.equal(m.lineRate(cleared.lines[0]), null);
  });

  it('totals work with negative lines (credit / return) and a zero price', async () => {
    const m = await import('../invoiceInboxReviewModel.js');
    const totals = m.computeTotals([
      { quantity: 2, unitPrice: 50, taxRate: 21 },
      { quantity: -1, unitPrice: 30, taxRate: 21 },
      { quantity: 3, unitPrice: 0, taxRate: 21 },
    ]);
    assert.equal(totals.base, 70);
    assert.equal(totals.linesTotal, 84.7);
    const negative = m.computeTotals([{ quantity: -1, unitPrice: 100, taxRate: 21 }]);
    assert.equal(negative.linesTotal, -121);
  });

  it('lineFieldMissing / hasMissingLineField read the line[i].quantity and unitPrice codes', async () => {
    const m = await import('../invoiceInboxReviewModel.js');
    const doc = { validation: { missing: ['line[2].quantity', 'line[0].unitPrice'] } };
    assert.equal(m.lineFieldMissing(m.missingSet(doc), 2, 'quantity'), true);
    assert.equal(m.lineFieldMissing(m.missingSet(doc), 2, 'unitPrice'), false);
    assert.equal(m.hasMissingLineField(doc, 'unitPrice'), true);
    assert.equal(m.hasMissingLineField({ validation: { missing: ['vendor'] } }, 'quantity'), false);
  });
});

describe('ETP-6050 S2 — currency scale', () => {
  it('currencyScale reads currency.scale and defaults to 2', async () => {
    const m = await import('../invoiceInboxReviewModel.js');
    assert.equal(m.currencyScale({ scale: 0 }), 0);
    assert.equal(m.currencyScale({ scale: 3 }), 3);
    assert.equal(m.currencyScale({}), 2);
    assert.equal(m.currencyScale(undefined), 2);
  });

  it('the mismatch tolerance is one minimal unit of the currency', async () => {
    const m = await import('../invoiceInboxReviewModel.js');
    const totals = { linesTotal: 122 };
    assert.equal(m.totalMismatch({ totalSource: 'printed', totalAmount: 123 }, totals, 0), null);
    assert.deepEqual(m.totalMismatch({ totalSource: 'printed', totalAmount: 124 }, totals, 0), { lines: 122, document: 124 });
    assert.equal(m.totalMismatch({ totalSource: 'printed', totalAmount: 122.01 }, totals, 2), null);
  });

  it('unit prices keep 6 decimals', async () => {
    const m = await import('../invoiceInboxReviewModel.js');
    assert.deepEqual(m.normalizeNumber('unitPrice', { value: 0.1234567, isValid: true }), { ok: true, value: 0.123457 });
  });
});

describe('ETP-6050 S2 — totals edge cases (any sign, missing sides, discount bounds)', () => {
  it('a line missing its quantity or its price counts for nothing (base, tax and total)', () => {
    const totals = computeTotals([
      { quantity: null, unitPrice: 10, taxRate: 21 },
      { quantity: 2, unitPrice: undefined, taxRate: 21 },
      { quantity: 1, unitPrice: 100, taxRate: 21 },
    ]);
    assert.equal(totals.base, 100);
    assert.deepEqual(totals.taxes.map((t) => [t.rate, t.base, t.amount]), [[21, 100, 21]]);
    assert.equal(totals.linesTotal, 121);
  });

  it('a zero quantity or a zero price counts as a valid line of amount 0 (and keeps its tax row)', () => {
    const totals = computeTotals([{ quantity: 0, unitPrice: 50, taxRate: 10 }, { quantity: 3, unitPrice: 0, taxRate: 10 }]);
    assert.equal(totals.base, 0);
    assert.deepEqual(totals.taxes, [{ rate: 10, base: 0, amount: 0 }]);
    assert.equal(totals.linesTotal, 0);
  });

  it('a negative price and a negative quantity multiply to a positive line; mixed signs net out', () => {
    assert.equal(computeTotals([{ quantity: -2, unitPrice: -5, taxRate: 0 }]).base, 10);
    const mixed = computeTotals([{ quantity: 1, unitPrice: 100, taxRate: 21 }, { quantity: -1, unitPrice: 100, taxRate: 21 }]);
    assert.equal(mixed.base, 0);
    assert.equal(mixed.linesTotal, 0);
  });

  it('a credit document (every line negative) totals negative with a negative tax amount', () => {
    const totals = computeTotals([{ quantity: -1, unitPrice: 100, taxRate: 21 }, { quantity: -2, unitPrice: 10.5, taxRate: 21 }]);
    assert.equal(totals.base, -121);
    assert.deepEqual(totals.taxes, [{ rate: 21, base: -121, amount: -25.41 }]);
    assert.equal(totals.linesTotal, -146.41);
  });

  it('a negative or over-100 discount is treated as 0; 100 gives a free line', () => {
    assert.equal(lineAmount({ quantity: 1, unitPrice: 10, discount: -20 }), 10);
    assert.equal(lineAmount({ quantity: 1, unitPrice: 10, discount: 150 }), 10);
    assert.equal(lineAmount({ quantity: 1, unitPrice: 10, discount: 100 }), 0);
    assert.equal(lineAmount({ quantity: 1, unitPrice: 10, discount: 'abc' }), 10);
  });

  it('the scale decides the rounding of every line, at the boundary (half away from zero)', () => {
    // 3 x 0.125 = 0.375 -> 0.38 at 2 decimals, 0.375 at 3, 0 at 0
    const l = { quantity: 3, unitPrice: 0.125 };
    assert.equal(lineAmount(l, 2), 0.38);
    assert.equal(lineAmount(l, 3), 0.375);
    assert.equal(lineAmount(l, 0), 0);
    assert.equal(lineAmount({ quantity: -3, unitPrice: 0.125 }, 2), -0.38);
    // 4 decimals of quantity x 6 of price survive until the final rounding
    assert.equal(lineAmount({ quantity: 1.5, unitPrice: 0.000333 }, 6), 0.000500);
    assert.equal(lineAmount({ quantity: 1000, unitPrice: 0.000333 }, 2), 0.33);
  });

  it('a 6-decimal unit price is kept by the discount math (unit6 rounds at 6 decimals)', () => {
    assert.equal(Number(lineUnit6({ unitPrice: 0.123456 })) / 1e6, 0.123456);
    assert.equal(Number(lineUnit6({ unitPrice: 0.123457, discount: 50 })) / 1e6, 0.061729);
  });

  it('D rows group per rate; L rows keep one row per rate too and sum per-line roundings; D comes before L', () => {
    const lines = [
      { quantity: 1, unitPrice: 0.25, taxRate: 10, tax: { docTaxAmount: 'L' } },
      { quantity: 1, unitPrice: 0.25, taxRate: 10, tax: { docTaxAmount: 'L' } },
      { quantity: 1, unitPrice: 0.25, taxRate: 10 },
      { quantity: 1, unitPrice: 0.25, taxRate: 10 },
      { quantity: 1, unitPrice: 1, taxRate: 4 },
    ];
    const { taxes, linesTotal } = computeTotals(lines);
    assert.deepEqual(taxes.map((t) => [t.rate, t.docTaxAmount ?? 'D', t.base, t.amount]), [
      [4, 'D', 1, 0.04], [10, 'D', 0.5, 0.05], [10, 'L', 0.5, 0.06],
    ]);
    assert.equal(linesTotal, 2 + 0.04 + 0.05 + 0.06);
  });

  it('the rate is rounded to 2 decimals before grouping and the effective rate falls back to tax.rate', () => {
    const { taxes } = computeTotals([
      { quantity: 1, unitPrice: 100, taxRate: 10.554 },
      { quantity: 1, unitPrice: 100, tax: { rate: 10.55 } },
    ]);
    assert.deepEqual(taxes.map((t) => [t.rate, t.base]), [[10.55, 200]]);
  });

  it('a scale of 3 and of 0 flow through computeTotals, documentTotal and totalMismatch', () => {
    const t3 = computeTotals([{ quantity: 3, unitPrice: 1.2345, taxRate: 10 }], 3);
    assert.equal(t3.linesTotal, 4.074);
    assert.equal(documentTotal(t3, null, 3), 4.074);
    assert.equal(documentTotal(t3, 4.0744, 3), 4.074);
    assert.equal(totalMismatch({ totalSource: 'printed', totalAmount: 4.075 }, t3, 3), null);
    assert.deepEqual(totalMismatch({ totalSource: 'printed', totalAmount: 4.076 }, t3, 3), { lines: 4.074, document: 4.076 });
    const t0 = computeTotals([{ quantity: 3, unitPrice: 33.5, taxRate: 21 }], 0);
    assert.equal(documentTotal(t0, 122.4, 0), 122);
    assert.equal(totalMismatch({ totalSource: 'printed', totalAmount: 123 }, t0, 0), null);
    assert.notEqual(totalMismatch({ totalSource: 'printed', totalAmount: 124 }, t0, 0), null);
  });

  it('a negative printed total (credit note) mismatches by minimal units, not by sign', () => {
    const totals = computeTotals([{ quantity: -1, unitPrice: 100, taxRate: 21 }]);
    assert.equal(totalMismatch({ totalSource: 'printed', totalAmount: -121 }, totals), null);
    assert.equal(totalMismatch({ totalSource: 'printed', totalAmount: -121.01 }, totals), null);
    assert.deepEqual(totalMismatch({ totalSource: 'printed', totalAmount: -121.5 }, totals), { lines: -121, document: -121.5 });
  });
});

describe('ETP-6050 S2 — currencyScale boundaries', () => {
  it('accepts 0..6 integers only; anything else falls back to 2', () => {
    for (const [input, expected] of [[0, 0], [1, 1], [6, 6], [7, 2], [-1, 2], [2.5, 2], ['3', 2], [null, 2]]) {
      assert.equal(currencyScale({ scale: input }), expected, String(input));
    }
    assert.equal(currencyScale(null), 2);
  });
});

describe('ETP-6050 S2 — line[i].quantity / unitPrice validation codes', () => {
  it('lineFieldMissing is exact per index and field; hasMissingLineField ignores look-alike codes', () => {
    const doc = { validation: { missing: ['line[0].quantity', 'line[10].unitPrice', 'line[1].quantityX', 'line[x].quantity'] } };
    const set = missingSet(doc);
    assert.equal(lineFieldMissing(set, 0, 'quantity'), true);
    assert.equal(lineFieldMissing(set, 1, 'quantity'), false);
    assert.equal(lineFieldMissing(set, 10, 'unitPrice'), true);
    assert.equal(hasMissingLineField(doc, 'quantity'), true);
    assert.equal(hasMissingLineField({ validation: { missing: ['line[1].quantityX', 'line[x].quantity'] } }, 'quantity'), false);
    assert.equal(hasMissingLineField({}, 'quantity'), false);
  });

  it('every missing code (quantity and price included) counts once in the footer counter, and blocks Mark as reviewed', () => {
    const review = { status: 'PENDING_REVIEW', editable: true, document: { validation: { missing: ['line[0].quantity', 'line[0].unitPrice', 'line[1].quantity'] } } };
    assert.equal(pendingCount(review.document), 3);
    assert.equal(canMarkReviewed(review), false);
    assert.equal(canMarkReviewed({ ...review, document: { validation: { missing: [] } } }), true);
  });

  it('an empty quantity or unit price is rejected, zero and negative values are accepted', () => {
    for (const field of ['quantity', 'unitPrice']) {
      assert.deepEqual(normalizeNumber(field, { value: null, isValid: true }), { ok: false });
      assert.deepEqual(normalizeNumber(field, { value: 0, isValid: true }), { ok: true, value: 0 });
      assert.deepEqual(normalizeNumber(field, { value: -7, isValid: true }), { ok: true, value: -7 });
    }
  });

  it('input scales: quantity 4, unit price 6, discount 4, rate 2 (HALF_UP at the boundary, away from zero when negative)', () => {
    assert.deepEqual(normalizeNumber('quantity', { value: 1.23455, isValid: true }), { ok: true, value: 1.2346 });
    assert.deepEqual(normalizeNumber('quantity', { value: -1.23455, isValid: true }), { ok: true, value: -1.2346 });
    assert.deepEqual(normalizeNumber('unitPrice', { value: 0.1234565, isValid: true }), { ok: true, value: 0.123457 });
    assert.deepEqual(normalizeNumber('unitPrice', { value: 12.345678, isValid: true }), { ok: true, value: 12.345678 });
    assert.deepEqual(normalizeNumber('discount', { value: 12.34565, isValid: true }), { ok: true, value: 12.3457 });
    assert.deepEqual(normalizeNumber('taxRate', { value: 10.555, isValid: true }), { ok: true, value: 10.56 });
  });
});

describe('ETP-6050 S2 — tax by id: optimistic copy and error mapping', () => {
  const taxed = () => ({ lines: [{ index: 0, quantity: 1, unitPrice: 100, taxRate: 21, tax: { state: 'resolved', id: 'T21', name: 'IVA 21%', rate: 21 } }] });

  it('a picked tax whose option exposes the rate shows it at once (resolved, manual) and the totals follow', () => {
    const next = applyOperationLocally(taxed(), buildOp.setLine(0, { taxId: 'T10' }), { taxName: 'IVA 10%', taxRate: '10' });
    assert.deepEqual(next.lines[0].tax, { state: 'resolved', matchedBy: 'manual', id: 'T10', name: 'IVA 10%', rate: 10 });
    assert.equal(next.lines[0].taxRate, 10);
    assert.equal(computeTotals(next.lines).linesTotal, 110);
  });

  it('an option with no usable rate leaves the rate unknown (pending): no taxRate, no tax row, the line counts in the base only', () => {
    for (const hint of [{}, { taxRate: null }, { taxRate: 'abc' }]) {
      const next = applyOperationLocally(taxed(), buildOp.setLine(0, { taxId: 'T10' }), hint);
      assert.equal(next.lines[0].tax.state, 'pending');
      assert.equal('rate' in next.lines[0].tax, false);
      assert.equal('taxRate' in next.lines[0], false);
      assert.equal(lineRate(next.lines[0]), null);
      assert.deepEqual(computeTotals(next.lines), { base: 100, taxes: [], linesTotal: 100 });
    }
  });

  it('a rate of 0 exposed by the option is a real rate, not "unknown"', () => {
    const next = applyOperationLocally(taxed(), buildOp.setLine(0, { taxId: 'T0' }), { taxName: 'Exento', taxRate: 0 });
    assert.equal(lineRate(next.lines[0]), 0);
    assert.equal(next.lines[0].tax.state, 'resolved');
  });

  it('the wire operation of a tax pick carries the id only (no rate, no name)', () => {
    assert.deepEqual(buildOp.setLine(0, { taxId: 'T10' }), { op: 'setLine', index: 0, taxId: 'T10' });
  });

  it('addLine inherits the previous line tax object (id included); with no previous tax id it inherits only the rate, or nothing', () => {
    const withId = applyOperationLocally(taxed(), buildOp.addLine());
    assert.equal(withId.lines[1].tax.id, 'T21');
    assert.equal(withId.lines[1].taxRate, 21);
    const rateOnly = applyOperationLocally({ lines: [{ index: 0, quantity: 1, unitPrice: 1, taxRate: 10 }] }, buildOp.addLine());
    assert.equal('tax' in rateOnly.lines[1], false);
    assert.equal(rateOnly.lines[1].taxRate, 10);
    const bare = applyOperationLocally({ lines: [{ index: 0, quantity: 1, unitPrice: 1 }] }, buildOp.addLine());
    assert.equal('tax' in bare.lines[1], false);
    assert.equal('taxRate' in bare.lines[1], false);
  });

  it('unknown_tax maps to its own label key and does not reload the document', () => {
    assert.equal(saveErrorKey('unknown_tax'), 'invoiceInboxSaveErrorUnknownTax');
    assert.equal(isReloadCode('unknown_tax'), false);
  });

  it('access_denied (code-less 403) maps to the access label and does not reload', () => {
    assert.equal(saveErrorKey('access_denied'), 'invoiceInboxSaveErrorAccess');
    assert.equal(isReloadCode('access_denied'), false);
  });
});

describe('ETP-6050 S2 — product.new without a resolved name', () => {
  it('the name comes from the answer or the description; a draft id with no name stays selected and is never echoed', () => {
    const doc = { lines: [{ index: 0, description: 'Tornillo', product: { state: 'new', new: { categoryId: 'C1', uomId: 'U1' } } }] };
    assert.equal(newProductName(doc.lines[0]), 'Tornillo');
    const next = applyOperationLocally(doc, buildOp.newProduct(0, { categoryId: 'C2' }), {});
    // category name not resolved: the id stays committed, the name is whatever the server sent before (none)
    assert.equal(next.lines[0].product.new.categoryId, 'C2');
    assert.equal(next.lines[0].product.new.category, undefined);
    assert.equal(newProductComplete(next.lines[0]), true);
  });
});

describe('omitKeys', () => {
  it('returns a copy without the keys, keeping the other keys in order and nested values shared', async () => {
    const { omitKeys } = await import('../invoiceInboxReviewModel.js');
    const nested = { a: 1 };
    const source = { id: 1, name: 'x', keep: nested, state: 'linked', details: {} };
    const copy = omitKeys(source, ['id', 'name', 'details', 'missing']);
    assert.deepEqual(Object.keys(copy), ['keep', 'state']);
    assert.equal(copy.keep, nested);
    assert.equal(source.id, 1, 'the source is untouched');
    assert.deepEqual(omitKeys({}, ['a']), {});
  });
});


// ── Confirm rules and the total-mismatch fixture ───────────────────────────────────────
const MISMATCH_FIXTURE = JSON.parse(readFileSync(new URL('../../../../../__tests__/fixtures/invoice-inbox-total-mismatch.json', import.meta.url), 'utf8'));

describe('total mismatch fixture (SPA only; the Java rule has its own tests)', () => {
  it('carries the 18 agreed cases', () => {
    assert.equal(MISMATCH_FIXTURE.cases.length, 18);
  });
  for (const c of MISMATCH_FIXTURE.cases) {
    it(`totalMismatch: ${c.name}`, () => {
      const header = { totalSource: c.totalSource };
      if ('totalAmount' in c) header.totalAmount = c.totalAmount;
      const result = totalMismatch(header, { linesTotal: c.linesTotal }, c.scale);
      assert.equal(result !== null, c.expected);
    });
  }
  it('a warning carries the lines total and the printed total as numbers', () => {
    assert.deepEqual(totalMismatch({ totalSource: 'printed', totalAmount: 10.02 }, { linesTotal: 10 }, 2), { lines: 10, document: 10.02 });
  });
});

describe('lineRate fallback (a non-numeric taxRate uses the resolved tax)', () => {
  it('"", text and null taxRate fall back to tax.rate', () => {
    for (const taxRate of ['', 'abc', null, undefined]) {
      assert.equal(lineRate({ taxRate, tax: { rate: 10 } }), 10, String(taxRate));
    }
  });
  it('a numeric taxRate wins, zero included', () => {
    assert.equal(lineRate({ taxRate: 0, tax: { rate: 10 } }), 0);
    assert.equal(lineRate({ taxRate: '21', tax: { rate: 10 } }), 21);
  });
  it('neither side numeric is null', () => {
    assert.equal(lineRate({ taxRate: 'abc', tax: { rate: 'x' } }), null);
  });
});

describe('canConfirm / isConfirmRetry', () => {
  const doc = (missing = []) => ({ validation: { missing } });
  const review = (extra = {}) => ({ status: 'PENDING_REVIEW', editable: true, document: doc(), ...extra });
  it('PENDING_REVIEW and READY with nothing pending can be confirmed (reviewed or not)', () => {
    assert.equal(canConfirm(review()), true);
    assert.equal(canConfirm(review({ status: 'READY' })), true);
  });
  it('an ERROR confirm failure or missing-fields error can be confirmed; any other error cannot', () => {
    assert.equal(canConfirm(review({ status: 'ERROR', errorCode: 'CONFIRM_FAILED' })), true);
    assert.equal(canConfirm(review({ status: 'ERROR', errorCode: 'MISSING_FIELDS' })), true);
    for (const errorCode of ['UNREADABLE', 'SERVICE_FAILURE', 'FOREIGN_RECEIVER', 'REFERENCE_TOO_LONG', undefined]) {
      assert.equal(canConfirm(review({ status: 'ERROR', errorCode })), false, String(errorCode));
    }
  });
  it('is false for pending fields, read-only, other statuses and no review', () => {
    assert.equal(canConfirm(review({ document: doc(['header.vendor']) })), false);
    assert.equal(canConfirm(review({ editable: false })), false);
    for (const status of ['PROCESSING', 'CONFIRMED', 'DISCARDED']) assert.equal(canConfirm(review({ status })), false, status);
    assert.equal(canConfirm(null), false);
    assert.equal(canConfirm(undefined), false);
  });
  it('isConfirmRetry is true only for a stored CONFIRM_FAILED error', () => {
    assert.equal(isConfirmRetry({ status: 'ERROR', errorCode: 'CONFIRM_FAILED' }), true);
    assert.equal(isConfirmRetry({ status: 'ERROR', errorCode: 'MISSING_FIELDS' }), false);
    assert.equal(isConfirmRetry({ status: 'READY', errorCode: 'CONFIRM_FAILED' }), false);
    assert.equal(isConfirmRetry(null), false);
  });
});

describe('confirmBlockers', () => {
  it('reads the exact exchangeRate / vendorAddress codes, in a stable order', () => {
    assert.deepEqual(confirmBlockers(doc(['vendorAddress', 'exchangeRate'])), ['exchangeRate', 'vendorAddress']);
    assert.deepEqual(confirmBlockers(doc(['exchangeRate'])), ['exchangeRate']);
  });
  it('ignores other codes, near-misses and no document', () => {
    assert.deepEqual(confirmBlockers(doc(['header.vendor', 'exchangerate', 'vendorAddresses'])), []);
    assert.deepEqual(confirmBlockers(undefined), []);
  });
  function doc(missing) { return { validation: { missing } }; }
});

describe('reviewBanners (confirm)', () => {
  it('a failed confirm shows the confirmFailed banner with the stored detail (null when absent)', () => {
    assert.deepEqual(reviewBanners({ status: 'ERROR', errorCode: 'CONFIRM_FAILED', errorDetail: 'boom' }), [{ kind: 'confirmFailed', detail: 'boom', info: null }]);
    assert.deepEqual(reviewBanners({ status: 'ERROR', errorCode: 'CONFIRM_FAILED' }), [{ kind: 'confirmFailed', detail: null, info: null }]);
  });
  it('a stored identifier travels as info next to the raw stored detail', () => {
    const info = { code: 'step_failed', params: { step: 'line', n: 2, reason: 'Tax is required' } };
    assert.deepEqual(
      reviewBanners({ status: 'ERROR', errorCode: 'CONFIRM_FAILED', errorDetail: '{"v":1}', errorInfo: info }),
      [{ kind: 'confirmFailed', detail: '{"v":1}', info }],
    );
  });
  it('blockers show on an open document, before the duplicates; settled documents show none', () => {
    const document = { validation: { missing: ['exchangeRate', 'vendorAddress'] }, header: { duplicate: { state: 'found', invoices: [{ documentNo: 'F1' }] } } };
    assert.deepEqual(reviewBanners({ status: 'PENDING_REVIEW', document }).map((b) => b.kind), ['blocker', 'blocker', 'duplicate']);
    assert.deepEqual(reviewBanners({ status: 'PENDING_REVIEW', document }).slice(0, 2).map((b) => b.blocker), ['exchangeRate', 'vendorAddress']);
    assert.deepEqual(reviewBanners({ status: 'DISCARDED', document }), []);
    assert.deepEqual(reviewBanners({ status: 'CONFIRMED', document }), [{ kind: 'confirmed' }]);
  });
});

describe('confirm save errors', () => {
  it('every confirm refusal has its own message key; not_confirmable reloads', () => {
    for (const code of ['not_confirmable', 'duplicate_invoice', 'missing_exchange_rate', 'vendor_address_missing', 'QUOTA_EXCEEDED', 'price_list_tax_included', 'confirm_failed']) {
      assert.notEqual(saveErrorKey(code), 'invoiceInboxSaveErrorGeneric', code);
    }
    assert.equal(isReloadCode('not_confirmable'), true);
    for (const code of ['duplicate_invoice', 'missing_exchange_rate', 'QUOTA_EXCEEDED', 'confirm_failed']) assert.equal(isReloadCode(code), false, code);
  });
});
