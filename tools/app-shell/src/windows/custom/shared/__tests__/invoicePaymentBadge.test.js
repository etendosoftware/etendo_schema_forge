import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveInvoicePaymentBadge } from '../invoicePaymentBadge.js';

// ETP-4841 — `resolveInvoicePaymentBadge` is the single source of truth for the
// "Pendiente de pago" badge in BOTH grids (sales-invoice, purchase-invoice) and
// BOTH detail topbars, plus InvoicePreview's `isCreditNote`. It replaces the
// previous document-type test (`getArSubtype`/`getApSubtype` === 'RECTIFICATIVA'),
// which mislabelled two real cases:
//
//   * a Factura Rectificativa with a POSITIVE total (an under-invoiced
//     correction) — payable, but rendered as "Saldo a favor";
//   * an ordinary Factura with a NEGATIVE total — a credit, but rendered as
//     "Cobrada"/"Pagada" because its negative outstanding satisfied
//     `outstanding <= 0`.
//
// Every case below is therefore expressed purely in terms of the SIGN of the
// total; the document-type fields are only present to prove they are ignored.

/** Convenience: a completed record with the given amounts. */
const completed = (grandTotalAmount, outstandingAmount, extra = {}) => ({
  documentStatus: 'CO',
  grandTotalAmount,
  outstandingAmount,
  ...extra,
});

describe('resolveInvoicePaymentBadge — payment state overrides the amount (ETP-4895)', () => {
  it('reports a rejected transfer instead of "Pagada"', () => {
    // The payment is applied even though it failed, so the outstanding is zero and the amount
    // branches would render this invoice as settled for money that never moved.
    assert.deepEqual(
      resolveInvoicePaymentBadge(completed(100, 0, { pisPaymentState: 'error' })),
      { kind: 'transfer-error', amount: 0, isCredit: false },
    );
  });

  it('reports a transfer in progress instead of "Pagada"', () => {
    assert.deepEqual(
      resolveInvoicePaymentBadge(completed(100, 0, { pisPaymentState: 'inProgress' })),
      { kind: 'transfer-in-progress', amount: 0, isCredit: false },
    );
  });

  it('steps aside for a partial transfer in flight: the remainder is real and payable', () => {
    // Invoice 6,05 with a 3,00 transfer in progress still owes 3,05. Showing "Pago en progreso"
    // there hid a genuine amount the user has to pay (ETP-4895).
    const badge = resolveInvoicePaymentBadge(completed(6.05, 3.05, { pisPaymentState: 'inProgress' }));
    assert.equal(badge.kind, 'partial');
    assert.equal(badge.amount, 3.05);
  });

  it('wins over a genuine remaining amount, so the error is not buried', () => {
    // A partial transfer that failed leaves a real 70 outstanding. Showing the figure would tell
    // the user to pay, and say nothing about the 30 that went wrong.
    assert.equal(
      resolveInvoicePaymentBadge(completed(100, 70, { pisPaymentState: 'error' })).kind,
      'transfer-error',
    );
  });

  it('leaves invoices without the field exactly as before', () => {
    // Sales invoices and every other window: the backend never emits it, so this stays inert.
    assert.equal(resolveInvoicePaymentBadge(completed(100, 0)).kind, 'paid');
    assert.equal(resolveInvoicePaymentBadge(completed(100, 40)).kind, 'partial');
    assert.equal(
      resolveInvoicePaymentBadge(completed(100, 0, { pisPaymentState: null })).kind, 'paid');
  });

  it('never overrides a credit instrument', () => {
    // A negative total is money owed back by the supplier — a different axis entirely.
    assert.equal(
      resolveInvoicePaymentBadge(completed(-100, -100, { pisPaymentState: 'error' })).kind,
      'credit-available',
    );
  });

  it('says nothing on a draft, which has no payments yet', () => {
    assert.equal(
      resolveInvoicePaymentBadge({ documentStatus: 'DR', grandTotalAmount: 100, pisPaymentState: 'error' }).kind,
      'draft',
    );
  });
});

