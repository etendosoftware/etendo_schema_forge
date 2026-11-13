// @covers tools/app-shell/src/pages/portal/portalPresentation.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultPortalRange,
  documentLabelKey,
  invoicePaymentState,
  readPortalView,
  toCalendarParam,
  writePortalView,
} from '../portalPresentation.js';

/**
 * Presentation rules of the customer portal — pure, so they run under plain `node --test`.
 *
 * The payment table is the parity guard: the portal must show an invoice's payment state exactly
 * as the app does (`resolveInvoicePaymentBadge`). Overdue follows the app on each surface: with
 * the instalments (the detail) it wins over pending and partial the way the invoice topbar orders
 * it — never over paid or over a credit note; without them (lists, home) the badge shows no
 * overdue, like the invoice list grid, whose due-date dot carries it instead.
 *
 * Instalment dates are far in the past or far in the future, so no row depends on the day the
 * suite runs.
 */

const invoice = (overrides) => ({
  kind: 'INVOICE', documentStatus: 'CO', grandTotal: 1000, outstandingAmount: 1000, overdue: false,
  ...overrides,
});
const PAST = '2020-01-10';
const FUTURE = '2999-01-10';
const installment = (dueDate, outstandingAmount) => ({ dueDate, outstandingAmount });

describe('invoicePaymentState', () => {
  for (const [label, document, installments, expected] of [
    ['paid when nothing is outstanding', invoice({ outstandingAmount: 0 }), null, 'paid'],
    ['partial when part was paid', invoice({ outstandingAmount: 400 }), null, 'partial'],
    ['pending when nothing was paid', invoice({}), null, 'pending'],
    ['pending when the outstanding amount is missing', invoice({ outstandingAmount: null }), null, 'pending'],
    ['credit available on a credit note with money left', invoice({ grandTotal: -100, outstandingAmount: -100 }), null, 'credit-available'],
    ['credit applied on a fully used credit note', invoice({ grandTotal: -100, outstandingAmount: 0 }), null, 'credit-applied'],
    ['overdue before pending when an owing instalment is past due', invoice({}), [installment(PAST, 1000)], 'overdue'],
    [
      'overdue before partial when an owing instalment is past due',
      invoice({ outstandingAmount: 400 }),
      [installment(PAST, 0), installment(PAST, 400)],
      'overdue',
    ],
    [
      'partial when the past-due instalment is settled and the rest is not due',
      invoice({ outstandingAmount: 400 }),
      [installment(PAST, 0), installment(FUTURE, 400)],
      'partial',
    ],
    ['paid even with a past-due instalment', invoice({ outstandingAmount: 0 }), [installment(PAST, 100)], 'paid'],
    [
      'never overdue on a credit note',
      invoice({ grandTotal: -100, outstandingAmount: -100 }),
      [installment(PAST, 100)],
      'credit-available',
    ],
    // Lists and home have no instalments: like the invoice list grid, the badge never says
    // overdue there, whatever the row's own flag — the due-date dot carries it.
    ['pending, not overdue, without instalments even when the row is flagged overdue', invoice({ overdue: true }), null, 'pending'],
  ]) {
    it(`is ${label}`, () => {
      assert.equal(invoicePaymentState(document, installments).id, expected);
    });
  }

  it('maps each state to the app labels and tones', () => {
    assert.deepEqual(
      [
        invoicePaymentState(invoice({ outstandingAmount: 0 })),
        invoicePaymentState(invoice({}), [installment(PAST, 1000)]),
        invoicePaymentState(invoice({ grandTotal: -1, outstandingAmount: -1 })),
      ],
      [
        { id: 'paid', labelKey: 'statusPaid', tone: 'success' },
        { id: 'overdue', labelKey: 'statusOverdue', tone: 'destructive' },
        { id: 'credit-available', labelKey: 'cpFavorBadge', tone: 'info' },
      ],
    );
  });

  for (const [label, document] of [
    ['a draft invoice', invoice({ documentStatus: 'DR' })],
    ['a document that is not an invoice', { kind: 'ORDER', documentStatus: 'CO', grandTotal: 10 }],
  ]) {
    it(`shows no payment state for ${label}`, () => {
      assert.equal(invoicePaymentState(document), null);
    });
  }
});

describe('defaultPortalRange (rolling last month)', () => {
  // Local-time constructors on both sides, so the expectation holds in any timezone.
  for (const [label, reference, from] of [
    ['mid-month', new Date(2026, 4, 15, 18, 30), new Date(2026, 3, 15)],
    ['clamped to a short February', new Date(2026, 2, 31), new Date(2026, 1, 28)],
    ['clamped to a leap February', new Date(2028, 2, 31), new Date(2028, 1, 29)],
    ['across the year boundary', new Date(2026, 0, 31), new Date(2025, 11, 31)],
  ]) {
    it(`goes back one month, ${label}`, () => {
      const range = defaultPortalRange(reference);
      assert.deepEqual(
        { from: toCalendarParam(range.from), to: toCalendarParam(range.to) },
        { from: toCalendarParam(from), to: toCalendarParam(reference) },
      );
    });
  }

  it('ends today at midnight, so the time of day never leaks into the range', () => {
    const { to } = defaultPortalRange(new Date(2026, 4, 15, 18, 30));
    assert.deepEqual([to.getHours(), to.getMinutes()], [0, 0]);
  });
});

describe('toCalendarParam', () => {
  it('formats a local date as yyyy-MM-dd and anything else as null', () => {
    assert.deepEqual(
      [toCalendarParam(new Date(2026, 7, 5, 23, 59)), toCalendarParam(null), toCalendarParam('2026-08-05')],
      ['2026-08-05', null, null],
    );
  });
});

describe('documentLabelKey', () => {
  for (const [document, expected] of [
    [{ kind: 'INVOICE', isCreditNote: true }, 'portalKindCreditNote'],
    [{ kind: 'INVOICE' }, 'portalKindInvoice'],
    [{ kind: 'SHIPMENT', isCreditNote: true }, 'portalKindShipment'],
    [{ kind: 'QUOTATION' }, 'portalKindQuotation'],
    [{ kind: 'UNKNOWN' }, 'portalKindInvoice'],
  ]) {
    it(`labels ${JSON.stringify(document)} as ${expected}`, () => {
      assert.equal(documentLabelKey(document), expected);
    });
  }
});

describe('portal view in the URL', () => {
  for (const target of [
    { view: 'home' },
    { view: 'list', kind: 'ORDER' },
    { view: 'doc', kind: 'INVOICE', id: 'inv/1' },
  ]) {
    it(`round-trips ${target.view}`, () => {
      assert.deepEqual(readPortalView(new URLSearchParams(writePortalView(target).toString())), target);
    });
  }

  for (const [label, search] of [
    ['no view', ''],
    ['an unknown kind', 'view=list&kind=PAYMENT'],
    ['a document without an id', 'view=doc&kind=INVOICE'],
    ['an unknown view', 'view=settings'],
  ]) {
    it(`reads ${label} as no view, so the page falls back to its default`, () => {
      assert.equal(readPortalView(new URLSearchParams(search)), null);
    });
  }

  it('writes only view, kind and id', () => {
    const params = writePortalView({ view: 'doc', kind: 'ORDER', id: 'ord-1', token: 'tok-secret' });
    assert.deepEqual([...params.keys()], ['view', 'kind', 'id']);
  });
});
