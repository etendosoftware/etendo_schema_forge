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

// ETP-5071 — `useRolesOverviewData.js` now imports the real `../../menu.json` at module
// scope (`with { type: 'json' }`) to build `MENU_WINDOW_INDEX` once, used by `adaptMatrix`
// to re-resolve category/window names. Mocked with a small synthetic fixture (same
// convention as `CommandPalette.vitest.jsx`'s `vi.mock('../../menu.json', ...)`) rather
// than relying on real, currently-live windowIds — real `menu.json` can be edited for
// unrelated reasons and would silently break these assertions.
//
// Fixture groups, in DECLARATION order (= `groupOrder`): Sales(0), Zeta(1), Alpha(2),
// DupGroup(3), RowOrder(4) — Zeta/Alpha are deliberately out of alphabetical order so
// ordering tests below can tell "sorted by groupOrder" apart from "sorted alphabetically".
// RowOrder's own two items (Zebra Row=itemOrder 0, Alpha Row=itemOrder 1) are likewise
// deliberately out of alphabetical order, for the same reason at the ROW level
// (ETP-5071 follow-up — `itemOrder`/row sort within a category).
// `useRolesOverviewData.js` (at `src/pages/roles/`) imports '../../menu.json' (-> `src/menu.json`).
// From THIS test file (at `src/pages/roles/__tests__/`), that same file is 3 levels up.
vi.mock('../../../menu.json', () => ({
  default: {
    menu: [
      {
        group: 'Sales',
        items: [
          { name: 'sales-order', label: 'Sales Order', windowId: '201' },
          { name: 'sales-order-2', label: 'Sales Order 2', windowId: '202' },
        ],
      },
      {
        group: 'Zeta',
        items: [{ name: 'zeta-window', label: 'Zeta Window', windowId: '401' }],
      },
      {
        group: 'Alpha',
        items: [{ name: 'alpha-window', label: 'Alpha Window', windowId: '301' }],
      },
      {
        group: 'DupGroup',
        items: [
          // '501': visible entry listed FIRST, hidden listed second.
          { name: 'dup-a-visible', label: 'Visible A', windowId: '501', hidden: false },
          { name: 'dup-a-hidden', label: 'Hidden A', windowId: '501', hidden: true },
          // '502': hidden entry listed FIRST, visible listed second (reversed order).
          { name: 'dup-b-hidden', label: 'Hidden B', windowId: '502', hidden: true },
          { name: 'dup-b-visible', label: 'Visible B', windowId: '502', hidden: false },
        ],
      },
      {
        // ETP-5071 follow-up — row-within-category ordering fixture. '701' is declared
        // FIRST (itemOrder 0, label "Zebra Row"), '702' SECOND (itemOrder 1, label "Alpha
        // Row") — alphabetically by label this is BACKWARDS, so any test asserting
        // itemOrder-based row order here cannot be accidentally passing due to alphabetical
        // sorting instead.
        group: 'RowOrder',
        items: [
          { name: 'row-order-zebra', label: 'Zebra Row', windowId: '701' },
          { name: 'row-order-alpha', label: 'Alpha Row', windowId: '702' },
        ],
      },
    ],
  },
}));

