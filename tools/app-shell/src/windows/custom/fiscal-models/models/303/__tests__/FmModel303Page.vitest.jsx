// Vitest component tests for FmModel303Page.jsx
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

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
      { key: t.id, role: 'tab', 'aria-selected': String(t.id === active), onClick: () => onSelect(t.id) },
      t.label
    ))
  ),
  Banner: () => null,
  SectionCard: () => null,
  EmptyState: () => React.createElement('div', { className: 'fm-empty-state' }, 'empty'),
  KpiWidget: ({ value, label }) => React.createElement(
    'div',
    { className: 'test-kpi303' },
    React.createElement('span', { className: 'test-kpi303-label' }, label),
    React.createElement('span', { className: 'test-kpi303-value' }, value)
  ),
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null,
  IncidentsTab: () => null,
}));
vi.mock('../FmBoxes303.jsx', () => ({
  // Surfaces the `readOnly` prop as a data attribute so tests can assert
  // CasillasTab correctly threads readOnly={isSubmitted} down to FmBoxes303.
  default: ({ readOnly }) => React.createElement(
    'div', { 'data-testid': 'fm-boxes-303', 'data-readonly': String(!!readOnly) }, 'boxes'
  ),
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  // Exposes an "invoke onConfirm" button so tests can drive `handleGenerate`
  // (and thus the `generating` state) without depending on the modal's own UI.
  FileGenModal303: ({ onConfirm }) => React.createElement(
    'div',
    { 'data-testid': 'FileGenModal303-mock' },
    'filegen-modal',
    React.createElement(
      'button',
      { 'data-testid': 'filegen303-confirm', onClick: () => onConfirm?.({ filename: undefined }) },
      'confirm-filegen',
    ),
  ),
}));
vi.mock('lucide-react', () => ({
  Settings: () => null, Download: () => null, OctagonAlert: () => null,
  TriangleAlert: () => null, CircleCheck: () => null, ArrowLeftRight: () => null,
  Calculator: () => null, Loader2: () => null, MoreVertical: () => null,
  TrendingUp: () => null, TrendingDown: () => null, Clock: () => null,
  ClipboardCheck: () => null, ReceiptText: () => null, Folder: () => null,
  FileCheck: () => null,
}));

import FmModel303Page from '../FmModel303Page.jsx';
import { computeBoxes303 } from '../../../fiscalModelsUtils.js';

const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
};

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Rendering ────────────────────────────────────────────────────────────────

describe('FmModel303Page — rendering', () => {
  it('renders without crashing', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(document.body).toBeTruthy();
  });

  it('shows "303" model badge in title', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(document.body.textContent).toContain('303');
  });

  it('shows period in title', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(document.body.textContent).toContain('T2');
  });

  it('shows year in title', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(document.body.textContent).toContain('2026');
  });

  it('renders FmBoxes303 when boxes tab is active (default)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(screen.getByTestId('fm-boxes-303')).toBeTruthy();
  });

  it('passes readOnly=false to FmBoxes303 for a non-submitted status (draft)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(screen.getByTestId('fm-boxes-303').getAttribute('data-readonly')).toBe('false');
  });

  it('passes readOnly=true to FmBoxes303 for a submitted status', () => {
    const submittedDecl = { ...BASE_DECL, status: 'submitted' };
    render(<FmModel303Page decl={submittedDecl} {...defaultProps} />);
    expect(screen.getByTestId('fm-boxes-303').getAttribute('data-readonly')).toBe('true');
  });

  it('renders the tab bar', () => {
    const { container } = render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
  });
});

// ── Action bar ───────────────────────────────────────────────────────────────

