// Vitest coverage for ETP-4907's Roles-overview data-shaping helpers:
// row-keying by category+window (the duplicate "Contactos" edge case) and
// role display ordering. Pure-function tests, no rendering involved.
import { describe, it, expect } from 'vitest';
import { buildRowKey, flattenMatrixRows, sortByRoleOrder, ROLE_ORDER } from '../useRolesOverviewData.js';

describe('buildRowKey', () => {
  it('combines category and windowKey with a separator', () => {
    expect(buildRowKey('Commercial', 'rolesMatrixWindowContacts')).toBe(
      'Commercial::rolesMatrixWindowContacts'
    );
  });

  it('produces DIFFERENT keys for the same windowKey in two different categories', () => {
    const commercial = buildRowKey('Commercial', 'rolesMatrixWindowContacts');
    const inventory = buildRowKey('Inventory', 'rolesMatrixWindowContacts');
    expect(commercial).not.toBe(inventory);
  });
});

describe('flattenMatrixRows', () => {
  // Regression for the real duplicate-window-name edge case called out in the
  // ticket: "Contactos" appears in both `Commercial` and `Inventory` with a
  // DIFFERENT access tier per role. Keying by windowKey alone would collide
  // the two rows in any Map/lookup built from the flattened list.
  const matrix = [
    {
      category: 'Commercial',
      rows: [
        {
          windowKey: 'rolesMatrixWindowContacts',
          access: { admin: 'full', sales: 'full', purchasing: 'full', finance: 'full', inventory: 'readOnly' },
        },
      ],
    },
    {
      category: 'Inventory',
      rows: [
        {
          windowKey: 'rolesMatrixWindowContacts',
          access: { admin: 'full', sales: 'full', purchasing: 'full', finance: 'full', inventory: 'full' },
        },
      ],
    },
  ];

  it('flattens every category into a single row list, each with its own composite key', () => {
    const rows = flattenMatrixRows(matrix);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.key)).toEqual([
      'Commercial::rolesMatrixWindowContacts',
      'Inventory::rolesMatrixWindowContacts',
    ]);
  });

  it('keeps the two same-windowKey rows distinct with their own independent access data', () => {
    const rows = flattenMatrixRows(matrix);
    const byKey = new Map(rows.map((r) => [r.key, r]));
    expect(byKey.size).toBe(2); // no collision — both rows survive
    expect(byKey.get('Commercial::rolesMatrixWindowContacts').access.inventory).toBe('readOnly');
    expect(byKey.get('Inventory::rolesMatrixWindowContacts').access.inventory).toBe('full');
  });

  it('returns an empty array for an empty/missing matrix', () => {
    expect(flattenMatrixRows([])).toEqual([]);
    expect(flattenMatrixRows(undefined)).toEqual([]);
  });
});

describe('sortByRoleOrder', () => {
  it('reorders cards into the canonical Admin/Sales/Purchasing/Finance/Inventory order regardless of input order', () => {
    const cards = [
      { id: 'inventory', name: 'Inventory' },
      { id: 'finance', name: 'Finance' },
      { id: 'admin', name: 'GOClient Admin' },
      { id: 'purchasing', name: 'Purchasing' },
      { id: 'sales', name: 'Sales' },
    ];
    expect(sortByRoleOrder(cards).map((c) => c.id)).toEqual(ROLE_ORDER);
  });

  it('does not mutate the input array', () => {
    const cards = [{ id: 'sales' }, { id: 'admin' }];
    const original = [...cards];
    sortByRoleOrder(cards);
    expect(cards).toEqual(original);
  });

  it('pushes unknown role ids to the end, sorted alphabetically, instead of dropping them', () => {
    const cards = [{ id: 'zzz-custom' }, { id: 'admin' }, { id: 'aaa-custom' }];
    expect(sortByRoleOrder(cards).map((c) => c.id)).toEqual(['admin', 'aaa-custom', 'zzz-custom']);
  });
});
