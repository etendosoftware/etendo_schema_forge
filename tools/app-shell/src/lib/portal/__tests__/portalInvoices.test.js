// @covers tools/app-shell/src/lib/portal/portalInvoices.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { portalPdfFileName } from '../portalInvoices.js';

/**
 * File name of a portal printable (ETP-5267): the document number, made safe for a download
 * attribute, so a `/` in `FV/0001` can never turn into a path.
 */

describe('portalPdfFileName', () => {
  it('folds the slash Etendo document numbers carry into a dash', () => {
    // A browser reads `FV/0001.pdf` in a `download` attribute as a path and saves `0001.pdf`.
    assert.equal(portalPdfFileName({ documentNo: 'FV/0001' }), 'FV-0001.pdf');
  });

  it('keeps dots, underscores and dashes, which are already safe', () => {
    assert.equal(portalPdfFileName({ documentNo: 'FV_2026-01.rev2' }), 'FV_2026-01.rev2.pdf');
  });

  it('collapses a run of unsafe characters into a single dash', () => {
    assert.equal(portalPdfFileName({ documentNo: 'FV / 0001' }), 'FV-0001.pdf');
  });

  it('trims leading and trailing dashes left by the fold', () => {
    assert.equal(portalPdfFileName({ documentNo: '/FV/0001/' }), 'FV-0001.pdf');
  });

  it('falls back to the record id when there is no document number', () => {
    assert.equal(portalPdfFileName({ documentNo: null, id: 'inv-42' }), 'inv-42.pdf');
  });

  it('falls back to a generic name for an empty invoice', () => {
    assert.equal(portalPdfFileName({}), 'invoice.pdf');
  });

  it('falls back to a generic name for a missing invoice', () => {
    assert.equal(portalPdfFileName(undefined), 'invoice.pdf');
  });

  it('falls back to a generic name when nothing safe survives the fold', () => {
    assert.equal(portalPdfFileName({ documentNo: '///' }), 'invoice.pdf');
  });

  it('trims dashes the document number itself carried, not only folded ones', () => {
    // `-` is inside the safe set, so these reach the trim as themselves rather than as the
    // product of a fold — a different path into the same branch.
    assert.equal(portalPdfFileName({ documentNo: '--FV-0001--' }), 'FV-0001.pdf');
  });

  it('keeps an interior dash run, which is part of the document number', () => {
    assert.equal(portalPdfFileName({ documentNo: 'FV-----0001' }), 'FV-----0001.pdf');
  });

  it('falls back to a generic name for a document number that is all dashes', () => {
    assert.equal(portalPdfFileName({ documentNo: '-----' }), 'invoice.pdf');
  });

  it('stays linear on a long interior dash run', () => {
    // Regression guard for the ReDoS this helper used to carry (ETP-5267). The trim was
    // `.replace(/^-+|-+$/g, '')`, and `-+$` is retried from every start position: on a dash run
    // that is neither at the start nor at the end, each attempt rescans the whole run before `$`
    // fails. Measured on the old code: ~200 ms at 8k dashes, quadrupling per doubling, and 50k
    // did not finish in two minutes. The current index scan does this in microseconds, so the
    // one-second bound below carries a margin of well over a hundredfold and is not a tight
    // timing assertion — it only fails if the quadratic construct comes back.
    const documentNo = `FV${'-'.repeat(50_000)}0001`;
    const started = Date.now();
    const name = portalPdfFileName({ documentNo });
    assert.equal(name, `${documentNo}.pdf`, 'an interior run is content, so nothing is trimmed');
    assert.ok(Date.now() - started < 1000, 'trimming must not be super-linear in the run length');
  });

  it('strips a long leading and trailing dash run without rescanning it', () => {
    const documentNo = `${'-'.repeat(50_000)}FV0001${'-'.repeat(50_000)}`;
    const started = Date.now();
    assert.equal(portalPdfFileName({ documentNo }), 'FV0001.pdf');
    assert.ok(Date.now() - started < 1000, 'trimming must not be super-linear in the run length');
  });
});