describe('FmModel303Page — action bar', () => {
  it('renders a Cancel/back button', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const cancelBtn = btns.find(b => b.textContent.includes('fm.action.cancel'));
    expect(cancelBtn).toBeTruthy();
  });

  it('calls onBack when cancel button is clicked', () => {
    const onBack = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} onBack={onBack} onStatusChange={vi.fn()} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const cancelBtn = btns.find(b => b.textContent.includes('fm.action.cancel'));
    fireEvent.click(cancelBtn);
    expect(onBack).toHaveBeenCalled();
  });

  it('renders the Compute button (Calcular)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const computeBtn = btns.find(b => b.textContent.includes('fm.action.compute'));
    expect(computeBtn).toBeTruthy();
  });

  it('renders the Submit button for non-submitted declarations', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const submitBtn = btns.find(b => b.textContent.includes('fm.action.submit'));
    expect(submitBtn).toBeTruthy();
  });

  it('does not render the Submit button for already-submitted declarations', () => {
    const submittedDecl = { ...BASE_DECL, status: 'submitted_ack' };
    render(<FmModel303Page decl={submittedDecl} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const submitBtn = btns.find(b => b.textContent.includes('fm.action.submit'));
    expect(submitBtn).toBeUndefined();
  });

  it('renders the Compute (Calcular) button for a non-submitted status (draft)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const computeBtn = btns.find(b => b.textContent.includes('fm.action.compute'));
    expect(computeBtn).toBeTruthy();
  });

  it('hides the Compute (Calcular) button for a submitted status, while Cancelar and Generar fichero 303 remain', () => {
    const submittedDecl = { ...BASE_DECL, status: 'submitted' };
    render(<FmModel303Page decl={submittedDecl} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const computeBtn = btns.find(b => b.textContent.includes('fm.action.compute'));
    const cancelBtn = btns.find(b => b.textContent.includes('fm.action.cancel'));
    const genBtn = btns.find(b => b.textContent.includes('fm.action.gen303'));
    expect(computeBtn).toBeUndefined();
    expect(cancelBtn).toBeTruthy();
    expect(genBtn).toBeTruthy();
  });

  it('hides the Compute (Calcular) button for a submitted_ack status, while Cancelar and Generar fichero 303 remain', () => {
    const submittedDecl = { ...BASE_DECL, status: 'submitted_ack' };
    render(<FmModel303Page decl={submittedDecl} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const computeBtn = btns.find(b => b.textContent.includes('fm.action.compute'));
    const cancelBtn = btns.find(b => b.textContent.includes('fm.action.cancel'));
    const genBtn = btns.find(b => b.textContent.includes('fm.action.gen303'));
    expect(computeBtn).toBeUndefined();
    expect(cancelBtn).toBeTruthy();
    expect(genBtn).toBeTruthy();
  });
});

// ── KPI bar ──────────────────────────────────────────────────────────────────

describe('FmModel303Page — KPI bar', () => {
  it('renders KPI cards', () => {
    const { container } = render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(container.querySelectorAll('.test-kpi303').length).toBeGreaterThanOrEqual(4);
  });

  it('shows Incidencias KPI label', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const labels = document.querySelectorAll('.test-kpi303-label');
    const labelTexts = Array.from(labels).map(l => l.textContent);
    expect(labelTexts.some(t => t.includes('fm.tab.incidents'))).toBe(true);
  });

  it('shows 0 incident count for declarations with no incidents', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const values = document.querySelectorAll('.test-kpi303-value');
    // First KPI = incident count = '0'
    expect(values[0].textContent).toBe('0');
  });

  it('shows correct IVA Devengado from precomputed summary', () => {
    const decl = {
      ...BASE_DECL,
      _precomputed: { boxes: {}, summary: { accrued: 1309.98, deductible: 36789.06, result: -35479.08 } },
    };
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    const values = document.querySelectorAll('.test-kpi303-value');
    // KPI[1] = IVA devengado = formatAmount(1309.98) = "1309.98"
    expect(values[1].textContent).toBe('1309.98');
  });
});

// ── Tab navigation ────────────────────────────────────────────────────────────

describe('FmModel303Page — tab navigation', () => {
  it('defaults to boxes tab showing FmBoxes303', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    expect(screen.getByTestId('fm-boxes-303')).toBeTruthy();
  });

  it('renders tab buttons for boxes, sources, incidents', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    const tabLabels = tabs.map(t => t.textContent);
    expect(tabLabels.some(t => t.includes('fm.tab.boxes'))).toBe(true);
    expect(tabLabels.some(t => t.includes('fm.tab.sources'))).toBe(true);
    expect(tabLabels.some(t => t.includes('fm.tab.incidents'))).toBe(true);
  });

  it('does not render a "Historial" tab', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    const tabLabels = tabs.map(t => t.textContent);
    expect(tabLabels.some(t => t.includes('fm.tab.history'))).toBe(false);
  });

  it('does not render a "Ficheros" tab', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    const tabLabels = tabs.map(t => t.textContent);
    expect(tabLabels.some(t => t.includes('fm.tab.files'))).toBe(false);
  });
});

// ── Precomputed data ──────────────────────────────────────────────────────────

describe('FmModel303Page — precomputed data', () => {
  it('initializes liveBoxes from _precomputed', () => {
    const decl = {
      ...BASE_DECL,
      _precomputed: { boxes: { 7: 100, 9: 21 }, summary: { accrued: 21, deductible: 0, result: 21 } },
    };
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    // If liveBoxes is initialized, FmBoxes303 should render (it's a mock)
    expect(screen.getByTestId('fm-boxes-303')).toBeTruthy();
  });
});

