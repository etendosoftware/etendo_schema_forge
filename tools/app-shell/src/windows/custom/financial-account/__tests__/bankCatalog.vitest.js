import { BANK_CATALOG, searchBanks, institutionsFor } from '../bankCatalog.js';

describe('bankCatalog', () => {
  describe('searchBanks', () => {
    it('returns the full catalog for an empty query', () => {
      expect(searchBanks('')).toBe(BANK_CATALOG);
      expect(searchBanks('   ')).toBe(BANK_CATALOG);
    });

    it('returns the full catalog for null / undefined', () => {
      expect(searchBanks(null)).toBe(BANK_CATALOG);
      expect(searchBanks(undefined)).toBe(BANK_CATALOG);
    });

    it('filters case-insensitively on the bank name', () => {
      const result = searchBanks('santander');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('santander');
    });

    it('matches substrings anywhere in the name', () => {
      const result = searchBanks('caja');
      const ids = result.map((b) => b.id);
      expect(ids).toContain('cajamar');
      expect(ids).toContain('unicaja');
      expect(ids).toContain('ibercaja');
      // "CaixaBank" does not contain the substring "caja"
      expect(ids).not.toContain('caixabank');
    });

    it('returns an empty array when nothing matches', () => {
      expect(searchBanks('zzz-no-such-bank')).toEqual([]);
    });

    it('trims surrounding whitespace before matching', () => {
      expect(searchBanks('  BBVA  ')).toHaveLength(1);
      expect(searchBanks('  BBVA  ')[0].id).toBe('bbva');
    });
  });

  describe('institutionsFor', () => {
    it('returns an empty array when no bank is given', () => {
      expect(institutionsFor(null)).toEqual([]);
      expect(institutionsFor(undefined)).toEqual([]);
    });

    it('returns three variants for a bank', () => {
      const bank = { id: 'santander', name: 'Banco Santander' };
      const variants = institutionsFor(bank);
      expect(variants).toHaveLength(3);
    });

    it('derives stable ids from the bank id', () => {
      const bank = { id: 'bbva', name: 'BBVA' };
      const ids = institutionsFor(bank).map((v) => v.id);
      expect(ids).toEqual(['bbva-default', 'bbva-business', 'bbva-personal']);
    });

    it('labels the variants from the bank name', () => {
      const bank = { id: 'bbva', name: 'BBVA' };
      const names = institutionsFor(bank).map((v) => v.name);
      expect(names).toEqual(['BBVA', 'BBVA (Empresas)', 'BBVA (Usuario)']);
    });
  });
});