describe('resolveInvoicePaymentBadge — draft (documentStatus !== CO)', () => {
  const NON_CO_STATUSES = ['DR', 'CL', 'VO', 'IP', '', 'co', 'CO ', null, undefined];

  for (const documentStatus of NON_CO_STATUSES) {
    it(`returns the draft badge for documentStatus ${JSON.stringify(documentStatus)}`, () => {
      assert.deepEqual(
        resolveInvoicePaymentBadge({ documentStatus, grandTotalAmount: 1000, outstandingAmount: 400 }),
        { kind: 'draft', amount: 0, isCredit: false },
      );
    });
  }

  it('reports no payment amount for a draft, but still flags a negative total as a credit', () => {
    // `isCredit` describes the DOCUMENT (negative total), not its payment state,
    // so it stays true on a draft — callers that only ask "is this a credit?"
    // (label swaps, due-date suppression) need the right answer before completion.
    assert.deepEqual(
      resolveInvoicePaymentBadge({ documentStatus: 'DR', grandTotalAmount: -500, outstandingAmount: -500 }),
      { kind: 'draft', amount: 0, isCredit: true },
    );
  });

  it('does not flag a draft with a positive total as a credit', () => {
    assert.deepEqual(
      resolveInvoicePaymentBadge({ documentStatus: 'DR', grandTotalAmount: 500, outstandingAmount: 500 }),
      { kind: 'draft', amount: 0, isCredit: false },
    );
  });

  it('treats a null record as draft', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(null), { kind: 'draft', amount: 0, isCredit: false });
  });

  it('treats an undefined record as draft', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(undefined), { kind: 'draft', amount: 0, isCredit: false });
  });

  it('treats an empty record as draft (no documentStatus at all)', () => {
    assert.deepEqual(resolveInvoicePaymentBadge({}), { kind: 'draft', amount: 0, isCredit: false });
  });
});

describe('resolveInvoicePaymentBadge — credit branch (negative total)', () => {
  it('returns credit-available with the absolute remaining balance', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(-25.3, -2.3)), {
      kind: 'credit-available',
      amount: 2.3,
      isCredit: true,
    });
  });

  it('returns credit-available for a fully unapplied credit (outstanding === total)', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(-27.6, -27.6)), {
      kind: 'credit-available',
      amount: 27.6,
      isCredit: true,
    });
  });

  it('returns credit-applied once the balance reaches zero', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(-1000, 0)), {
      kind: 'credit-applied',
      amount: 0,
      isCredit: true,
    });
  });

  it('treats float dust below the epsilon as fully applied', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(-1000, -0.0009)), {
      kind: 'credit-applied',
      amount: 0,
      isCredit: true,
    });
  });

  it('treats positive float dust below the epsilon as fully applied too', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(-1000, 0.0009)), {
      kind: 'credit-applied',
      amount: 0,
      isCredit: true,
    });
  });

  it('keeps a balance of exactly the epsilon available (boundary is exclusive)', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(-1000, -0.001)), {
      kind: 'credit-available',
      amount: 0.001,
      isCredit: true,
    });
  });

  it('reports a credit whose outstanding is stored POSITIVE as available (sign of the total wins)', () => {
    // Defensive: some sources return the remaining balance unsigned. The credit
    // branch is chosen by the total, and the amount is always the absolute value.
    assert.deepEqual(resolveInvoicePaymentBadge(completed(-500, 120)), {
      kind: 'credit-available',
      amount: 120,
      isCredit: true,
    });
  });

  it('treats an ABSENT outstandingAmount on a negative total as fully unapplied', () => {
    // "Unknown" must not read as "already spent" — the whole credit is still
    // available until something says otherwise.
    assert.deepEqual(resolveInvoicePaymentBadge({ documentStatus: 'CO', grandTotalAmount: -900 }), {
      kind: 'credit-available',
      amount: 900,
      isCredit: true,
    });
  });

  it('treats a null outstandingAmount on a negative total as fully unapplied', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(-900, null)), {
      kind: 'credit-available',
      amount: 900,
      isCredit: true,
    });
  });

  it('treats an empty-string outstandingAmount on a negative total as fully unapplied', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(-900, '')), {
      kind: 'credit-available',
      amount: 900,
      isCredit: true,
    });
  });

  it('still reports a PRESENT zero outstanding on a negative total as fully applied', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(-900, 0)), {
      kind: 'credit-applied',
      amount: 0,
      isCredit: true,
    });
  });
});

