// Additional Vitest tests for FmModel349Page — rendering, tabs, status, key filter
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('../../../fiscalModelsUtils.js', () => ({
  formatAmount: (n) => (n == null ? '—' : String(n)),
  compute349Operators: vi.fn().mockResolvedValue(null),
  generate349File: vi.fn().mockResolvedValue({ ok: false }),
}));
vi.mock('../use349Pdf.js', () => ({
  use349Pdf: () => ({
    pdfUrl: null,
    loading: false,
    generatePdf: vi.fn().mockResolvedValue(null),
    clearPdf: vi.fn(),
  }),
}));
vi.mock('../../../FmCommon.jsx', () => ({
  StatusPillMenu: () => null,
  MoreOptionsMenu: () => null,
  KpiWidget: ({ value, label }) => React.createElement(
    'div',
    { className: 'test-kpi349' },
    React.createElement('span', { className: 'test-kpi349-label' }, label),
    React.createElement('span', { className: 'test-kpi349-value' }, value)
  ),
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
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null,
  IncidentsTab: () => null,
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  // Exposes an "invoke onConfirm" button so tests can drive `handleGenerate`
  // (and thus the `generating` state) without depending on the modal's own UI.
  FileGenModal: ({ onConfirm }) => React.createElement(
    'div',
    { 'data-testid': 'FileGenModal-mock' },
    'filegen-modal',
    React.createElement(
      'button',
      { 'data-testid': 'filegen349-confirm', onClick: () => onConfirm?.({ phone: '', contact: '' }) },
      'confirm-filegen',
    ),
    // Fires onConfirm with the full 8-key payload the real FileGenModal now produces,
    // so tests can verify handleGenerate threads every field through unmodified.
    React.createElement(
      'button',
      {
        'data-testid': 'filegen349-confirm-full',
        onClick: () => onConfirm?.({
          fileName: 'my_349_file',
          phone: '600111222',
          contact: 'Jane Doe',
          substitutive: true,
          formerStatement: '1234567890123',
          representativeTaxId: 'X1234567L',
          navarra: true,
          guipuzcoa: false,
        }),
      },
      'confirm-filegen-full',
    ),
  ),
}));
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
  OctagonAlert: () => null, ArrowLeft: () => null, FileText: () => null,
  Star: () => null, ArrowUpRight: () => null, Loader2: () => null, X: () => null, Check: () => null,
  FileCheck: () => null,
}));

import FmModel349Page from '../FmModel349Page.jsx';

const makeDecl = (overrides = {}) => ({
  id: 'decl-349', model: '349', year: 2026, period: 'T1',
  type: 'ord', status: 'pending', nif: 'B12345678',
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

beforeEach(() => vi.clearAllMocks());

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('FmModel349Page — rendering', () => {
  it('renders without crashing', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(document.body).toBeTruthy();
  });

  it('shows model 349 label', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(document.body.textContent).toContain('349');
  });

  it('shows year in header', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(document.body.textContent).toContain('2026');
  });

  it('renders the tab bar', () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(container.querySelector('[role="tablist"]')).toBeTruthy();
  });

  it('renders KPI cards', () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(container.querySelectorAll('.test-kpi349').length).toBeGreaterThan(0);
  });
});

// ── KPI values ────────────────────────────────────────────────────────────────

