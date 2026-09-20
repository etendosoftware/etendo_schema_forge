// ETP-5409 (bug 2) — FmModel303Page.jsx's parseBoxInput now rounds a manually-typed box
// value through the shared `roundEur` (Math.round(n*100)/100) before it lands in
// manualOverrides/liveBoxes, instead of returning the raw unrounded parseFloat result.
// `null` is still returned for unparseable input, unchanged.
//
// `parseBoxInput` itself is module-private (not exported) — this exercises it through the
// same `handleBoxChange` commit path exposed by the mocked FmBoxes303.jsx, following the
// harness established in FmModel303Page.box78Clamp.vitest.jsx.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
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
  KpiWidget: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null, IncidentsTab: () => null, HistoryTab: () => null,
}));

// Exposes `onBoxChange` via a plain input (one per box under test) and dumps the `boxes`
// prop `handleBoxChange` produced as JSON, so a test can read back the exact committed
// (rounded) value for any box number without depending on FmBoxes303's own edit-mode UI.
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ boxes, onBoxChange }) => {
    const arr = Array.isArray(boxes)
      ? boxes
      : (boxes && typeof boxes === 'object' ? Object.entries(boxes).map(([n, v]) => ({ num: Number(n), value: v })) : []);
    return React.createElement(
      'div',
      { 'data-testid': 'fm-boxes-303' },
      React.createElement('pre', { 'data-testid': 'boxes-json' }, JSON.stringify(arr)),
      React.createElement('input', { 'data-testid': 'commit-76', onChange: (e) => onBoxChange(76, e.target.value) }),
    );
  },
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null,
  FileGenModal303: () => null,
}));
vi.mock('../AeatSubmitFlow.jsx', () => ({
  default: () => null,
  isMissingDefaultIaeActivity: () => false,
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
import { roundEur } from '../../../fiscalModelsUtils.js';

const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
  identification: { tipo_declaracion: 'N' },
};

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
};

/** Reads back box `num`'s committed value from the mocked FmBoxes303's `boxes` dump. */
function boxValue(num) {
  const arr = JSON.parse(screen.getByTestId('boxes-json').textContent);
  const entry = arr.find((b) => b.num === num);
  return entry ? entry.value : undefined;
}

function commit(boxNum, rawValue) {
  fireEvent.change(screen.getByTestId(`commit-${boxNum}`), { target: { value: rawValue } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FmModel303Page — manual box entry is rounded to 2 decimals (ETP-5409, bug 2)', () => {
  it('rounds a manually-typed value with 3 decimals to 2 decimals (12.345 -> 12.35)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(76, '12.345');

    expect(boxValue(76)).toBe(roundEur(12.345));
    expect(boxValue(76)).toBe(12.35);
  });

  it('rounds a comma-decimal manually-typed value (parseBoxInput replaces , with .)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(76, '12,345');

    expect(boxValue(76)).toBe(roundEur(12.345));
    expect(boxValue(76)).toBe(12.35);
  });

  it('leaves an already-2-decimal value unchanged', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(76, '99.99');

    expect(boxValue(76)).toBe(99.99);
  });

  it('rounds a value with many trailing decimals (12.126 -> 12.13)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(76, '12.126');

    expect(boxValue(76)).toBe(roundEur(12.126));
    expect(boxValue(76)).toBe(12.13);
  });

  it('unparseable input still resolves to null (box removed), unaffected by the rounding change', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(76, 'not-a-number');

    expect(boxValue(76)).toBeUndefined();
  });
});
