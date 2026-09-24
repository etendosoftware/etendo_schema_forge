// ETP-5431 pt.2 — box 111 (Rectificación - Importe) autocompletion integration coverage.
//
// The exhaustive `{ isRectificativa, box70, box71 }` -> box111 matrix (`MIN(box70, ABS(box71))`,
// rewritten in `0d196b0c4` — see that commit and `fm303Layouts.computeBox111.vitest.js`'s own
// header for the full rationale/confirmed-bug context) is covered directly, as a pure function,
// in `fm303Layouts.computeBox111.vitest.js`. This file covers the INTEGRATION wiring around that
// formula at the FmModel303Page level:
//   - reactive typing: a representative, UI-REACHABLE subset of the matrix (box70/71 are
//     themselves DERIVED from other boxes here, not free parameters like in the pure test — see
//     the note on each scenario below for which branch it exercises);
//   - the "Calcular" flow (`applyComputeResult`), which must reach the exact same result as
//     interactive typing;
//   - `syncBox111Override` — the side-fix that mirrors the freshly-autocompleted box111 into
//     `manualOverrides`, the object `generate303File`/"Guardar" actually forward to AEAT as
//     `RectifyingAmount`. This is the single most fragile part of the implementation: nothing
//     errors if it silently stops firing, the file would just quietly carry a stale box 111.
//
// Every scenario below seeds `manualData.identification.rectificativa: true` (via `BASE_DECL`) —
// the new formula's explicit `isRectificativa` guard means box111 stays unconditionally empty
// otherwise, regardless of box70/71.
//
// The box70-clamp-before-box111-formula ordering guarantee has its own dedicated test in
// `FmModel303Page.negativeBoxClamp.vitest.jsx` (same file Rule B's clamp mechanism lives in).
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));

const computeBoxes303 = vi.fn();

// `persistManualData` deliberately kept REAL (not stubbed) — same convention as
// FmModel303Page.save.vitest.jsx / FmModel303Page.calcularPersists.vitest.jsx — so the
// `syncBox111Override` tests below assert on the ACTUAL PUT body the page would send, not on
// an internal ref/flag.
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
// Exposes `onBoxChange` via one raw input per box under test and dumps the `boxes` prop
// `handleBoxChange`/`applyComputeResult` produced, so the test reads back the exact
// post-`recomputeDerivedBoxes` value — same harness shape as
// FmModel303Page.negativeBoxClamp.vitest.jsx.
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ boxes, onBoxChange }) => {
    const arr = Array.isArray(boxes)
      ? boxes
      : (boxes && typeof boxes === 'object' ? Object.entries(boxes).map(([n, v]) => ({ num: Number(n), value: v })) : []);
    return React.createElement(
      'div',
      { 'data-testid': 'fm-boxes-303' },
      React.createElement('pre', { 'data-testid': 'boxes-json' }, JSON.stringify(arr)),
      ...[68, 69, 70, 71, 77, 108, 109].map(num => React.createElement('input', {
        key: num,
        'data-testid': `commit-${num}`,
        onChange: (e) => onBoxChange(num, e.target.value),
      })),
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

// `rectificativa: true` is REQUIRED under the new (ETP-5431, `0d196b0c4` rewrite) MIN/ABS
// formula: `computeBox111` now has an explicit `isRectificativa` guard the old per-sign draft
// didn't have, so a `manualData.identification` that omits it makes box111 unconditionally null
// regardless of box69/70/71 — every scenario in this file needs it seeded to exercise the
// formula at all.
const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
  manualData: { identification: { tipo_declaracion: 'N', rectificativa: true } },
};

// `boxes: []`/`summary: {}` — not `_precomputed: null` — so the mount effect's own
// auto-compute (`FmModel303Page.jsx`'s `useEffect` on `decl.id`, ETP-4755) never independently
// calls `computeBoxes303` before the "Calcular" click does. Same convention as
// FmModel303Page.calcularPersists.vitest.jsx — see that file's own header comment for why.
const CALCULAR_DECL = { ...BASE_DECL, _precomputed: { boxes: [], summary: {}, sources: [] } };

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
  vi.restoreAllMocks();
});