describe('FmModel349Page — KPI values', () => {
  it('shows 0 operator count initially when no operators', () => {
    render(<FmModel349Page decl={makeDecl({ operators: [] })} {...defaultProps} />);
    const values = document.querySelectorAll('.test-kpi349-value');
    expect(values[0].textContent).toBe('0');
  });

  it('shows operator count from _precomputed', () => {
    const ops = [
      { id: 1, nif: 'IT12345678901', name: 'Test', key: 'A', base: 100, vies: 'valid' },
      { id: 2, nif: 'FR40123456789', name: 'Test2', key: 'E', base: 200, vies: 'valid' },
    ];
    render(<FmModel349Page decl={makeDecl({ _precomputed: { operators: ops } })} {...defaultProps} />);
    const values = document.querySelectorAll('.test-kpi349-value');
    expect(values[0].textContent).toBe('2');
  });

  it('KPI totalBase is 0 when no operators', () => {
    render(<FmModel349Page decl={makeDecl({ operators: [] })} {...defaultProps} />);
    const values = document.querySelectorAll('.test-kpi349-value');
    // Index 1 = totalBase = formatAmount(0) = "0"
    expect(values[1].textContent).toBe('0');
  });

  it('shows VIES pending count', () => {
    const ops = [
      { id: 1, nif: 'IT123', name: 'A', key: 'A', base: 100, vies: 'pending' },
      { id: 2, nif: 'FR123', name: 'B', key: 'E', base: 200, vies: 'valid' },
    ];
    render(<FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />);
    const values = document.querySelectorAll('.test-kpi349-value');
    // Index 3 = viesPending = "1"
    expect(values[3].textContent).toBe('1');
  });
});

// ── Submit button ────────────────────────────────────────────────────────────