import { fetchRolesOverview } from '@/lib/rolesApi.js';
import {
  buildRowKey,
  flattenMatrixRows,
  sortByRoleOrder,
  resolveRoleKind,
  normalizeTier,
  buildMenuWindowIndex,
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

describe('buildMenuWindowIndex', () => {
  it('resolves group/label/groupOrder/itemOrder for a windowId present in menu.json', () => {
    const index = buildMenuWindowIndex();
    // '201' is the FIRST item (index 0) inside the 'Sales' group's own `items[]` array.
    expect(index.get('201')).toEqual({ group: 'Sales', label: 'Sales Order', groupOrder: 0, itemOrder: 0, hidden: false });
  });

  it('prefers the non-hidden entry for a duplicate windowId when the VISIBLE one is listed first', () => {
    const index = buildMenuWindowIndex();
    expect(index.get('501')).toMatchObject({ group: 'DupGroup', label: 'Visible A', hidden: false });
  });

  it('prefers the non-hidden entry for a duplicate windowId when the VISIBLE one is listed second (hidden first)', () => {
    const index = buildMenuWindowIndex();
    expect(index.get('502')).toMatchObject({ group: 'DupGroup', label: 'Visible B', hidden: false });
  });

  it('omits a windowId that never appears in any menu.json group, rather than erroring', () => {
    const index = buildMenuWindowIndex();
    expect(index.has('does-not-exist-anywhere')).toBe(false);
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

  it('adapts windowCount: 0 and userCount: 0 through unchanged, not dropped/defaulted away', async () => {
    fetchRolesOverview.mockResolvedValue({
      roles: [{ id: 'r-empty', name: 'Purchasing', userCount: 0, windowCount: 0 }],
      matrix: { categories: [] },
    });
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    expect(getResult().cards[0].windowCount).toBe(0);
    expect(getResult().cards[0].userCount).toBe(0);
  });

  it('should not happen per the backend contract, but a matrix category with an empty windows array adapts to zero output categories rather than crashing', async () => {
    // ETP-5071 — `adaptMatrix` now flattens every window across ALL backend categories
    // first, then re-buckets by the RESOLVED category. An empty `windows[]` contributes
    // nothing to flatten, so there is no window left to resolve a category name from —
    // the category itself does not survive, unlike the pre-ETP-5071 behavior which kept
    // an empty `{category: 'Finance', rows: []}` placeholder.
    fetchRolesOverview.mockResolvedValue({
      roles: [{ id: 'r-admin', name: 'Admin', isClientAdmin: true }],
      matrix: { categories: [{ name: 'Finance', windows: [] }] },
    });
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    expect(getResult().error).toBeNull();
    expect(getResult().matrix).toEqual([]);
  });

  it('passes a role/window pair entirely missing from a malformed/partial access map through as absent (RolesAccessMatrix, not this adapter, defaults it to "none" at render time)', async () => {
    fetchRolesOverview.mockResolvedValue({
      roles: [
        { id: 'r-admin', name: 'Admin', isClientAdmin: true },
        { id: 'r-fin', name: 'Finance' },
      ],
      matrix: {
        categories: [
          {
            name: 'Commercial',
            // r-fin has no entry at all here (partial payload), unlike r-admin.
            windows: [{ id: 'w-1', name: 'Business Partner', access: { 'r-admin': 'full' } }],
          },
        ],
      },
    });
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    const row = getResult().matrix[0].rows[0];
    expect(row.access['r-admin']).toBe('full');
    expect(row.access['r-fin']).toBeUndefined();
  });
});

// ETP-5071 — `adaptMatrix(matrix, menuIndex)` is not exported (the file exports
// `buildMenuWindowIndex`/`normalizeTier`/`buildRowKey`/`flattenMatrixRows`/
// `sortByRoleOrder`/`resolveRoleKind`, but not this one) — tested only indirectly
// through `useRolesOverviewData()`'s public surface, same convention already used
// above for the plain adapter-shape assertions. Uses the mocked `menu.json` fixture
// declared at the top of this file (Sales/Zeta/Alpha/DupGroup, groupOrder 0..3).
describe('adaptMatrix (via useRolesOverviewData) — ETP-5071 menu.json resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('resolves category/name from menu.json when the windowId IS in the index, ignoring the backend\'s raw values', async () => {
    fetchRolesOverview.mockResolvedValue({
      roles: [],
      matrix: {
        categories: [
          { name: 'WrongBucketName', windows: [{ id: '201', name: 'Wrong Raw Name', access: {} }] },
        ],
      },
    });
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    expect(getResult().matrix).toEqual([
      { category: 'Sales', rows: [{ windowId: '201', windowName: 'Sales Order', access: {} }] },
    ]);
  });

  it('falls back to the backend\'s raw category/name when the windowId is NOT in menu.json — never dropped', async () => {
    fetchRolesOverview.mockResolvedValue({
      roles: [],
      matrix: {
        categories: [
          { name: 'LegacyBucket', windows: [{ id: 'unmapped-1', name: 'Legacy Window', access: {} }] },
        ],
      },
    });
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    expect(getResult().matrix).toEqual([
      { category: 'LegacyBucket', rows: [{ windowId: 'unmapped-1', windowName: 'Legacy Window', access: {} }] },
    ]);
  });

  it('merges two backend categories whose windows both resolve to the SAME menu.json group into one output category', async () => {
    fetchRolesOverview.mockResolvedValue({
      roles: [],
      matrix: {
        categories: [
          { name: 'BucketA', windows: [{ id: '201', name: 'raw A', access: {} }] },
          { name: 'BucketB', windows: [{ id: '202', name: 'raw B', access: {} }] },
        ],
      },
    });
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    const result = getResult();
    expect(result.matrix).toHaveLength(1);
    expect(result.matrix[0].category).toBe('Sales');
    expect(result.matrix[0].rows.map((r) => r.windowId).sort()).toEqual(['201', '202']);
  });

  it('orders categories by menu.json declaration order (groupOrder), not alphabetically', async () => {
    fetchRolesOverview.mockResolvedValue({
      roles: [],
      matrix: {
        // Fed in an order that would look "alphabetical" (Alpha, Sales, Zeta) if the
        // adapter sorted category names lexically — it must not.
        categories: [
          { name: 'whatever-alpha-bucket', windows: [{ id: '301', name: 'x', access: {} }] }, // -> Alpha (groupOrder 2)
          { name: 'whatever-sales-bucket', windows: [{ id: '201', name: 'x', access: {} }] }, // -> Sales (groupOrder 0)
          { name: 'whatever-zeta-bucket', windows: [{ id: '401', name: 'x', access: {} }] }, // -> Zeta (groupOrder 1)
        ],
      },
    });
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    expect(getResult().matrix.map((g) => g.category)).toEqual(['Sales', 'Zeta', 'Alpha']);
  });

  it('sorts categories with only fallback (unmapped) windows after every menu.json-ordered category, alphabetically among themselves', async () => {
    fetchRolesOverview.mockResolvedValue({
      roles: [],
      matrix: {
        categories: [
          { name: 'Zoo', windows: [{ id: 'zoo-1', name: 'z', access: {} }] },
          { name: 'Sales-ish', windows: [{ id: '201', name: 'x', access: {} }] }, // -> Sales (groupOrder 0)
          { name: 'Apple', windows: [{ id: 'apple-1', name: 'a', access: {} }] },
        ],
      },
    });
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    expect(getResult().matrix.map((g) => g.category)).toEqual(['Sales', 'Apple', 'Zoo']);
  });

  // ETP-5071 follow-up (commit 13fa3589f) — ROWS within a resolved category are sorted
  // by `itemOrder` (the window's index within its menu.json group's own `items[]`), not
  // by whatever order the backend fed them in. Uses the `RowOrder` fixture group: '701'
  // (itemOrder 0, "Zebra Row") declared BEFORE '702' (itemOrder 1, "Alpha Row") — the
  // labels are deliberately reverse-alphabetical so these tests can't accidentally pass
  // because itemOrder order happens to coincide with alphabetical order.
  it('sorts rows within a category by itemOrder (menu.json item-declaration order), not by the backend\'s feed order', async () => {
    fetchRolesOverview.mockResolvedValue({
      roles: [],
      matrix: {
        // Fed with '702' (itemOrder 1) BEFORE '701' (itemOrder 0) — the output must
        // still put '701' first.
        categories: [
          {
            name: 'RowOrder-ish',
            windows: [
              { id: '702', name: 'raw 702', access: {} },
              { id: '701', name: 'raw 701', access: {} },
            ],
          },
        ],
      },
    });
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    const group = getResult().matrix.find((g) => g.category === 'RowOrder');
    expect(group.rows.map((r) => r.windowId)).toEqual(['701', '702']);
  });

  it('proves the row sort is itemOrder-based, not alphabetical-by-name, via a case where the two disagree', async () => {
    fetchRolesOverview.mockResolvedValue({
      roles: [],
      matrix: {
        categories: [
          {
            name: 'RowOrder-ish',
            windows: [
              { id: '701', name: 'raw 701', access: {} }, // resolved label "Zebra Row", itemOrder 0
              { id: '702', name: 'raw 702', access: {} }, // resolved label "Alpha Row", itemOrder 1
            ],
          },
        ],
      },
    });
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    const group = getResult().matrix.find((g) => g.category === 'RowOrder');
    // Alphabetically this would be ["Alpha Row", "Zebra Row"] — itemOrder order wins.
    expect(group.rows.map((r) => r.windowName)).toEqual(['Zebra Row', 'Alpha Row']);
  });

  it('sorts a fallback row (windowId absent from menu.json, no itemOrder) after every ordered row in its category, alphabetically among other fallback rows', async () => {
    fetchRolesOverview.mockResolvedValue({
      roles: [],
      matrix: {
        categories: [
          {
            // Same resolved category ("RowOrder") as the ordered rows below, so the
            // fallback rows land in the SAME output group and their relative position
            // can be asserted directly.
            name: 'RowOrder',
            windows: [
              { id: 'unmapped-zeta-fallback', name: 'Zeta Fallback', access: {} },
              { id: '702', name: 'raw 702', access: {} }, // itemOrder 1
              { id: 'unmapped-beta-fallback', name: 'Beta Fallback', access: {} },
              { id: '701', name: 'raw 701', access: {} }, // itemOrder 0
            ],
          },
        ],
      },
    });
    const { getResult, waitFor } = await renderHook();
    await waitFor(() => expect(getResult().loading).toBe(false));
    const group = getResult().matrix.find((g) => g.category === 'RowOrder');
    // Ordered rows first (by itemOrder: 701 then 702), THEN fallback rows, sorted
    // alphabetically by windowName among themselves ("Beta..." before "Zeta...").
    expect(group.rows.map((r) => r.windowId)).toEqual([
      '701',
      '702',
      'unmapped-beta-fallback',
      'unmapped-zeta-fallback',
    ]);
  });
});
