// ETP-5456 — a successful "Calcular" or "Guardar" must invalidate the sessionStorage cache
// `FmListPage`'s `useFiscalAutoCompute` populated for this declaration (via
// `invalidateFiscalComputeCache(decl.id)`). Root cause this closes: `checkModified303` (the
// list's staleness check) only ever compares invoice-change timestamps — it has no way to detect
// that the BACKEND's calculation logic itself changed (e.g. this ticket's row-per-side rewrite).
// Without the invalidation, reopening the declaration from the list after a live recompute/save
// could still serve the stale cached payload computed under the OLD backend logic.
//
// `handleComputeClick` (Calcular) and `handleSave` (Guardar) both call
// `invalidateFiscalComputeCache(decl.id)` — see FmModel303Page.jsx — but only AFTER their own
// operation actually succeeds; a failed compute/save must leave any existing cache entry alone.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { toast } from 'sonner';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));

const computeBoxes303 = vi.fn();
const invalidateFiscalComputeCache = vi.fn();

vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    formatPeriod: (p) => p,
    computeBoxes303: (...args) => computeBoxes303(...args),
    generate303File: vi.fn().mockResolvedValue({ ok: false }),
    checkModified303: vi.fn(),
    fetchDeclarationIncidents: vi.fn().mockResolvedValue(null),
  };
});
// The one module under test here: real `getCachedFiscalCompute`/`invalidateFiscalComputeCache`
// implementations are swapped for spies so each test can assert the call (and its argument)
// directly, instead of poking at sessionStorage.
vi.mock('../../../useFiscalAutoCompute.js', () => ({
  invalidateFiscalComputeCache: (...args) => invalidateFiscalComputeCache(...args),
  getCachedFiscalCompute: () => null,
}));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  ResultPill: () => null,
  SummaryCard: () => null,
  Tabs: () => null,
  Banner: () => null,
  SectionCard: () => null,
  EmptyState: () => null,
  KpiWidget: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null, IncidentsTab: () => null, HistoryTab: () => null,
}));
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ onIdentChange }) => React.createElement('input', {
    'data-testid': 'ident-nif',
    onChange: (e) => onIdentChange('nif', e.target.value),
  }),
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  FileGenModal303: () => null,
}));
vi.mock('../AeatSubmitFlow.jsx', () => ({
  default: () => null,
  isMissingDefaultIaeActivity: () => false,
}));
vi.mock('lucide-react', () => ({
  Settings: () => null, Download: () => null, ArrowLeft: () => null, Save: () => null,
  OctagonAlert: () => null, TriangleAlert: () => null, CircleCheck: () => null,
  ArrowLeftRight: () => null, Calculator: () => null, Loader2: () => null,
  MoreVertical: () => null, TrendingUp: () => null, TrendingDown: () => null, Clock: () => null,
  ClipboardCheck: () => null, ReceiptText: () => null, Folder: () => null,
  FileCheck: () => null, Landmark: () => null,
}));

import FmModel303Page from '../FmModel303Page.jsx';
import { jsonResponse } from '@/test/realApiFetch.js';

// `_precomputed` set so the mount-time auto-compute effect does not itself call
// `computeBoxes303`/touch the cache — only the explicit Calcular/Guardar clicks under test do.
const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: { boxes: [], summary: {}, sources: [] },
  boxes: null, sources: [], history: [],
  manualData: { identification: { tipo_declaracion: 'N' } },
};

const TOKEN = 'test-token';
const API_BASE_URL = '/sws/neo/fiscal-models';

function installImmediateServer() {
  globalThis.fetch = vi.fn((_url, options = {}) => Promise.resolve(
    String(options.method || 'GET').toUpperCase() === 'PUT'
      ? jsonResponse({ manualDataApplied: true })
      : jsonResponse({ response: { data: [] } }),
  ));
}

function installFailingPutServer() {
  globalThis.fetch = vi.fn((_url, options = {}) => {
    if (String(options.method || 'GET').toUpperCase() === 'PUT') {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    return Promise.resolve(jsonResponse({ response: { data: [] } }));
  });
}

function editNif(value) {
  fireEvent.change(screen.getByTestId('ident-nif'), { target: { value } });
}

function clickSave() {
  fireEvent.click(screen.getByTestId('FmModel303Page__save'));
}

async function clickCalcular() {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.includes('fm.action.compute'));
  await act(async () => {
    fireEvent.click(btn);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  computeBoxes303.mockResolvedValue({
    boxes: [{ num: 27, value: 100 }],
    summary: { accrued: 100, deductible: 0, result: 100 },
    sources: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FmModel303Page — cache invalidation on Guardar/Calcular (ETP-5456)', () => {
  it('Guardar invalidates the fiscal-compute cache for this declaration on a successful save', async () => {
    installImmediateServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    editNif('EDIT-FOR-SAVE');
    expect(invalidateFiscalComputeCache).not.toHaveBeenCalled();

    await act(async () => { clickSave(); await Promise.resolve(); await Promise.resolve(); });

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(invalidateFiscalComputeCache).toHaveBeenCalledTimes(1);
    expect(invalidateFiscalComputeCache).toHaveBeenCalledWith(BASE_DECL.id);
  });

  it('Guardar does NOT invalidate the cache when the save fails', async () => {
    installFailingPutServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    editNif('EDIT-THAT-FAILS');
    await act(async () => {
      clickSave();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(invalidateFiscalComputeCache).not.toHaveBeenCalled();
  });

  it('Calcular invalidates the fiscal-compute cache after a successful recompute', async () => {
    installImmediateServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    expect(invalidateFiscalComputeCache).not.toHaveBeenCalled();

    await clickCalcular();

    expect(computeBoxes303).toHaveBeenCalledTimes(1);
    expect(invalidateFiscalComputeCache).toHaveBeenCalledTimes(1);
    expect(invalidateFiscalComputeCache).toHaveBeenCalledWith(BASE_DECL.id);
  });
});
