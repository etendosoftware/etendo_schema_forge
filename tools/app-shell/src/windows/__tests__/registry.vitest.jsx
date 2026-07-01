import { buildMenuGroups, getAllWindowNames, apiOnlyWindows, buildWindowMap } from '../registry';

describe('registry', () => {
  describe('buildMenuGroups', () => {
    it('returns an array of menu groups', () => {
      const groups = buildMenuGroups();
      expect(Array.isArray(groups)).toBe(true);
      expect(groups.length).toBeGreaterThan(0);
    });

    it('each group has group name and items array', () => {
      const groups = buildMenuGroups();
      for (const g of groups) {
        expect(g.group).toBeTruthy();
        expect(Array.isArray(g.items)).toBe(true);
      }
    });

    it('excludes hidden groups by default', () => {
      const groups = buildMenuGroups();
      const marketplace = groups.find(g => g.group === 'Marketplace');
      expect(marketplace).toBeUndefined();
    });

    it('includes Marketplace when appStoreUnlocked is true', () => {
      const groups = buildMenuGroups([], { appStoreUnlocked: true });
      const marketplace = groups.find(g => g.group === 'Marketplace');
      expect(marketplace).toBeDefined();
    });

    it('excludes hidden items within groups', () => {
      const groups = buildMenuGroups();
      for (const g of groups) {
        for (const item of g.items) {
          expect(item.hidden).toBeFalsy();
        }
      }
    });
  });

  describe('getAllWindowNames', () => {
    it('returns an array of strings', () => {
      const names = getAllWindowNames();
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBeGreaterThan(0);
      for (const n of names) {
        expect(typeof n).toBe('string');
      }
    });

    it('includes known windows', () => {
      const names = getAllWindowNames();
      expect(names).toContain('sales-order');
      expect(names).toContain('purchase-order');
      expect(names).toContain('product');
    });
  });

  describe('apiOnlyWindows', () => {
    it('is a Set', () => {
      expect(apiOnlyWindows instanceof Set).toBe(true);
    });

    it('contains expected fiscal config windows', () => {
      expect(apiOnlyWindows.has('sii-config')).toBe(true);
      expect(apiOnlyWindows.has('tbai-config')).toBe(true);
      expect(apiOnlyWindows.has('verifactu-config')).toBe(true);
    });
  });

  describe('buildWindowMap', () => {
    it('returns an object with window entries', () => {
      const map = buildWindowMap();
      expect(typeof map).toBe('object');
      expect(Object.keys(map).length).toBeGreaterThan(0);
    });

    it('each entry has name, label, contract, and loader', () => {
      const map = buildWindowMap();
      for (const [key, entry] of Object.entries(map)) {
        expect(entry.name).toBe(key);
        expect(typeof entry.loader).toBe('function');
        expect(entry.contract).toBeNull();
      }
    });

    it('known windows have loaders', () => {
      const map = buildWindowMap();
      expect(map['sales-order']).toBeDefined();
      expect(typeof map['sales-order'].loader).toBe('function');
    });
  });
});