describe('FmModel349Page — submit button', () => {
  it('renders present button for non-submitted declarations', () => {
    render(<FmModel349Page decl={makeDecl({ status: 'draft' })} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    expect(btns.some(b => b.textContent.includes('fm.action.present'))).toBe(true);
  });

  it('does not render present button for submitted_ack declarations', () => {
    render(<FmModel349Page decl={makeDecl({ status: 'submitted_ack' })} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    expect(btns.some(b => b.textContent.includes('fm.action.present'))).toBe(false);
  });
});

// ── Calcular button ──────────────────────────────────────────────────────────

describe('FmModel349Page — Calcular button', () => {
  it('renders the Calcular button for a non-submitted status (draft)', async () => {
    render(<FmModel349Page decl={makeDecl({ status: 'draft' })} {...defaultProps} />);
    // The mount-time auto-compute (ETP-4755) fires immediately since this
    // declaration has no precomputed data, flipping the button to its
    // "computing" (busy) label. Wait for it to settle back to idle before
    // asserting on the idle "fm.action.compute" label — otherwise the
    // assertion races the auto-fired compute call.
    await waitFor(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      expect(btns.some(b => b.textContent.includes('fm.action.compute'))).toBe(true);
    });
  });

  it('hides the Calcular button for a submitted status, while Cancelar and Generar fichero 349 remain', () => {
    render(<FmModel349Page decl={makeDecl({ status: 'submitted' })} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    expect(btns.some(b => b.textContent.includes('fm.action.compute'))).toBe(false);
    expect(btns.some(b => b.textContent.includes('fm.action.cancel'))).toBe(true);
    expect(btns.some(b => b.textContent.includes('fm.action.gen349'))).toBe(true);
  });

  it('hides the Calcular button for a submitted_ack status, while Cancelar and Generar fichero 349 remain', () => {
    render(<FmModel349Page decl={makeDecl({ status: 'submitted_ack' })} {...defaultProps} />);
    const btns = Array.from(document.querySelectorAll('button'));
    expect(btns.some(b => b.textContent.includes('fm.action.compute'))).toBe(false);
    expect(btns.some(b => b.textContent.includes('fm.action.cancel'))).toBe(true);
    expect(btns.some(b => b.textContent.includes('fm.action.gen349'))).toBe(true);
  });
});

// ── Operator table ───────────────────────────────────────────────────────────

describe('FmModel349Page — operator table', () => {
  const ops = [
    { id: 1, nif: 'IT12345678901', name: 'Bramini', key: 'A', base: 1000, vies: 'valid' },
    { id: 2, nif: 'FR40123456789', name: 'Olives', key: 'E', base: 500, vies: 'valid' },
  ];

  it('renders table rows for each operator', () => {
    const { container } = render(
      <FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />
    );
    expect(container.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('renders NIF column for each operator', () => {
    render(<FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />);
    expect(document.body.textContent).toContain('IT12345678901');
    expect(document.body.textContent).toContain('FR40123456789');
  });

  it('renders operator names', () => {
    render(<FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />);
    expect(document.body.textContent).toContain('Bramini');
    expect(document.body.textContent).toContain('Olives');
  });
});

// ── Key filter ───────────────────────────────────────────────────────────────

describe('FmModel349Page — key filter', () => {
  const ops = [
    { id: 1, nif: 'IT123', name: 'A-op', key: 'A', base: 100, vies: 'valid' },
    { id: 2, nif: 'FR123', name: 'E-op', key: 'E', base: 200, vies: 'valid' },
    { id: 3, nif: 'DE123', name: 'S-op', key: 'S', base: 300, vies: 'valid' },
  ];

  it('shows all operators with "all" key filter (default)', () => {
    const { container } = render(
      <FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />
    );
    expect(container.querySelectorAll('tbody tr').length).toBe(3);
  });
});

// ── VIES banner ───────────────────────────────────────────────────────────────

describe('FmModel349Page — VIES banner', () => {
  it('shows VIES banner when there are pending operators', () => {
    const ops = [{ id: 1, nif: 'IT123', name: 'A', key: 'A', base: 100, vies: 'pending' }];
    render(<FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />);
    expect(document.body.textContent).toContain('fm.m349.banner.vies_title');
  });

  it('does not show VIES banner when all operators have valid VIES', () => {
    const ops = [{ id: 1, nif: 'IT123', name: 'A', key: 'A', base: 100, vies: 'valid' }];
    render(<FmModel349Page decl={makeDecl({ operators: ops })} {...defaultProps} />);
    expect(document.body.textContent).not.toContain('fm.m349.banner.vies_title');
  });
});

// ── TotalsCard ────────────────────────────────────────────────────────────────

describe('FmModel349Page — totals card', () => {
  it('renders the totals card title', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(document.body.textContent).toContain('fm.m349.totals.title');
  });

  it('renders total rows for each KEY_ID (E, S, A, I)', () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const rows = container.querySelectorAll('.fm-349-total-row');
    expect(rows.length).toBe(4); // E, S, A, I
  });
});

// ── Kebab / MoreOptionsMenu ──────────────────────────────────────────────────
// The old MoreOptionsMenu349 (VIES + Vista previa PDF) was removed from this
// page. PDF preview machinery (use349Pdf, DocumentPreview, showPdf) went with
// it; Generar fichero already lives in its own standalone action-bar button
// (see describe block below). A NEW, functional MoreOptionsMenu (favorites +
// help) was added later (ETP-4755) — since FmCommon.jsx is mocked wholesale at
// the top of this file, its real behavior is covered directly in
// FmCommon.vitest.jsx instead.

// ── Standalone "Generar fichero" action-bar button ─────────────────────────────

describe('FmModel349Page — standalone Generar fichero button', () => {
  it('renders a standalone "Generar fichero" button in the action bar', () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const btns = Array.from(container.querySelectorAll('button'));
    expect(btns.some(b => b.textContent.includes('fm.action.gen349'))).toBe(true);
  });

  it('clicking it opens the file-gen modal', () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const btns = Array.from(container.querySelectorAll('button'));
    const genBtn = btns.find(b => b.textContent.includes('fm.action.gen349'));
    expect(screen.queryByTestId('FileGenModal-mock')).toBeNull();
    fireEvent.click(genBtn);
    expect(screen.getByTestId('FileGenModal-mock')).toBeTruthy();
  });

  it('is visible and functional when the declaration is already submitted', () => {
    const { container } = render(<FmModel349Page decl={makeDecl({ status: 'submitted' })} {...defaultProps} />);
    const btns = Array.from(container.querySelectorAll('button'));
    const genBtn = btns.find(b => b.textContent.includes('fm.action.gen349'));
    expect(genBtn).toBeTruthy();
    fireEvent.click(genBtn);
    expect(screen.getByTestId('FileGenModal-mock')).toBeTruthy();
  });

  it('is visible and functional when the declaration is not submitted (pending)', () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const btns = Array.from(container.querySelectorAll('button'));
    const genBtn = btns.find(b => b.textContent.includes('fm.action.gen349'));
    expect(genBtn).toBeTruthy();
    fireEvent.click(genBtn);
    expect(screen.getByTestId('FileGenModal-mock')).toBeTruthy();
  });

  it('disables the standalone "Generar fichero" button while generation is in flight, re-enables after it settles', async () => {
    let resolveGenerate;
    const { generate349File } = await import('../../../fiscalModelsUtils.js');
    generate349File.mockImplementation(() => new Promise((resolve) => { resolveGenerate = resolve; }));

    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const genBtn = () => Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.gen349'));
    fireEvent.click(genBtn());
    expect(genBtn().disabled).toBe(false);

    fireEvent.click(screen.getByTestId('filegen349-confirm'));
    await waitFor(() => expect(genBtn().disabled).toBe(true));

    await act(async () => { resolveGenerate({ ok: true }); await Promise.resolve(); });
    await waitFor(() => expect(genBtn().disabled).toBe(false));
  });

  it('threads the full 8-key onConfirm payload from FileGenModal into generate349File unmodified', async () => {
    const { generate349File } = await import('../../../fiscalModelsUtils.js');
    generate349File.mockResolvedValue({ ok: true });

    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const genBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.gen349'));
    fireEvent.click(genBtn);

    fireEvent.click(screen.getByTestId('filegen349-confirm-full'));

    await waitFor(() => expect(generate349File).toHaveBeenCalled());
    expect(generate349File).toHaveBeenCalledWith(
      makeDecl(),
      expect.objectContaining({
        token: 'tok',
        apiBaseUrl: '/api',
        fileName: 'my_349_file',
        phone: '600111222',
        contact: 'Jane Doe',
        substitutive: true,
        formerStatement: '1234567890123',
        representativeTaxId: 'X1234567L',
        navarra: true,
        guipuzcoa: false,
      }),
    );
  });
});

