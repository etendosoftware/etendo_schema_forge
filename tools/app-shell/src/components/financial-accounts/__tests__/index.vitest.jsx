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
    expect(featureExports.AccountsTable).toBeDefined();
  });

  it('re-exports the ACCOUNT_TYPE map and ordering', () => {
    expect(featureExports.ACCOUNT_TYPE).toEqual({ BANK: 'B', CASH: 'C', CARD: 'CA' });
    expect(featureExports.ACCOUNT_TYPE_ORDER).toEqual(['B', 'C', 'CA']);
  });
});

describe('financial-accounts tokens', () => {
  it('exposes the Figma color palette', () => {
    expect(COLORS.textPrimary).toBe('#121217');
    expect(COLORS.bgGray50).toBe('#f5f7f9');
    expect(COLORS.brand).toBe('#ffd500');
  });

  it('exposes the radii and shadow tokens', () => {
    expect(RADII).toEqual({ none: 0, md: 8, pill: 360 });
    expect(SHADOWS.xs).toBe('0 1px 2px rgba(18, 18, 23, 0.05)');
  });

  it('exposes the account-type constants', () => {
    expect(ACCOUNT_TYPE.BANK).toBe('B');
    expect(ACCOUNT_TYPE.CASH).toBe('C');
    expect(ACCOUNT_TYPE.CARD).toBe('CA');
    expect(ACCOUNT_TYPE_ORDER.length).toBe(3);
  });
});
