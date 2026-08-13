import { isValidIban, normalizeIban, chunkIban } from '../validateIban.js';

describe('validateIban', () => {
  describe('normalizeIban', () => {
    it('strips whitespace and upper-cases', () => {
      expect(normalizeIban('es91 2100 0418 4502 0005 1332')).toBe('ES9121000418450200051332');
    });

    it('handles null / undefined as empty string', () => {
      expect(normalizeIban(null)).toBe('');
      expect(normalizeIban(undefined)).toBe('');
    });

    it('collapses tabs and newlines too', () => {
      expect(normalizeIban('GB82\tWEST\n1234')).toBe('GB82WEST1234');
    });
  });

  describe('chunkIban', () => {
    it('groups into blocks of 4 separated by spaces', () => {
      expect(chunkIban('ES9121000418450200051332')).toBe('ES91 2100 0418 4502 0005 1332');
    });

    it('normalises before chunking', () => {
      expect(chunkIban('es9121000418450200051332')).toBe('ES91 2100 0418 4502 0005 1332');
    });

    it('trims any trailing space for exact multiples of 4', () => {
      // 8 chars → two groups, no trailing space
      expect(chunkIban('GB82WEST')).toBe('GB82 WEST');
    });
  });

  describe('isValidIban', () => {
    it('accepts a valid Spanish IBAN', () => {
      expect(isValidIban('ES9121000418450200051332')).toBe(true);
    });

    it('accepts a valid IBAN with display spaces', () => {
      expect(isValidIban('ES91 2100 0418 4502 0005 1332')).toBe(true);
    });

    it('accepts a valid UK IBAN', () => {
      expect(isValidIban('GB82WEST12345698765432')).toBe(true);
    });

    it('accepts a lower-case valid IBAN (normalised first)', () => {
      expect(isValidIban('gb82west12345698765432')).toBe(true);
    });

    it('rejects an IBAN with a broken checksum', () => {
      // last digit flipped
      expect(isValidIban('ES9121000418450200051333')).toBe(false);
    });

    it('rejects an IBAN with a wrong check-digit pair', () => {
      expect(isValidIban('GB00WEST12345698765432')).toBe(false);
    });

    it('rejects an IBAN that is too short', () => {
      expect(isValidIban('ES91')).toBe(false);
    });

    it('rejects an IBAN longer than 34 characters', () => {
      expect(isValidIban(`ES91${'1'.repeat(40)}`)).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(isValidIban('')).toBe(false);
    });

    it('rejects null / undefined', () => {
      expect(isValidIban(null)).toBe(false);
      expect(isValidIban(undefined)).toBe(false);
    });

    it('rejects a string that does not start with two letters + two digits', () => {
      expect(isValidIban('1234WEST12345698765432')).toBe(false);
    });

    it('rejects a string containing punctuation', () => {
      expect(isValidIban('ES91-2100-0418-4502-0005-1332')).toBe(false);
    });
  });
});
