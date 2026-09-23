// ETP-5438 — "block re-presentation once already submitted... sigue tomando facturas aun
// presentada (ocultar boton de generar fichero y que no se recalcule)".
//
// These tests pin the mount-time auto-compute effect's new isSubmitted guard: once a
// declaration is in a submitted-family status, opening its detail page must NEVER issue a
// live `compute349Operators()` call (= `GET /fiscal349/operators`, which always recomputes
// from whatever invoices exist RIGHT NOW) — it must fall back to whatever `FmListPage.jsx`'s
// own submitted-family bucket already cached this session (`getCachedFiscalCompute`), or show
// nothing at all if there is truly no cache yet. A non-submitted declaration's existing
// auto-compute-on-mount behavior (ETP-4755) must be completely unaffected.

import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
  compute349Operators: vi.fn().mockResolvedValue(null),
  generate349File: vi.fn().mockResolvedValue({ ok: false }),
}));
// useFiscalAutoCompute.js is DELIBERATELY NOT mocked here — the whole point of this suite is
// exercising its real `getCachedFiscalCompute`/sessionStorage cache contract.
vi.mock('../use349Pdf.js', () => ({
  use349Pdf: () => ({ pdfUrl: null, loading: false, generatePdf: vi.fn(), clearPdf: vi.fn() }),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  KpiWidget: ({ value, label }) => React.createElement(
    'div', { className: 'test-kpi349', 'data-kpi-label': label },
    React.createElement('span', { className: 'test-kpi349-value' }, value),
  ),
  Tabs: () => null,
  Banner: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({ SourcesTab: () => null, IncidentsTab: () => null }));
vi.mock('../../../FmOverlays.jsx', () => ({ PresentModal: () => null, FileGenModal: () => null }));
vi.mock('../../../../../../components/contract-ui/DocumentPreview.jsx', () => ({
  DocumentPreview: () => null,
}));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('lucide-react', () => ({
  Download: () => null, FileDown: () => null, CircleCheck: () => null, Search: () => null,
  RefreshCw: () => null, Globe: () => null, Eye: () => null, MoreVertical: () => null,
  ChevronDown: () => null, ChevronRight: () => null, Users: () => null, FileEdit: () => null,
  Clock: () => null, TriangleAlert: () => null, Folder: () => null, ReceiptText: () => null,
  Calculator: () => null, PenLine: () => null, ShieldAlert: () => null, Info: () => null,
  OctagonAlert: () => null, ArrowLeft: () => null, Save: () => null, FileText: () => null,
  Star: () => null, ArrowUpRight: () => null, Loader2: () => null, X: () => null, Check: () => null,
  FileCheck: () => null,
}));

import FmModel349Page from '../FmModel349Page.jsx';

const makeDecl = (overrides = {}) => ({
  id: 'decl-349-freeze', model: '349', year: 2026, period: 'T1',
  type: 'ord', status: 'draft', nif: 'B12345678',
  operators: [], invoices: [], rectifications: 0,
  incidents: { blocking: 0 }, _precomputed: null,
  ...overrides,
});

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  token: 'tok',
  apiBaseUrl: '/api',
};

// Same cache key format as useFiscalAutoCompute.js's own sessionCacheKey() — not exported,
// so mirrored here (the "v3" suffix bump reflects that module's own comment: 349's compute
// payload gained per-operator `vies` and per-invoice `key`).
const cacheKeyFor = (declId) => `fiscal_ac_v3_${declId}`;

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('FmModel349Page — mount-time auto-compute is frozen once submitted (ETP-5438)', () => {
  it('does NOT call compute349Operators on mount for a submitted declaration with no precomputed data', async () => {
    const { compute349Operators } = await import('../../../fiscalModelsUtils.js');
    render(<FmModel349Page decl={makeDecl({ status: 'submitted' })} {...defaultProps} />);

    // Give any (incorrect) async mount effect a tick to fire before asserting it didn't.
    await new Promise(r => setTimeout(r, 0));
    expect(compute349Operators).not.toHaveBeenCalled();
  });

  it('does NOT call compute349Operators on mount for a submitted_ack declaration with no precomputed data', async () => {
    const { compute349Operators } = await import('../../../fiscalModelsUtils.js');
    render(<FmModel349Page decl={makeDecl({ status: 'submitted_ack' })} {...defaultProps} />);

    await new Promise(r => setTimeout(r, 0));
    expect(compute349Operators).not.toHaveBeenCalled();
  });

  it('does NOT call compute349Operators on mount for a submitted_ext declaration with no precomputed data', async () => {
    const { compute349Operators } = await import('../../../fiscalModelsUtils.js');
    render(<FmModel349Page decl={makeDecl({ status: 'submitted_ext' })} {...defaultProps} />);

    await new Promise(r => setTimeout(r, 0));
    expect(compute349Operators).not.toHaveBeenCalled();
  });

  it('still calls compute349Operators on mount for a non-submitted (draft) declaration — baseline unchanged (ETP-4755)', async () => {
    const { compute349Operators } = await import('../../../fiscalModelsUtils.js');
    render(<FmModel349Page decl={makeDecl({ status: 'draft' })} {...defaultProps} />);

    await waitFor(() => expect(compute349Operators).toHaveBeenCalledTimes(1));
  });

  it('still calls compute349Operators on mount for a ready declaration — baseline unchanged', async () => {
    const { compute349Operators } = await import('../../../fiscalModelsUtils.js');
    render(<FmModel349Page decl={makeDecl({ status: 'ready' })} {...defaultProps} />);

    await waitFor(() => expect(compute349Operators).toHaveBeenCalledTimes(1));
  });

  it('a submitted declaration with a session cache (populated earlier by FmListPage.jsx) shows the cached operators without ever calling compute349Operators', async () => {
    const { compute349Operators } = await import('../../../fiscalModelsUtils.js');
    const decl = makeDecl({ status: 'submitted' });
    sessionStorage.setItem(cacheKeyFor(decl.id), JSON.stringify({
      computedAt: Date.now(),
      result: {
        operators: [
          { bpId: '1', nif: 'IT12345678901', name: 'Cached SRL', key: 'A', base: '999.00', vies: 'valid' },
        ],
      },
    }));

    render(<FmModel349Page decl={decl} {...defaultProps} />);

    await waitFor(() => expect(document.body.textContent).toContain('Cached SRL'));
    expect(compute349Operators).not.toHaveBeenCalled();
  });

  it('a submitted declaration that already has decl._precomputed does not consult the session cache or compute (existing hasPrecomputed short-circuit, unaffected)', async () => {
    const { compute349Operators } = await import('../../../fiscalModelsUtils.js');
    const ops = [{ bpId: '2', nif: 'FR40123456789', name: 'Precomputed SARL', key: 'E', base: '111.00', vies: 'valid' }];
    render(
      <FmModel349Page
        decl={makeDecl({ status: 'submitted', _precomputed: { operators: ops } })}
        {...defaultProps}
      />
    );

    await waitFor(() => expect(document.body.textContent).toContain('Precomputed SARL'));
    expect(compute349Operators).not.toHaveBeenCalled();
  });
});
