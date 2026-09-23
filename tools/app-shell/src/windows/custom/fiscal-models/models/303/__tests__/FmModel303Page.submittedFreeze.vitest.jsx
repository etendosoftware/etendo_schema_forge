// ETP-5438 — "en todos los modelos tiene que funcionar de la misma manera, una vez presentados
// no se debe recalcular nada por mas que se agreguen quiten facturas, y el boton de generar
// fichero no debe aparecer" — full cross-model parity follow-up to the original 349 fix.
//
// These tests pin FmModel303Page's mount-time auto-compute effect's isSubmitted guard, mirroring
// FmModel349Page.submittedFreeze.vitest.jsx exactly: once a declaration is in a submitted-family
// status, opening its detail page must NEVER issue a live `computeBoxes303()` call (=
// `GET /fiscal303/boxes`, which always recomputes from whatever invoices exist RIGHT NOW).

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

describe('FmModel303Page — mount-time auto-compute is frozen once submitted (ETP-5438)', () => {
  it('does NOT call computeBoxes303 on mount for a submitted declaration with no precomputed data', async () => {
    const { computeBoxes303 } = await import('../../../fiscalModelsUtils.js');
    render(<FmModel303Page decl={makeDecl({ status: 'submitted' })} {...defaultProps} />);

    await new Promise(r => setTimeout(r, 0));
    expect(computeBoxes303).not.toHaveBeenCalled();
  });

  it('does NOT call computeBoxes303 on mount for a submitted_ack declaration with no precomputed data', async () => {
    const { computeBoxes303 } = await import('../../../fiscalModelsUtils.js');
    render(<FmModel303Page decl={makeDecl({ status: 'submitted_ack' })} {...defaultProps} />);

    await new Promise(r => setTimeout(r, 0));
    expect(computeBoxes303).not.toHaveBeenCalled();
  });

  it('does NOT call computeBoxes303 on mount for a submitted_ext declaration with no precomputed data', async () => {
    const { computeBoxes303 } = await import('../../../fiscalModelsUtils.js');
    render(<FmModel303Page decl={makeDecl({ status: 'submitted_ext' })} {...defaultProps} />);

    await new Promise(r => setTimeout(r, 0));
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
