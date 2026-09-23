import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';

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
// PresentModal stand-in: one click confirms the manual "sin acuse" path.
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: ({ onConfirm }) => React.createElement(
    'button', { 'data-testid': 'confirm-present', onClick: () => onConfirm({ status: 'submitted' }) }, 'confirm'
  ),
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
import { toast } from 'sonner';

const decl = {
  id: 'decl-303-rollback', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: { boxes: { 27: 10 }, summary: { accrued: 10, deductible: 0, result: 10 }, sources: [] },
  boxes: null, sources: [], history: [],
  manualData: { identification: { tipo_declaracion: 'I' }, manualOverrides: {} },
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

// ETP-5438 — the backend rejects a presentation whose submission snapshot it cannot compute and
// writes nothing. The page must roll its optimistic "Presentado" back and say so.
describe('FmModel303Page — rejected presentation rolls back (ETP-5438)', () => {
  it('restores the draft action bar and toasts fm.action.present_error when the PUT fails', async () => {
    const onStatusChange = vi.fn().mockResolvedValue({ ok: false, error: 'http_500' });
    render(<FmModel303Page decl={decl} onBack={vi.fn()} onStatusChange={onStatusChange} token="tok" apiBaseUrl="/api" />);

    fireEvent.click(screen.getByText('fm.action.submit'));
    fireEvent.click(await screen.findByTestId('confirm-present'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('fm.action.present_error'));
    expect(onStatusChange).toHaveBeenCalledWith('decl-303-rollback', 'submitted', 'manual_no_receipt');
    expect(screen.getByText('fm.action.submit')).toBeTruthy();
  });

  it('keeps the submitted state when the PUT succeeds', async () => {
    const onStatusChange = vi.fn().mockResolvedValue({ ok: true });
    render(<FmModel303Page decl={decl} onBack={vi.fn()} onStatusChange={onStatusChange} token="tok" apiBaseUrl="/api" />);

    fireEvent.click(screen.getByText('fm.action.submit'));
    fireEvent.click(await screen.findByTestId('confirm-present'));

    await waitFor(() => expect(onStatusChange).toHaveBeenCalled());
    await new Promise(r => setTimeout(r, 0));
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByText('fm.action.submit')).toBeNull();
  });
});
