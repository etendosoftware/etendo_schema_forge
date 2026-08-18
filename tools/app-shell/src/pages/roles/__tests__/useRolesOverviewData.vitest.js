// Vitest coverage for ETP-4907's Roles-overview data-shaping helpers and the
// `useRolesOverviewData()` hook itself. Follow-up update: the hook now wires
// the REAL `fetchRolesOverview()` (`lib/rolesApi.js`, ETP-4513) instead of an
// isolated mock — this file's fixtures use realistic-but-arbitrary numbers
// (NOT the earlier Figma reference screenshot's placeholder figures, which
// the backend developer confirmed do not match live GOClient data).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/rolesApi.js', () => ({
  fetchRolesOverview: vi.fn(),
}));

import { fetchRolesOverview } from '@/lib/rolesApi.js';
import {
  buildRowKey,
  flattenMatrixRows,
  sortByRoleOrder,
  resolveRoleKind,
  normalizeTier,
  ROLE_ORDER,
  useRolesOverviewData,
} from '../useRolesOverviewData.js';

describe('normalizeTier', () => {
  it('passes through "full" unchanged', () => {
    expect(normalizeTier('full')).toBe('full');
  });

  it('normalizes the backend\'s hyphenated "read-only" to camelCase "readOnly"', () => {
    expect(normalizeTier('read-only')).toBe('readOnly');
  });

  it('collapses "none", null, undefined, and any unrecognized string to "none"', () => {
    expect(normalizeTier('none')).toBe('none');
    expect(normalizeTier(null)).toBe('none');
    expect(normalizeTier(undefined)).toBe('none');
    expect(normalizeTier('readOnly')).toBe('none'); // the OLD camelCase spelling must NOT be accepted here
  });
});

describe('resolveRoleKind', () => {
  it('identifies admin via isClientAdmin, regardless of the literal (per-tenant) name', () => {
    expect(resolveRoleKind({ isClientAdmin: true, name: 'RolesPresa Admin' })).toBe('admin');
    expect(resolveRoleKind({ isClientAdmin: true, name: 'GOClient Admin' })).toBe('admin');
  });

  it('identifies the 4 fixed template roles by their literal English name', () => {
    expect(resolveRoleKind({ name: 'Finance' })).toBe('finance');
    expect(resolveRoleKind({ name: 'Sales' })).toBe('sales');
    expect(resolveRoleKind({ name: 'Purchasing' })).toBe('purchasing');
    expect(resolveRoleKind({ name: 'Inventory' })).toBe('inventory');
  });

  it('matches by name regardless of roleSource (tenant vs. systemTemplate)', () => {
    expect(resolveRoleKind({ name: 'Purchasing', roleSource: 'tenant' })).toBe('purchasing');
    expect(resolveRoleKind({ name: 'Purchasing', roleSource: 'systemTemplate' })).toBe('purchasing');
  });

  it('returns null for an unrecognized role instead of guessing', () => {
    expect(resolveRoleKind({ name: 'Some Custom Role' })).toBeNull();
    expect(resolveRoleKind({})).toBeNull();
  });
});

describe('buildRowKey', () => {
  it('combines category and windowId with a separator', () => {
    expect(buildRowKey('Commercial', 'w-123')).toBe('Commercial::w-123');
  });

  it('produces DIFFERENT keys for the same windowId in two different categories', () => {
    expect(buildRowKey('Commercial', 'w-1')).not.toBe(buildRowKey('Inventory', 'w-1'));
  });
});

describe('flattenMatrixRows', () => {
  // Regression for the duplicate-window-NAME edge case: "Contactos" (Business
  // Partner) appears in both `Commercial` and `Inventory`, as two SEPARATE
  // backend entries with their own real `windowId` and independent access.
  const matrix = [
    {
      category: 'Commercial',
      rows: [
        {
          windowId: 'w-bp-commercial',
          windowName: 'Business Partner',
          access: { admin: 'full', inventory: 'readOnly' },
        },
      ],
    },
    {
      category: 'Inventory',
      rows: [
        {
          windowId: 'w-bp-inventory',
          windowName: 'Business Partner',
          access: { admin: 'full', inventory: 'full' },
        },
      ],
    },
  ];

  it('flattens every category into a single row list, each with its own composite key', () => {
    const rows = flattenMatrixRows(matrix);
    expect(rows.map((r) => r.key)).toEqual([
      'Commercial::w-bp-commercial',
      'Inventory::w-bp-inventory',
    ]);
  });

  it('keeps the two same-name rows distinct with their own independent access data', () => {
    const byKey = new Map(flattenMatrixRows(matrix).map((r) => [r.key, r]));
    expect(byKey.size).toBe(2);
    expect(byKey.get('Commercial::w-bp-commercial').access.inventory).toBe('readOnly');
    expect(byKey.get('Inventory::w-bp-inventory').access.inventory).toBe('full');
  });

  it('returns an empty array for an empty/missing matrix', () => {
    expect(flattenMatrixRows([])).toEqual([]);
    expect(flattenMatrixRows(undefined)).toEqual([]);
  });
});

