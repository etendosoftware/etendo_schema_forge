// ETP-5338 CRITICAL FIX — regression test.
//
// Root cause: `FmListPage` "stays mounted at all times" (see FiscalModelsPage.jsx) so
// `useFiscalAutoCompute` keeps polling, which means it is NEVER remounted — and therefore
// never refetches `decls` — when a user opens a declaration, presents it, and navigates back
// (via the new "Volver"/go-back button OR the pre-existing "Cancelar", both of which just call
// `onBack`). The status change IS correctly persisted server-side by
// `FiscalModelsPage`'s `onStatusChange` (`persistDeclarationStatus`), but nothing ever pushed
// that new status into THIS component's own `decls` state — it was fetched once on mount and
// never patched for a status change made in the detail page. So the row the user just
// presented kept showing its stale pre-submission status ("Borrador"/draft) the moment they
// landed back on the list — reported as "presenting a declaration and going back reverts it
// to draft". Nothing was actually reverted server-side; this list's own cache was stale.
//
// The fix: `FiscalModelsPage` now pushes a one-shot `{ id, patch }` down as `declStatusPatch`
// right after a successful `persistDeclarationStatus`, which `FmListPage` applies to its
// `decls` state the same way `handleConfirmReactivate` already patches it for a change made
// in-place in this same component (see FmListPage.jsx). Mirrors the mocking conventions of
// FmListPage.reactivate.vitest.jsx.

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
vi.mock('@/windows/custom/shared/CheckboxField.jsx', () => ({
  CheckboxField: ({ checked, onToggle }) =>
    React.createElement('input', { type: 'checkbox', checked: !!checked, onChange: e => onToggle?.(e.target.checked) }),
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

describe('FmListPage — declStatusPatch (ETP-5338)', () => {
  it('reflects a status change pushed from the detail page without a refetch', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: '303-2026-T2', status: 'draft' });
    const { rerender } = render(
      <FmListPage declarations={[decl]} declStatusPatch={null} {...baseProps} />
    );
    await waitForCatalogLoad();

    // Before any patch, the row shows the original (draft) status — sanity check that the
    // test is reading real rendered content, not a mock.
    expect(screen.getByText('fm.status.draft')).toBeInTheDocument();

    // Simulate FiscalModelsPage pushing the new status down after presenting the declaration
    // and successfully persisting it — this is the exact shape `onStatusChange` produces.
    rerender(
      <FmListPage
        declarations={[decl]}
        declStatusPatch={{ id: '303-2026-T2', patch: { status: 'submitted' } }}
        {...baseProps}
      />
    );

    // The list must now show the up-to-date status — this is what going "back" (Volver or
    // Cancelar) to this always-mounted list must land on, never the stale pre-submission one.
    await waitFor(() => expect(screen.getByText('fm.status.submitted')).toBeInTheDocument());
    expect(screen.queryByText('fm.status.draft')).not.toBeInTheDocument();
  });

  it('ignores a patch for a declaration id not present in the list (no crash)', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: '303-2026-T2', status: 'draft' });
    render(
      <FmListPage
        declarations={[decl]}
        declStatusPatch={{ id: 'does-not-exist', patch: { status: 'submitted' } }}
        {...baseProps}
      />
    );
    await waitForCatalogLoad();

    expect(screen.getByText('fm.status.draft')).toBeInTheDocument();
  });

  it('carries submissionMethod through the same patch when provided', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: '303-2026-T3', status: 'draft' });
    const { rerender } = render(
      <FmListPage declarations={[decl]} declStatusPatch={null} {...baseProps} />
    );
    await waitForCatalogLoad();

    rerender(
      <FmListPage
        declarations={[decl]}
        declStatusPatch={{
          id: '303-2026-T3',
          patch: { status: 'submitted_ack', submissionMethod: 'manual_ack' },
        }}
        {...baseProps}
      />
    );

    await waitFor(() => expect(screen.getByText('fm.present.method.manual_ack')).toBeInTheDocument());
  });
});