// ── Tab navigation — click to switch ─────────────────────────────────────────

describe('FmModel303Page — tab click switching', () => {
  it('hides FmBoxes303 when sources tab is clicked', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.sources')));
    expect(screen.queryByTestId('fm-boxes-303')).toBeNull();
  });

  it('hides FmBoxes303 when incidents tab is clicked', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.incidents')));
    expect(screen.queryByTestId('fm-boxes-303')).toBeNull();
  });

  it('shows FmBoxes303 again when boxes tab is re-clicked after switching', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.sources')));
    fireEvent.click(tabs.find(t => t.textContent.includes('fm.tab.boxes')));
    expect(screen.getByTestId('fm-boxes-303')).toBeTruthy();
  });
});

// ── Kebab / MoreOptionsMenu ────────────────────────────────────────────────
// The old MoreOptionsMenu349-style dropdown (Comparar / Configuración / Generar)
// was removed from this page — Comparar and Configuración are gone entirely;
// Generar fichero moved to a standalone action-bar button (see describe block
// below). A NEW, functional MoreOptionsMenu (favorites + help) was added later
// (ETP-4755) — since FmCommon.jsx is mocked wholesale at the top of this file,
// its real behavior is covered directly in FmCommon.vitest.jsx instead.

// ── Standalone "Generar fichero" action-bar button ────────────────────────────

describe('FmModel303Page — standalone Generar fichero button', () => {
  it('renders a "Generar fichero" button in the action bar (not just inside Files tab)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    expect(btns.some(b => b.textContent.includes('fm.action.gen303'))).toBe(true);
  });

  it('clicking it opens the file-gen modal', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const genBtn = btns.find(b => b.textContent.includes('fm.action.gen303'));
    expect(screen.queryByTestId('FileGenModal303-mock')).toBeNull();
    fireEvent.click(genBtn);
    expect(screen.getByTestId('FileGenModal303-mock')).toBeTruthy();
  });

  it('is visible and functional when the declaration is already submitted', () => {
    const decl = { ...BASE_DECL, status: 'submitted' };
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const genBtn = btns.find(b => b.textContent.includes('fm.action.gen303'));
    expect(genBtn).toBeTruthy();
    fireEvent.click(genBtn);
    expect(screen.getByTestId('FileGenModal303-mock')).toBeTruthy();
  });

  it('is visible and functional when the declaration is not submitted (draft)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const genBtn = btns.find(b => b.textContent.includes('fm.action.gen303'));
    expect(genBtn).toBeTruthy();
    fireEvent.click(genBtn);
    expect(screen.getByTestId('FileGenModal303-mock')).toBeTruthy();
  });

  it('disables the standalone "Generar fichero" button while generation is in flight, re-enables after it settles', async () => {
    let resolveGenerate;
    const { generate303File } = await import('../../../fiscalModelsUtils.js');
    generate303File.mockImplementation(() => new Promise((resolve) => { resolveGenerate = resolve; }));

    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const genBtn = () => Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.gen303'));
    fireEvent.click(genBtn());
    expect(genBtn().disabled).toBe(false);

    fireEvent.click(screen.getByTestId('filegen303-confirm'));
    await waitFor(() => expect(genBtn().disabled).toBe(true));

    await act(async () => { resolveGenerate({ ok: true }); await Promise.resolve(); });
    await waitFor(() => expect(genBtn().disabled).toBe(false));
  });
});

// ── Incidents KPI variants ────────────────────────────────────────────────────

describe('FmModel303Page — incidents KPI variants', () => {
  it('shows combined incident count (blocking + warning)', () => {
    const decl = { ...BASE_DECL, incidents: { blocking: 1, warning: 2 } };
    const { container } = render(<FmModel303Page decl={decl} {...defaultProps} />);
    const values = container.querySelectorAll('.test-kpi303-value');
    expect(values[0].textContent).toBe('3');
  });

  it('shows blocking-only count in KPI', () => {
    const decl = { ...BASE_DECL, incidents: { blocking: 2, warning: 0 } };
    const { container } = render(<FmModel303Page decl={decl} {...defaultProps} />);
    const values = container.querySelectorAll('.test-kpi303-value');
    expect(values[0].textContent).toBe('2');
  });

  it('shows warning-only count in KPI', () => {
    const decl = { ...BASE_DECL, incidents: { blocking: 0, warning: 3 } };
    const { container } = render(<FmModel303Page decl={decl} {...defaultProps} />);
    const values = container.querySelectorAll('.test-kpi303-value');
    expect(values[0].textContent).toBe('3');
  });
});

