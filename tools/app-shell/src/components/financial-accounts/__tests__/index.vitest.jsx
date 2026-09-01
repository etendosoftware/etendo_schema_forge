import * as featureExports from '../index.js';
import { ACCOUNT_TYPE, ACCOUNT_TYPE_ORDER, COLORS, RADII, SHADOWS } from '../tokens.js';

describe('financial-accounts barrel exports', () => {
  it('re-exports every component the page consumes', () => {
    expect(featureExports.AccountLogoAvatar).toBeDefined();
    expect(featureExports.SyncStatusInline).toBeDefined();
    expect(featureExports.ReconcilePill).toBeDefined();
    expect(featureExports.AccountTypeFilter).toBeDefined();
    expect(featureExports.AccountRowMenu).toBeDefined();
    expect(featureExports.AccountsToolbar).toBeDefined();
    expect(featureExports.AccountsSidebar).toBeDefined();
    // Shared by the four financial-account toolbars that draw themselves instead of
    // using ListView's idle bar, so they import it through this barrel.
    expect(featureExports.RefreshButton).toBeDefined();
  });

  // ETP-4658 retired the hand-rolled AccountsTable host (table + header + row): the
  // list is now the generated page's ListView with the AccountsHeaderTable slot, and
  // nothing mounted the old trio any more. Its cell bodies survive in
  // AccountsTable/accountColumns.jsx, bound to columns by accountCellTypes.jsx.
  it('no longer exports the retired AccountsTable host', () => {
    expect(featureExports.AccountsTable).toBeUndefined();
  });

  it('re-exports the ACCOUNT_TYPE map and ordering', () => {
    expect(featureExports.ACCOUNT_TYPE).toEqual({ BANK: 'B', CASH: 'C', CARD: 'CA' });
    expect(featureExports.ACCOUNT_TYPE_ORDER).toEqual(['B', 'C', 'CA']);
  });
});

describe('financial-accounts tokens', () => {
  it('exposes the Figma color palette', () => {
    expect(COLORS.textPrimary).toBe('hsl(var(--foreground))');
    expect(COLORS.bgGray50).toBe('hsl(var(--muted))');
    expect(COLORS.brand).toBe('hsl(var(--primary))');
  });

  it('exposes the radii and shadow tokens', () => {
    expect(RADII).toEqual({ none: 0, md: 8, pill: 360 });
    expect(SHADOWS.xs).toBe('0 1px 2px hsl(var(--foreground) / 0.05)');
  });

  it('exposes the account-type constants', () => {
    expect(ACCOUNT_TYPE.BANK).toBe('B');
    expect(ACCOUNT_TYPE.CASH).toBe('C');
    expect(ACCOUNT_TYPE.CARD).toBe('CA');
    expect(ACCOUNT_TYPE_ORDER.length).toBe(3);
  });
});