describe('resolveInvoicePaymentBadge — payable branch (non-negative total)', () => {
  it('returns pending when nothing has been paid', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(1000, 1000)), {
      kind: 'pending',
      amount: 1000,
      isCredit: false,
    });
  });

  it('returns partial when something — but not everything — has been paid', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(1000, 400)), {
      kind: 'partial',
      amount: 400,
      isCredit: false,
    });
  });

  it('returns pending when the paid amount is only float dust', () => {
    const badge = resolveInvoicePaymentBadge(completed(1000, 999.9995));
    assert.equal(badge.kind, 'pending');
    assert.equal(badge.isCredit, false);
  });

  it('returns partial when the paid amount just clears the epsilon', () => {
    const badge = resolveInvoicePaymentBadge(completed(1000, 998));
    assert.equal(badge.kind, 'partial');
    assert.equal(badge.amount, 998);
  });

  it('returns paid when the outstanding reaches zero', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(1000, 0)), {
      kind: 'paid',
      amount: 1000,
      isCredit: false,
    });
  });

  it('returns paid — NOT a credit — for an OVERPAID invoice (outstanding < 0)', () => {
    // Real dev data has 7 such rows. Before ETP-4841 the negative outstanding on
    // an ordinary invoice was harmless (the credit branch was keyed on the doc
    // type), but the naive sign-of-outstanding rewrite would flip these to
    // "Saldo a favor". The credit test must read the TOTAL, never the outstanding.
    assert.deepEqual(resolveInvoicePaymentBadge(completed(700, -50)), {
      kind: 'paid',
      amount: 750,
      isCredit: false,
    });
  });

  it('returns paid with a zero amount for a zero-total completed invoice', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(0, 0)), {
      kind: 'paid',
      amount: 0,
      isCredit: false,
    });
  });

  it('never reports a negative paid amount', () => {
    // grandTotal 0 with a positive outstanding would give paid = -5.
    const badge = resolveInvoicePaymentBadge(completed(0, 5));
    assert.equal(badge.kind, 'pending');
    assert.equal(badge.amount, 5);
  });

  it('returns paid with a clamped amount when the outstanding exceeds the total', () => {
    const badge = resolveInvoicePaymentBadge(completed(100, -0));
    assert.equal(badge.kind, 'paid');
    assert.ok(badge.amount >= 0);
  });

  it('treats an ABSENT outstandingAmount as the full total still owed, never as settled', () => {
    // The dangerous direction is rendering "unknown" as "paid". A payload that
    // omits the field must read as fully unpaid instead.
    assert.deepEqual(resolveInvoicePaymentBadge({ documentStatus: 'CO', grandTotalAmount: 1000 }), {
      kind: 'pending',
      amount: 1000,
      isCredit: false,
    });
  });

  it('treats a null outstandingAmount as the full total still owed', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(1000, null)), {
      kind: 'pending',
      amount: 1000,
      isCredit: false,
    });
  });

  it('treats an undefined outstandingAmount as the full total still owed', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(1000, undefined)), {
      kind: 'pending',
      amount: 1000,
      isCredit: false,
    });
  });

  it('treats an empty-string outstandingAmount as the full total still owed', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(1000, '')), {
      kind: 'pending',
      amount: 1000,
      isCredit: false,
    });
  });

  it('treats missing amounts on a completed record as a zero-total paid invoice', () => {
    // Both fields absent: outstanding falls back to a grandTotal that is itself
    // 0, so there is genuinely nothing left to pay.
    assert.deepEqual(resolveInvoicePaymentBadge({ documentStatus: 'CO' }), {
      kind: 'paid',
      amount: 0,
      isCredit: false,
    });
  });
});

