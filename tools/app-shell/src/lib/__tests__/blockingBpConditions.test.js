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
