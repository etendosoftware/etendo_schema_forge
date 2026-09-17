// ETP-5338 — "Calcular" is an explicit user click too, so it ALSO flushes any pending
// identChecks/manualOverrides edit, via the exact same `persistEditableFields` helper "Guardar"
// uses, alongside its existing recompute (`handleCompute`). See `handleComputeClick`'s own
// comment in FmModel303Page.jsx for the full rationale.
//
// Two independent things happen on a Calcular click, and this file checks each in isolation and
// together:
//   1. The recompute — `handleCompute` — always runs, unaffected by how long (or whether) the
//      save succeeds.
//   2. The save — `persistEditableFields` — flushes any pending edit, but reports ONLY failure
//      via `toast.error`. Unlike "Guardar", it never shows a success toast: the user's feedback
//      for "Calcular" is the refreshed KPIs/boxes, not a second, redundant "guardado" message.
//
// `persistManualData` is kept REAL and `globalThis.fetch` doubled underneath it, matching the
// convention of the sibling Guardar test files.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { toast } from 'sonner';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));

const computeBoxes303 = vi.fn();

// `persistManualData` deliberately NOT stubbed — see file header. `computeBoxes303` IS a mock
// here (not the real implementation) so each test controls exactly what the recompute observes.
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
  KpiWidget: ({ value, label }) => React.createElement(
    'div',
    { className: 'test-kpi303' },
    React.createElement('span', { className: 'test-kpi303-label' }, label),
    React.createElement('span', { className: 'test-kpi303-value' }, value),
  ),
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

// `boxes: []`/`summary: {}` — not `_precomputed` — so the mount effect's own auto-compute never
// fires (this file only cares about the CALCULAR-triggered compute). Setting `_precomputed` (or
// leaving it `null` with a token/apiBaseUrl configured) would make the mount effect call
// `computeBoxes303` too, corrupting the "exactly one recompute call, from the click" assertions.
const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: { boxes: [], summary: {}, sources: [] },
  boxes: null, sources: [], history: [],
  manualData: { identification: { tipo_declaracion: 'N' } },
};

const TOKEN = 'test-token';
const API_BASE_URL = '/sws/neo/fiscal-models';

function putCalls() {
  return globalThis.fetch.mock.calls.filter(
    ([, options]) => String(options?.method || '').toUpperCase() === 'PUT',
  );
}

function nifOf(call) {
  return JSON.parse(call[1].body).manualData.identification.nif;
}

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

describe('FmModel303Page — Calcular also persists pending edits (ETP-5338)', () => {
  it('flushes a pending manualData edit alongside the recompute, with NO success toast', async () => {
    installImmediateServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    editNif('CALCULAR-EDIT');
    expect(putCalls()).toHaveLength(0);

    await clickCalcular();

    // The save fired...
    expect(putCalls()).toHaveLength(1);
    expect(nifOf(putCalls()[0])).toBe('CALCULAR-EDIT');
    // ...and the recompute ALSO ran.
    expect(computeBoxes303).toHaveBeenCalledTimes(1);
    // Calcular is silent on save success — only Guardar toasts success.
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still recomputes when there is nothing pending to save', async () => {
    installImmediateServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    await clickCalcular();

    expect(putCalls()).toHaveLength(0);
    expect(computeBoxes303).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('shows toast.error when the flush fails, but the recompute still refreshes the KPIs', async () => {
    installFailingPutServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    editNif('CALCULAR-EDIT-FAILS');
    await clickCalcular();

    // Failure is reported...
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    // ...but the recompute ran regardless, and its KPI values are on screen (not blocked or
    // skipped by the save failure).
    expect(computeBoxes303).toHaveBeenCalledTimes(1);
    const values = Array.from(document.querySelectorAll('.test-kpi303-value')).map(el => el.textContent);
    expect(values).toContain('100');
  });
});
