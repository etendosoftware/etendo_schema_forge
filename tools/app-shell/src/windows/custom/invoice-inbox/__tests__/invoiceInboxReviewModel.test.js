// @covers tools/app-shell/src/windows/custom/invoice-inbox/invoiceInboxReviewModel.js
// New file justification: no existing test covers the review-panel model; invoiceInboxFilters.test.js
// is about the list criteria (a different unit) and invoiceInboxMessages.test.js about backend codes.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTotals, documentTotal, totalMismatch, missingSet, lineKey, unresolvedProductCount, hasMissingTax,
  pendingCount, vendorView, productView, joinMeta, extractedCountry, isReviewReadOnly, isOpenableRow,
  isSettledStatus, reviewBanners, reviewNeighbors, reviewErrorKey, lineAmount, lineRate,
  initialZoom, stepZoom, PAPER_WIDTH, ZOOM_MIN, ZOOM_MAX, ZOOM_STEP,
  lineUnit6, toScaled, divRoundHalfAway, normalizeNumber, sameNumber, buildOp, applyOperationLocally,
  applyPendingToReview, newProductComplete, newProductName, saveErrorKey, isReloadCode, canMarkReviewed,
  SAVE_ERROR_LABEL_KEYS, NUMBER_FIELDS,
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
  it('uses the document total when numeric, rounded to the cent', () => {
    assert.equal(documentTotal({ totalAmount: 130.456 }, totals), 130.46);
  });
  it('falls back to the lines total when missing, empty or not a number', () => {
    assert.equal(documentTotal({}, totals), 121);
    assert.equal(documentTotal({ totalAmount: '' }, totals), 121);
    assert.equal(documentTotal({ totalAmount: 'n/a' }, totals), 121);
    assert.equal(documentTotal(undefined, totals), 121);
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

// ── ETP-6050 S2: shared totals fixture, number helpers, operations, optimistic copy ────────────
const FIXTURE = JSON.parse(readFileSync(new URL('../../../../../__tests__/fixtures/invoice-inbox-totals.json', import.meta.url), 'utf8'));

describe('totals shared fixture (same file the backend reads)', () => {
  it('carries the 15 agreed cases', () => {
    assert.equal(FIXTURE.cases.length, 15);
  });
  for (const c of FIXTURE.cases) {
    it(`computeTotals: ${c.name}`, () => {
      const totals = computeTotals(c.lines);
      assert.equal(totals.base, Number(c.expected.base ?? 0));
      assert.equal(totals.linesTotal, Number(c.expected.linesTotal));
      assert.deepEqual(
        totals.taxes.map((t) => [t.rate, t.base, t.amount]),
        (c.expected.taxes ?? []).map((t) => [t.rate, Number(t.base), Number(t.amount)]),
      );
      (c.expected.lines ?? []).forEach((expected, i) => {
        assert.equal(lineAmount(c.lines[i]), Number(expected.net), 'lineAmount');
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
    assert.deepEqual(next.lines[0].product.new, { name: 'A', categoryId: 'C1', uomId: 'U1', category: 'Cat', uom: 'Kg' });
    next = applyOperationLocally(next, buildOp.newProduct(0, { categoryId: null }));
    assert.equal(next.lines[0].product.new.category, null);
    assert.equal(next.lines[0].product.new.uomId, 'U1');
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
