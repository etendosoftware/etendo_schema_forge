// Vitest tests for FmModel303Page's ETP-4975 missing-default-IAE-activity
// pre-flight guard in handleGenerate ("Generar fichero 303"). Mirrors the
// identical guard already covered on AeatSubmitFlow's "Marcar como Presentado"
// button — see AeatSubmitFlow.jsx's own handleSubmit and its docstring for the
// full rationale (Classic's Modelo 303 code, reused via reflection, throws an
// untranslated IndexOutOfBoundsException on the last period of the fiscal year
// when the organization has no default IAE activity with a code).

import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ selectedOrg: { id: 'org-1' } }),
}));
vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    formatPeriod: (p) => p,
    computeBoxes303: vi.fn().mockResolvedValue(null),
    generate303File: vi.fn().mockResolvedValue({ ok: true }),
    fetchDeclarationIncidents: vi.fn().mockResolvedValue({ blocking: 0, warning: 0, items: [] }),
  };
});
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u ?? '' }));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  ResultPill: () => null,
  SummaryCard: () => null,
  Tabs: ({ tabs, active, onSelect }) => React.createElement(
    'div',
    { role: 'tablist' },
    tabs.map(t => React.createElement(
      'button',
      { key: t.id, role: 'tab', 'aria-selected': String(t.id === active), onClick: () => onSelect(t.id) },
      t.label
    ))
  ),
  Banner: () => null,
  SectionCard: () => null,
  EmptyState: () => null,
  KpiWidget: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null,
  IncidentsTab: () => null,
}));
vi.mock('../FmBoxes303.jsx', () => ({
  default: () => React.createElement('div', { 'data-testid': 'fm-boxes-303' }, 'boxes'),
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  // Exposes an "invoke onConfirm" button so tests can drive handleGenerate directly,
  // same pattern as FmModel303Page.vitest.jsx.
  FileGenModal303: ({ onConfirm }) => React.createElement(
    'div',
    { 'data-testid': 'FileGenModal303-mock' },
    React.createElement(
      'button',
      { 'data-testid': 'filegen303-confirm', onClick: () => onConfirm?.({ filename: undefined }) },
      'confirm-filegen',
    ),
  ),
}));
vi.mock('@/components/attachments', () => ({
  AttachmentsTab: () => null,
  useAttachments: () => ({ upload: vi.fn() }),
}));
vi.mock('lucide-react', () => ({
  Download: () => null, OctagonAlert: () => null, TriangleAlert: () => null,
  CircleCheck: () => null, Calculator: () => null, Loader2: () => null,
  TrendingUp: () => null, TrendingDown: () => null, ClipboardCheck: () => null,
  ReceiptText: () => null, FileCheck: () => null, Landmark: () => null,
}));

import FmModel303Page from '../FmModel303Page.jsx';
import { generate303File } from '../../../fiscalModelsUtils.js';

const LAST_PERIOD_DECL = {
  id: '303-2026-T4', model: '303', year: 2026, period: 'T4', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
};

const NOT_LAST_PERIOD_DECL = { ...LAST_PERIOD_DECL, id: '303-2026-T2', period: 'T2' };

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  token: 'tok',
  apiBaseUrl: '/sws/neo/fiscal-models',
};

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

// iaeRows null => the /organization/actividadesDelIae fetch itself rejects (fail-open case).
function makeFetchMock({ iaeRows = [], iaeRejects = false } = {}) {
  return vi.fn((url) => {
    if (url.includes('/organization/actividadesDelIae')) {
      if (iaeRejects) return Promise.reject(new Error('network down'));
      return jsonResponse({ response: { data: iaeRows } });
    }
    if (url.includes('/session')) {
      return jsonResponse({ organization: { taxId: 'B1', name: 'Acme' } });
    }
    return jsonResponse({});
  });
}

async function openFileGenAndConfirm() {
  const genBtn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.includes('fm.action.gen303'));
  fireEvent.click(genBtn);
  fireEvent.click(await screen.findByTestId('filegen303-confirm'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FmModel303Page — missing default IAE activity guard (ETP-4975)', () => {
  it('last period + a default row WITH a code: proceeds to generate normally', async () => {
    global.fetch = makeFetchMock({ iaeRows: [{ id: 'row-1', default: true, epiaeCode: 'C1' }] });
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} />);

    await openFileGenAndConfirm();

    await waitFor(() => expect(generate303File).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('fm.aeat.error.missingDefaultIae')).not.toBeInTheDocument();
  });

  it('last period + NO default row: blocks BEFORE calling generate303File and shows the banner + CTA', async () => {
    global.fetch = makeFetchMock({ iaeRows: [] });
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} />);

    await openFileGenAndConfirm();

    await waitFor(() => expect(screen.getByText('fm.aeat.error.missingDefaultIae')).toBeInTheDocument());
    expect(generate303File).not.toHaveBeenCalled();
    expect(screen.getByText('fm.aeat.action.go_to_organization')).toBeInTheDocument();
  });

  it('last period + a default row WITHOUT a code: still counts as missing and blocks', async () => {
    global.fetch = makeFetchMock({ iaeRows: [{ id: 'row-1', default: true, epiaeCode: null }] });
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} />);

    await openFileGenAndConfirm();

    await waitFor(() => expect(screen.getByText('fm.aeat.error.missingDefaultIae')).toBeInTheDocument());
    expect(generate303File).not.toHaveBeenCalled();
  });

  it('non-last period: never checks actividadesDelIae and generates normally', async () => {
    const fetchMock = makeFetchMock({ iaeRows: [] }); // would block if (wrongly) checked
    global.fetch = fetchMock;
    render(<FmModel303Page decl={NOT_LAST_PERIOD_DECL} {...defaultProps} />);

    await openFileGenAndConfirm();

    await waitFor(() => expect(generate303File).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls.some(([url]) => url.includes('/organization/actividadesDelIae'))).toBe(false);
    expect(screen.queryByText('fm.aeat.error.missingDefaultIae')).not.toBeInTheDocument();
  });

  it('fails OPEN when the actividadesDelIae fetch itself errors (network failure): generation still proceeds', async () => {
    global.fetch = makeFetchMock({ iaeRejects: true });
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} />);

    await openFileGenAndConfirm();

    await waitFor(() => expect(generate303File).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('fm.aeat.error.missingDefaultIae')).not.toBeInTheDocument();
  });

  it('clicking the "Go to Organization" CTA navigates to /organization', async () => {
    global.fetch = makeFetchMock({ iaeRows: [] });
    render(<FmModel303Page decl={LAST_PERIOD_DECL} {...defaultProps} />);

    await openFileGenAndConfirm();
    await waitFor(() => expect(screen.getByText('fm.aeat.action.go_to_organization')).toBeInTheDocument());

    fireEvent.click(screen.getByText('fm.aeat.action.go_to_organization'));
    expect(navigateMock).toHaveBeenCalledWith('/organization');
  });
});
