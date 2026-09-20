// ETP-5393 manual-QA fix — reproduces the exact bug the user reported: the bank block
// (datos_bancarios section, tab "identificacion") became visible once rectificativa was
// checked AND box 111 (Rectificación - Importe, tab "resultado_final") carried a non-zero
// amount, but it stayed VISIBLE (just lost the red asterisk) after either condition was
// reverted — box 111 back to 0, or rectificativa unchecked — instead of hiding again.
// `_BANK_DVX_VW`/`datos_bancarios.sectionVisibleWhen` (fm303Layouts.js) now require
// `_box111NonZero` in the rectificativa branch too, matching `_BANK_FULL_BLOCK_REQUIRED_WHEN`
// exactly, so visibility and requiredness hide/show together. This test drives the REAL
// FmModel303Page (not a mocked FmBoxes303) through the actual DOM interactions a user would
// perform — tab switching, checkbox click, editable-cell edit — to prove the fix holds
// end-to-end, not just at the pure-function level (see fm303Layouts.bankIbanRequiredWhen.vitest.js
// for that lower-level coverage).
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock('@/auth/AuthContext.jsx', () => ({ useAuth: () => ({ selectedOrg: { id: 'org-1' } }) }));
vi.mock('../../../fiscal-models.css', () => ({}));
vi.mock('@/components/related-documents/helpers.js', () => ({ neoBase: (u) => u }));
vi.mock('../../../FmOverlays.jsx', () => ({
  PresentModal: () => null, FileGenModal303: () => null,
}));
vi.mock('@/components/attachments', () => ({
  AttachmentsTab: () => null, useAttachments: () => ({ upload: vi.fn() }),
}));
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal();
  const mocked = {};
  for (const key of Object.keys(actual)) mocked[key] = () => null;
  return mocked;
});
vi.mock('@/windows/custom/shared/CheckboxField.jsx', () => ({
  CheckboxField: ({ checked, disabled, onToggle }) =>
    React.createElement('input', { type: 'checkbox', checked: !!checked, disabled, onChange: e => onToggle?.(e.target.checked) }),
}));

import FmModel303Page from '../FmModel303Page.jsx';

function findRectificativaCheckbox() {
  const label = Array.from(document.querySelectorAll('.fm-aeat-ident-cb__label'))
    .find(el => el.textContent === 'fm.ident.rectificativa');
  return label.closest('.fm-aeat-ident-cb').querySelector('input[type="checkbox"]');
}

// Locates the editable grid cell for a given AD box number (its `.fm-aeat-cell__num` reads
// the box number, e.g. "111") and sets its value through the same edit-button -> input ->
// blur flow a real user drives.
function setBoxValue(boxNum, value) {
  const numSpan = Array.from(document.querySelectorAll('.fm-aeat-cell__num'))
    .find(el => el.textContent === String(boxNum).padStart(2, '0'));
  const cell = numSpan.closest('.fm-aeat-cell');
  fireEvent.click(cell.querySelector('.fm-aeat-cell__edit-btn'));
  const input = cell.querySelector('.fm-aeat-cell__input');
  fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.blur(input);
}

function makeDecl(identification, overrides = {}) {
  return {
    id: '303-2026-T2', model: '303', year: 2026, period: 'T2', type: 'ord',
    status: 'draft', result: null, incidents: { blocking: 0, warning: 0 },
    _precomputed: null, boxes: null, sources: [], history: [],
    identification,
    ...overrides,
  };
}

describe('FmModel303Page + FmBoxes303 — datos_bancarios visibility reactivity (ETP-5393 manual-QA fix)', () => {
  it('shows the bank block on rectificativa+box111!=0, then hides it again when box 111 returns to 0', () => {
    const decl = makeDecl({ tipo_declaracion: 'I', rectificativa: false });
    render(<FmModel303Page decl={decl} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    // Activate: check rectificativa, set box 111 = 10.
    fireEvent.click(screen.getByText('fm.page.resultado_final'));
    fireEvent.click(findRectificativaCheckbox());
    setBoxValue(111, 10);

    // Bank block visible AND required (asterisk present) on the identificacion tab.
    fireEvent.click(screen.getByText('fm.page.identificacion'));
    const labelAfterActivate = screen.getByText(/^fm\.ident\.bank\.swift_bic\*?$/);
    expect(labelAfterActivate).toBeInTheDocument();
    expect(labelAfterActivate.textContent).toBe('fm.ident.bank.swift_bic*');

    // Revert: box 111 back to 0 (rectificativa stays checked).
    fireEvent.click(screen.getByText('fm.page.resultado_final'));
    setBoxValue(111, 0);

    fireEvent.click(screen.getByText('fm.page.identificacion'));
    expect(screen.queryByText(/^fm\.ident\.bank\.swift_bic\*?$/)).not.toBeInTheDocument();
  });

  it('shows the bank block on rectificativa+box111!=0, then hides it again when rectificativa is unchecked', () => {
    const decl = makeDecl({ tipo_declaracion: 'I', rectificativa: false });
    render(<FmModel303Page decl={decl} onBack={vi.fn()} onStatusChange={vi.fn()} />);

    fireEvent.click(screen.getByText('fm.page.resultado_final'));
    fireEvent.click(findRectificativaCheckbox());
    setBoxValue(111, 10);

    fireEvent.click(screen.getByText('fm.page.identificacion'));
    expect(screen.getByText(/^fm\.ident\.bank\.swift_bic\*?$/)).toBeInTheDocument();

    // Revert: uncheck rectificativa (box 111 stays non-zero — tipo is NOT a devolución tipo).
    fireEvent.click(screen.getByText('fm.page.resultado_final'));
    fireEvent.click(findRectificativaCheckbox());

    fireEvent.click(screen.getByText('fm.page.identificacion'));
    expect(screen.queryByText(/^fm\.ident\.bank\.swift_bic\*?$/)).not.toBeInTheDocument();
  });
});
