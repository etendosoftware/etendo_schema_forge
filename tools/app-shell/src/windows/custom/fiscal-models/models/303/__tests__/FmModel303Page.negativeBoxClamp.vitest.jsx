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
import { render, screen, fireEvent, act } from '@testing-library/react';

const navigateMock = vi.fn();
const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn() } }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));

// ETP-5431 [B1 fix, review round 2] — `computeBoxes303` needs to be per-test controllable (not
// a fixed `mockResolvedValue(null)`) so the new "Calcular" scenario below can hand back a
// negative box70 the way the real backend can. Same hoisted-fn pattern as
// FmModel303Page.box111Autocomplete.vitest.jsx.
const computeBoxes303 = vi.fn();
// `persistManualData` deliberately kept REAL (not stubbed) — same convention as
// FmModel303Page.box111Autocomplete.vitest.jsx — so the manualOverrides-clamp assertion below
// reads the ACTUAL PUT body, not an internal ref/flag.
vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    formatPeriod: (p) => p,
    computeBoxes303: (...args) => computeBoxes303(...args),
    generate303File: vi.fn().mockResolvedValue({ ok: false }),
    checkModified303: vi.fn(),
    fetchDeclarationIncidents: vi.fn().mockResolvedValue(null),
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
import { jsonResponse } from '@/test/realApiFetch.js';

const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
  identification: { tipo_declaracion: 'N' },
};

// `boxes: []`/`summary: {}` — not `_precomputed: null` — so the mount effect's own auto-compute
// (ETP-4755) never independently calls `computeBoxes303` before the "Calcular" click does. Same
// convention as FmModel303Page.box111Autocomplete.vitest.jsx.
const CALCULAR_DECL = { ...BASE_DECL, _precomputed: { boxes: [], summary: {}, sources: [] } };

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
};

const TOKEN = 'test-token';
const API_BASE_URL = '/sws/neo/fiscal-models';

function boxValue(num) {
  const arr = JSON.parse(screen.getByTestId('boxes-json').textContent);
  const entry = arr.find((b) => b.num === num);
  return entry ? entry.value : undefined;
}

function commit(boxNum, rawValue) {
  fireEvent.change(screen.getByTestId(`commit-${boxNum}`), { target: { value: rawValue } });
}

function putCalls() {
  return globalThis.fetch.mock.calls.filter(
    ([, options]) => String(options?.method || '').toUpperCase() === 'PUT',
  );
}

function overridesOf(call) {
  return JSON.parse(call[1].body).manualData.manualOverrides;
}

function clickSave() {
  fireEvent.click(screen.getByTestId('FmModel303Page__save'));
}

async function clickCalcular() {
  const btn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.includes('fm.action.compute'));
  await act(async () => {
    fireEvent.click(btn);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function installImmediateServer() {
  globalThis.fetch = vi.fn((_url, options = {}) => Promise.resolve(
    String(options.method || 'GET').toUpperCase() === 'PUT'
      ? jsonResponse({ manualDataApplied: true })
      : jsonResponse({ response: { data: [] } }),
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
  computeBoxes303.mockResolvedValue(null);
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

// ETP-5431 [B1 fix, review round 2] — Alex (REVIEW) rejected the original delivery because the
// clamp above only fired inside `handleBoxChange` (i.e. only for a box70/109 the user TYPED).
// Two real paths never went through `handleBoxChange` at all and could carry a negative box70/109
// straight into `computeBox111`/AEAT submission:
//   1. The "Calcular" flow — `computeBoxes303` (the real backend) can itself return a negative
//      box70/109 in `res.boxes`, with nothing upstream ever clamping it.
//   2. Hydration from a persisted declaration — `manualOverrides` seeded from
//      `decl.manualData.manualOverrides` can carry a negative box70/109 saved before this rule
//      existed (or by any future bug), and the mount effect merges it straight into `liveBoxes`
//      via `applyComputeResult` with no clamp in between.
// The fix moved the clamp into `recomputeDerivedBoxes` itself (`clampNegativeBoxes`, applied to
// its own input first) — the ONE choke point every path already shares — plus a matching
// `clampNegativeOverrides` at `manualOverrides`' hydration, since `applyBoxParams`
// (fiscalModelsUtils.js) reads box 70/109's AEAT param straight off that map, bypassing
// `liveBoxes` entirely. Both cases below reproduce Alex's exact scenarios and assert (a) the
// clamp lands in the displayed `liveBoxes`, and (b) box 111 never comes out negative.
describe('FmModel303Page — box70/109 clamp applies even when handleBoxChange never runs (ETP-5431 B1 fix)', () => {
  it('"Calcular" returning a negative box70 in res.boxes is clamped before box111 is derived', async () => {
    // box27 = -500 drives box69 negative (see the ordering test above for the full chain), and
    // box70 = -300 arrives DIRECTLY from the backend response — never typed, never routed
    // through handleBoxChange's own clamp.
    computeBoxes303.mockResolvedValue({
      boxes: [{ num: 27, value: -500 }, { num: 70, value: -300 }],
      summary: { accrued: 0, deductible: 0, result: 0 },
      sources: [],
    });
    render(<FmModel303Page decl={CALCULAR_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} {...defaultProps} />);

    await clickCalcular();

    expect(boxValue(70)).toBe(0); // clamped by recomputeDerivedBoxes, not by handleBoxChange.
    expect(boxValue(111)).toBe(0); // never negative, despite the -300 the backend returned.
  });

  it('a negative box70 hydrated from a persisted manualOverrides is clamped on mount, before any click', async () => {
    // Simulates a declaration saved BEFORE Rule B existed (or by any future bug): box70 = -300
    // sits in manualOverrides from the very first render, with no interactive input at all.
    const decl = {
      ...BASE_DECL,
      _precomputed: { boxes: [{ num: 27, value: -500 }], summary: {}, sources: [] },
      manualData: { identification: { tipo_declaracion: 'N' }, manualOverrides: { 70: -300 } },
    };
    installImmediateServer();
    render(<FmModel303Page decl={decl} token={TOKEN} apiBaseUrl={API_BASE_URL} {...defaultProps} />);

    // The mount effect (`decl._precomputed?.boxes != null` -> `applyComputeResult`) runs
    // synchronously off props, no click/await needed for the box/box111 assertions themselves.
    expect(boxValue(70)).toBe(0); // clamped on mount, not after a user edit.
    expect(boxValue(111)).toBe(0); // never negative, despite the persisted -300.

    // The clamp must also reach the `manualOverrides` MAP itself (not just the displayed
    // `liveBoxes`), because `applyBoxParams` reads box 70's AEAT param straight off that map,
    // bypassing `liveBoxes` entirely — a stale unclamped -300 there would still reach AEAT as a
    // negative `ComplementaryAmt` even with box111 fixed. Commit an unrelated box (27, to its
    // own current value) to arm the pending-edit flag so "Guardar" actually flushes, then assert
    // the PUT body's manualOverrides[70] is the clamped 0, never the persisted -300.
    commit(27, '-500');
    await act(async () => { clickSave(); await Promise.resolve(); await Promise.resolve(); });

    expect(putCalls()).toHaveLength(1);
    expect(overridesOf(putCalls()[0])[70]).toBe(0);
  });
});
