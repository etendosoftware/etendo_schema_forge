// Vitest tests for the ETP-4456 "Incidencias" tab wiring in FmModel303Page.jsx:
// fetchDeclarationIncidents is called on mount when apiBaseUrl is present, its result
// drives the incidents KPI/tab badge/IncidentsTab props, a fresh fetch fully replaces (not
// appends to) the previous state, and demo/mock mode (no apiBaseUrl) never overwrites the
// seeded decl.incidents. Kept in its own file (rather than editing FmModel303Page.vitest.jsx or
// FmModel303Page.aeatFlow.vitest.jsx) so its fetchDeclarationIncidents mock and its
// badge-exposing Tabs/KpiWidget/IncidentsTab mocks — which differ from those other files' inert
// mocks — can't affect their suites.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
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
    fetchDeclarationIncidents: vi.fn(),
  };
});
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
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
      { key: t.id, role: 'tab', 'aria-selected': String(t.id === active), 'data-badge': t.badge ?? '', onClick: () => onSelect(t.id) },
      t.label
    ))
  ),
  Banner: () => null,
  SectionCard: () => null,
  EmptyState: () => null,
  // Exposes label/value/badge via data-* attrs, keyed by label (an i18n key here, e.g.
  // 'fm.tab.incidents'), so a test can target the "Incidencias" KPI card specifically.
  KpiWidget: ({ label, value, badge }) => React.createElement(
    'div',
    { 'data-testid': `kpi-${label}`, 'data-value': value, 'data-badge': badge ?? '' },
    `${label}:${value}`,
  ),
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null,
  HistoryTab: () => null,
  IncidentsTab: ({ decl, blocking, warning }) => React.createElement(
    'div',
    {
      'data-testid': 'incidents-tab-mock',
      'data-blocking': blocking,
      'data-warning': warning,
      'data-items-count': decl.incidents?.items?.length ?? 0,
      'data-origins': (decl.incidents?.items ?? []).map(i => i.origin).join(','),
    },
    'incidents-tab',
  ),
}));
vi.mock('../FmBoxes303.jsx', () => ({ default: () => null }));
vi.mock('lucide-react', () => ({
  Settings: () => null, Download: () => null, OctagonAlert: () => null,
  TriangleAlert: () => null, CircleCheck: () => null, ArrowLeftRight: () => null,
  Calculator: () => null, Loader2: () => null, MoreVertical: () => null,
  TrendingUp: () => null, TrendingDown: () => null, Clock: () => null,
  ClipboardCheck: () => null, ReceiptText: () => null, Folder: () => null,
  FileCheck: () => null,
}));

// PresentModal mock: renders a button that reports the 'aeat_telematic' sentinel status,
// so tests can open AeatSubmitFlow (matches FmModel303Page.aeatFlow.vitest.jsx's pattern).
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: ({ onConfirm }) => React.createElement(
    'button',
    { 'data-testid': 'present-confirm-aeat', onClick: () => onConfirm({ status: 'aeat_telematic' }) },
    'confirm-aeat',
  ),
  FileGenModal303: () => null,
  ConfigDrawer: () => null,
  CompareDrawer: () => null,
}));

// AeatSubmitFlow mock: exposes a button that triggers onIncidentsChanged — used to simulate the
// "refreshed again after a second AEAT attempt" scenario without exercising AeatSubmitFlow itself
// (already covered by AeatSubmitFlow.vitest.jsx).
vi.mock('../AeatSubmitFlow.jsx', () => ({
  default: ({ onIncidentsChanged }) => React.createElement(
    'button',
    { 'data-testid': 'aeat-flow-incidents-changed', onClick: () => onIncidentsChanged?.() },
    'aeat-flow-incidents-changed',
  ),
}));

import FmModel303Page from '../FmModel303Page.jsx';
import { fetchDeclarationIncidents } from '../../../fiscalModelsUtils.js';

const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0, items: [] },
  _precomputed: null, boxes: null, sources: [], history: [],
};

function incidentsTabButton() {
  return screen.getAllByRole('tab').find(t => t.textContent.includes('fm.tab.incidents'));
}

function openAeatFlow() {
  const btns = Array.from(document.querySelectorAll('button'));
  fireEvent.click(btns.find(b => b.textContent.includes('fm.action.submit')));
  fireEvent.click(screen.getByTestId('present-confirm-aeat'));
}

