// Vitest coverage for the ETP-4907 window x role access matrix: category
// grouping, per-role tri-state cells, and the duplicate-window-NAME edge case
// ("Business Partner"/Contactos in two categories, disambiguated by the
// backend's real per-window `id`, not by name).
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) =>
    ({ Commercial: 'Comercial', Inventory: 'Inventario', Sales: 'Ventas', 'Business Partner': 'Contactos' }[key] ?? key),
}));

vi.mock('@/lib/roleNameI18n.js', () => ({
  resolveRoleDisplayName: (ui, name) => name,
  ADMIN_NAME_I18N_KEY: 'roleNameAdmin',
}));

import { render, screen } from '@testing-library/react';
import RolesAccessMatrix from '../RolesAccessMatrix.jsx';
import { buildRowKey } from '../useRolesOverviewData.js';

const CARDS = [
  { id: 'admin', name: 'GOClient Admin', isClientAdmin: true },
  { id: 'inventory', name: 'Inventory' },
];

const MATRIX = [
  {
    category: 'Commercial',
    rows: [
      { windowId: 'w-bp-commercial', windowName: 'Business Partner', access: { admin: 'full', inventory: 'readOnly' } },
    ],
  },
  {
    category: 'Inventory',
    rows: [
      { windowId: 'w-bp-inventory', windowName: 'Business Partner', access: { admin: 'full', inventory: 'full' } },
    ],
  },
];

describe('RolesAccessMatrix', () => {
  it('renders one category header row per group, translated via useMenuLabel', () => {
    render(<RolesAccessMatrix cards={CARDS} matrix={MATRIX} />);
    expect(screen.getByTestId('RolesAccessMatrix__category-Commercial').textContent).toContain('Comercial');
    expect(screen.getByTestId('RolesAccessMatrix__category-Inventory').textContent).toContain('Inventario');
  });

  it('renders both same-window-NAME rows independently, keyed by category+windowId', () => {
    render(<RolesAccessMatrix cards={CARDS} matrix={MATRIX} />);
    const commercialRow = screen.getByTestId(`RolesAccessMatrix__row-${buildRowKey('Commercial', 'w-bp-commercial')}`);
    const inventoryRow = screen.getByTestId(`RolesAccessMatrix__row-${buildRowKey('Inventory', 'w-bp-inventory')}`);
    expect(commercialRow).toBeTruthy();
    expect(inventoryRow).toBeTruthy();
    expect(commercialRow).not.toBe(inventoryRow);
    // Both render the SAME translated window name — only their access differs.
    expect(commercialRow.textContent).toContain('Contactos');
    expect(inventoryRow.textContent).toContain('Contactos');
  });

  it('gives the two same-name rows their own independent tier per role', () => {
    render(<RolesAccessMatrix cards={CARDS} matrix={MATRIX} />);
    const commercialKey = buildRowKey('Commercial', 'w-bp-commercial');
    const inventoryKey = buildRowKey('Inventory', 'w-bp-inventory');

    expect(screen.getByTestId(`RolesAccessMatrix__cell-${commercialKey}-inventory`).textContent).toBe('accessTierReadOnly');
    expect(screen.getByTestId(`RolesAccessMatrix__cell-${inventoryKey}-inventory`).textContent).toBe('✓');
  });

  it('defaults a missing per-role access entry to "none" (dash)', () => {
    // Uses a category other than "General" — that name is reserved for the
    // hardcoded GENERAL_ROWS overlay below and would collide on
    // data-testid="RolesAccessMatrix__category-General" otherwise.
    const matrixWithGap = [
      { category: 'Finance', rows: [{ windowId: 'w-dash', windowName: 'Dashboard', access: { admin: 'full' } }] },
    ];
    render(<RolesAccessMatrix cards={CARDS} matrix={matrixWithGap} />);
    const key = buildRowKey('Finance', 'w-dash');
    expect(screen.getByTestId(`RolesAccessMatrix__cell-${key}-inventory`).textContent).toBe('—');
  });

  it('renders one column header per card, using the provided icon resolver (passed the whole role object)', () => {
    function Icon(props) { return <svg data-testid="icon" {...props} />; }
    const iconFor = vi.fn(() => Icon);
    render(<RolesAccessMatrix cards={CARDS} matrix={MATRIX} iconFor={iconFor} />);
    expect(screen.getByTestId('RolesAccessMatrix__headerIcon-admin')).toBeTruthy();
    expect(screen.getByTestId('RolesAccessMatrix__headerIcon-inventory')).toBeTruthy();
    expect(iconFor).toHaveBeenCalledWith(CARDS[0]);
  });

  describe('hardcoded General overlay (Inicio/Favoritos/Copilot)', () => {
    // These 3 rows are NOT real AD windows (confirmed against the sibling
    // feature/ETP-4906 branch's UserRolesTab.jsx GENERAL_ROWS precedent) and
    // will never arrive from the backend's matrix.categories — they are
    // always overlaid client-side, unconditionally, ahead of the real groups.
    it('always renders the General category, even with an empty real matrix', () => {
      render(<RolesAccessMatrix cards={CARDS} matrix={[]} />);
      expect(screen.getByTestId('RolesAccessMatrix__category-General')).toBeTruthy();
    });

    it('renders all 3 hardcoded rows using the shared ETP-4906 i18n keys', () => {
      render(<RolesAccessMatrix cards={CARDS} matrix={[]} />);
      expect(document.body.textContent).toContain('userRolesTabDashboardRow');
      expect(document.body.textContent).toContain('userRolesTabFavoritesRow');
      expect(document.body.textContent).toContain('userRolesTabCopilotRow');
    });

    it('gives every role column full ("✓") access on every General row, unconditionally', () => {
      render(<RolesAccessMatrix cards={CARDS} matrix={[]} />);
      for (const rowId of ['dashboard', 'favorites', 'copilot']) {
        const key = buildRowKey('General', rowId);
        expect(screen.getByTestId(`RolesAccessMatrix__cell-${key}-admin`).textContent).toBe('✓');
        expect(screen.getByTestId(`RolesAccessMatrix__cell-${key}-inventory`).textContent).toBe('✓');
      }
    });

    it('renders the General overlay before the real matrix.categories groups in document order', () => {
      render(<RolesAccessMatrix cards={CARDS} matrix={MATRIX} />);
      const rows = Array.from(document.querySelectorAll('[data-testid^="RolesAccessMatrix__category-"]'));
      expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
        'RolesAccessMatrix__category-General',
        'RolesAccessMatrix__category-Commercial',
        'RolesAccessMatrix__category-Inventory',
      ]);
    });
  });
});