describe('resolveInvoicePaymentBadge — numeric coercion', () => {
  it('parses numeric strings exactly like numbers', () => {
    assert.deepEqual(
      resolveInvoicePaymentBadge(completed('-25.30', '-2.30')),
      resolveInvoicePaymentBadge(completed(-25.3, -2.3)),
    );
  });

  it('parses a positive numeric string total as payable', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed('1000', '500')), {
      kind: 'partial',
      amount: 500,
      isCredit: false,
    });
  });

  it('treats a PRESENT non-numeric outstanding as zero, not as absent', () => {
    // 'xyz' is a value the payload actually carried, so it goes through
    // toNumber → 0. It must NOT take the absent-value fallback to grandTotal.
    assert.deepEqual(resolveInvoicePaymentBadge(completed(1000, 'xyz')), {
      kind: 'paid',
      amount: 1000,
      isCredit: false,
    });
  });

  it('treats a PRESENT NaN outstanding as zero, not as absent', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(1000, NaN)), {
      kind: 'paid',
      amount: 1000,
      isCredit: false,
    });
  });

  it('treats a PRESENT Infinity outstanding as zero, not as absent', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(1000, Infinity)), {
      kind: 'paid',
      amount: 1000,
      isCredit: false,
    });
  });

  it('treats a PRESENT zero outstanding as genuinely settled', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(1000, 0)), {
      kind: 'paid',
      amount: 1000,
      isCredit: false,
    });
  });

  it("treats a PRESENT '0' string outstanding as genuinely settled", () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(1000, '0')), {
      kind: 'paid',
      amount: 1000,
      isCredit: false,
    });
  });

  // The subtle part: only null / undefined / '' mean "the payload did not tell
  // us". Everything else — including junk that coerces to 0 — is a real value.
  it('separates ABSENT from PRESENT-but-unparseable for the same total', () => {
    const absent = resolveInvoicePaymentBadge(completed(1000, null));
    const unparseable = resolveInvoicePaymentBadge(completed(1000, 'xyz'));
    assert.equal(absent.kind, 'pending', 'absent → full total still owed');
    assert.equal(absent.amount, 1000);
    assert.equal(unparseable.kind, 'paid', 'present junk → coerced to 0 → settled');
    assert.notDeepEqual(absent, unparseable);
  });

  it('treats a non-numeric string TOTAL as zero', () => {
    // grandTotal 'abc' → 0; outstanding 'xyz' is present → 0 → nothing owed.
    assert.deepEqual(resolveInvoicePaymentBadge(completed('abc', 'xyz')), {
      kind: 'paid',
      amount: 0,
      isCredit: false,
    });
  });

  it('treats a null total with a null outstanding as a zero-total paid invoice', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(null, null)), {
      kind: 'paid',
      amount: 0,
      isCredit: false,
    });
  });

  it('treats a NaN total as zero', () => {
    assert.deepEqual(resolveInvoicePaymentBadge(completed(NaN, 0)), {
      kind: 'paid',
      amount: 0,
      isCredit: false,
    });
  });
});

// ── The regression this function exists for ──────────────────────────────────
// Both grids and both topbars used to decide "credit vs payable" from the
// document type. These two cases are the ones that shipped wrong.

describe('resolveInvoicePaymentBadge — document type is irrelevant (ETP-4841)', () => {
  const DOC_TYPE_SHAPES = [
    { label: 'ordinary sales invoice', fields: { arInvoiceSubtype: 'FAC', 'transactionDocument$_identifier': 'ARInvoice' } },
    { label: 'sales rectificativa', fields: { arInvoiceSubtype: 'RECTIFICATIVA', 'transactionDocument$_identifier': 'Factura Rectificativa' } },
    { label: 'ordinary purchase invoice', fields: { apInvoiceSubtype: 'FAC', 'transactionDocument$_identifier': 'AP Invoice' } },
    { label: 'purchase rectificativa', fields: { apInvoiceSubtype: 'RECTIFICATIVA', 'transactionDocument$_identifier': 'AP CreditMemo' } },
    { label: 'no subtype fields at all', fields: {} },
  ];

  for (const { label, fields } of DOC_TYPE_SHAPES) {
    it(`resolves a NEGATIVE total to a credit for a ${label}`, () => {
      assert.deepEqual(resolveInvoicePaymentBadge(completed(-100, -100, fields)), {
        kind: 'credit-available',
        amount: 100,
        isCredit: true,
      });
    });

    it(`resolves a POSITIVE total to a payable invoice for a ${label}`, () => {
      assert.deepEqual(resolveInvoicePaymentBadge(completed(100, 100, fields)), {
        kind: 'pending',
        amount: 100,
        isCredit: false,
      });
    });
  }

  it('bug repro A: a Factura Rectificativa with a POSITIVE total is payable, not a credit', () => {
    const badge = resolveInvoicePaymentBadge(
      completed(1000, 400, { apInvoiceSubtype: 'RECTIFICATIVA', 'transactionDocument$_identifier': 'Factura Rectificativa' }),
    );
    assert.equal(badge.isCredit, false);
    assert.equal(badge.kind, 'partial');
    assert.equal(badge.amount, 400);
  });

  it('bug repro B: an ordinary Factura with a NEGATIVE total is a credit, not "Cobrada"', () => {
    const badge = resolveInvoicePaymentBadge(
      completed(-900, -900, { arInvoiceSubtype: 'FAC', 'transactionDocument$_identifier': 'ARInvoice' }),
    );
    assert.equal(badge.isCredit, true);
    assert.equal(badge.kind, 'credit-available');
    assert.equal(badge.amount, 900);
  });
});