beforeEach(() => {
  vi.clearAllMocks();
  // fetchOrgIdent (a separate effect, unrelated to incidents) uses the raw global fetch — stub
  // it to a harmless non-ok response so it doesn't attempt a real network call.
  vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('FmModel303Page — incidents fetched on mount (ETP-4456)', () => {
  it('shows fetched incidents in the KPI bar, tab badge, and IncidentsTab after mount (non-empty)', async () => {
    fetchDeclarationIncidents.mockResolvedValueOnce({
      blocking: 2,
      warning: 0,
      items: [
        { origin: 'EDID065', message: 'IBAN not allowed', severity: 'block' },
        { origin: 'E0100803', message: 'Business name error', severity: 'block' },
      ],
    });

    render(<FmModel303Page decl={BASE_DECL} apiBaseUrl="/api" onBack={vi.fn()} onStatusChange={vi.fn()} />);

    await waitFor(() => expect(fetchDeclarationIncidents).toHaveBeenCalledWith(
      BASE_DECL.id, { apiBaseUrl: '/api' },
    ));
    await waitFor(() => expect(screen.getByTestId('kpi-fm.tab.incidents').getAttribute('data-value')).toBe('2'));

    const tabBtn = incidentsTabButton();
    expect(tabBtn.getAttribute('data-badge')).toBe('2');

    fireEvent.click(tabBtn);
    const incidentsMock = screen.getByTestId('incidents-tab-mock');
    expect(incidentsMock.getAttribute('data-blocking')).toBe('2');
    expect(incidentsMock.getAttribute('data-items-count')).toBe('2');
    expect(incidentsMock.getAttribute('data-origins')).toBe('EDID065,E0100803');
  });

  it('shows an empty incidents state (blocking=0) when the fetch returns no items', async () => {
    fetchDeclarationIncidents.mockResolvedValueOnce({ blocking: 0, warning: 0, items: [] });
    const seeded = {
      ...BASE_DECL,
      incidents: { blocking: 5, warning: 0, items: [{ origin: 'STALE', message: 'x', severity: 'block' }] },
    };

    render(<FmModel303Page decl={seeded} apiBaseUrl="/api" onBack={vi.fn()} onStatusChange={vi.fn()} />);

    await waitFor(() => expect(fetchDeclarationIncidents).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('kpi-fm.tab.incidents').getAttribute('data-value')).toBe('0'));

    const tabBtn = incidentsTabButton();
    expect(tabBtn.getAttribute('data-badge')).toBe('');

    fireEvent.click(tabBtn);
    const incidentsMock = screen.getByTestId('incidents-tab-mock');
    expect(incidentsMock.getAttribute('data-items-count')).toBe('0');
  });

  it('fully replaces incidents (not appended) on a second fetch via onIncidentsChanged', async () => {
    fetchDeclarationIncidents
      .mockResolvedValueOnce({
        blocking: 2, warning: 0,
        items: [
          { origin: 'A', message: 'a', severity: 'block' },
          { origin: 'B', message: 'b', severity: 'block' },
        ],
      })
      .mockResolvedValueOnce({
        blocking: 1, warning: 0,
        items: [{ origin: 'C', message: 'c', severity: 'block' }],
      });

    render(<FmModel303Page decl={BASE_DECL} apiBaseUrl="/api" onBack={vi.fn()} onStatusChange={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('kpi-fm.tab.incidents').getAttribute('data-value')).toBe('2'));

    openAeatFlow();
    fireEvent.click(screen.getByTestId('aeat-flow-incidents-changed'));

    await waitFor(() => expect(fetchDeclarationIncidents).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('kpi-fm.tab.incidents').getAttribute('data-value')).toBe('1'));

    fireEvent.click(incidentsTabButton());
    const incidentsMock = screen.getByTestId('incidents-tab-mock');
    // Replaced, not appended: only the second fetch's item survives, no accumulation of A/B/C.
    expect(incidentsMock.getAttribute('data-items-count')).toBe('1');
    expect(incidentsMock.getAttribute('data-origins')).toBe('C');
  });
});

describe('FmModel303Page — demo/mock mode does not overwrite seeded incidents (ETP-4456)', () => {
  it('never calls fetchDeclarationIncidents and keeps decl.incidents as-is when apiBaseUrl is absent', async () => {
    const seeded = {
      ...BASE_DECL,
      incidents: { blocking: 3, warning: 1, items: [{ origin: 'SEED', message: 'seed msg', severity: 'block' }] },
    };

    render(<FmModel303Page decl={seeded} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    // No apiBaseUrl means demo mode — give pending microtasks a tick, then assert the
    // fetch never happened and the seeded value rendered as-is.
    await waitFor(() => expect(screen.getByTestId('kpi-fm.tab.incidents')).toBeInTheDocument());
    expect(fetchDeclarationIncidents).not.toHaveBeenCalled();
    expect(screen.getByTestId('kpi-fm.tab.incidents').getAttribute('data-value')).toBe('4');

    fireEvent.click(incidentsTabButton());
    const incidentsMock = screen.getByTestId('incidents-tab-mock');
    expect(incidentsMock.getAttribute('data-items-count')).toBe('1');
    expect(incidentsMock.getAttribute('data-origins')).toBe('SEED');
  });
});
