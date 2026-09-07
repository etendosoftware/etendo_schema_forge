import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/rolesApi.js', () => ({
  fetchRolesOverview: vi.fn(),
}));

import { buildMenuWindowIndex } from '../useRolesOverviewData.js';

/**
 * ETP-5116 — regression guard for the `fiscal-config` menu.json entry's `windowId`.
 *
 * Unlike `useRolesOverviewData.vitest.js` (which mocks `menu.json` with a synthetic
 * fixture to test `buildMenuWindowIndex`'s resolution RULES in isolation), this file
 * does NOT mock `menu.json` — it runs against the REAL file to lock in the actual
 * DATA. The roles-overview matrix's category/name override for a given window (see
 * `resolveMatrixRow` in `useRolesOverviewData.js`) only fires when the backend
 * window's raw `id` is present as a `windowId` on some menu.json item. `fiscal-monitor`
 * already proved this mechanism live (its matrix row shows as "Fiscal Monitor"/Finance
 * instead of the raw "SII Monitor" AD_Window name/category). `fiscal-config` was
 * missing its `windowId` entirely, so its 3 real underlying windows (SII
 * Configuration, Configuración TBAI, Configuración Verifactu) each surfaced as their
 * OWN separate matrix rows under their native "Gestión Financiera"/Finance category
 * instead of collapsing into one "Fiscal Configuration"/Settings row — confirmed via
 * a live screenshot during QA.
 *
 * If `fiscal-config`'s `windowId` is ever removed from menu.json (e.g. during an
 * unrelated menu reshuffle), this test fails loudly instead of silently regressing.
 * `rolesApi.js` is mocked purely to satisfy `useRolesOverviewData.js`'s top-level
 * import chain — this test never calls `fetchRolesOverview`.
 */
describe('ETP-5116 — fiscal-config menu.json windowId (roles matrix override)', () => {
  it('indexes fiscal-monitor by its real windowId, resolving to Finance/"Fiscal Monitor" (pre-existing, proven mechanism)', () => {
    const index = buildMenuWindowIndex();
    const entry = index.get('FEF76C3E0F104F06A89AAD15A4A4A35C');
    expect(entry, 'fiscal-monitor windowId must still be indexed').toBeTruthy();
    expect(entry.group).toBe('Finance');
    expect(entry.label).toBe('Fiscal Monitor');
  });

  it('indexes fiscal-config by its real windowId (SII Configuration), resolving to Settings/"Fiscal Configuration"', () => {
    const index = buildMenuWindowIndex();
    const entry = index.get('C1D3A2A017AC4B82B9FEE6F4D2A0C55A');
    expect(
      entry,
      'fiscal-config windowId must be indexed — without it, the 3 fiscal-config windows leak into the matrix as separate rows under their native Finance category'
    ).toBeTruthy();
    expect(entry.group).toBe('Settings');
    expect(entry.label).toBe('Fiscal Configuration');
  });
});
