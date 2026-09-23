// ETP-5438 — "en todos los modelos tiene que funcionar de la misma manera, una vez presentados
// no se debe recalcular nada por mas que se agreguen quiten facturas, y el boton de generar
// fichero no debe aparecer" — full cross-model parity follow-up to the original 349 fix.
//
// These tests pin FmModel303Page's mount-time auto-compute effect's isSubmitted guard, mirroring
// FmModel349Page.submittedFreeze.vitest.jsx exactly: once a declaration is in a submitted-family
// status, opening its detail page computes AT MOST ONCE per browser session. A warm session cache
// (`fiscal_ac_v3_<id>`, shared with FmListPage's submitted-family bucket) is applied with zero
// `computeBoxes303()` calls; a cold cache (new tab, reload, another browser) triggers exactly one
// compute (`GET /fiscal303/boxes`, allowed server-side for submitted declarations since the
// ETP-5438 follow-up), whose result is shown and written back to the same cache entry.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));
vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    formatPeriod: (p) => p,
    computeBoxes303: vi.fn().mockResolvedValue(null),
    generate303File: vi.fn().mockResolvedValue({ ok: false }),
    checkModified303: vi.fn(),
  };
});
// useFiscalAutoCompute.js is DELIBERATELY NOT mocked here — the whole point of this suite is
// exercising its real `getCachedFiscalCompute`/sessionStorage cache contract.
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
    'div', { className: 'test-kpi303', 'data-kpi-label': label },
    React.createElement('span', { className: 'test-kpi303-value' }, value),
  ),
}));
vi.mock('../../../FmTabContent.jsx', () => ({ SourcesTab: () => null, IncidentsTab: () => null }));
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ readOnly }) => React.createElement(
    'div', { 'data-testid': 'fm-boxes-303', 'data-readonly': String(!!readOnly) }, 'boxes'
  ),
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  FileGenModal303: () => null,
}));
vi.mock('lucide-react', () => ({
  Settings: () => null, Download: () => null, ArrowLeft: () => null, Save: () => null, OctagonAlert: () => null,
  TriangleAlert: () => null, CircleCheck: () => null, ArrowLeftRight: () => null,
  Calculator: () => null, Loader2: () => null, MoreVertical: () => null,
  TrendingUp: () => null, TrendingDown: () => null, Clock: () => null,
  ClipboardCheck: () => null, ReceiptText: () => null, Folder: () => null,
  FileCheck: () => null, Landmark: () => null,
}));

import FmModel303Page from '../FmModel303Page.jsx';