// ── Reactive typing — representative, UI-reachable subset of the computeBox111 matrix ────
// box69 = box68 and box71 = box69 - box70 in every scenario below (BASE_DECL starts every
// other box111 input — 77/78/108/109/112 — at its 0 default), so setting just box68/box70
// (both still-editable boxes) is enough to steer every branch that's actually reachable
// through the real UI.
describe('FmModel303Page — box 111 reactive typing (ETP-5431 pt.2, computeBox111 via handleBoxChange)', () => {
  it('box69 positive, 70-69 positive -> box111 = 70 - 69', () => {
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    commit(68, '5');  // box69 = 5
    commit(70, '20'); // box71 = 5 - 20 = -15 (< 0); 70 - 69 = 15 (> 0)
    expect(boxValue(111)).toBe(15);
  });

  it('box69 negative -> box111 = box70 (MIN(box70, |box71|), |box71| > box70 branch)', () => {
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    commit(68, '-500'); // box69 = -500
    commit(70, '300');  // box71 = -500 - 300 = -800 (< 0); MIN(300, 800) = 300.
    expect(boxValue(111)).toBe(300);
  });

  // ETP-5431 (0d196b0c4 rewrite) — THE case the AEAT rejection fixed. Under the OLD per-sign
  // draft, box69 === 0 fell through to "111 queda vacía" — a confirmed bug (real ServValiDos
  // rejection, errors 35100/E030292/35068). The new MIN/ABS formula doesn't read box69 at all,
  // so this same scenario now correctly autocompletes box111 = box70 (since |box71| = box70 here).
  it('box69 exactly 0 -> box111 autocompletes to box70 (the confirmed AEAT rejection fix, was empty before)', () => {
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    commit(68, '0'); // box69 = 0 (irrelevant to the new formula)
    commit(70, '10'); // box71 = 0 - 10 = -10 (< 0), box70 = 10 (> 0) -> MIN(10, 10) = 10.
    expect(boxValue(111)).toBe(10);
  });

  // Explicit isRectificativa=false guard, driven through the real UI (checkbox never ticked):
  // box70/box71 alone would otherwise fully qualify (matches the very first scenario above).
  it('rectificativa unchecked -> box111 stays empty even though box70/box71 otherwise qualify', () => {
    const decl = { ...BASE_DECL, manualData: { identification: { tipo_declaracion: 'N', rectificativa: false } } };
    render(<FmModel303Page decl={decl} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    commit(68, '5');   // box69 = 5
    commit(70, '20');  // box71 = 5 - 20 = -15 (< 0), box70 = 20 (> 0) — would qualify if rectificativa were true.
    expect(boxValue(111)).toBeUndefined();
  });

  it('box71 >= 0 -> box111 stays empty regardless of box69/box70', () => {
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    commit(68, '100');
    commit(70, '10'); // box71 = 100 - 10 = 90 (>= 0) -> outer condition fails
    expect(boxValue(111)).toBeUndefined();
  });

  it('box70 never committed (no value) -> box111 stays empty even with box71 < 0', () => {
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    commit(68, '-100'); // box69 = -100, box71 = -100 - 0 = -100 (< 0) — box70 untouched
    expect(boxValue(111)).toBeUndefined();
  });

  it('reacts on every keystroke commit, not just a final one — box111 tracks each intermediate state', () => {
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    commit(68, '5');
    commit(70, '20');
    expect(boxValue(111)).toBe(15);
    // A further keystroke commit on box70 alone re-triggers the formula with the new value.
    commit(70, '25');
    expect(boxValue(111)).toBe(20);
  });
});

// ── "Calcular" flow — applyComputeResult must reach the SAME result as reactive typing ───
describe('FmModel303Page — box 111 via "Calcular" (ETP-5431 pt.2, applyComputeResult -> recomputeDerivedBoxes)', () => {
  it('computes box111 from the backend-returned boxes, same formula as interactive typing', async () => {
    computeBoxes303.mockResolvedValue({
      boxes: [{ num: 68, value: 5 }, { num: 70, value: 20 }],
      summary: { accrued: 0, deductible: 0, result: 0 },
      sources: [],
    });
    render(<FmModel303Page decl={CALCULAR_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    await clickCalcular();

    expect(boxValue(111)).toBe(15); // identical scenario/result to the typed-matrix test above.
  });

  it('computes an empty box111 from the backend-returned boxes when box71 >= 0', async () => {
    computeBoxes303.mockResolvedValue({
      boxes: [{ num: 68, value: 100 }, { num: 70, value: 10 }],
      summary: { accrued: 0, deductible: 0, result: 0 },
      sources: [],
    });
    render(<FmModel303Page decl={CALCULAR_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    await clickCalcular();

    expect(boxValue(111)).toBeUndefined();
  });
});

// ── syncBox111Override — the side-fix generate303File/"Guardar" depend on ──────────────
// Because box 111 is no longer user-typed, `manualOverrides[111]` — the exact field
// `generate303File`'s `applyBoxParams` and "Guardar"'s `persistManualData` read box 111 from
// (`BOX_PARAM_MAP` -> AEAT's `RectifyingAmount`) — never gets set any other way. If
// `syncBox111Override` stops firing on a future refactor, nothing throws or logs: the
// generated .303 file / saved declaration would just silently carry a stale (or missing)
// box 111. These tests assert on the ACTUAL PUT body, not on an internal ref.
describe('FmModel303Page — syncBox111Override keeps manualOverrides[111] in sync (ETP-5431 pt.2)', () => {
  it('after reactive typing autocompletes box111, "Guardar" sends it in manualOverrides', async () => {
    installImmediateServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    commit(68, '5');
    commit(70, '20');
    expect(boxValue(111)).toBe(15);

    await act(async () => { clickSave(); await Promise.resolve(); await Promise.resolve(); });

    expect(putCalls()).toHaveLength(1);
    expect(overridesOf(putCalls()[0])[111]).toBe(15);
  });

  it('after "Calcular" autocompletes box111, a subsequent "Guardar" sends it in manualOverrides', async () => {
    installImmediateServer();
    computeBoxes303.mockResolvedValue({
      boxes: [{ num: 68, value: 5 }, { num: 70, value: 20 }],
      summary: { accrued: 0, deductible: 0, result: 0 },
      sources: [],
    });
    render(<FmModel303Page decl={CALCULAR_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    // `persistEditableFields` (both "Guardar" and "Calcular"'s own pre-recompute flush) is a
    // no-op unless SOMETHING was actually edited (`hasPendingManualDataEditRef`) — commit box68
    // to the SAME value `computeBoxes303` below also returns for it, so the click below both
    // arms that flag and exercises the real `applyOverrides(res.boxes, manualOverrides)` merge
    // (box68's manualOverrides entry lines up with, not overrides away, the backend's own box68).
    commit(68, '5');

    await clickCalcular();
    expect(boxValue(111)).toBe(15);

    // `persistEditableFields` clears `hasPendingManualDataEditRef` on every successful flush —
    // including the one `handleComputeClick` itself already fired BEFORE the recompute promise
    // settled, which could only have captured the pre-recompute `manualOverrides` (no box111
    // yet). A save fired straight after `clickCalcular()` resolves, with nothing re-armed in
    // between, would therefore be a no-op and prove nothing either way. Committing box77 to its
    // own current value (0) re-arms the flag with a genuine, harmless edit AFTER the recompute
    // settled — its own `recomputeDerivedBoxes`/`syncBox111Override` pass re-derives box111 from
    // the now-settled box68/70, so this is what actually proves `applyComputeResult`'s sync
    // survived into a save issued after the fact, not merely into a stale, already-flushed one.
    globalThis.fetch.mockClear();
    commit(77, '0');
    await act(async () => { clickSave(); await Promise.resolve(); await Promise.resolve(); });

    expect(putCalls()).toHaveLength(1);
    expect(overridesOf(putCalls()[0])[111]).toBe(15);
  });

  it('when box111 autocompletes back to empty, "Guardar" no longer carries a stale manualOverrides[111]', async () => {
    installImmediateServer();
    render(<FmModel303Page decl={BASE_DECL} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    commit(68, '5');
    commit(70, '20');
    expect(boxValue(111)).toBe(15);
    // box70 down to box69 -> 70 - 69 = 0 (not > 0) -> box111 empty again.
    commit(70, '5');
    expect(boxValue(111)).toBeUndefined();

    await act(async () => { clickSave(); await Promise.resolve(); await Promise.resolve(); });

    expect(putCalls()).toHaveLength(1);
    expect(overridesOf(putCalls()[0])[111]).toBeUndefined();
  });
});
