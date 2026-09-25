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
// PresentModal stand-in: one click picks the AEAT telematic path (opens AeatSubmitFlow).
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: ({ onConfirm }) => React.createElement(
    'button', { 'data-testid': 'confirm-present', onClick: () => onConfirm({ status: 'aeat_telematic' }) }, 'confirm'
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

// AeatSubmitFlow stand-in: one click reports a successful production filing.
vi.mock('../AeatSubmitFlow.jsx', () => ({
  default: ({ onSuccess }) => React.createElement(
    'button', { 'data-testid': 'aeat-success', onClick: () => onSuccess('submitted_ack') }, 'filed'
  ),
  isMissingDefaultIaeActivity: () => false,
}));

import FmModel303Page from '../FmModel303Page.jsx';

const decl = {
  id: 'decl-303-telematic', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: { boxes: { 27: 10 }, summary: { accrued: 10, deductible: 0, result: 10 }, sources: [] },
  boxes: null, sources: [], history: [],
  manualData: { identification: { tipo_declaracion: 'I' }, manualOverrides: {} },
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

// ETP-5438 — the AEAT telematic filing sets submitted_ack server-side. The page must NOT route it
// through onStatusChange (that PUTs the status, and a submitted -> submitted PUT is a 409 from
// rejectRepresentation); it updates locally and asks the parent to refresh via onSubmittedRemotely.
describe('FmModel303Page — AEAT telematic success (ETP-5438)', () => {
  it('never calls onStatusChange, notifies onSubmittedRemotely and freezes the action bar', async () => {
    const onStatusChange = vi.fn();
    const onSubmittedRemotely = vi.fn();
    render(
      <FmModel303Page decl={decl} onBack={vi.fn()} onStatusChange={onStatusChange}
        onSubmittedRemotely={onSubmittedRemotely} token="tok" apiBaseUrl="/api" />
    );

    fireEvent.click(screen.getByText('fm.action.submit'));
    fireEvent.click(await screen.findByTestId('confirm-present'));
    fireEvent.click(await screen.findByTestId('aeat-success'));

    await waitFor(() => expect(onSubmittedRemotely).toHaveBeenCalledWith('decl-303-telematic', 'submitted_ack'));
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(screen.queryByText('fm.action.submit')).toBeNull();
  });
});
