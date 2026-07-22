import { buildMenuGroups, getAllWindowNames, apiOnlyWindows, buildWindowMap, filterMenuGroupsByAccess } from '../registry';

describe('registry', () => {
  // ETP-4598 — calling filterMenuGroupsByAccess() directly with synthetic
  // groups, not via buildMenuGroups()/real menu.json, so these assertions
  // aren't hostage to fixture data (menu.json ids/groups can change freely
  // without breaking these).
  describe('filterMenuGroupsByAccess', () => {
    it('keeps an item with only processId set when that processId is in allowedIds', () => {
      const groups = [{ group: 'Tools', items: [{ name: 'proc-a', processId: '500' }] }];
      const result = filterMenuGroupsByAccess(groups, new Set(['500']));
      const tools = result.find(g => g.group === 'Tools');
      expect(tools).toBeDefined();
      expect(tools.items.map(i => i.name)).toContain('proc-a');
    });

    it('drops an item with only processId set when that processId is NOT in allowedIds', () => {
      const groups = [{ group: 'Tools', items: [{ name: 'proc-a', processId: '500' }] }];
      const result = filterMenuGroupsByAccess(groups, new Set(['999']));
      expect(result.find(g => g.group === 'Tools')).toBeUndefined();
    });

    it('keeps an item with only obuiappProcessId set when it is in allowedIds', () => {
      const groups = [{ group: 'Tools', items: [{ name: 'obui-a', obuiappProcessId: '600' }] }];
      const result = filterMenuGroupsByAccess(groups, new Set(['600']));
      const tools = result.find(g => g.group === 'Tools');
      expect(tools).toBeDefined();
      expect(tools.items.map(i => i.name)).toContain('obui-a');
    });

    it('drops an item with only obuiappProcessId set when it is NOT in allowedIds', () => {
      const groups = [{ group: 'Tools', items: [{ name: 'obui-a', obuiappProcessId: '600' }] }];
      const result = filterMenuGroupsByAccess(groups, new Set(['999']));
      expect(result.find(g => g.group === 'Tools')).toBeUndefined();
    });

    it('keeps an item reachable via ANY carried id (union semantics): windowId not allowed, but processId is', () => {
      // Correct post-fix behavior: the item carries both windowId and
      // processId; windowId alone would be denied, but the item is still
      // reachable via processId, so it must be KEPT — not dropped by a
      // first-truthy-wins fallback chain.
      const groups = [{
        group: 'Sales',
        items: [{ name: 'multi-id', windowId: '111', processId: '222' }],
      }];
      const result = filterMenuGroupsByAccess(groups, new Set(['222']));
      const sales = result.find(g => g.group === 'Sales');
      expect(sales).toBeDefined();
      expect(sales.items.map(i => i.name)).toContain('multi-id');
    });

    it('drops a non-Favorites group with 0 items when allowedIds is a Set', () => {
      const groups = [{ group: 'Empty', items: [] }];
      const result = filterMenuGroupsByAccess(groups, new Set(['1']));
      expect(result.find(g => g.group === 'Empty')).toBeUndefined();
    });

    it('keeps a non-Favorites group with 0 items, unchanged, when allowedIds is null (no filtering)', () => {
      const groups = [{ group: 'Empty', items: [] }];
      const result = filterMenuGroupsByAccess(groups, null);
      const empty = result.find(g => g.group === 'Empty');
      expect(empty).toBeDefined();
      expect(empty.items).toEqual([]);
    });
  });

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

    it('does not filter at all when allowedIds is omitted (back-compat)', () => {
      const groups = buildMenuGroups();
      const purchases = groups.find(g => g.group === 'Purchases');
      expect(purchases.items.length).toBeGreaterThan(0);
    });

    it('keeps only items whose windowId is in allowedIds, and drops emptied groups', () => {
      const allowedIds = new Set(['108']); // "user" window's id from menu.json
      const groups = buildMenuGroups([], {}, allowedIds);
      const settings = groups.find(g => g.group === 'Settings');
      expect(settings.items.map(i => i.name)).toContain('user');
      expect(settings.items.map(i => i.name)).not.toContain('price-list');
      // "People" group's only non-hidden item ("contacts") carries windowId "123",
      // which is not in allowedIds — so the whole group is dropped.
      const people = groups.find(g => g.group === 'People');
      expect(people).toBeUndefined();
    });

    it('never filters items with no windowId (dashboard, custom pages, installed apps)', () => {
      const allowedIds = new Set(); // role with access to nothing AD-window-backed
      const groups = buildMenuGroups([], {}, allowedIds);
      const home = groups.find(g => g.group === 'Home');
      expect(home.items.map(i => i.name)).toContain('dashboard');
    });

    it('always keeps the Favorites group even though it starts empty', () => {
      const groups = buildMenuGroups([], {}, new Set());
      expect(groups.find(g => g.group === 'Favorites')).toBeDefined();
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