// ── Result kind rendering ─────────────────────────────────────────────────────
// resultSubLabel is passed as a `badge` prop to KpiWidget, which the mock does
// not render. Tests here cover the branch execution rather than DOM text.

describe('FmModel303Page — result kind rendering', () => {
  it('renders without crashing when result kind is I', () => {
    const decl = { ...BASE_DECL, result: { kind: 'I' } };
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(document.body).toBeTruthy();
  });

  it('renders without crashing when result kind is C', () => {
    const decl = { ...BASE_DECL, result: { kind: 'C' } };
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(document.body).toBeTruthy();
  });

  it('renders without crashing when result kind is N', () => {
    const decl = { ...BASE_DECL, result: { kind: 'N' } };
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(document.body).toBeTruthy();
  });

  it('renders result KPI label key via i18n', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const labels = Array.from(document.querySelectorAll('.test-kpi303-label'));
    expect(labels.some(l => l.textContent === 'fm.m303.summary.result')).toBe(true);
  });

  it('renders IVA devengado and IVA deducible KPI labels', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const labels = Array.from(document.querySelectorAll('.test-kpi303-label'));
    const texts = labels.map(l => l.textContent);
    expect(texts.some(t => t === 'fm.m303.summary.accrued')).toBe(true);
    expect(texts.some(t => t === 'fm.m303.summary.deductible')).toBe(true);
  });
});

// ── Precomputed summary KPI values ────────────────────────────────────────────

describe('FmModel303Page — precomputed summary KPI deductible and result', () => {
  it('shows deductible value from precomputed summary', () => {
    const decl = {
      ...BASE_DECL,
      _precomputed: { boxes: {}, summary: { accrued: 100, deductible: 200, result: -100 } },
    };
    const { container } = render(<FmModel303Page decl={decl} {...defaultProps} />);
    const values = container.querySelectorAll('.test-kpi303-value');
    expect(values[2].textContent).toBe('200');
  });

  it('shows result value from precomputed summary', () => {
    const decl = {
      ...BASE_DECL,
      _precomputed: { boxes: {}, summary: { accrued: 100, deductible: 200, result: -100 } },
    };
    const { container } = render(<FmModel303Page decl={decl} {...defaultProps} />);
    const values = container.querySelectorAll('.test-kpi303-value');
    expect(values[3].textContent).toBe('-100');
  });
});

// ── Submit button status variants ─────────────────────────────────────────────

describe('FmModel303Page — submit button status variants', () => {
  it('hides submit button when status is submitted', () => {
    const decl = { ...BASE_DECL, status: 'submitted' };
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    expect(btns.find(b => b.textContent.includes('fm.action.submit'))).toBeUndefined();
  });

  it('hides submit button when status is submitted_ext', () => {
    const decl = { ...BASE_DECL, status: 'submitted_ext' };
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    expect(btns.find(b => b.textContent.includes('fm.action.submit'))).toBeUndefined();
  });

  it('clicking submit button shows PresentModal (no crash)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    const submitBtn = btns.find(b => b.textContent.includes('fm.action.submit'));
    expect(() => fireEvent.click(submitBtn)).not.toThrow();
  });
});

// ── handleCompute async ───────────────────────────────────────────────────────