describe('sortByRoleOrder', () => {
  it('reorders cards into the canonical Admin/Sales/Purchasing/Finance/Inventory order regardless of input order or real role ids', () => {
    const cards = [
      { id: 'uuid-inventory', name: 'Inventory' },
      { id: 'uuid-finance', name: 'Finance' },
      { id: 'uuid-admin', name: 'GOClient Admin', isClientAdmin: true },
      { id: 'uuid-purchasing', name: 'Purchasing' },
      { id: 'uuid-sales', name: 'Sales' },
    ];
    expect(sortByRoleOrder(cards).map((c) => resolveRoleKind(c))).toEqual(ROLE_ORDER);
  });

  it('does not mutate the input array', () => {
    const cards = [{ id: 'a', name: 'Sales' }, { id: 'b', isClientAdmin: true, name: 'X' }];
    const original = [...cards];
    sortByRoleOrder(cards);
    expect(cards).toEqual(original);
  });

  it('pushes unrecognized roles to the end, sorted by id, instead of dropping them', () => {
    const cards = [{ id: 'zzz-custom', name: 'Custom' }, { id: 'a-admin', isClientAdmin: true, name: 'Admin' }, { id: 'aaa-custom', name: 'Other' }];
    expect(sortByRoleOrder(cards).map((c) => c.id)).toEqual(['a-admin', 'aaa-custom', 'zzz-custom']);
  });
});

describe('useRolesOverviewData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Minimal harness — this hook has no rendering of its own, so we drive it
  // via React's test renderer through a tiny probe component.
  async function renderHook() {
    const React = await import('react');
    const { render, waitFor } = await import('@testing-library/react');
    let result;
    function Probe() {
      result = useRolesOverviewData();
      return null;
    }
    render(React.createElement(Probe));
    return { getResult: () => result, waitFor };
  }

  it('adapts the real backend shape (roles[] + matrix.categories[]) into cards/matrix, sorted and tier-normalized', async () => {
    fetchRolesOverview.mockResolvedValue({
      roles: [
        { id: 'r-fin', name: 'Finance', userCount: 2, windowCount: 27 },
        { id: 'r-admin', name: 'GOClient Admin', isClientAdmin: true, userCount: 2, windowCount: 48 },
      ],
      matrix: {
        categories: [
          {
            name: 'Commercial',
            windows: [
              { id: 'w-1', name: 'Business Partner', access: { 'r-admin': 'full', 'r-fin': 'read-only' } },
            ],
          },
        ],
      },
    });

    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));

    const result = getResult();
    expect(result.error).toBeNull();
    expect(result.cards.map((c) => c.id)).toEqual(['r-admin', 'r-fin']); // admin sorts before finance
    expect(result.cards[1].windowCount).toBe(27);
    expect(result.matrix[0].category).toBe('Commercial');
    expect(result.matrix[0].rows[0].windowId).toBe('w-1');
    expect(result.matrix[0].rows[0].access['r-fin']).toBe('readOnly'); // hyphenated -> camelCase
    expect(result.matrix[0].rows[0].access['r-admin']).toBe('full');
  });

  it('surfaces a fetch rejection as `error`, not a crash', async () => {
    fetchRolesOverview.mockRejectedValue(new Error('network down'));
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    expect(getResult().error).toBe('network down');
  });

  it('treats a missing/empty roles or matrix as empty rather than crashing', async () => {
    fetchRolesOverview.mockResolvedValue({});
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    expect(getResult().cards).toEqual([]);
    expect(getResult().matrix).toEqual([]);
  });
});
