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
} from '../invoiceInboxReviewModel.js';

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
