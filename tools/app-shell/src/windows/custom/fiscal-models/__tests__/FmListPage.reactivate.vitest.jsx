// Vitest tests for FmListPage.jsx's ETP-5338 row hover "Reactivar declaración"
// wiring: the canReactivate(decl) gate (status + submissionMethod truth table),
// the confirm-dialog flow (open → confirm → PUT status:'draft' only → row
// patched to draft on success), and the failure path (error toast, row
// unchanged). Mirrors FmListPage.rowActions.vitest.jsx's ETP-5187 Delete
// coverage but for the reactivate action.

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
import { persistDeclarationStatus } from '../fiscalModelsUtils.js';

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

// ── canReactivate gating truth table ────────────────────────────────────────

describe('FmListPage — canReactivate gating (Reactivar button visibility)', () => {
  const cases = [
    { desc: 'draft (no submissionMethod)', status: 'draft', submissionMethod: undefined, expectButton: false },
    { desc: 'submitted (no submissionMethod)', status: 'submitted', submissionMethod: undefined, expectButton: true },
    { desc: 'submitted_ack (no submissionMethod)', status: 'submitted_ack', submissionMethod: undefined, expectButton: true },
    { desc: 'submitted_ext (no submissionMethod)', status: 'submitted_ext', submissionMethod: undefined, expectButton: false },
    { desc: 'submitted + aeat_telematic', status: 'submitted', submissionMethod: 'aeat_telematic', expectButton: false },
    { desc: 'submitted_ack + aeat_telematic', status: 'submitted_ack', submissionMethod: 'aeat_telematic', expectButton: false },
    { desc: 'submitted + manual_ack', status: 'submitted', submissionMethod: 'manual_ack', expectButton: true },
    { desc: 'submitted + manual_no_receipt', status: 'submitted', submissionMethod: 'manual_no_receipt', expectButton: true },
  ];

  it.each(cases)('$desc → reactivate button %s', async ({ status, submissionMethod, expectButton }) => {
    globalThis.fetch = mockCatalogFetch();
    const decl = makeDecl({ id: 'gate-decl', status, submissionMethod });
    render(<FmListPage declarations={[decl]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    const button = screen.queryByTestId('FmRowActions__reactivate');
    if (expectButton) {
      expect(button).toBeInTheDocument();
    } else {
      expect(button).not.toBeInTheDocument();
    }
  });
});

// ── Confirm-dialog flow ──────────────────────────────────────────────────────

describe('FmListPage — Reactivar confirm dialog flow', () => {
  it('clicking Reactivar opens the confirm dialog without calling persistDeclarationStatus yet', async () => {
    globalThis.fetch = mockCatalogFetch();
    render(<FmListPage declarations={[makeDecl({ id: 'react-1', status: 'submitted' })]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    fireEvent.click(screen.getByTestId('FmRowActions__reactivate'));

    expect(screen.getByTestId('fm-reactivate-confirm')).toBeInTheDocument();
    expect(persistDeclarationStatus).not.toHaveBeenCalled();
  });

  it('confirming calls persistDeclarationStatus with status:"draft" only (no submissionMethod) and patches the row on success', async () => {
    globalThis.fetch = mockCatalogFetch();
    persistDeclarationStatus.mockResolvedValue({ ok: true });
    render(<FmListPage declarations={[makeDecl({ id: 'react-2', status: 'submitted_ack' })]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    fireEvent.click(screen.getByTestId('FmRowActions__reactivate'));
    fireEvent.click(screen.getByTestId('fm-reactivate-confirm'));

    await waitFor(() => expect(persistDeclarationStatus).toHaveBeenCalledWith(
      'react-2',
      'draft',
      expect.objectContaining({ token: TOKEN }),
    ));
    // Only { status: 'draft' } is sent — no submissionMethod in the payload.
    const callArgs = persistDeclarationStatus.mock.calls[0];
    expect(callArgs[1]).toBe('draft');
    expect(callArgs[2]).not.toHaveProperty('submissionMethod');

    // Dialog closes and the reactivate button disappears (row is now draft →
    // no longer eligible for the reactivate action).
    await waitFor(() => expect(screen.queryByTestId('fm-reactivate-confirm')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId('FmRowActions__reactivate')).not.toBeInTheDocument());
  });

  it('handles a failed reactivate gracefully: row status unchanged, error toast fires', async () => {
    globalThis.fetch = mockCatalogFetch();
    persistDeclarationStatus.mockResolvedValue({ ok: false, error: 'http_409' });
    render(<FmListPage declarations={[makeDecl({ id: 'react-3', status: 'submitted' })]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    fireEvent.click(screen.getByTestId('FmRowActions__reactivate'));
    fireEvent.click(screen.getByTestId('fm-reactivate-confirm'));

    await waitFor(() => expect(persistDeclarationStatus).toHaveBeenCalledTimes(1));

    const { toast } = await import('sonner');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.list.reactivate_failed'));

    // The row keeps showing the reactivate action — status was NOT patched to draft.
    expect(screen.getByTestId('FmRowActions__reactivate')).toBeInTheDocument();
  });

  it('closing the confirm dialog without confirming never calls persistDeclarationStatus', async () => {
    globalThis.fetch = mockCatalogFetch();
    render(<FmListPage declarations={[makeDecl({ id: 'react-4', status: 'submitted' })]} {...withCatalogProps} />);
    await waitForCatalogLoad();

    fireEvent.click(screen.getByTestId('FmRowActions__reactivate'));
    expect(screen.getByTestId('fm-reactivate-confirm')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('Button__fm-reactivate-cancel'));

    expect(persistDeclarationStatus).not.toHaveBeenCalled();
    expect(screen.getByTestId('FmRowActions__reactivate')).toBeInTheDocument();
  });
});
