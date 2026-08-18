// Vitest coverage for the ETP-4907 window x role access matrix: category
// grouping, per-role tri-state cells, and the duplicate-"Contactos"-row edge
// case (same windowKey, two categories, independent access per row).
import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => ({ Commercial: 'Comercial', Inventory: 'Inventario', Sales: 'Ventas' }[key] ?? key),
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
      { windowKey: 'rolesMatrixWindowContacts', access: { admin: 'full', inventory: 'readOnly' } },
    ],
  },
  {
    category: 'Inventory',
    rows: [
      { windowKey: 'rolesMatrixWindowContacts', access: { admin: 'full', inventory: 'full' } },
    ],
  },
];

describe('RolesAccessMatrix', () => {
  it('renders one category header row per group, translated via useMenuLabel', () => {
    render(<RolesAccessMatrix cards={CARDS} matrix={MATRIX} />);
    expect(screen.getByTestId('RolesAccessMatrix__category-Commercial').textContent).toContain('Comercial');
    expect(screen.getByTestId('RolesAccessMatrix__category-Inventory').textContent).toContain('Inventario');
  });

  it('renders both same-windowKey rows independently, keyed by category+windowKey', () => {
    render(<RolesAccessMatrix cards={CARDS} matrix={MATRIX} />);
    const commercialRow = screen.getByTestId(
      `RolesAccessMatrix__row-${buildRowKey('Commercial', 'rolesMatrixWindowContacts')}`
    );
    const inventoryRow = screen.getByTestId(
      `RolesAccessMatrix__row-${buildRowKey('Inventory', 'rolesMatrixWindowContacts')}`
    );
    expect(commercialRow).toBeTruthy();
    expect(inventoryRow).toBeTruthy();
    expect(commercialRow).not.toBe(inventoryRow);
  });

  it('gives the two same-windowKey rows their own independent tier per role', () => {
    render(<RolesAccessMatrix cards={CARDS} matrix={MATRIX} />);
    const commercialKey = buildRowKey('Commercial', 'rolesMatrixWindowContacts');
    const inventoryKey = buildRowKey('Inventory', 'rolesMatrixWindowContacts');

    expect(screen.getByTestId(`RolesAccessMatrix__cell-${commercialKey}-inventory`).textContent).toBe('accessTierReadOnly');
    expect(screen.getByTestId(`RolesAccessMatrix__cell-${inventoryKey}-inventory`).textContent).toBe('✓');
  });

  it('defaults a missing per-role access entry to "none" (dash)', () => {
    const matrixWithGap = [
      { category: 'General', rows: [{ windowKey: 'rolesMatrixWindowDashboard', access: { admin: 'full' } }] },
    ];
    render(<RolesAccessMatrix cards={CARDS} matrix={matrixWithGap} />);
    const key = buildRowKey('General', 'rolesMatrixWindowDashboard');
    expect(screen.getByTestId(`RolesAccessMatrix__cell-${key}-inventory`).textContent).toBe('—');
  });

  it('renders one column header per card, using the provided icon resolver', () => {
    function Icon(props) { return <svg data-testid="icon" {...props} />; }
    render(<RolesAccessMatrix cards={CARDS} matrix={MATRIX} iconFor={() => Icon} />);
    expect(screen.getByTestId('RolesAccessMatrix__headerIcon-admin')).toBeTruthy();
    expect(screen.getByTestId('RolesAccessMatrix__headerIcon-inventory')).toBeTruthy();
  });
});
