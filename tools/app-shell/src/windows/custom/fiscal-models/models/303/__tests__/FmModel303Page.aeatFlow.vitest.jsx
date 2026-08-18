// Vitest tests for the ETP-4456 wiring between PresentModal's 4th
// ("aeat_telematic") path and AeatSubmitFlow inside FmModel303Page.jsx.
// Kept in its own file (rather than editing FmModel303Page.vitest.jsx) so
// its PresentModal/AeatSubmitFlow mocks — which need to actually invoke
// callbacks, unlike that file's inert `() => null` mocks — can't affect the
// existing test suite there.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
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
  ResultPill: () => null,
  SummaryCard: () => null,
  Tabs: () => null,
  Banner: () => null,
  SectionCard: () => null,
  EmptyState: () => null,
  KpiWidget: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null, IncidentsTab: () => null, FilesTab: () => null, HistoryTab: () => null,
}));
vi.mock('../FmBoxes303.jsx', () => ({ default: () => null }));
// Explicit per-icon mock (matching FmModel303Page.vitest.jsx's established pattern) rather
// than a catch-all Proxy — a Proxy with only a `get` trap crashed module collection here
// ("Cannot create proxy with a non-object as target or handler"), most likely because some
// property access along Vitest's/Vite's module-interop path (e.g. a well-known symbol or an
// enumeration step) doesn't tolerate a trap that unconditionally returns a function for any
// key. AeatSubmitFlow.jsx is mocked wholesale below, so its own lucide-react imports (Loader2,
// TriangleAlert, OctagonAlert, CircleCheck, Download, Landmark) never execute in this file —
// only FmModel303Page.jsx's own icon imports need stubbing here.
vi.mock('lucide-react', () => ({
  Settings: () => null, Download: () => null, OctagonAlert: () => null,
  TriangleAlert: () => null, CircleCheck: () => null, ArrowLeftRight: () => null,
  Calculator: () => null, Loader2: () => null, MoreVertical: () => null,
  TrendingUp: () => null, TrendingDown: () => null, Clock: () => null,
  ClipboardCheck: () => null, ReceiptText: () => null, Folder: () => null,
  FileCheck: () => null,
}));

// PresentModal mock: renders a button that, when clicked, reports the
// 'aeat_telematic' sentinel status — exactly like selecting the 4th path
// and confirming in the real component.
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

// AeatSubmitFlow mock: exposes a button that triggers onSuccess, so we can
// verify the page reacts to it the same way it reacts to the 3 manual paths.
vi.mock('../AeatSubmitFlow.jsx', () => ({
  default: ({ onSuccess }) => React.createElement(
    'button',
    { 'data-testid': 'aeat-flow-succeed', onClick: () => onSuccess('submitted_ack') },
    'aeat-flow',
  ),
}));

import FmModel303Page from '../FmModel303Page.jsx';

const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
};

beforeEach(() => vi.clearAllMocks());

describe('FmModel303Page — AEAT flow wiring (ETP-4456)', () => {
  it('opens AeatSubmitFlow (instead of changing status) when the aeat_telematic path is confirmed', () => {
    const onStatusChange = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={onStatusChange} />);

    // Open the present modal via the toolbar action.
    const btns = Array.from(document.querySelectorAll('button'));
    const presentBtn = btns.find(b => b.textContent.includes('fm.action.submit'));
    fireEvent.click(presentBtn);

    // Our PresentModal mock immediately reports the aeat_telematic sentinel.
    fireEvent.click(screen.getByTestId('present-confirm-aeat'));

    // The sentinel must NOT have been treated as a real status change.
    expect(onStatusChange).not.toHaveBeenCalled();
    // AeatSubmitFlow must now be mounted.
    expect(screen.getByTestId('aeat-flow-succeed')).toBeInTheDocument();
    // Regression guard: PresentModal must be unmounted, not stacked underneath
    // AeatSubmitFlow — two full-viewport overlays mounted at once, and the
    // stale path-selection screen reappearing when AeatSubmitFlow later
    // closes, is exactly the bug this asserts against.
    expect(screen.queryByTestId('present-confirm-aeat')).not.toBeInTheDocument();
  });

  it('propagates AeatSubmitFlow onSuccess through the normal status-change path', () => {
    const onStatusChange = vi.fn();
    render(<FmModel303Page decl={BASE_DECL} onBack={vi.fn()} onStatusChange={onStatusChange} />);

    const btns = Array.from(document.querySelectorAll('button'));
    fireEvent.click(btns.find(b => b.textContent.includes('fm.action.submit')));
    fireEvent.click(screen.getByTestId('present-confirm-aeat'));
    fireEvent.click(screen.getByTestId('aeat-flow-succeed'));

    expect(onStatusChange).toHaveBeenCalledWith('303-2026-T2', 'submitted_ack');
  });
});