describe('FmModel303Page — handleCompute async', () => {
  afterEach(() => {
    // Always restore null default so other tests see clean state
    computeBoxes303.mockResolvedValue(null);
  });

  it('updates accrued, deductible, and result KPI values after successful compute', async () => {
    // boxes must be an array of {num, value} — applyOverrides returns boxes unchanged
    // when overrides={}, and recomputeDerivedBoxes expects an array.
    computeBoxes303.mockResolvedValue({
      boxes: [{ num: 7, value: 100 }, { num: 9, value: 21 }],
      summary: { accrued: 500, deductible: 200, result: 300 },
      sources: [],
    });
    const { container } = render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    fireEvent.click(
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('fm.action.compute'))
    );
    await waitFor(() => {
      const values = container.querySelectorAll('.test-kpi303-value');
      expect(values[1].textContent).toBe('500');
    });
    const values = container.querySelectorAll('.test-kpi303-value');
    expect(values[2].textContent).toBe('200');
    expect(values[3].textContent).toBe('300');
  });

  it('shows computing label on button during async compute', async () => {
    let resolveCompute;
    computeBoxes303.mockImplementation(() => new Promise(resolve => { resolveCompute = resolve; }));
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    fireEvent.click(
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('fm.action.compute'))
    );
    await waitFor(() => {
      const computingBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('fm.action.computing'));
      expect(computingBtn).toBeTruthy();
    });
    await act(async () => { resolveCompute(null); });
  });

  it('compute button is disabled while computing', async () => {
    let resolveCompute;
    computeBoxes303.mockImplementation(() => new Promise(resolve => { resolveCompute = resolve; }));
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    fireEvent.click(
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('fm.action.compute'))
    );
    await waitFor(() => {
      const disabledBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent.includes('fm.action.computing'));
      expect(disabledBtn?.disabled).toBe(true);
    });
    await act(async () => { resolveCompute(null); });
  });

  it('does not update KPI when computeBoxes303 returns null', async () => {
    // default mockResolvedValue(null) already set by afterEach from previous tests
    const { container } = render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    fireEvent.click(
      Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('fm.action.compute'))
    );
    // Let the async work complete
    await act(async () => {});
    // Summary stays at default (0) since res is null and setLiveSummary is not called
    const values = container.querySelectorAll('.test-kpi303-value');
    expect(values[1].textContent).toBe('0');
  });
});

// ── Generate error toast (ETP-5027) ──────────────────────────────────────────
//
// The page-level `genError` banner (a red strip above the tabs, driven by a
// `genError` state) was replaced by a sonner toast, matching the 349 page and the
// invoice rectification save errors. Assertions therefore go through the mocked
// `toast.error` rather than the DOM — and the banner's absence is asserted too, so
// the two renderings can never both come back.

describe('FmModel303Page — generate error toast', () => {
  const genBtn = () => Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.includes('fm.action.gen303'));

  // Other components in this tree can toast for unrelated reasons in the test
  // environment, so never count total calls — always filter by message.
  const toastsFor = (toast, message) =>
    toast.error.mock.calls.filter(c => c[0] === message).length;

  async function generateWith(result) {
    const { toast } = await import('sonner');
    const { generate303File } = await import('../../../fiscalModelsUtils.js');
    generate303File.mockResolvedValue(result);

    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    fireEvent.click(genBtn());
    fireEvent.click(screen.getByTestId('filegen303-confirm'));
    return toast;
  }

  it('toasts the backend serverMessage when generate303File fails with one', async () => {
    const toast = await generateWith({ ok: false, error: 'http_400', serverMessage: 'AEAT303 boom' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('AEAT303 boom'));
  });

  it('falls back to the fm.gen303.error.generic key when there is no serverMessage', async () => {
    const toast = await generateWith({ ok: false, error: 'http_500' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.gen303.error.generic'));
  });

  it('uses the dedicated iban_required message instead of the generic one', async () => {
    const toast = await generateWith({ ok: false, error: 'iban_required' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.gen303.error.iban_required'));
    expect(toastsFor(toast, 'fm.gen303.error.generic')).toBe(0);
  });

  it('the iban_required branch wins even when a serverMessage is present', async () => {
    const toast = await generateWith({ ok: false, error: 'iban_required', serverMessage: 'ignored' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.gen303.error.iban_required'));
    expect(toastsFor(toast, 'ignored')).toBe(0);
  });

  it('renders NO inline error banner — the message lives only in the toast', async () => {
    const toast = await generateWith({ ok: false, serverMessage: 'Boom validation error' });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Boom validation error'));
    expect(document.body.textContent).not.toContain('Boom validation error');
    expect(screen.queryByTestId('OctagonAlert__gen_error')).not.toBeInTheDocument();
  });

  it('emits exactly one toast per failure and does not re-emit when the modal is reopened', async () => {
    const toast = await generateWith({ ok: false, serverMessage: 'Boom validation error' });
    await waitFor(() => expect(toastsFor(toast, 'Boom validation error')).toBe(1));

    // Reopening the modal is not a failure event — it must not toast again.
    fireEvent.click(genBtn());
    expect(toastsFor(toast, 'Boom validation error')).toBe(1);
  });

  it('does not toast at all on a successful generation', async () => {
    const toast = await generateWith({ ok: true });
    const { generate303File } = await import('../../../fiscalModelsUtils.js');
    await waitFor(() => expect(generate303File).toHaveBeenCalled());
    expect(toastsFor(toast, 'fm.gen303.error.generic')).toBe(0);
    expect(toastsFor(toast, 'fm.gen303.error.iban_required')).toBe(0);
  });
});
