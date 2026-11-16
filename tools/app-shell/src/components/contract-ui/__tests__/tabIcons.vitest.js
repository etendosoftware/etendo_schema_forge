// @covers tools/app-shell/src/components/contract-ui/tabIcons.js
// ETP-5889 — the Product "Movements" tab shows two arrows, like the financial account's Movements tab,
// instead of the generic list icon every tab without an entry falls back to.
import { ArrowLeftRight, List } from 'lucide-react';
import { resolveTabIcon } from '../tabIcons.js';

describe('resolveTabIcon', () => {
  it('gives the Product Movements tab the two-arrows icon', () => {
    expect(resolveTabIcon('custom:movements')).toBe(ArrowLeftRight);
  });

  it('still falls back to the generic list icon for a tab with no entry', () => {
    expect(resolveTabIcon('custom:does-not-exist')).toBe(List);
  });

  // ETP-5791 — a tab may carry its own icon (the CustomLines `tabIcon` static): it wins over the
  // key's icon and over the generic fallback; a tab without one resolves exactly as before.
  const OwnIcon = () => null;
  it.each([
    ['wins over the icon of a mapped key', 'custom:movements', OwnIcon, OwnIcon],
    ['absent (null, as DetailView passes it): the mapped key icon', 'custom:movements', null, ArrowLeftRight],
  ])('own icon %s', (_label, tabKey, icon, expected) => {
    expect(resolveTabIcon(tabKey, icon)).toBe(expected);
  });
});
