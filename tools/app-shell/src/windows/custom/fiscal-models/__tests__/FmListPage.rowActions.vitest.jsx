// Vitest tests for FmListPage.jsx's ETP-5187 row hover Edit/Delete wiring
// (FmRowActions.jsx): only rendered for draft-status rows, Edit selects the
// declaration the same way a row click would, and the delete confirmation
// flow calls the DELETE API, removes the row from the list on success, and
// handles a failed delete gracefully (row stays, error toast).

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  X: () => null,
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
import { deleteDeclaration } from '../fiscalModelsUtils.js';

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

const withCatalogProps = {
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

// ── Draft-only rendering ─────────────────────────────────────────────────────

describe('FmListPage — row actions rendered only for draft declarations', () => {
  it('renders FmRowActions only for the draft row among draft/submitted/pending', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decls = [
      makeDecl({ id: 'd-draft', status: 'draft' }),
      makeDecl({ id: 'd-submitted', status: 'submitted' }),
      makeDecl({ id: 'd-pending', status: 'pending' }),
    ];
    const { container } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const rows = Array.from(container.querySelectorAll('tbody tr'));
    expect(rows.length).toBe(3);
    const rowsWithActions = rows.filter(r => r.querySelector('.fm-row-actions'));
    expect(rowsWithActions.length).toBe(1);
    expect(rowsWithActions[0].textContent).toContain('T1');
  });

  it('renders no row actions at all when there are no draft declarations', async () => {
    globalThis.fetch = mockCatalogFetch();
    const decls = [
      makeDecl({ id: 'd-submitted', status: 'submitted' }),
      makeDecl({ id: 'd-pending', status: 'pending' }),
    ];
    const { container } = render(<FmListPage declarations={decls} {...withCatalogProps} />);
    await waitForCatalogLoad();
    expect(container.querySelectorAll('.fm-row-actions').length).toBe(0);
  });
});

// ── Edit action ──────────────────────────────────────────────────────────────

describe('FmListPage — row actions Edit', () => {
  it('clicking Edit calls onSelect with the declaration, exactly once', async () => {
    globalThis.fetch = mockCatalogFetch();
    const onSelect = vi.fn();
    const decl = makeDecl({ id: 'edit-me' });
    render(
      <FmListPage declarations={[decl]} {...withCatalogProps} onSelect={onSelect} />
    );
    await waitForCatalogLoad();
    fireEvent.click(screen.getByTestId('FmRowActions__edit'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'edit-me' }));
  });
});

// ── Delete action ────────────────────────────────────────────────────────────

describe('FmListPage — row actions Delete', () => {
  it('clicking Delete opens the confirm dialog without calling deleteDeclaration yet', async () => {
    globalThis.fetch = mockCatalogFetch();
    const onSelect = vi.fn();
    render(<FmListPage declarations={[makeDecl({ id: 'del-1' })]} {...withCatalogProps} onSelect={onSelect} />);
    await waitForCatalogLoad();

    fireEvent.click(screen.getByTestId('FmRowActions__delete'));

    expect(screen.getByTestId('batch-delete-confirm')).toBeInTheDocument();
    expect(deleteDeclaration).not.toHaveBeenCalled();
    // Opening the dialog must not also select/navigate into the row.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('confirming delete calls deleteDeclaration and removes the row from the list on success', async () => {
    globalThis.fetch = mockCatalogFetch();
    deleteDeclaration.mockResolvedValue({ ok: true });
    const { container } = render(
      <FmListPage declarations={[makeDecl({ id: 'del-2' })]} {...withCatalogProps} />
    );
    await waitForCatalogLoad();

    fireEvent.click(screen.getByTestId('FmRowActions__delete'));
    fireEvent.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(deleteDeclaration).toHaveBeenCalledWith('del-2', expect.objectContaining({ token: TOKEN })));
    await waitFor(() => expect(container.querySelectorAll('tbody tr').length).toBe(0));
    expect(screen.queryByTestId('batch-delete-confirm')).not.toBeInTheDocument();
  });

  it('handles a failed delete gracefully: row stays, an error toast fires, dialog can be re-tried', async () => {
    globalThis.fetch = mockCatalogFetch();
    deleteDeclaration.mockResolvedValue({ ok: false, error: 'http_500' });
    const { container } = render(
      <FmListPage declarations={[makeDecl({ id: 'del-3' })]} {...withCatalogProps} />
    );
    await waitForCatalogLoad();

    fireEvent.click(screen.getByTestId('FmRowActions__delete'));
    fireEvent.click(screen.getByTestId('batch-delete-confirm'));

    await waitFor(() => expect(deleteDeclaration).toHaveBeenCalledTimes(1));
    // Row is NOT removed on failure.
    await waitFor(() => expect(container.querySelectorAll('tbody tr').length).toBe(1));

    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.list.delete_failed'));
  });

  it('closing the confirm dialog without confirming never calls deleteDeclaration', async () => {
    globalThis.fetch = mockCatalogFetch();
    const { container } = render(
      <FmListPage declarations={[makeDecl({ id: 'del-4' })]} {...withCatalogProps} />
    );
    await waitForCatalogLoad();

    fireEvent.click(screen.getByTestId('FmRowActions__delete'));
    expect(screen.getByTestId('batch-delete-confirm')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('Button__batch-delete-cancel'));

    expect(deleteDeclaration).not.toHaveBeenCalled();
    expect(container.querySelectorAll('tbody tr').length).toBe(1);
  });
});
