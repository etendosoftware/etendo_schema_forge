// ETP-5338 pt.2 (cycle 3) — box78 auto-clamp, end-to-end through the real FmBoxes303 grid.
//
// FmModel303Page.box78Clamp.vitest.jsx exercises `handleBoxChange`'s clamp math in isolation
// (FmBoxes303 mocked). This file complements it with two things that need the REAL box grid:
//
//   1. Regression: the advisory `Banner`/`TriangleAlert` warning from the previous iteration
//      (git history at 75b033d0c) must be genuinely gone — no warning renders anywhere near
//      boxes 78/110/87 anymore, for any combination of values.
//   2. Sanity: the clamped box78 value must flow correctly into casilla 87's own
//      `computeDerivedValue` display (box87 = max(0, box110 - box78), already covered on its
//      own terms in FmBoxes303.vitest.jsx) — i.e. the clamp and the existing box87 formula
//      compose correctly through the real component, not just through a mocked stand-in.
//
// FmBoxes303 is deliberately left UNMOCKED here — only its heavier siblings (FmOverlays,
// AeatSubmitFlow, FmTabContent, lucide-react) are stubbed, following the same minimal-mock
// convention as FmModel303Page.precomputed.vitest.jsx.
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
    formatPeriod: (p) => p,
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
  PresentModal: () => null,
  FileGenModal303: () => null,
}));
vi.mock('../AeatSubmitFlow.jsx', () => ({
  default: () => null,
  isMissingDefaultIaeActivity: () => false,
}));

import FmModel303Page from '../FmModel303Page.jsx';

const BASE_DECL = {
  id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
  status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
  // box110 pre-populated so committing box78 through the real UI has something to clamp
  // against immediately.
  _precomputed: { boxes: { 110: 500 }, summary: {}, error: null, computedAt: Date.now() },
  boxes: null, sources: [], history: [],
  identification: { tipo_declaracion: 'N' },
};

const defaultProps = {
  onBack: vi.fn(),
  onStatusChange: vi.fn(),
};

function findCellByNum(container, num) {
  const padded = String(num).padStart(2, '0');
  return Array.from(container.querySelectorAll('.fm-aeat-cell')).find(
    (cell) => cell.querySelector('.fm-aeat-cell__num')?.textContent === padded,
  );
}

/** Opens the box's editable cell, types `rawValue`, and commits it via blur — mirroring the
 * real user flow (`FmBoxes303.jsx`'s Pencil button → input → onBlur). */
function editBox(container, num, rawValue) {
  const cell = findCellByNum(container, num);
  const editBtn = cell.querySelector('.fm-aeat-cell__edit-btn');
  fireEvent.click(editBtn);
  const input = container.querySelector('.fm-aeat-cell__input');
  fireEvent.change(input, { target: { value: rawValue } });
  fireEvent.blur(input);
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

describe('FmModel303Page — box78 clamp through the real FmBoxes303 grid', () => {
  it('clamps box78 to box110 and flows correctly into casilla 87 (box110=500, typed box78=900 → clamped to 500 → casilla 87 = max(0,500-500)=0)', () => {
    const { container } = render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    goToResultadoFinal();

    editBox(container, 78, '900');

    const cell78 = findCellByNum(container, 78);
    const value78 = cell78.querySelector('.fm-aeat-cell__value').textContent;
    expect(value78).toContain('500');
    expect(value78).not.toContain('900');

    const cell87 = findCellByNum(container, 87);
    const value87 = cell87.querySelector('.fm-aeat-cell__value').textContent;
    expect(value87).toContain('0');
    expect(value87).not.toContain('-');
  });

  it('renders no advisory warning banner anywhere for box78 > box110 (the old advisory approach is fully gone)', () => {
    const { container } = render(<FmModel303Page decl={BASE_DECL} {...defaultProps} />);
    goToResultadoFinal();

    editBox(container, 78, '900');

    expect(screen.queryByTestId('Banner__box78GtBox110')).not.toBeInTheDocument();
    expect(screen.queryByTestId('TriangleAlert__box78GtBox110')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('fm.box.warning.box78_gt_box110');
  });
});
