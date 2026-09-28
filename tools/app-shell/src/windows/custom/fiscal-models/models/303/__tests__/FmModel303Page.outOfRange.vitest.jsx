// ETP-5456 — autocalculated boxes out of the AEAT record-length range (FINAL behavior, fiscal-
// advisory correction). A derived box (69, 71, or anything that cascades: 46, 64, 66, …) that
// overflows its range is NEVER rounded/truncated/saturated — `recomputeDerivedBoxes` leaves the
// real computed value untouched and reports the offending box numbers via `.outOfRangeBoxes`
// (fiscalModelsUtils.js). This file covers what `FmModel303Page.jsx` does with that report:
//   - a TOAST (not a persistent banner — manual QA explicitly asked for this, see the ETP-5456
//     UX-correction comment on `outOfRangeSignatureRef`) fires once per distinct out-of-range set,
//     singular/plural-correct ("la casilla [N] excede" / "las casillas [N], [M] exceden"),
//   - Guardar / Generar fichero / Registrar-Presentar are all BLOCKED (their own guard, their own
//     contextual toast) while any box is out of range,
//   - none of this fires when every box is in range.
//
// FmBoxes303 is mocked here (direct `onBoxChange` calls) — the keystroke-level hard-stop that
// makes an out-of-range MANUAL edit structurally impossible is covered in
// FmBoxes303.hardStop.vitest.jsx; exact-value preservation through the REAL component is covered
// in FmModel303Page.exactValuePreservation.vitest.jsx.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const navigateMock = vi.fn();
const { toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(), toastSuccessMock: vi.fn(),
}));

vi.mock('@/i18n', () => ({ useUI: () => (key, params) => {
  // Minimal real interpolation so the plural/singular assertions below can check actual text,
  // mirroring the real dictionary strings (en_US.json/es_ES.json) closely enough to assert on.
  const DICTIONARY = {
    'fm.validation.out_of_range_subject_one': 'box {boxes}',
    'fm.validation.out_of_range_subject_other': 'boxes {boxes}',
    'fm.validation.out_of_range_verb_one': 'exceeds',
    'fm.validation.out_of_range_verb_other': 'exceed',
    'fm.validation.out_of_range_save': 'The result of {subject} {verb} the range allowed by the AEAT. The source figure must be corrected before saving.',
    'fm.validation.out_of_range_generate': 'The result of {subject} {verb} the range allowed by the AEAT. The source figure must be corrected before generating the file.',
    'fm.validation.out_of_range_present': 'The result of {subject} {verb} the range allowed by the AEAT. The source figure must be corrected before marking the declaration as submitted.',
    'fm.validation.out_of_range_banner': 'The result of {subject} {verb} the range allowed by the AEAT. The source figure must be corrected before saving, generating the file, or marking the declaration as submitted.',
  };
  let text = DICTIONARY[key] ?? key;
  Object.entries(params ?? {}).forEach(([k, v]) => { text = text.replace(`{${k}}`, v); });
  return text;
} }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: toastSuccessMock } }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));

const computeBoxes303 = vi.fn();
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
  StatusPillMenu: () => null, MoreOptionsMenu: () => null, ResultPill: () => null,
  SummaryCard: () => null, Tabs: () => null, Banner: () => null, SectionCard: () => null,
  EmptyState: () => null, KpiWidget: () => null,
}));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null, IncidentsTab: () => null, HistoryTab: () => null,
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null, FileGenModal303: () => null,
}));
vi.mock('../AeatSubmitFlow.jsx', () => ({
  default: () => null, isMissingDefaultIaeActivity: () => false,
}));
vi.mock('lucide-react', () => ({
  Settings: () => null, Download: () => null, ArrowLeft: () => null, Save: () => null, OctagonAlert: () => null,
  TriangleAlert: () => null, CircleCheck: () => null, ArrowLeftRight: () => null,
  Calculator: () => null, Loader2: () => null, MoreVertical: () => null,
  TrendingUp: () => null, TrendingDown: () => null, Clock: () => null,
  ClipboardCheck: () => null, ReceiptText: () => null, Folder: () => null,
  FileCheck: () => null, Landmark: () => null,
}));

// Dumps the `boxes` prop and exposes one `onBoxChange(boxNum, rawValue)` input per box under
// test, same convention as FmModel303Page.negativeBoxClamp.vitest.jsx.
vi.mock('../FmBoxes303.jsx', () => ({
  default: ({ boxes, onBoxChange }) => {
    const arr = Array.isArray(boxes)
      ? boxes
      : (boxes && typeof boxes === 'object' ? Object.entries(boxes).map(([n, v]) => ({ num: Number(n), value: v })) : []);
    return React.createElement(
      'div',
      { 'data-testid': 'fm-boxes-303' },
      React.createElement('pre', { 'data-testid': 'boxes-json' }, JSON.stringify(arr)),
      React.createElement('input', { 'data-testid': 'commit-27', onChange: (e) => onBoxChange(27, e.target.value) }),
    );
  },
}));

import FmModel303Page from '../FmModel303Page.jsx';

