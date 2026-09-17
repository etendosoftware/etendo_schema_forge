// ETP-5338 — the AUTOMATIC mount-time recompute must never persist anything.
//
// `handleCompute` (the raw recompute, no persistence) is shared by TWO callers:
//   1. The "Calcular" button's `handleComputeClick` wrapper, which ALSO calls
//      `persistEditableFields()` (see FmModel303Page.calcularPersists.vitest.jsx).
//   2. A mount-time `useEffect` that fires AUTOMATICALLY — not from a user click — whenever the
//      list didn't hand this page any precomputed data
//      (`decl._precomputed?.boxes == null && liveBoxes == null`).
//
// `handleCompute` itself never persists anything — persistence lives entirely in
// `persistEditableFields`, called only from the button wrapper. This test asserts the automatic
// path stays that way: with no `_precomputed` boxes and no `liveBoxes` seed, the mount effect
// calls `handleCompute` on its own, and this must NEVER issue a PUT — only the GET-shaped
// `computeBoxes303` call the recompute itself makes.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));

const computeBoxes303 = vi.fn();

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
  KpiWidget: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null, IncidentsTab: () => null, HistoryTab: () => null,
}));
vi.mock('../FmBoxes303.jsx', () => ({
  default: () => React.createElement('div', { 'data-testid': 'fm-boxes-303' }, 'boxes'),
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

// `_precomputed` is ABSENT (not just `{ boxes: null }` — genuinely `undefined`) and `boxes` is
// also `null`, so `liveBoxes` seeds to `null` too — this is exactly the
// `decl._precomputed?.boxes == null && liveBoxes == null` condition the mount effect gates on.
const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  boxes: null, sources: [], history: [],
  manualData: { identification: { tipo_declaracion: 'N' } },
};

const TOKEN = 'test-token';
const API_BASE_URL = '/sws/neo/fiscal-models';

function getCalls() {
  return globalThis.fetch.mock.calls.filter(
    ([, options]) => String(options?.method || 'GET').toUpperCase() === 'GET',
  );
}

function putCalls() {
  return globalThis.fetch.mock.calls.filter(
    ([, options]) => String(options?.method || '').toUpperCase() === 'PUT',
  );
}

function installServer() {
  globalThis.fetch = vi.fn((_url, options = {}) => Promise.resolve(
    String(options.method || 'GET').toUpperCase() === 'PUT'
      ? jsonResponse({ manualDataApplied: true })
      : jsonResponse({ response: { data: [] } }),
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
  computeBoxes303.mockResolvedValue({
    boxes: [{ num: 27, value: 50 }],
    summary: { accrued: 50, deductible: 0, result: 50 },
    sources: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FmModel303Page — automatic mount-time recompute never persists (ETP-5338)', () => {
  it('runs computeBoxes303 automatically on mount but issues NO PUT', async () => {
    installServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    await waitFor(() => expect(computeBoxes303).toHaveBeenCalledTimes(1));

    expect(putCalls()).toHaveLength(0);
    // Sanity check that the mount actually did make network calls (GETs) — otherwise a
    // trivially-passing "no PUT" assertion would prove nothing.
    expect(getCalls().length).toBeGreaterThan(0);
  });

  it('never persists even when the declaration already carries a saved manualData edit', async () => {
    // The seeded manualData is not a NEW edit — it is what was already saved. The automatic
    // recompute reading it (to merge overrides via applyComputeResult) must still never re-PUT
    // it: only an explicit Guardar/Calcular click may ever flush editable fields.
    installServer();
    const decl = {
      ...BASE_DECL,
      manualData: {
        identification: { tipo_declaracion: 'N' },
        manualOverrides: { 46: 200 },
      },
    };
    render(<FmModel303Page decl={decl} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    await waitFor(() => expect(computeBoxes303).toHaveBeenCalledTimes(1));

    expect(putCalls()).toHaveLength(0);
  });
});
