// Vitest tests for FmListPage.jsx's ETP-5272 `handleNewDecl` error handling.
// Before this fix, a failed POST /fiscal303/declarations (a 409 when a draft
// already exists for the period, or any other backend failure) was silently
// swallowed — the modal just closed with no created row and no explanation.
// Mirrors the exact toast pattern already covered for delete failures in
// FmListPage.rowActions.vitest.jsx.

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
  };
});
// Exposes an onConfirm trigger so tests can simulate the modal's "Crear" flow
// without depending on NewDeclModal's own UI — mirrors the FmCatalogPage mock
// pattern used across the sibling FmListPage test files.
vi.mock('../FmOverlays.jsx', () => ({
  NewDeclModal: ({ onConfirm }) =>
    React.createElement(
      'button',
      {
        'data-testid': 'new-decl-confirm',
        onClick: () => onConfirm({ model: '303', year: 2026, period: 'T1', status: 'draft' }),
      },
      'confirm-new-decl',
    ),
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
  Pencil: () => null, Trash2: () => null, Loader2: () => null, X: () => null,
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

const TOKEN = 'test-token';
const API_BASE_URL = '/api/window';

const withCatalogProps = {
  onSelect: vi.fn(),
  onStatusChange: vi.fn(),
  onComputeUpdate: vi.fn(),
  token: TOKEN,
  apiBaseUrl: API_BASE_URL,
};

function mockFetch({ postStatus = 201, postBody = { data: { id: 'new-1', model: '303', year: 2026, period: 'T1', status: 'draft' } } } = {}) {
  return vi.fn((url, opts = {}) => {
    const u = String(url);
    if (u.includes('fiscal-models-catalog')) {
      return Promise.resolve({ ok: true, json: async () => ({ '303': true, '349': true }) });
    }
    if (u.includes('fiscal303/declarations') && opts.method === 'POST') {
      const ok = postStatus >= 200 && postStatus < 300;
      return Promise.resolve({ ok, status: postStatus, json: async () => postBody });
    }
    return Promise.reject(new Error(`unmocked fetch: ${u}`));
  });
}

async function waitForCatalogLoad() {
  await waitFor(() => expect(screen.queryByText('loading')).not.toBeInTheDocument());
}

function openNewDeclModal() {
  fireEvent.click(screen.getByText('+ Nueva declaración'));
}

beforeEach(() => {
  vi.clearAllMocks();
  registerApiSession({ getToken: () => TOKEN });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetApiSessionForTests();
});

describe('FmListPage — handleNewDecl surfaces backend errors (ETP-5272)', () => {
  it('shows an error toast and does not add a row when the backend rejects with 409 (duplicate draft)', async () => {
    globalThis.fetch = mockFetch({ postStatus: 409 });
    const { container } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    openNewDeclModal();
    fireEvent.click(screen.getByTestId('new-decl-confirm'));

    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.list.new_decl_failed'));
    expect(container.querySelectorAll('tbody tr').length).toBe(0);
  });

  it('shows an error toast for a generic 500 failure too, not just 409', async () => {
    globalThis.fetch = mockFetch({ postStatus: 500 });
    render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    openNewDeclModal();
    fireEvent.click(screen.getByTestId('new-decl-confirm'));

    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.list.new_decl_failed'));
  });

  it('does not toast and adds the created row when the backend succeeds', async () => {
    globalThis.fetch = mockFetch({ postStatus: 201 });
    const { container } = render(<FmListPage declarations={[]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    openNewDeclModal();
    fireEvent.click(screen.getByTestId('new-decl-confirm'));

    await waitFor(() => expect(container.querySelectorAll('tbody tr').length).toBe(1));
    const { toast } = await import('sonner');
    expect(toast.error).not.toHaveBeenCalled();
  });
});
