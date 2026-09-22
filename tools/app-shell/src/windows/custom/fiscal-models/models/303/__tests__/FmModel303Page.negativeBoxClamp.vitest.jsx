// ETP-5393 Bug C — boxes 111 (Rectificación – Importe) and 77 (IVA a la importación liquidado
// por la Aduana pendiente de ingreso) can never be negative: the classic AEAT303Report engine
// hard-rejects a negative value for either at file-generation time
// (AEAT303Report2024.java:276-278 / AEAT303Report2015.java:149-162), but Go's on-screen
// previsualización had no equivalent check at all. `handleBoxChange` in FmModel303Page.jsx now
// clamps a negative commit on either box to 0 and surfaces an i18n toast error — same
// "make the invalid state structurally impossible" approach as the pre-existing box78/box110
// clamp (see FmModel303Page.box78Clamp.vitest.jsx), which this test file's scaffold mirrors.
//
// ETP-5438 (AEAT spec audit) — boxes 70, 78, 109 and 110 are ALSO declared "Num" (numérico sin
// signo / unsigned) in the official Modelo 303 "Diseño de registro" (DR303e26v101 v1.01), exactly
// like 111 and 77 above, but had no negative guard at all until this audit found the gap. Widened
// into the SAME NEGATIVE_NOT_ALLOWED_BOXES set (fiscalModelsUtils.js) rather than a parallel
// mechanism — see that constant's own comment for the full spec citation.
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
      React.createElement('input', { 'data-testid': 'commit-70', onChange: (e) => onBoxChange(70, e.target.value) }),
      React.createElement('input', { 'data-testid': 'commit-78', onChange: (e) => onBoxChange(78, e.target.value) }),
      React.createElement('input', { 'data-testid': 'commit-109', onChange: (e) => onBoxChange(109, e.target.value) }),
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
  it('clamps a negative box111 (Rectificación – Importe) commit to 0', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(111, '-500');

    expect(boxValue(111)).toBe(0);
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('clamps a negative box77 (IVA importación Aduana) commit to 0', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(77, '-12.34');

    expect(boxValue(77)).toBe(0);
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('accepts a positive box111 value unchanged', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(111, '250');

    expect(boxValue(111)).toBe(250);
    expect(toastErrorMock).not.toHaveBeenCalled();
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
});

describe('FmModel303Page — negative value rejected on boxes 70, 78, 109 and 110 (ETP-5438)', () => {
  it('clamps a negative box70 (Resultados a ingresar anteriores autoliquidaciones) commit to 0', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(70, '-300');

    expect(boxValue(70)).toBe(0);
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('clamps a negative box78 (Cuotas a compensar aplicadas) commit to 0', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(78, '-45.5');

    expect(boxValue(78)).toBe(0);
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('clamps a negative box109 (Devoluciones acordadas por la AT) commit to 0', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(109, '-1');

    expect(boxValue(109)).toBe(0);
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('clamps a negative box110 (Cuotas a compensar pendientes) commit to 0', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(110, '-200');

    expect(boxValue(110)).toBe(0);
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it('accepts a zero value on all 4 new boxes unchanged (boundary, not a clearly positive value)', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(70, '0');
    commit(78, '0');
    commit(109, '0');
    commit(110, '0');

    expect(boxValue(70)).toBe(0);
    expect(boxValue(78)).toBe(0);
    expect(boxValue(109)).toBe(0);
    expect(boxValue(110)).toBe(0);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('accepts a positive value on all 4 new boxes unchanged', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    commit(70, '150');
    commit(78, '75.25');
    commit(109, '10');
    commit(110, '400');

    expect(boxValue(70)).toBe(150);
    expect(boxValue(78)).toBe(75.25);
    expect(boxValue(109)).toBe(10);
    expect(boxValue(110)).toBe(400);
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  // ETP-5438 explicit follow-up: a negative box110 must floor to 0 BEFORE box78's own, unrelated
  // relative clamp (box78 <= box110, ETP-5338 pt.2) reads it — otherwise box78 could inherit a
  // negative ceiling from an un-floored box110. Both guards live in the same handleBoxChange, with
  // the negative-not-allowed floor applying first (see fiscalModelsUtils.js's
  // NEGATIVE_NOT_ALLOWED_BOXES comment) — this test pins that ordering as an observable contract,
  // not just an implementation detail.
  it('floors a negative box110 to 0 first, so box78s relative clamp never inherits a negative ceiling', () => {
    render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);

    // box78 is legitimately positive before box110 goes negative.
    commit(110, '500');
    commit(78, '300');
    expect(boxValue(78)).toBe(300);

    // Committing box110 as negative must floor it to 0 (this test file's own guard) AND
    // immediately re-clamp box78 down to that floored 0 (box78Clamp's reactive check), never to
    // a negative value.
    commit(110, '-50');

    expect(boxValue(110)).toBe(0);
    expect(boxValue(78)).toBe(0);
    expect(boxValue(78)).not.toBeLessThan(0);
  });
});
