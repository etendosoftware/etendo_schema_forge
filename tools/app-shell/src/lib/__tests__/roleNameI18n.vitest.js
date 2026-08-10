import { ROLE_NAME_I18N_KEYS, ADMIN_NAME_I18N_KEY, resolveRoleDisplayName } from '../roleNameI18n.js';

// ETP-4513 — shared i18n key mapping for the 4 fixed non-admin role names
// (Finance/Sales/Purchasing/Inventory), extracted out of RolesOverviewPage.jsx
// so AssignRoleControl.jsx can reuse the exact same mapping instead of
// rendering the raw AD_Role.name untranslated (ETP-4512's dropdown bug).
describe('roleNameI18n', () => {
  describe('ROLE_NAME_I18N_KEYS', () => {
    it('maps exactly the 4 fixed non-admin role names to their i18n keys', () => {
      expect(ROLE_NAME_I18N_KEYS).toEqual({
        Finance: 'roleNameFinance',
        Sales: 'roleNameSales',
        Purchasing: 'roleNamePurchasing',
        Inventory: 'roleNameInventory',
      });
    });

    it('does not include the client-admin role (its name varies per tenant)', () => {
      expect(ROLE_NAME_I18N_KEYS.Admin).toBeUndefined();
      expect(ROLE_NAME_I18N_KEYS['GOClient Admin']).toBeUndefined();
    });
  });

  describe('ADMIN_NAME_I18N_KEY', () => {
    it('is the generic admin i18n key', () => {
      expect(ADMIN_NAME_I18N_KEY).toBe('roleNameAdmin');
    });
  });

  describe('resolveRoleDisplayName', () => {
    it('translates each of the 4 known role names via the provided ui() function', () => {
      const ui = (key) => `translated:${key}`;
      expect(resolveRoleDisplayName(ui, 'Finance')).toBe('translated:roleNameFinance');
      expect(resolveRoleDisplayName(ui, 'Sales')).toBe('translated:roleNameSales');
      expect(resolveRoleDisplayName(ui, 'Purchasing')).toBe('translated:roleNamePurchasing');
      expect(resolveRoleDisplayName(ui, 'Inventory')).toBe('translated:roleNameInventory');
    });

    it('falls back to the raw name unchanged for a name it does not recognize', () => {
      const ui = (key) => `translated:${key}`;
      expect(resolveRoleDisplayName(ui, 'GOClient Admin')).toBe('GOClient Admin');
      expect(resolveRoleDisplayName(ui, 'Some Future Role')).toBe('Some Future Role');
    });

    it('does not call ui() at all for an unrecognized name (no wasted lookup)', () => {
      const ui = vi.fn((key) => key);
      resolveRoleDisplayName(ui, 'GOClient Admin');
      expect(ui).not.toHaveBeenCalled();
    });

    it('handles null/undefined/empty name gracefully by returning it unchanged', () => {
      const ui = (key) => key;
      expect(resolveRoleDisplayName(ui, null)).toBeNull();
      expect(resolveRoleDisplayName(ui, undefined)).toBeUndefined();
      expect(resolveRoleDisplayName(ui, '')).toBe('');
    });
  });
});
