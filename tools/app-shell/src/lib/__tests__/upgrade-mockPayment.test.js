import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECLINE_CARD_NUMBER,
  DECLINED_PAYMENT_TOKEN,
  normalizeCardNumber,
  formatCardNumber,
  isDeclinedCard,
  validateCheckout,
  createMockPaymentToken,
} from '../upgrade/mockPayment.js';

/**
 * Mock payment for the tenant upgrade flow (ETP-4686).
 *
 * `now` is injected everywhere expiry matters, so these assertions do not rot
 * as the calendar moves.
 */

const NOW = new Date('2026-07-27T00:00:00Z');

const validForm = {
  tenantName: 'Acme Productive',
  cardholder: 'Ada Lovelace',
  cardNumber: '4242 4242 4242 4242',
  expiry: '12/30',
  cvc: '123',
};

describe('normalizeCardNumber', () => {
  it('strips the spaces and dashes people type', () => {
    assert.equal(normalizeCardNumber('4242 4242-4242 4242'), '4242424242424242');
  });

  it('coerces null and undefined to an empty string', () => {
    assert.equal(normalizeCardNumber(null), '');
    assert.equal(normalizeCardNumber(undefined), '');
  });
});

describe('formatCardNumber', () => {
  it('groups digits in blocks of four', () => {
    assert.equal(formatCardNumber('4242424242424242'), '4242 4242 4242 4242');
  });

  it('formats a partial number without a trailing separator', () => {
    assert.equal(formatCardNumber('42424'), '4242 4');
    assert.equal(formatCardNumber('4242'), '4242');
  });

  it('caps the input at a full card number', () => {
    assert.equal(formatCardNumber('42424242424242429999'), '4242 4242 4242 4242');
  });

  it('is idempotent, so re-formatting while typing is safe', () => {
    assert.equal(formatCardNumber(formatCardNumber('4242424242424242')), '4242 4242 4242 4242');
  });
});

describe('isDeclinedCard', () => {
  it('recognises the decline card however it is spaced', () => {
    assert.equal(isDeclinedCard(DECLINE_CARD_NUMBER), true);
    assert.equal(isDeclinedCard('4000 0000 0000 0002'), true);
  });

  it('accepts any other card', () => {
    assert.equal(isDeclinedCard('4242424242424242'), false);
    assert.equal(isDeclinedCard(''), false);
  });
});

describe('validateCheckout', () => {
  describe('happy path', () => {
    it('returns no errors for a complete, valid form', () => {
      assert.deepEqual(validateCheckout(validForm, NOW), {});
    });

    it('accepts an expiry in the current month, valid through its last day', () => {
      assert.deepEqual(validateCheckout({ ...validForm, expiry: '07/26' }, NOW), {});
    });

    it('accepts a four-digit CVC', () => {
      assert.deepEqual(validateCheckout({ ...validForm, cvc: '1234' }, NOW), {});
    });

    it('accepts spaces around the expiry separator', () => {
      assert.deepEqual(validateCheckout({ ...validForm, expiry: '12 / 30' }, NOW), {});
    });
  });

  describe('required fields', () => {
    it('requires a tenant name that is not just whitespace', () => {
      assert.equal(validateCheckout({ ...validForm, tenantName: '   ' }, NOW).tenantName,
        'upgradeTenantNameRequired');
    });

    it('requires a cardholder', () => {
      assert.equal(validateCheckout({ ...validForm, cardholder: '' }, NOW).cardholder,
        'upgradeCardholderRequired');
    });

    it('reports every problem at once on an empty form', () => {
      const errors = validateCheckout({}, NOW);
      assert.deepEqual(Object.keys(errors).sort(),
        ['cardNumber', 'cardholder', 'cvc', 'expiry', 'tenantName']);
    });

    it('treats a missing argument as an empty form rather than throwing', () => {
      assert.equal(Object.keys(validateCheckout(undefined, NOW)).length, 5);
    });
  });

  describe('card number', () => {
    it('rejects a number that is too short or too long', () => {
      assert.equal(validateCheckout({ ...validForm, cardNumber: '424242424242424' }, NOW).cardNumber,
        'upgradeCardNumberInvalid');
      assert.equal(validateCheckout({ ...validForm, cardNumber: '42424242424242421' }, NOW).cardNumber,
        'upgradeCardNumberInvalid');
    });

    it('rejects non-digits', () => {
      assert.equal(validateCheckout({ ...validForm, cardNumber: '4242abcd42424242' }, NOW).cardNumber,
        'upgradeCardNumberInvalid');
    });
  });

  describe('expiry', () => {
    it('rejects an unparseable value', () => {
      for (const expiry of ['', '1230', '12-30', 'ab/cd', '2030/12']) {
        assert.equal(validateCheckout({ ...validForm, expiry }, NOW).expiry, 'upgradeExpiryInvalid',
          `expected ${JSON.stringify(expiry)} to be invalid`);
      }
    });

    it('rejects a month outside 1-12', () => {
      assert.equal(validateCheckout({ ...validForm, expiry: '00/30' }, NOW).expiry, 'upgradeExpiryInvalid');
      assert.equal(validateCheckout({ ...validForm, expiry: '13/30' }, NOW).expiry, 'upgradeExpiryInvalid');
    });

    it('distinguishes an expired card from a malformed one', () => {
      assert.equal(validateCheckout({ ...validForm, expiry: '06/26' }, NOW).expiry, 'upgradeExpiryPast');
      assert.equal(validateCheckout({ ...validForm, expiry: '12/25' }, NOW).expiry, 'upgradeExpiryPast');
    });
  });

  describe('cvc', () => {
    it('rejects fewer than three or more than four digits', () => {
      assert.equal(validateCheckout({ ...validForm, cvc: '12' }, NOW).cvc, 'upgradeCvcInvalid');
      assert.equal(validateCheckout({ ...validForm, cvc: '12345' }, NOW).cvc, 'upgradeCvcInvalid');
    });

    it('rejects non-digits', () => {
      assert.equal(validateCheckout({ ...validForm, cvc: '12a' }, NOW).cvc, 'upgradeCvcInvalid');
    });
  });
});

describe('createMockPaymentToken', () => {
  it('mints a token in the shape the backend accepts', () => {
    // The backend pattern is /^mock-paid-[0-9a-f]+$/ — lowercase hex.
    assert.match(createMockPaymentToken(), /^mock-paid-[0-9a-f]+$/);
  });

  it('mints a different token each time', () => {
    const tokens = new Set(Array.from({ length: 20 }, () => createMockPaymentToken()));
    assert.equal(tokens.size, 20);
  });

  it('never mints the token the backend declines', () => {
    for (let i = 0; i < 20; i += 1) {
      assert.notEqual(createMockPaymentToken(), DECLINED_PAYMENT_TOKEN);
    }
  });
});
