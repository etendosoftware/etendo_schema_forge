// ETP-5338 pt.2 (cycle 3) — box78 is auto-clamped to box110 instead of merely warning.
//
// box78 ("cuotas de periodos anteriores que se compensan en esta declaracion") can never
// legitimately exceed box110 ("cuotas pendientes de compensar de periodos anteriores"). This
// commit (bb4dacde7) replaces the advisory `Banner` from the previous iteration (git history at
// 75b033d0c) with a structural clamp inside `FmModel303Page.jsx`'s `handleBoxChange` — the single
// commit path used by every editable box in `FmBoxes303.jsx` (`onBoxChange` fires from the box
// input's `onBlur`/Enter).
//
// `FmBoxes303.jsx` is mocked here to a thin shell that exposes `onBoxChange` directly and dumps
// the `boxes` prop it was handed, so these tests exercise `handleBoxChange` itself — the clamp
// math and the `manualOverrides`/`liveBoxes` bookkeeping — without depending on the real box
// grid's edit-mode UI (covered separately, alongside the removed-Banner regression and the
// casilla-87 sanity check, in FmModel303Page.box78ClampIntegration.vitest.jsx).
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

// Exposes `onBoxChange` via two plain inputs (one per box under test) and dumps the `boxes`
// prop `handleBoxChange` produced as JSON, so a test can read back the exact committed value
// for any box number without depending on FmBoxes303's own edit-mode UI.
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ boxes, onBoxChange }) => {
    const arr = Array.isArray(boxes)
      ? boxes
      : (boxes && typeof boxes === 'object' ? Object.entries(boxes).map(([n, v]) => ({ num: Number(n), value: v })) : []);
    return React.createElement(
      'div',
      { 'data-testid': 'fm-boxes-303' },
      React.createElement('pre', { 'data-testid': 'boxes-json' }, JSON.stringify(arr)),
      React.createElement('input', { 'data-testid': 'commit-78', onChange: (e) => onBoxChange(78, e.target.value) }),
      React.createElement('input', { 'data-testid': 'commit-110', onChange: (e) => onBoxChange(110, e.target.value) }),
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
import { computeBoxes303 } from '../../../fiscalModelsUtils.js';

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

afterEach(() => {
  computeBoxes303.mockResolvedValue(null);
});

describe('FmModel303Page — box78 auto-clamped to box110 (ETP-5338 pt.2, cycle 3)', () => {
  it('clamps box78 down to box110 when the typed value would exceed it', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(110, '500');
    commit(78, '900');

    expect(boxValue(78)).toBe(500);
    expect(boxValue(110)).toBe(500);
  });

  it('accepts box78 as typed when it does not exceed box110', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(110, '500');
    commit(78, '200');

    expect(boxValue(78)).toBe(200);
  });

  it('accepts box78 as typed when box110 is blank/absent — nothing to clamp against', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(78, '900');

    expect(boxValue(78)).toBe(900);
    expect(boxValue(110)).toBeUndefined();
  });

  it('re-clamps an already-larger box78 when box110 is subsequently lowered', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    // box110=800, box78=500 — valid at the time, no clamp.
    commit(110, '800');
    commit(78, '500');
    expect(boxValue(78)).toBe(500);

    // Lowering box110 below the already-committed box78 must re-clamp box78 downward too.
    commit(110, '300');

    expect(boxValue(78)).toBe(300);
    expect(boxValue(110)).toBe(300);
  });

  it('derives box69/71 from the CLAMPED box78, not the raw pre-clamp value (f06e2e378)', () => {
    // box110=500, commit box78=900 -> box78 clamps to 500 in the SAME commit. With every other
    // input at 0/default, box69 = box66(0) + box77(0) - box78 + box68(0) + box108(0), so a
    // correctly-clamped box78=500 yields box69=box71=-500. Before f06e2e378, applyBoxChange's
    // first recomputeDerivedBoxes pass ran against the un-clamped box78=900, so box69/71 were
    // wrongly -900 until a second, unrelated edit happened to self-heal them.
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(110, '500');
    commit(78, '900');

    expect(boxValue(78)).toBe(500);
    expect(boxValue(69)).toBe(-500);
    expect(boxValue(71)).toBe(-500);
    expect(boxValue(69)).not.toBe(-900);
    expect(boxValue(71)).not.toBe(-900);
  });

  it('re-derives box69/71 from the re-clamped box78 in the same commit that lowers box110', () => {
    // box78=900 committed while box110=1000 is still valid (no clamp yet) -> box69=box71=-900.
    // Lowering box110 to 500 must re-clamp box78 to 500 AND recompute box69/71 to -500 in that
    // SAME commit, with no third edit needed for the derived boxes to self-heal.
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(110, '1000');
    commit(78, '900');
    expect(boxValue(78)).toBe(900);
    expect(boxValue(69)).toBe(-900);
    expect(boxValue(71)).toBe(-900);

    commit(110, '500');

    expect(boxValue(78)).toBe(500);
    expect(boxValue(110)).toBe(500);
    expect(boxValue(69)).toBe(-500);
    expect(boxValue(71)).toBe(-500);
    expect(boxValue(69)).not.toBe(-900);
    expect(boxValue(71)).not.toBe(-900);
  });

  it('does NOT raise a previously-clamped box78 back up when box110 is subsequently raised (QA — final validation)', () => {
    // box110=500 clamps a typed box78=900 down to 500. Raising box110 to 800 afterwards must
    // leave box78 at its clamped 500 — the reactive check only ever clamps box78 DOWN when
    // box110 drops below it; it must never invent a higher box78 just because more headroom
    // became available. Only a fresh, explicit edit of box78 itself may raise it again.
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(110, '500');
    commit(78, '900');
    expect(boxValue(78)).toBe(500);

    commit(110, '800');

    expect(boxValue(78)).toBe(500);
    expect(boxValue(78)).not.toBe(800);
    expect(boxValue(110)).toBe(800);
  });

  it('is idempotent under repeated commits — no drift/oscillation from re-committing the same over-limit box78 or repeatedly lowering box110 (QA — final validation)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(110, '500');
    commit(78, '900');
    expect(boxValue(78)).toBe(500);

    // Re-committing the same raw over-limit value must land on the same clamped result, not
    // drift further (e.g. re-clamping against an already-clamped 500 instead of the raw 900).
    commit(78, '900');
    expect(boxValue(78)).toBe(500);
    commit(78, '900');
    expect(boxValue(78)).toBe(500);

    // Lowering box110 twice in a row must monotonically re-clamp box78 each time with no
    // oscillation back up.
    commit(110, '300');
    expect(boxValue(78)).toBe(300);
    commit(110, '200');
    expect(boxValue(78)).toBe(200);
    expect(boxValue(110)).toBe(200);
  });

  it('pins the clamped box78 into manualOverrides so a later "Calcular" recompute does not resurrect the un-clamped value', async () => {
    // Simulates a backend recompute that would (wrongly) resurrect box78=999 — the clamp's
    // `manualOverrides[78]` pin must win over whatever the backend returns for that box.
    computeBoxes303.mockResolvedValue({
      boxes: { 110: 500, 78: 999 },
      summary: {},
      sources: [],
    });
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(110, '500');
    commit(78, '900');
    expect(boxValue(78)).toBe(500);

    fireEvent.click(
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('fm.action.compute')),
    );

    await waitFor(() => {
      expect(boxValue(78)).toBe(500);
    });
    expect(boxValue(78)).not.toBe(999);
  });
});
