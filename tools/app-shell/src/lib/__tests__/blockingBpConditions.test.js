import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectBlockingBpCondition } from '../blockingBpConditions.js';

describe('detectBlockingBpCondition', () => {
  describe('creditLimit — English', () => {
    it('matches "credit limit" wording', () => {
      const result = detectBlockingBpCondition('Business Partner credit limit exceeded.');
      assert.deepEqual(result, {
        kind: 'creditLimit',
        text: 'Business Partner credit limit exceeded.',
        amount: null,
      });
    });

    it('matches regardless of case', () => {
      const result = detectBlockingBpCondition('CREDIT LIMIT over the allowed amount');
      assert.equal(result?.kind, 'creditLimit');
    });
  });

  describe('creditLimit — Spanish', () => {
    it('matches "límite de crédito" wording', () => {
      const result = detectBlockingBpCondition('Se ha superado el límite de crédito del cliente.');
      assert.equal(result?.kind, 'creditLimit');
    });

    it('matches "crédito ... límite" in either order (within the 20-char window)', () => {
      const result = detectBlockingBpCondition('El crédito supera el límite.');
      assert.equal(result?.kind, 'creditLimit');
    });

    it('matches unaccented "limite"/"credito" variants', () => {
      const result = detectBlockingBpCondition('limite de credito superado');
      assert.equal(result?.kind, 'creditLimit');
    });
  });

  describe('creditLimit — trailing amount extraction (ETP-5024 follow-up bug)', () => {
    // SE_Order_BPartner.java (core Etendo) builds the message as raw
    // concatenation with NO separating space and an unformatted
    // `Double.toString()` amount — e.g. the real repro from the bug report:
    // "Aviso: Crédito limite superado4912.6". The amount must be pulled out
    // separately so the UI layer can format it, never paste it back raw.
    it('extracts the amount and strips it (with the backend text) from a Spanish message with no separating space', () => {
      const result = detectBlockingBpCondition('Aviso: Crédito limite superado4912.6');
      assert.deepEqual(result, {
        kind: 'creditLimit',
        text: 'Aviso: Crédito limite superado',
        amount: 4912.6,
      });
    });

    it('extracts the amount from an English message with a trailing space (trims it off the label)', () => {
      const result = detectBlockingBpCondition('Credit Limit over by 4912.6');
      assert.deepEqual(result, {
        kind: 'creditLimit',
        text: 'Credit Limit over by',
        amount: 4912.6,
      });
    });

    it('treats a comma decimal separator the same as a period', () => {
      const result = detectBlockingBpCondition('limite de credito superado por 4912,60');
      assert.deepEqual(result, {
        kind: 'creditLimit',
        text: 'limite de credito superado por',
        amount: 4912.6,
      });
    });

    it('extracts a negative amount', () => {
      const result = detectBlockingBpCondition('credito limite superado-4912.6');
      assert.deepEqual(result, {
        kind: 'creditLimit',
        text: 'credito limite superado',
        amount: -4912.6,
      });
    });

    it('leaves amount null when the message has no trailing number', () => {
      const result = detectBlockingBpCondition('limite de credito superado');
      assert.deepEqual(result, {
        kind: 'creditLimit',
        text: 'limite de credito superado',
        amount: null,
      });
    });

    // ETP-5024 blocker 3: Java's Double.toString() (SE_Order_BPartner.java, core
    // Etendo) switches to scientific notation for values >= 1e7 — routine for
    // ARS/COP/CLP amounts. The old plain-decimal-only regex matched only the
    // trailing digit after the exponent marker, producing a wildly wrong amount.
    it('extracts a large amount expressed in scientific notation', () => {
      const result = detectBlockingBpCondition('Aviso: Crédito limite superado1.2345678E7');
      assert.deepEqual(result, {
        kind: 'creditLimit',
        text: 'Aviso: Crédito limite superado',
        amount: 12345678,
      });
    });

    it('extracts a negative amount in scientific notation', () => {
      const result = detectBlockingBpCondition('credit limit exceeded by -1.5E7');
      assert.deepEqual(result, {
        kind: 'creditLimit',
        text: 'credit limit exceeded by',
        amount: -15000000,
      });
    });

    it('extracts scientific notation with an explicit positive exponent sign', () => {
      const result = detectBlockingBpCondition('limite de credito superado1.0E+7');
      assert.deepEqual(result, {
        kind: 'creditLimit',
        text: 'limite de credito superado',
        amount: 10000000,
      });
    });

    // ETP-5024 Sonar fix (javascript:S5852): the regex-based extractor was replaced
    // with a manual backward character scan. A lone trailing separator with no digit
    // (a sentence ending in a bare period, comma, "e"/"E", "+" or "-") must NOT be
    // treated as a candidate number and stripped from the label — the scan requires
    // at least one digit in the trailing run before returning a match.
    it('does not treat a trailing period with no digits as an amount', () => {
      const result = detectBlockingBpCondition('El límite de crédito fue superado.');
      assert.deepEqual(result, {
        kind: 'creditLimit',
        text: 'El límite de crédito fue superado.',
        amount: null,
      });
    });
  });

  describe('onHold — English', () => {
    // Real production wording (AD_MESSAGE `BusinessPartnerBlocked` /
    // `SelectedBPartnerBlocked`), not a contrived shorthand — the pattern is
    // anchored on this exact sentence shape (ETP-5024 blocker 1).
    it('matches the BusinessPartnerBlocked sentence shape', () => {
      const result = detectBlockingBpCondition(
        'The business partner Acme Corp is on hold for this document, therefore it is not possible to complete it.'
      );
      assert.deepEqual(result, {
        kind: 'onHold',
        text: 'The business partner Acme Corp is on hold for this document, therefore it is not possible to complete it.',
      });
    });

    it('matches the SelectedBPartnerBlocked sentence shape', () => {
      const result = detectBlockingBpCondition(
        'The selected Business Partner is on hold for this document, therefore it is not possible to complete it.'
      );
      assert.equal(result?.kind, 'onHold');
    });

    it('matches regardless of case', () => {
      const result = detectBlockingBpCondition(
        'THIS BUSINESS PARTNER IS ON HOLD FOR THIS DOCUMENT, THEREFORE IT IS NOT POSSIBLE TO COMPLETE IT.'
      );
      assert.equal(result?.kind, 'onHold');
    });
  });

  describe('onHold — Spanish', () => {
    it('matches "bloqueado para este documento" (masculine, BusinessPartnerBlocked)', () => {
      const result = detectBlockingBpCondition(
        'El socio de negocio Acme Corp está bloqueado para este documento, no se puede completar.'
      );
      assert.equal(result?.kind, 'onHold');
    });

    it('matches "bloqueada para este documento" (feminine)', () => {
      const result = detectBlockingBpCondition(
        'La cuenta seleccionada está bloqueada para este documento, no se puede completar.'
      );
      assert.equal(result?.kind, 'onHold');
    });

    it('matches the SelectedBPartnerBlocked Spanish sentence shape', () => {
      const result = detectBlockingBpCondition(
        'El tercero seleccionado está bloqueado para este documento, no se puede completar.'
      );
      assert.equal(result?.kind, 'onHold');
    });
  });

  // ETP-5024 blocker 1 — REVIEW (Alex) queried the live AD_MESSAGE/AD_MESSAGE_TRL
  // catalog and found these Spanish messages false-positived against the old bare
  // `bloquead[oa]` keyword. None of them has anything to do with a BP being on
  // hold, and one of them (`lockedProduct`) is a real, reachable Goods Shipment
  // Complete failure that would have been silently converted from a red toast
  // into a persistent yellow "BP blocking" banner.
  describe('false positives the old bare-keyword pattern matched (regression, ETP-5024)', () => {
    it('does NOT match lockedProduct (Goods Shipment Complete failure)', () => {
      const result = detectBlockingBpCondition(
        'el producto está bloqueado y no se puede entregar'
      );
      assert.equal(result, null);
    });

    it('does NOT match LinesWithLockedProducts', () => {
      const result = detectBlockingBpCondition('Hay líneas con productos bloqueados');
      assert.equal(result, null);
    });

    it('does NOT match CannotConsumeHoldReservation (bare "On Hold", no document)', () => {
      const result = detectBlockingBpCondition('It is not possible to modify a On Hold reservation');
      assert.equal(result, null);
    });

    it('does NOT match LOCKED_USER_MSG', () => {
      const result = detectBlockingBpCondition(
        'El usuario está bloqueado. Solicite a un administrador que lo desbloquee.'
      );
      assert.equal(result, null);
    });
  });

  describe('priority when both patterns could apply', () => {
    it('returns creditLimit when the credit-limit pattern matches first', () => {
      // Contrived, but locks in the documented "credit limit checked before
      // on-hold" order in detectBlockingBpCondition's implementation.
      const result = detectBlockingBpCondition(
        'credit limit exceeded, account is on hold for this document'
      );
      assert.equal(result?.kind, 'creditLimit');
    });
  });

  describe('no match', () => {
    it('returns null for an unrelated message', () => {
      assert.equal(detectBlockingBpCondition('Record saved successfully.'), null);
    });

    it('returns null for an unrelated Spanish message', () => {
      assert.equal(detectBlockingBpCondition('Registro guardado correctamente.'), null);
    });

    it('returns null for empty string', () => {
      assert.equal(detectBlockingBpCondition(''), null);
    });

    it('returns null for null', () => {
      assert.equal(detectBlockingBpCondition(null), null);
    });

    it('returns null for undefined', () => {
      assert.equal(detectBlockingBpCondition(undefined), null);
    });

    it('returns null for a non-string value', () => {
      assert.equal(detectBlockingBpCondition(42), null);
    });
  });
});