describe('resolveInvoicePaymentBadge — invariants', () => {
  const RECORDS = [
    null,
    undefined,
    {},
    { documentStatus: 'DR', grandTotalAmount: -10, outstandingAmount: -10 },
    completed(1000, 1000),
    completed(1000, 400),
    completed(1000, 0),
    completed(700, -50),
    completed(0, 0),
    completed(0, 5),
    completed(-25.3, -2.3),
    completed(-25.3, 0),
    completed(-25.3, 25.3),
    completed('abc', 'xyz'),
    // ABSENT outstanding — falls back to the full total in both signs.
    { documentStatus: 'CO', grandTotalAmount: 1000 },
    { documentStatus: 'CO', grandTotalAmount: -1000 },
    completed(1000, null),
    completed(-1000, ''),
  ];

  const KINDS = new Set(['draft', 'credit-available', 'credit-applied', 'paid', 'partial', 'pending']);

  it('always returns a non-negative amount', () => {
    for (const record of RECORDS) {
      const { amount } = resolveInvoicePaymentBadge(record);
      assert.ok(amount >= 0, `expected a non-negative amount for ${JSON.stringify(record)}, got ${amount}`);
    }
  });

  it('always returns a documented kind and a boolean isCredit', () => {
    for (const record of RECORDS) {
      const badge = resolveInvoicePaymentBadge(record);
      assert.ok(KINDS.has(badge.kind), `unexpected kind "${badge.kind}"`);
      assert.equal(typeof badge.isCredit, 'boolean');
    }
  });

  it('always sets isCredit on the two credit kinds and never on paid/partial/pending', () => {
    // `draft` is deliberately excluded: it carries the document-level isCredit
    // flag (see the draft suite above), whichever sign the total has.
    for (const record of RECORDS) {
      const badge = resolveInvoicePaymentBadge(record);
      if (badge.kind === 'credit-available' || badge.kind === 'credit-applied') {
        assert.equal(badge.isCredit, true, `expected isCredit on kind "${badge.kind}"`);
      } else if (badge.kind !== 'draft') {
        assert.equal(badge.isCredit, false, `expected no isCredit on kind "${badge.kind}"`);
      }
    }
  });

  it('mirrors the sign of the total in isCredit for every record, draft or not', () => {
    for (const record of RECORDS) {
      const total = parseFloat(record?.grandTotalAmount);
      const expected = Number.isFinite(total) ? total < 0 : false;
      assert.equal(
        resolveInvoicePaymentBadge(record).isCredit,
        expected,
        `isCredit must follow the sign of the total for ${JSON.stringify(record)}`,
      );
    }
  });

  it('is a pure function — repeated calls return equal results and never mutate the record', () => {
    const record = completed(-25.3, -2.3, { apInvoiceSubtype: 'RECTIFICATIVA' });
    const snapshot = JSON.stringify(record);
    assert.deepEqual(resolveInvoicePaymentBadge(record), resolveInvoicePaymentBadge(record));
    assert.equal(JSON.stringify(record), snapshot);
  });
});
