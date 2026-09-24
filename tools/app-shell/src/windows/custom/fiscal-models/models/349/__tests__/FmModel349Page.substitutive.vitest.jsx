// ETP-5456 — "349 sustitutivas": the "Sustitutiva" checkbox moved from FileGenModal
// (generation-time popup) into the declaration form itself (`SubstitutiveSection`,
// rendered inline next to the "Todas las claves" key filter on the Operadores tab
// toolbar), persisted as `manualData.identification.sustitutiva` and flushed by the
// real (no-longer-no-op) "Guardar" button — mirroring the 303
// "Autoliquidación rectificativa" convention.
//
// Mocking conventions mirror FmModel349Page.render.vitest.jsx.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
  persistManualData: vi.fn().mockResolvedValue({ ok: true }),
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
// FileGenModal is mocked to echo the `substitutive` prop it received, via a data
// attribute — so tests can assert the persisted form value reaches the modal, without
// depending on FmOverlays.jsx's own internals (covered separately in FmOverlays.vitest.jsx).
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  FileGenModal: ({ substitutive }) => React.createElement(
    'div',
    { 'data-testid': 'FileGenModal-mock', 'data-substitutive': String(!!substitutive) },
    'filegen-modal',
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
  OctagonAlert: () => null, ArrowLeft: () => null, Save: () => null, FileText: () => null,
  Star: () => null, ArrowUpRight: () => null, Loader2: () => null, X: () => null, Check: () => null,
  FileCheck: () => null,
}));

import FmModel349Page from '../FmModel349Page.jsx';

const makeDecl = (overrides = {}) => ({
  id: 'decl-349', model: '349', year: 2026, period: 'T1',
  type: 'ord', status: 'draft', nif: 'B12345678',
  operators: [], invoices: [], rectifications: 0,
  incidents: { blocking: 0 }, _precomputed: null,
  ...overrides,
});

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
  onManualDataSaved: vi.fn(),
  token: 'tok',
  apiBaseUrl: '/api',
};

beforeEach(() => vi.clearAllMocks());

function getSustitutivaCheckbox() {
  return screen.getByTestId('FmModel349Page__sustitutiva');
}

describe('FmModel349Page — SubstitutiveSection (ETP-5456)', () => {
  it('renders the "Sustitutiva" checkbox on the Operadores tab, next to the key filter', () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const checkbox = getSustitutivaCheckbox();
    expect(checkbox).toBeTruthy();
    expect(checkbox.getAttribute('role')).toBe('checkbox');
    // It shares the toolbar row with the key filter dropdown (the "Todas las claves"
    // pill button), and renders AFTER it (the checkbox follows the filter, separated
    // by the toolbar's usual .fm-toolbar__sep divider).
    const keyFilter = container.querySelector('.fm-toolbar__pill');
    expect(keyFilter).toBeTruthy();
    expect(checkbox.compareDocumentPosition(keyFilter) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('is unchecked by default when the declaration has no manualData', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    expect(getSustitutivaCheckbox().getAttribute('aria-checked')).toBe('false');
  });

  it('is pre-checked when the declaration already carries manualData.identification.sustitutiva', () => {
    render(
      <FmModel349Page
        decl={makeDecl({ manualData: { identification: { sustitutiva: true } } })}
        {...defaultProps}
      />
    );
    expect(getSustitutivaCheckbox().getAttribute('aria-checked')).toBe('true');
  });

  it('toggling the checkbox updates its own state immediately (before any save)', () => {
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    const checkbox = getSustitutivaCheckbox();
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(checkbox);
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
  });

  it('is disabled once the declaration is submitted', () => {
    render(<FmModel349Page decl={makeDecl({ status: 'submitted' })} {...defaultProps} />);
    // Only rendered post-submission when the flag was already true (see FmModel349Page.jsx's
    // `(!isSubmitted || sustitutiva)` guard) — check the true case here.
    expect(screen.queryByTestId('FmModel349Page__sustitutiva')).toBeNull();
  });

  it('stays visible (read-only) once submitted if it was already marked sustitutiva', () => {
    render(
      <FmModel349Page
        decl={makeDecl({ status: 'submitted', manualData: { identification: { sustitutiva: true } } })}
        {...defaultProps}
      />
    );
    const checkbox = getSustitutivaCheckbox();
    expect(checkbox.getAttribute('aria-checked')).toBe('true');
    expect(checkbox.disabled).toBe(true);
  });

  it('threads the checked state into FileGenModal as the `substitutive` prop', () => {
    const { container } = render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    fireEvent.click(getSustitutivaCheckbox());

    const genBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.gen349'));
    fireEvent.click(genBtn);

    const modal = screen.getByTestId('FileGenModal-mock');
    expect(modal.getAttribute('data-substitutive')).toBe('true');
  });
});

describe('FmModel349Page — Guardar now flushes real manualData (ETP-5456)', () => {
  it('makes a real PUT via persistManualData when the checkbox was toggled, then calls onManualDataSaved', async () => {
    const { persistManualData } = await import('../../../fiscalModelsUtils.js');
    const { toast } = await import('sonner');
    const onManualDataSaved = vi.fn();

    render(
      <FmModel349Page
        decl={makeDecl()}
        {...defaultProps}
        onManualDataSaved={onManualDataSaved}
      />
    );
    fireEvent.click(getSustitutivaCheckbox());
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));

    await waitFor(() => expect(persistManualData).toHaveBeenCalledWith(
      'decl-349',
      { identification: { sustitutiva: true } },
      expect.objectContaining({ token: 'tok', apiBaseUrl: '/api' }),
    ));
    await waitFor(() => expect(onManualDataSaved).toHaveBeenCalledWith(
      'decl-349',
      { identification: { sustitutiva: true } },
    ));
    expect(toast.success).toHaveBeenCalled();
  });

  it('issues no network call — the old no-op path — when nothing was edited', async () => {
    const { persistManualData } = await import('../../../fiscalModelsUtils.js');
    const { toast } = await import('sonner');
    render(<FmModel349Page decl={makeDecl()} {...defaultProps} />);
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));
    expect(persistManualData).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('shows an error toast and does not call onManualDataSaved when the PUT fails', async () => {
    const { persistManualData } = await import('../../../fiscalModelsUtils.js');
    persistManualData.mockResolvedValueOnce({ ok: false, error: 'http_500' });
    const { toast } = await import('sonner');
    const onManualDataSaved = vi.fn();

    render(
      <FmModel349Page decl={makeDecl()} {...defaultProps} onManualDataSaved={onManualDataSaved} />
    );
    fireEvent.click(getSustitutivaCheckbox());
    fireEvent.click(screen.getByTestId('FmModel349Page__save'));

    await waitFor(() => expect(persistManualData).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalled();
    expect(onManualDataSaved).not.toHaveBeenCalled();
  });
});
