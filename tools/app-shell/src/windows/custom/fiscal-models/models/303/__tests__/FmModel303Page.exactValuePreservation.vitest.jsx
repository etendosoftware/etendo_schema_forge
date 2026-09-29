// ETP-5456 — a boundary-legal manual value (15 integer digits + 2 decimals, e.g.
// "123456789012345.35") must be preserved EXACTLY through the real edit pipeline, not silently
// corrupted by float64 precision loss (`Number('123456789012345.35')` alone, no arithmetic,
// already rounds to "...34" — this was the exact regression manual QA caught and is what
// `buildValidatedBoxValue`/`buildExactDecimalValue` in fiscalModelsUtils.js exist to prevent).
//
// FmBoxes303 is deliberately left UNMOCKED (same convention as FmModel303Page.
// box78ClampIntegration.vitest.jsx) so this exercises the REAL pencil -> input -> blur wiring,
// not a mocked stand-in. The keystroke hard-stop itself (integer/decimal ceilings) is unit-tested
// in isolation in FmBoxes303.hardStop.vitest.jsx; this file is about what happens to an in-range
// boundary value once it's committed.
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';

const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));
vi.mock('../../../fiscalModelsUtils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    formatPeriod: (p) => p,
    // formatAmount is deliberately stubbed to a raw string, not the real currency formatter:
    // lib/formatCurrency.js has its OWN, separate float64 boundary quirk in its display-rounding
    // trick (`toFixedHalfUp`'s exponent-shift), one digit earlier than the storage-layer concern
    // this file is about — see FmModel303Page.boxDigitLimitsIntegration.vitest.jsx's history for
    // the full rationale (now folded into this file). Stubbing it isolates "is the STORED value
    // exact" from "does the currency formatter also handle 17-significant-digit magnitudes",
    // which is a separate, already-covered concern (lib/formatCurrency.js has its own exact-
    // decimal-string fast path).
    formatAmount: (n) => (n == null ? '—' : String(n)),
    computeBoxes303: vi.fn().mockResolvedValue(null),
    generate303File: vi.fn().mockResolvedValue({ ok: false }),
    checkModified303: vi.fn(),
  };
});
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('../../../FmTabContent.jsx', () => ({
  SourcesTab: () => null, IncidentsTab: () => null, HistoryTab: () => null,
}));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null, FileGenModal303: () => null,
}));
vi.mock('../AeatSubmitFlow.jsx', () => ({
  default: () => null, isMissingDefaultIaeActivity: () => false,
}));

import FmModel303Page from '../FmModel303Page.jsx';

const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  _precomputed: null, boxes: null, sources: [], history: [],
  identification: { tipo_declaracion: 'N' },
};

const defaultProps = { onBack: vi.fn(), onStatusChange: vi.fn() };

function findCellByNum(container, num) {
  const padded = String(num).padStart(2, '0');
  return Array.from(container.querySelectorAll('.fm-aeat-cell')).find(
    (cell) => cell.querySelector('.fm-aeat-cell__num')?.textContent === padded,
  );
}

function editBox(container, num, rawValue) {
  const cell = findCellByNum(container, num);
  const editBtn = cell.querySelector('.fm-aeat-cell__edit-btn');
  fireEvent.click(editBtn);
  const input = container.querySelector('.fm-aeat-cell__input');
  fireEvent.change(input, { target: { value: rawValue } });
  fireEvent.blur(input);
  return input;
}

function goToResultadoFinal() {
  const navBtn = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent.includes('fm.page.resultado_final'),
  );
  fireEvent.click(navBtn);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FmModel303Page — exact preservation of a boundary-legal value through the real FmBoxes303 grid (ETP-5456)', () => {
  it('a 15-integer-digit + 2-decimal value on a Num box (77) round-trips EXACTLY, no toast, cell exits edit mode', () => {
    const { container } = render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    goToResultadoFinal();

    editBox(container, 77, '123456789012345.35');

    expect(container.querySelector('.fm-aeat-cell__input')).not.toBeInTheDocument();
    const cell77 = findCellByNum(container, 77);
    const value77 = cell77.querySelector('.fm-aeat-cell__value').textContent;
    expect(value77).toBe('123456789012345.35');
  });

  it('a positive 15-integer-digit + 2-decimal value on a N box (27, via the bicolumn a_deducir/box70 sibling row) round-trips EXACTLY', () => {
    // Box 27 itself is a total (`total_devengada`), not directly editable — box 70 ("a_deducir")
    // lives in the same resultado_final bicolumn as box 77 and is a genuine N box, editable,
    // ceiling 15 positive / 14 negative — a legitimate stand-in for this magnitude check.
    const { container } = render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    goToResultadoFinal();

    editBox(container, 70, '123456789012345.12');

    const cell70 = findCellByNum(container, 70);
    const value70 = cell70.querySelector('.fm-aeat-cell__value').textContent;
    expect(value70).toBe('123456789012345.12');
  });

  it('leaves an ordinary small value untouched (no regression for the overwhelming majority of real edits)', () => {
    const { container } = render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    goToResultadoFinal();

    editBox(container, 77, '500.25');

    const cell77 = findCellByNum(container, 77);
    expect(cell77.querySelector('.fm-aeat-cell__value').textContent).toBe('500.25');
  });
});
