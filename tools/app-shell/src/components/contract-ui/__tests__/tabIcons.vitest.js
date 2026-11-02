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
});