const makeDecl = (overrides = {}) => ({
  id: 'decl-303-freeze', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
  identification: { tipo_declaracion: 'I' },
  ...overrides,
});

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  token: 'tok',
  apiBaseUrl: '/api',
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('FmModel303Page — mount-time auto-compute runs at most once per session once submitted (ETP-5438)', () => {
  const cacheKeyFor = (declId) => `fiscal_ac_v3_${declId}`;
  const serverPayload = {
    boxes: { 27: 1309.98, 45: 36789.06, 46: -35479.08, 71: -35479.08 },
    summary: { accrued: 1309.98, deductible: 36789.06, result: -35479.08 },
    sources: [],
  };

  it.each(['submitted', 'submitted_ack', 'submitted_ext'])(
    'cold cache + %s: computes exactly once (no mock fallback), shows it and writes the session cache',
    async (status) => {
      const { computeBoxes303 } = await import('../../../fiscalModelsUtils.js');
      computeBoxes303.mockResolvedValueOnce(serverPayload);
      const decl = makeDecl({ status });
      const { container } = render(<FmModel303Page decl={decl} {...defaultProps} />);

      await waitFor(() => expect(sessionStorage.getItem(cacheKeyFor(decl.id))).not.toBeNull());
      expect(computeBoxes303).toHaveBeenCalledTimes(1);
      expect(computeBoxes303).toHaveBeenCalledWith(
        expect.objectContaining({ id: decl.id }),
        expect.objectContaining({ noMockFallback: true }),
      );
      const cached = JSON.parse(sessionStorage.getItem(cacheKeyFor(decl.id)));
      expect(cached.result).toEqual(serverPayload);
      expect(typeof cached.computedAt).toBe('number');
      await waitFor(() => {
        const values = [...container.querySelectorAll('.test-kpi303-value')].map(n => n.textContent);
        expect(values).toContain('1309.98');
      });
    },
  );

  it('cold cache + submitted: a failed compute caches nothing and is not retried', async () => {
    const { computeBoxes303 } = await import('../../../fiscalModelsUtils.js');
    computeBoxes303.mockResolvedValueOnce(null);
    const decl = makeDecl({ status: 'submitted' });
    render(<FmModel303Page decl={decl} {...defaultProps} />);

    await waitFor(() => expect(computeBoxes303).toHaveBeenCalledTimes(1));
    await new Promise(r => setTimeout(r, 0));
    expect(sessionStorage.getItem(cacheKeyFor(decl.id))).toBeNull();
    expect(computeBoxes303).toHaveBeenCalledTimes(1);
  });

  it('cold cache + submitted: a late response for a previous decl.id is cached under its own id but never painted', async () => {
    const { computeBoxes303 } = await import('../../../fiscalModelsUtils.js');
    let resolveFirst;
    computeBoxes303
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({
        boxes: { 27: 222.22 }, summary: { accrued: 222.22, deductible: 0, result: 0 }, sources: [],
      });
    const first = makeDecl({ id: 'decl-303-first', status: 'submitted' });
    const second = makeDecl({ id: 'decl-303-second', status: 'submitted' });
    const { container, rerender } = render(<FmModel303Page decl={first} {...defaultProps} />);
    await waitFor(() => expect(computeBoxes303).toHaveBeenCalledTimes(1));

    rerender(<FmModel303Page decl={second} {...defaultProps} />);
    await waitFor(() => expect(sessionStorage.getItem(cacheKeyFor(second.id))).not.toBeNull());
    resolveFirst(serverPayload);
    await waitFor(() => expect(sessionStorage.getItem(cacheKeyFor(first.id))).not.toBeNull());
    await new Promise(r => setTimeout(r, 0));

    const values = [...container.querySelectorAll('.test-kpi303-value')].map(n => n.textContent);
    expect(values).toContain('222.22');
    expect(values).not.toContain('1309.98');
    expect(JSON.parse(sessionStorage.getItem(cacheKeyFor(first.id))).result).toEqual(serverPayload);
  });

  it('warm cache + submitted: applies the cached payload with ZERO compute calls', async () => {
    const { computeBoxes303 } = await import('../../../fiscalModelsUtils.js');
    const decl = makeDecl({ status: 'submitted' });
    sessionStorage.setItem(cacheKeyFor(decl.id), JSON.stringify({
      result: serverPayload, computedAt: Date.now(),
    }));
    const { container } = render(<FmModel303Page decl={decl} {...defaultProps} />);

    await waitFor(() => {
      const values = [...container.querySelectorAll('.test-kpi303-value')].map(n => n.textContent);
      expect(values).toContain('1309.98');
    });
    expect(computeBoxes303).not.toHaveBeenCalled();
  });

  it('still calls computeBoxes303 on mount for a non-submitted (draft) declaration — baseline unchanged (ETP-4755)', async () => {
    const { computeBoxes303 } = await import('../../../fiscalModelsUtils.js');
    render(<FmModel303Page decl={makeDecl({ status: 'draft' })} {...defaultProps} />);

    await waitFor(() => expect(computeBoxes303).toHaveBeenCalledTimes(1));
  });

  it('still calls computeBoxes303 on mount for a ready declaration — baseline unchanged', async () => {
    const { computeBoxes303 } = await import('../../../fiscalModelsUtils.js');
    render(<FmModel303Page decl={makeDecl({ status: 'ready' })} {...defaultProps} />);

    await waitFor(() => expect(computeBoxes303).toHaveBeenCalledTimes(1));
  });

  it('a submitted declaration that already has decl._precomputed does not consult the session cache or compute (existing short-circuit, unaffected)', async () => {
    const { computeBoxes303 } = await import('../../../fiscalModelsUtils.js');
    render(
      <FmModel303Page
        decl={makeDecl({ status: 'submitted', _precomputed: { boxes: { 1: 100 } } })}
        {...defaultProps}
      />
    );

    await new Promise(r => setTimeout(r, 0));
    expect(computeBoxes303).not.toHaveBeenCalled();
  });
});