const defaultProps = { onBack: vi.fn(), onStatusChange: vi.fn() };

function commit27(rawValue) {
  fireEvent.change(screen.getByTestId('commit-27'), { target: { value: rawValue } });
}

function clickButtonByText(text) {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(text));
  fireEvent.click(btn);
}

function lastToastMessage() {
  const calls = toastErrorMock.mock.calls;
  return calls[calls.length - 1]?.[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  computeBoxes303.mockResolvedValue(null);
});

describe('FmModel303Page — out-of-range autocalculated boxes (ETP-5456)', () => {
  it('does not toast or block anything while every derived box is in range', () => {
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      _precomputed: null, boxes: null, sources: [], history: [],
      identification: { tipo_declaracion: 'N' },
    };
    render(<FmModel303Page decl={decl} {...defaultProps} />);

    commit27('1000');

    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('toasts once on mount with PLURAL wording when several derived boxes are out of range', () => {
    // box27 = -100000000000000 (1e14) drives box46 = 27 - box45(0) = -1e14, a 15-integer-digit
    // negative N value — over its 14-digit ceiling — and everything that chains off it (64, 66,
    // 69, 71) inherits the same violation. 5 boxes total -> plural.
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      _precomputed: { boxes: [{ num: 27, value: -100000000000000 }], summary: {}, sources: [] },
      boxes: null, sources: [], history: [],
      identification: { tipo_declaracion: 'N' },
    };
    render(<FmModel303Page decl={decl} {...defaultProps} />);

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    const message = lastToastMessage();
    expect(message).toContain('boxes');
    expect(message).toContain('exceed the range allowed by the AEAT');
    expect(message).not.toContain('exceeds'); // singular verb must not appear in the plural message
  });

  it('toasts with SINGULAR wording when exactly one derived box is out of range', () => {
    // box46/64/66/69 stay small (box27=100 -> box46=100 -> box64=100 -> box66=100 (box65
    // defaults to 100%) -> box69=100), all comfortably in range. Only box71 = box69 - box70
    // = 100 - 1_000_000_000_000_000 = -999999999999900 (15 integer digits) goes out of range —
    // ONE negative N-box 1 digit over its 14-digit ceiling — isolating a genuine single-box
    // violation from the cascade.
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      _precomputed: {
        boxes: [{ num: 27, value: 100 }, { num: 70, value: 1000000000000000 }],
        summary: {}, sources: [],
      },
      boxes: null, sources: [], history: [],
      identification: { tipo_declaracion: 'N' },
    };
    render(<FmModel303Page decl={decl} {...defaultProps} />);

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    const message = lastToastMessage();
    expect(message).toContain('box [71]');
    expect(message).not.toContain('boxes [71]');
    expect(message).toContain('exceeds the range allowed by the AEAT');
  });

  it('does not re-toast on an unrelated edit that leaves the same out-of-range set unchanged', () => {
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      _precomputed: { boxes: [{ num: 27, value: -100000000000000 }], summary: {}, sources: [] },
      boxes: null, sources: [], history: [],
      identification: { tipo_declaracion: 'N' },
    };
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    expect(toastErrorMock).toHaveBeenCalledTimes(1);

    // Re-commit box27 to the SAME value — outOfRangeBoxes recomputes to the identical set, no
    // new toast should fire (compared by signature, not by "is it non-empty").
    commit27('-100000000000000');
    expect(toastErrorMock).toHaveBeenCalledTimes(1);
  });

  it('blocks Guardar (Save) with its own contextual toast while a box is out of range', () => {
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      _precomputed: { boxes: [{ num: 27, value: -100000000000000 }], summary: {}, sources: [] },
      boxes: null, sources: [], history: [],
      identification: { tipo_declaracion: 'N' },
    };
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    toastErrorMock.mockClear();

    fireEvent.click(screen.getByTestId('FmModel303Page__save'));

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(lastToastMessage()).toContain('before saving.');
    expect(toastSuccessMock).not.toHaveBeenCalled(); // "Guardar" never actually ran/succeeded
  });

  it('blocks Generar fichero 303 with its own contextual toast while a box is out of range', () => {
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      _precomputed: { boxes: [{ num: 27, value: -100000000000000 }], summary: {}, sources: [] },
      boxes: null, sources: [], history: [],
      identification: { tipo_declaracion: 'N' },
    };
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    toastErrorMock.mockClear();

    clickButtonByText('fm.action.gen303');

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(lastToastMessage()).toContain('before generating the file.');
  });

  it('blocks Registrar/Presentar with its own contextual toast while a box is out of range', () => {
    const decl = {
      id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
      status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
      _precomputed: { boxes: [{ num: 27, value: -100000000000000 }], summary: {}, sources: [] },
      boxes: null, sources: [], history: [],
      identification: { tipo_declaracion: 'N' },
    };
    render(<FmModel303Page decl={decl} {...defaultProps} />);
    toastErrorMock.mockClear();

    clickButtonByText('fm.action.submit');

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(lastToastMessage()).toContain('before marking the declaration as submitted.');
  });
});
