// ETP-5338 Bug A fix — regression test.
//
// Root cause: `FmModel303Page` used to autosave `identChecks`/`manualOverrides` via a debounced
// background PUT, and NOTHING ever pushed that saved value into `FmListPage`'s own cached
// `decls` — reopening the same declaration from the list (without a full page reload) handed the
// stale pre-edit `manualData` right back into a freshly-mounted detail page, which re-hydrates
// its local state from it. Under the ETP-5338 redesign (identChecks/manualOverrides are pure
// local state until an explicit Guardar/Calcular click), `FiscalModelsPage` now pushes a one-shot
// `{ id, patch: { manualData } }` down as `declManualDataPatch` right after a successful
// `onManualDataSaved` call, which `FmListPage` applies to its `decls` state the same way it
// already does for `declStatusPatch` (see FmListPage.declStatusPatch.vitest.jsx, the sibling test
// for the pre-existing status-patch mechanism this mirrors).
//
// The patched `manualData` is not rendered as its own visible column, so this test observes the
// patch indirectly through `onSelect`: clicking the row hands the FULL cached `decl` object back
// to the caller, so the patched `manualData` on it proves the underlying `decls` state was
// actually updated (not just accepted as a prop and ignored).
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { registerApiSession, resetApiSessionForTests } from '@/auth/api.js';

vi.mock('@etendosoftware/app-shell-core', () => ({
  useUI: () => (key) => key,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
vi.mock('../fiscal-models.css', () => ({}));
vi.mock('../useFiscalAutoCompute.js', () => ({
  default: vi.fn(() => ({ computedMap: {} })),
}));
vi.mock('../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    checkModified303: vi.fn(),
    checkModified349: vi.fn(),
    compute349Operators: vi.fn(),
    deleteDeclaration: vi.fn(),
    persistDeclarationStatus: vi.fn(),
  };
});
vi.mock('../FmOverlays.jsx', () => ({
  NewDeclModal: () => null,
}));
vi.mock('../FmCatalogPage.jsx', () => ({
  default: () => null,
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) =>
    React.createElement('input', { type: 'checkbox', checked: !!checked, onChange: onChange ?? (() => {}) }),
}));
vi.mock('lucide-react', () => ({
  LayoutGrid: () => null, Settings: () => null, ListFilter: () => null,
  ArrowUpDown: () => null, ChevronDown: () => null, MoreHorizontal: () => null,
  MoreVertical: () => null, Calendar: () => null, Clock: () => null,
  TriangleAlert: () => null, OctagonAlert: () => null, ArrowUpRight: () => null,
  Search: () => null, Play: () => null, Check: () => null,
  Pencil: () => null, Trash2: () => null, Loader2: () => null,
  RotateCcw: () => null, X: () => null,
}));
vi.mock('../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  ResultPill: () => null,
  EmptyState: ({ title, message }) =>
    React.createElement('div', { className: 'fm-empty-state' }, title || message || 'empty'),
  KpiWidget: ({ value, label }) =>
    React.createElement('div', { className: 'test-kpi', 'data-kpi-label': label }, value),
}));

import FmListPage from '../FmListPage.jsx';

const makeDecl = (overrides = {}) => ({
  id: `decl-${Math.random()}`,
  model: '303',
  year: 2026,
  period: 'T1',
  type: 'ord',
  status: 'draft',
  nif: 'B12345678',
  result: null,
  incidents: { blocking: 0, warning: 0 },
  updatedAt: '2026-01-20',
  ...overrides,
});

const TOKEN = 'test-token';
const API_BASE_URL = '/api/window';

const baseProps = {
  onSelect: vi.fn(),
  onStatusChange: vi.fn(),
  onComputeUpdate: vi.fn(),
  token: TOKEN,
  apiBaseUrl: API_BASE_URL,
};

function mockCatalogFetch(activeModels = { '303': true, '349': true }) {
  return vi.fn((url) => {
    if (String(url).includes('fiscal-models-catalog')) {
      return Promise.resolve({ ok: true, json: async () => activeModels });
    }
    return Promise.reject(new Error(`unmocked fetch: ${url}`));
  });
}

async function waitForCatalogLoad() {
  await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(() => Promise.reject(new Error('fetch not mocked for this test')));
  registerApiSession({ getToken: () => TOKEN });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetApiSessionForTests();
});

describe('FmListPage — declManualDataPatch (ETP-5338 Bug A fix)', () => {
  it('reflects a manualData save pushed from the detail page without a refetch', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: '303-2026-T2', status: 'draft', manualData: null });
    const onSelect = vi.fn();
    const { rerender } = render(
      <FmListPage declarations={[decl]} declManualDataPatch={null} {...baseProps} onSelect={onSelect} />
    );
    await waitForCatalogLoad();

    // Before any patch, selecting the row hands back the original (un-patched) manualData.
    fireEvent.click(document.querySelector('tbody tr'));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ manualData: null }));

    // Simulate FiscalModelsPage pushing the newly-saved manualData down — this is the exact
    // shape `onManualDataSaved` produces (see FiscalModelsPage.jsx).
    const savedManualData = { identification: { nif: 'NEW-NIF' }, manualOverrides: { 46: 300 } };
    rerender(
      <FmListPage
        declarations={[decl]}
        declManualDataPatch={{ id: '303-2026-T2', patch: { manualData: savedManualData } }}
        {...baseProps}
        onSelect={onSelect}
      />
    );

    // Selecting the row again must now hand back the PATCHED manualData — this is what reopening
    // the declaration from this always-mounted list must see, never the stale pre-save value.
    await waitFor(() => {
      fireEvent.click(document.querySelector('tbody tr'));
      expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ manualData: savedManualData }));
    });
  });

  it('ignores a patch for a declaration id not present in the list (no crash)', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: '303-2026-T2', status: 'draft', manualData: null });
    const onSelect = vi.fn();
    render(
      <FmListPage
        declarations={[decl]}
        declManualDataPatch={{ id: 'does-not-exist', patch: { manualData: { identification: { nif: 'X' } } } }}
        {...baseProps}
        onSelect={onSelect}
      />
    );
    await waitForCatalogLoad();

    fireEvent.click(document.querySelector('tbody tr'));
    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ manualData: null }));
  });
});
