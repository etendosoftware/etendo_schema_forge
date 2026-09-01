import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_ORDER, compareStatusCodes } from '../statusBadge.js';

// Regression coverage for ETP-4696: the "All statuses" dropdown must render
// in a fixed order regardless of the arrival order of its two data sources
// (in-memory rows vs. the uncached backend distinct-values fetch).

describe('compareStatusCodes (ETP-4696 — stable status dropdown order)', () => {
  it('orders known codes by their fixed STATUS_ORDER position', () => {
    const shuffled = ['VO', 'DR', 'CO', 'IP', 'CL', 'RPAP'];
    const sorted = shuffled.slice().sort(compareStatusCodes);
    const expected = STATUS_ORDER.filter((c) => shuffled.includes(c));
    assert.deepEqual(sorted, expected);
  });

  it('produces the same order no matter the input order (idempotent regardless of arrival order)', () => {
    const a = ['CL', 'DR', 'VO', 'IP', 'CO'];
    const b = ['VO', 'IP', 'CO', 'CL', 'DR'];
    assert.deepEqual(a.slice().sort(compareStatusCodes), b.slice().sort(compareStatusCodes));
  });

  it('is case-insensitive', () => {
    const mixed = ['vo', 'DR', 'Co', 'ip'];
    const sorted = mixed.slice().sort(compareStatusCodes);
    assert.deepEqual(sorted.map((c) => c.toUpperCase()), ['DR', 'IP', 'CO', 'VO']);
  });

  it('pushes unknown codes after all known ones', () => {
    const codes = ['ZZZ_UNKNOWN', 'DR', 'AAA_UNKNOWN'];
    const sorted = codes.slice().sort(compareStatusCodes);
    assert.equal(sorted[0], 'DR');
    assert.deepEqual(sorted.slice(1), ['AAA_UNKNOWN', 'ZZZ_UNKNOWN']);
  });

  it('keeps unknown codes stable and alphabetical relative to each other', () => {
    const codes = ['UNKNOWN_B', 'UNKNOWN_A', 'UNKNOWN_C'];
    const sorted = codes.slice().sort(compareStatusCodes);
    assert.deepEqual(sorted, ['UNKNOWN_A', 'UNKNOWN_B', 'UNKNOWN_C']);
  });

  it('treats boolean-derived codes (true/false) consistently with Draft/Completed buckets', () => {
    const codes = ['true', 'false'];
    const sorted = codes.slice().sort(compareStatusCodes);
    assert.deepEqual(sorted, ['false', 'true']);
  });

  it('returns 0 for two identical unknown codes (exact tie, neither in STATUS_ORDER)', () => {
    assert.equal(compareStatusCodes('FOO_UNKNOWN', 'FOO_UNKNOWN'), 0);
  });

  it('returns 0 for the same unknown code differing only in case (normalized tie)', () => {
    assert.equal(compareStatusCodes('foo_unknown', 'FOO_UNKNOWN'), 0);
  });
});

// ETP-4913 extended STATUS_ORDER with the remaining real docstatus codes, so a
// whole reference list now sorts by document flow instead of leaving
// "??, NA, RE, TEMP, WP" alphabetized at the tail.

// Real AD_Ref_List code sets. 131 "All_Document Status" backs M_InOut and
// C_Invoice (shipments, receipts, returns, invoices); FF8081…0011
// "Order_Document Status" backs C_Order (orders and quotations), plus the
// ETGO_CI value com.etendoerp.go adds.
const WAREHOUSE_CODES = ['CL', 'CO', 'DR', 'NA', 'WP', 'RE', 'TEMP', 'IP', '??', 'VO'];
const ORDER_CODES = [
  'AE', 'CO', 'CL', 'ETGO_CI', 'CA', 'CJ', 'DR', 'ME', 'NA', 'NC',
  'WP', 'RE', 'TMP', 'UE', 'IP', '??', 'VO',
];
const PAYMENT_CODES = ['RPAE', 'RPAP', 'RPR', 'RPPC', 'PPM', 'PWNC', 'RDNC', 'RPVOID', 'ETGOERR'];

describe('compareStatusCodes — full document flows (ETP-4913)', () => {
  it('orders the warehouse/invoice docstatus set by document flow', () => {
    assert.deepEqual(
      WAREHOUSE_CODES.slice().sort(compareStatusCodes),
      ['TEMP', 'DR', 'IP', 'WP', 'CO', 'RE', 'CL', 'NA', 'VO', '??'],
    );
  });

  it('orders the order/quotation docstatus set by document flow', () => {
    assert.deepEqual(
      ORDER_CODES.slice().sort(compareStatusCodes),
      ['TMP', 'DR', 'NC', 'IP', 'UE', 'AE', 'ME', 'WP', 'CO', 'CA', 'ETGO_CI',
        'RE', 'CL', 'NA', 'CJ', 'VO', '??'],
    );
  });

  it('orders the payment status set by payment flow', () => {
    assert.deepEqual(
      PAYMENT_CODES.slice().sort(compareStatusCodes),
      ['RPAE', 'RPAP', 'RPR', 'RPPC', 'PPM', 'PWNC', 'RDNC', 'RPVOID', 'ETGOERR'],
    );
  });

  it('knows every code of every real status set (none falls to the alphabetical tail)', () => {
    for (const code of [...WAREHOUSE_CODES, ...ORDER_CODES, ...PAYMENT_CODES]) {
      assert.ok(STATUS_ORDER.includes(code), `${code} is missing from STATUS_ORDER`);
    }
  });

  it('places the Unknown sentinel last among known codes, but before an unknown one', () => {
    // The backend orders distinct values by raw code and '?' (0x3F) sorts
    // before 'A', so without an explicit entry '??' rendered FIRST.
    assert.deepEqual(
      ['??', 'CO', 'DR', 'ZZZ_UNKNOWN'].sort(compareStatusCodes),
      ['DR', 'CO', '??', 'ZZZ_UNKNOWN'],
    );
  });

  it('keeps the two Temporal aliases adjacent and ahead of Draft', () => {
    assert.deepEqual(['DR', 'TEMP', 'TMP'].sort(compareStatusCodes), ['TMP', 'TEMP', 'DR']);
  });

  it('orders Re-Opened after Completed and before the terminal Closed', () => {
    assert.deepEqual(['CL', 'RE', 'CO'].sort(compareStatusCodes), ['CO', 'RE', 'CL']);
  });
});

describe('STATUS_ORDER invariants', () => {
  it('has no duplicate entries', () => {
    assert.equal(new Set(STATUS_ORDER).size, STATUS_ORDER.length);
  });

  it('holds every entry in upper case', () => {
    // compareStatusCodes upper-cases its inputs before the indexOf lookup, so a
    // lower-case entry would be permanently unreachable.
    for (const code of STATUS_ORDER) {
      assert.equal(code, code.toUpperCase(), `${code} is not upper case`);
    }
  });
});
