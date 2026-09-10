import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { todayCalendarISO } from '../../dateOnly.js';
import {
  PORTAL_INVOICE_STATUS,
  portalPdfFileName,
  resolveInvoiceStatus,
} from '../portalInvoices.js';

/**
 * Presentation rules of the Business Partner portal's invoice list (ETP-5267).
 *
 * Every due-date case below pins its own reference date instead of leaning on the machine's
 * real "today": the reference is built with the LOCAL-time `Date` constructor, exactly as
 * `getCalendarDateRelation` builds the value it is compared against, so the assertions hold
 * under any host timezone and on any day the suite happens to run. The one case that
 * deliberately DOES read the real clock (`due today is not overdue`) derives the due date from
 * `todayCalendarISO()` — local calendar getters — which is the regression ETP-4031/ETP-4850
 * were about, and which a hardcoded date could never catch.
 */

/** Mid-month so every neighbouring day below stays inside the same month. */
const REFERENCE = new Date(2026, 5, 15);
const YESTERDAY = '2026-06-14';
const TODAY = '2026-06-15';
const TOMORROW = '2026-06-16';

describe('resolveInvoiceStatus', () => {
  describe('no outstanding amount to judge', () => {
    it('returns null when the backend sent no outstanding amount', () => {
      assert.equal(
        resolveInvoiceStatus({ outstandingAmount: null, grandTotalAmount: 100 }, REFERENCE),
        null,
      );
    });

    it('returns null for a non-finite outstanding amount', () => {
      assert.equal(resolveInvoiceStatus({ outstandingAmount: NaN }, REFERENCE), null);
    });

    it('returns null for a missing invoice', () => {
      assert.equal(resolveInvoiceStatus(undefined, REFERENCE), null);
    });
  });

  describe('paid', () => {
    it('reports an exactly settled invoice as paid', () => {
      assert.deepEqual(
        resolveInvoiceStatus({ outstandingAmount: 0, grandTotalAmount: 100 }, REFERENCE),
        PORTAL_INVOICE_STATUS.paid,
      );
    });

    it('reports a rounding residue below half a cent as paid', () => {
      assert.deepEqual(
        resolveInvoiceStatus(
          { outstandingAmount: 0.000000001, grandTotalAmount: 100 },
          REFERENCE,
        ),
        PORTAL_INVOICE_STATUS.paid,
      );
    });

    it('reports a settled invoice as paid even when it is past its due date', () => {
      assert.deepEqual(
        resolveInvoiceStatus(
          { outstandingAmount: 0, grandTotalAmount: 100, dueDate: YESTERDAY },
          REFERENCE,
        ),
        PORTAL_INVOICE_STATUS.paid,
      );
    });
  });

  describe('overdue', () => {
    it('reports an unpaid invoice past its due date as overdue', () => {
      assert.deepEqual(
        resolveInvoiceStatus(
          { outstandingAmount: 100, grandTotalAmount: 100, dueDate: YESTERDAY },
          REFERENCE,
        ),
        PORTAL_INVOICE_STATUS.overdue,
      );
    });

    it('ranks overdue above partially paid for a half-paid invoice past its due date', () => {
      assert.deepEqual(
        resolveInvoiceStatus(
          { outstandingAmount: 50, grandTotalAmount: 100, dueDate: YESTERDAY },
          REFERENCE,
        ),
        PORTAL_INVOICE_STATUS.overdue,
      );
    });

    it('does not report an invoice due today as overdue', () => {
      assert.deepEqual(
        resolveInvoiceStatus(
          { outstandingAmount: 100, grandTotalAmount: 100, dueDate: TODAY },
          REFERENCE,
        ),
        PORTAL_INVOICE_STATUS.pending,
      );
    });

    it('does not report an invoice due today as overdue against the real clock', () => {
      // The ETP-4031/ETP-4850 regression: a date-only value parsed as UTC midnight reads as
      // "past" for the whole of its own due date under any negative UTC offset. Both sides of
      // this comparison are local-calendar values, so the day is never shifted.
      assert.deepEqual(
        resolveInvoiceStatus({
          outstandingAmount: 100,
          grandTotalAmount: 100,
          dueDate: todayCalendarISO(),
        }),
        PORTAL_INVOICE_STATUS.pending,
      );
    });
  });

  describe('partially paid', () => {
    it('reports an invoice paid down below its total as partially paid', () => {
      assert.deepEqual(
        resolveInvoiceStatus(
          { outstandingAmount: 50, grandTotalAmount: 100, dueDate: TOMORROW },
          REFERENCE,
        ),
        PORTAL_INVOICE_STATUS.partiallyPaid,
      );
    });

    it('reports a partial payment on an invoice with no due date', () => {
      assert.deepEqual(
        resolveInvoiceStatus(
          { outstandingAmount: 50, grandTotalAmount: 100, dueDate: null },
          REFERENCE,
        ),
        PORTAL_INVOICE_STATUS.partiallyPaid,
      );
    });

    it('compares against the absolute total, so a credit note is judged the same way', () => {
      assert.deepEqual(
        resolveInvoiceStatus(
          { outstandingAmount: 50, grandTotalAmount: -100, dueDate: TOMORROW },
          REFERENCE,
        ),
        PORTAL_INVOICE_STATUS.partiallyPaid,
      );
    });
  });

  describe('pending', () => {
    it('reports a wholly unpaid invoice not yet due as pending', () => {
      assert.deepEqual(
        resolveInvoiceStatus(
          { outstandingAmount: 100, grandTotalAmount: 100, dueDate: TOMORROW },
          REFERENCE,
        ),
        PORTAL_INVOICE_STATUS.pending,
      );
    });

    it('reports pending when the total is missing, rather than guessing a partial payment', () => {
      assert.deepEqual(
        resolveInvoiceStatus(
          { outstandingAmount: 100, grandTotalAmount: null, dueDate: TOMORROW },
          REFERENCE,
        ),
        PORTAL_INVOICE_STATUS.pending,
      );
    });
  });

  it('exposes an existing generic label key for every status but the portal-specific one', () => {
    // `useUI()` echoes the raw key when the active locale has no entry, so a status whose key
    // does not already ship would print an identifier on a customer's screen.
    assert.deepEqual(
      Object.values(PORTAL_INVOICE_STATUS).map((status) => status.labelKey),
      ['statusPaid', 'statusOverdue', 'portalInvoicePartiallyPaid', 'statusPending'],
    );
  });
});

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
});
