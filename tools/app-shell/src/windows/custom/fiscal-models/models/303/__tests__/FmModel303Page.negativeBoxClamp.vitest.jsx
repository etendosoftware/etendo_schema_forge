// ETP-5393 Bug C — boxes 111 (Rectificación – Importe) and 77 (IVA a la importación liquidado
// por la Aduana pendiente de ingreso) can never be negative: the classic AEAT303Report engine
// hard-rejects a negative value for either at file-generation time
// (AEAT303Report2024.java:276-278 / AEAT303Report2015.java:149-162), but Go's on-screen
// previsualización had no equivalent check at all. `handleBoxChange` in FmModel303Page.jsx now
// clamps a negative commit on either box to 0 and surfaces an i18n toast error — same
// "make the invalid state structurally impossible" approach as the pre-existing box78/box110
// clamp (see FmModel303Page.box78Clamp.vitest.jsx), which this test file's scaffold mirrors.
//
// ETP-5431 pt.2 — boxes 109 (devoluciones_at) and 70 (a_deducir) joined the same
// `NEGATIVE_NOT_ALLOWED_BOXES` set, reusing this exact clamp+toast mechanism (no new code).
// The two former box-111 cases below ("clamps a negative box111 commit to 0" / "accepts a
// positive box111 value unchanged") are gone: box 111 is no longer user-typed at all — it is
// now autocompleted from boxes 69/70/71 (`computeBox111`, see `fm303Layouts.computeBox111.
// vitest.js` and `FmModel303Page.box111Autocomplete.vitest.jsx`), and `recomputeDerivedBoxes`
// unconditionally overwrites whatever this harness's `commit-111` input sends with that
// formula's result — so asserting a literal committed value for box 111 here no longer reflects
// what the UI does. The clamp MECHANISM these two cases actually exercised (negative commit on
// a `NEGATIVE_NOT_ALLOWED_BOXES` member -> clamped to 0 + toast; positive commit -> accepted
// unchanged) is preserved below, replayed on boxes 109 and 70 instead — the two boxes this
// ticket actually added to the set.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const navigateMock = vi.fn();
const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn() } }));
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

// Exposes `onBoxChange` via one input per box under test and dumps the `boxes` prop
// `handleBoxChange` produced, so the test reads back the exact committed value.
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ boxes, onBoxChange }) => {
    const arr = Array.isArray(boxes)
      ? boxes
      : (boxes && typeof boxes === 'object' ? Object.entries(boxes).map(([n, v]) => ({ num: Number(n), value: v })) : []);
    return React.createElement(
      'div',
      { 'data-testid': 'fm-boxes-303' },
      React.createElement('pre', { 'data-testid': 'boxes-json' }, JSON.stringify(arr)),
      React.createElement('input', { 'data-testid': 'commit-111', onChange: (e) => onBoxChange(111, e.target.value) }),
      React.createElement('input', { 'data-testid': 'commit-77', onChange: (e) => onBoxChange(77, e.target.value) }),
      React.createElement('input', { 'data-testid': 'commit-27', onChange: (e) => onBoxChange(27, e.target.value) }),
      // ETP-5431 pt.2 — boxes 109/70 joined NEGATIVE_NOT_ALLOWED_BOXES.
      React.createElement('input', { 'data-testid': 'commit-109', onChange: (e) => onBoxChange(109, e.target.value) }),
      React.createElement('input', { 'data-testid': 'commit-70', onChange: (e) => onBoxChange(70, e.target.value) }),
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
  vi.clearAllMocks();
});

describe('FmModel303Page — negative value rejected on boxes 111 and 77 (ETP-5393 Bug C)', () => {
  it('clamps a negative box109 (Devoluciones en tramitación) commit to 0 (ETP-5431 pt.2)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(109, '-500');

    expect(boxValue(109)).toBe(0);
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('accepts a positive box109 value unchanged (ETP-5431 pt.2)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(109, '250');

    expect(boxValue(109)).toBe(250);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('clamps a negative box70 (A deducir) commit to 0 (ETP-5431 pt.2)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(70, '-500');

    expect(boxValue(70)).toBe(0);
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('accepts a positive box70 value unchanged (ETP-5431 pt.2)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(70, '250');

    expect(boxValue(70)).toBe(250);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('clamps a negative box77 (IVA importación Aduana) commit to 0', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(77, '-12.34');

    expect(boxValue(77)).toBe(0);
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('accepts a zero box77 value unchanged', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(77, '0');

    expect(boxValue(77)).toBe(0);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('does not clamp a negative value on a box outside the negative-not-allowed set (e.g. 27)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(27, '-100');

    expect(boxValue(27)).toBe(-100);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  // ETP-5431 pt.2 — ordering dependency between Rule B's box70 clamp and Rule A's box111
  // formula: `recomputeDerivedBoxes` always reads box70 AFTER `handleBoxChange` has already
  // clamped a negative commit to 0, never the raw negative value. Box 27 (declared VAT,
  // negative-allowed, exposed by this same harness) drives box69 negative with nothing else
  // set (box69 = box66 + box77 - box78 + box68 + box108, and box66 collapses to box27 here) —
  // computeBox111's "box69 negative" branch then returns box70 verbatim. If the clamp ran
  // AFTER (or never), box111 would come out -300 (a negative rectification amount, itself an
  // invalid AEAT value); by construction it must come out exactly 0 instead.
  it('a negative box70 commit is clamped BEFORE box111 is recomputed from it (ordering guarantee)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(27, '-500'); // box69 = -500 (< 0) — arms computeBox111's "box69 negative" branch.
    commit(70, '-300'); // would make box71 = -500 - (-300) = -200 < 0 if left unclamped too.

    expect(toastErrorMock).toHaveBeenCalled();
    expect(boxValue(70)).toBe(0); // Rule B clamp applied.
    expect(boxValue(111)).toBe(0); // Rule A formula read the ALREADY-clamped box70, never -300.
  });
});
