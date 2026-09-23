import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';

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
// PresentModal stand-in: one click confirms the manual "sin acuse" path.
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: ({ onConfirm }) => React.createElement(
    'button', { 'data-testid': 'confirm-present', onClick: () => onConfirm({ status: 'submitted' }) }, 'confirm'
  ),
  FileGenModal: () => null,
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
import { toast } from 'sonner';

const decl = {
  id: 'decl-349-rollback', model: '349', year: 2026, period: 'T1',
  type: 'ord', status: 'draft', nif: 'B12345678',
  operators: [], invoices: [], rectifications: 0,
  incidents: { blocking: 0 }, _precomputed: { operators: [], invoices: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

// ETP-5438 — the backend rejects a presentation whose submission snapshot it cannot compute and
// writes nothing. The page must roll its optimistic "Presentado" back and say so.
describe('FmModel349Page — rejected presentation rolls back (ETP-5438)', () => {
  it('restores the draft action bar and toasts fm.action.present_error when the PUT fails', async () => {
    const onStatusChange = vi.fn().mockResolvedValue({ ok: false, error: 'http_500' });
    render(<FmModel349Page decl={decl} onBack={vi.fn()} onStatusChange={onStatusChange} token="tok" apiBaseUrl="/api" />);

    fireEvent.click(screen.getByText('fm.action.present'));
    fireEvent.click(await screen.findByTestId('confirm-present'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.action.present_error'));
    expect(onStatusChange).toHaveBeenCalledWith('decl-349-rollback', 'submitted', 'manual_no_receipt');
    expect(screen.getByText('fm.action.present')).toBeTruthy();
  });

  it('keeps the submitted state when the PUT succeeds', async () => {
    const onStatusChange = vi.fn().mockResolvedValue({ ok: true });
    render(<FmModel349Page decl={decl} onBack={vi.fn()} onStatusChange={onStatusChange} token="tok" apiBaseUrl="/api" />);

    fireEvent.click(screen.getByText('fm.action.present'));
    fireEvent.click(await screen.findByTestId('confirm-present'));

    await waitFor(() => expect(onStatusChange).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 0));
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByText('fm.action.present')).toBeNull();
  });
});
