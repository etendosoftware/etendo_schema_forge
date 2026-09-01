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
  });

  describe('onHold — English', () => {
    it('matches "on hold" wording', () => {
      const result = detectBlockingBpCondition('Selected Business Partner is on hold.');
      assert.deepEqual(result, {
        kind: 'onHold',
        text: 'Selected Business Partner is on hold.',
      });
    });

    it('matches regardless of case', () => {
      const result = detectBlockingBpCondition('This BUSINESS PARTNER IS ON HOLD');
      assert.equal(result?.kind, 'onHold');
    });
  });

  describe('onHold — Spanish', () => {
    it('matches "bloqueado" (masculine)', () => {
      const result = detectBlockingBpCondition('El socio de negocio está bloqueado.');
      assert.equal(result?.kind, 'onHold');
    });

    it('matches "bloqueada" (feminine)', () => {
      const result = detectBlockingBpCondition('La cuenta seleccionada está bloqueada.');
      assert.equal(result?.kind, 'onHold');
    });
  });

  describe('priority when both patterns could apply', () => {
    it('returns creditLimit when the credit-limit pattern matches first', () => {
      // Contrived, but locks in the documented "credit limit checked before
      // on-hold" order in detectBlockingBpCondition's implementation.
      const result = detectBlockingBpCondition('credit limit exceeded, account bloqueada');
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