// ── Generate error toast (ETP-5027) ────────────────────────────────────────
// The page-level error banner was replaced by a sonner toast, matching the
// rectification save errors on the invoice. The assertions therefore go
// through the mocked `toast.error` instead of the rendered DOM.

describe('FmModel349Page — generate error toast', () => {
  it('toasts the backend serverMessage when generate349File fails with one', async () => {
    const { toast } = await import('sonner');
    const { generate349File } = await import('../../../fiscalModelsUtils.js');
    generate349File.mockResolvedValue({
      ok: false, error: 'http_400', serverMessage: 'AEAT349_FormerStatement_Required',
    });

    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const genBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.gen349'));
    fireEvent.click(genBtn);
    fireEvent.click(screen.getByTestId('filegen349-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('AEAT349_FormerStatement_Required'));
  });

  it('falls back to the fm.gen349.error.generic key when generate349File fails without a serverMessage', async () => {
    const { toast } = await import('sonner');
    const { generate349File } = await import('../../../fiscalModelsUtils.js');
    generate349File.mockResolvedValue({ ok: false });

    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const genBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.gen349'));
    fireEvent.click(genBtn);
    fireEvent.click(screen.getByTestId('filegen349-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.gen349.error.generic'));
  });

  it('emits exactly one toast per failure and does not re-emit when the modal is reopened', async () => {
    const { toast } = await import('sonner');
    const { generate349File } = await import('../../../fiscalModelsUtils.js');
    generate349File.mockResolvedValue({ ok: false, serverMessage: 'Boom validation error' });

    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const genBtn = () => Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.gen349'));

    fireEvent.click(genBtn());
    fireEvent.click(screen.getByTestId('filegen349-confirm'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Boom validation error'));
    // Count only OUR message: useAttachments also toasts in this unmocked-fetch env.
    const genToasts = () => toast.error.mock.calls.filter(c => c[0] === 'Boom validation error').length;
    expect(genToasts()).toBe(1);

    // Reopening the modal is not a failure event — no second toast.
    fireEvent.click(genBtn());
    expect(genToasts()).toBe(1);
  });
});

// ── No Historial tab ────────────────────────────────────────────────────────────

describe('FmModel349Page — no Historial tab', () => {
  it('does not render a "Historial" tab', () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(container.textContent).not.toContain('fm.tab.history');
  });
});
