// ETP-5431 (50653772f, Fix 1) — `handleIdentChange` (fires on every identificación-tab edit,
// most visibly ticking/unticking "Autoliquidación Rectificativa") is the 4th call site that
// changes `identChecks` and must therefore recompute + `syncBox111Override` box111 — the other
// 3 (`handleBoxChange`, `applyComputeResult` via both "Calcular" and the precomputed-on-mount
// hydration) already did this before this fix. Before the fix, ticking "Rectificativa" with
// boxes 69/70/71 already loaded left `manualOverrides[111]` stale (or entirely unset) until the
// user ALSO touched a box or clicked "Calcular" — i.e. the on-screen box111 cell would update
// (it reads `liveBoxes`) but the PUT body sent to the backend (which reads box 111 off
// `manualOverrides`, not `liveBoxes` — see `applyBoxParams`) would not, so the file/declaration
// AEAT actually received silently disagreed with what the screen showed.
//
// These tests assert on the ACTUAL PUT body (`manualOverrides[111]`), not on `liveBoxes`/an
// internal ref, and confirm the sync lands IMMEDIATELY on the ident-change itself — no
// additional box edit or "Calcular" click needed in between.
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));

// `persistManualData` deliberately kept REAL (not stubbed), same convention as
// FmModel303Page.box111Autocomplete.vitest.jsx, so assertions read the ACTUAL PUT body.
vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatAmount: (n) => (n == null ? '—' : String(n)),
    formatPeriod: (p) => p,
    computeBoxes303: vi.fn().mockResolvedValue(null),
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
// Exposes both `onIdentChange` (a single checkbox for `rectificativa`) and `onBoxChange` (boxes
// 68/70, enough to seed 69/71 into a state where toggling rectificativa alone flips box111 from
// empty to non-empty), plus a `boxes-json` dump to read back the derived array.
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ boxes, onBoxChange, onIdentChange, identification }) => {
    const arr = Array.isArray(boxes)
      ? boxes
      : (boxes && typeof boxes === 'object' ? Object.entries(boxes).map(([n, v]) => ({ num: Number(n), value: v })) : []);
    return React.createElement(
      'div',
      { 'data-testid': 'fm-boxes-303' },
      React.createElement('pre', { 'data-testid': 'boxes-json' }, JSON.stringify(arr)),
      // Controlled by the CURRENT `identification.rectificativa` (re-rendered on every parent
      // state update, like the real checkbox does) — an uncontrolled checkbox here would always
      // flip false->true on its first click regardless of the seeded decl value, silently
      // breaking any "starts true, untick it" scenario.
      React.createElement('input', {
        type: 'checkbox',
        checked: !!identification?.rectificativa,
        'data-testid': 'rectificativa-cb',
        onChange: (e) => onIdentChange('rectificativa', e.target.checked),
      }),
      ...[68, 70].map(num => React.createElement('input', {
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

function toggleRectificativa() {
  fireEvent.click(screen.getByTestId('rectificativa-cb'));
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

function installImmediateServer() {
  globalThis.fetch = vi.fn((_url, options = {}) => Promise.resolve(
    String(options.method || 'GET').toUpperCase() === 'PUT'
      ? jsonResponse({ manualDataApplied: true })
      : jsonResponse({ response: { data: [] } }),
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FmModel303Page — handleIdentChange syncs box111 immediately (ETP-5431 Fix 1)', () => {
  it('ticking "Rectificativa" alone (boxes already loaded) autocompletes box111 into liveBoxes, no extra edit needed', () => {
    // Boxes 68/70 pre-loaded via decl.boxes (no token/apiBaseUrl auto-compute race) so
    // toggling rectificativa is the ONLY thing that changes between "empty" and "computed".
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      _precomputed: null, boxes: [{ num: 68, value: 5 }, { num: 70, value: 20 }],
      sources: [], history: [],
      manualData: { identification: { tipo_declaracion: 'N', rectificativa: false } },
    };
    render(<FmModel303Page decl={decl} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    // Before toggling: rectificativa is false, box111 stays empty even though box70/71 qualify.
    expect(boxValue(111)).toBeUndefined();

    toggleRectificativa();

    // box69 = box68 = 5, box71 = 5 - 20 = -15 (< 0), box70 = 20 (> 0), rectificativa now true
    // -> MIN(20, 15) = 15 — recomputed the instant the checkbox flips, no other action taken.
    expect(boxValue(111)).toBe(15);
  });

  it('the freshly-synced box111 reaches "Guardar" (manualOverrides[111]) with NO other edit in between', async () => {
    installImmediateServer();
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      _precomputed: null, boxes: [{ num: 68, value: 5 }, { num: 70, value: 20 }],
      sources: [], history: [],
      manualData: { identification: { tipo_declaracion: 'N', rectificativa: false } },
    };
    render(<FmModel303Page decl={decl} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    toggleRectificativa();
    expect(boxValue(111)).toBe(15);

    // "Guardar" straight after the toggle — no box commit, no "Calcular" click in between. If
    // handleIdentChange didn't sync manualOverrides[111], this PUT would carry the pre-toggle
    // value (undefined), even though the screen already shows box111 = 15.
    await act(async () => { clickSave(); await Promise.resolve(); await Promise.resolve(); });

    expect(putCalls()).toHaveLength(1);
    expect(overridesOf(putCalls()[0])[111]).toBe(15);
  });

  it('unticking "Rectificativa" clears the now-stale box111 out of manualOverrides on "Guardar"', async () => {
    installImmediateServer();
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      // `_precomputed` (not plain `decl.boxes`) so the mount effect routes it through
      // `applyComputeResult` -> `recomputeDerivedBoxes`/`syncBox111Override`, merging the
      // persisted `manualOverrides[111]` into a genuinely re-derived `liveBoxes` — same as a
      // real reopened declaration, not a raw unrecomputed box array.
      _precomputed: { boxes: [{ num: 68, value: 5 }, { num: 70, value: 20 }], summary: {}, sources: [] },
      boxes: null, sources: [], history: [],
      manualData: {
        identification: { tipo_declaracion: 'N', rectificativa: true },
        manualOverrides: { 111: 15 },
      },
    };
    render(<FmModel303Page decl={decl} token={TOKEN} apiBaseUrl={API_BASE_URL} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    expect(boxValue(111)).toBe(15);
    toggleRectificativa(); // rectificativa: true -> false
    expect(boxValue(111)).toBeUndefined();

    await act(async () => { clickSave(); await Promise.resolve(); await Promise.resolve(); });

    expect(putCalls()).toHaveLength(1);
    expect(overridesOf(putCalls()[0])[111]).toBeUndefined();
  });

  it('an ident change that keeps box111 qualifying (box70 already committed) re-syncs on a SECOND ident edit too', () => {
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      _precomputed: null, boxes: null, sources: [], history: [],
      manualData: { identification: { tipo_declaracion: 'N', rectificativa: false } },
    };
    render(<FmModel303Page decl={decl} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    // Boxes committed via typing FIRST (rectificativa still false at this point) — box111 stays
    // empty, matching the "rectificativa unchecked" guard covered in
    // FmModel303Page.box111Autocomplete.vitest.jsx.
    commit(68, '5');
    commit(70, '20');
    expect(boxValue(111)).toBeUndefined();

    // Only the ident-change itself (no further box edit) flips box111 on.
    toggleRectificativa();
    expect(boxValue(111)).toBe(15);
  });
});
