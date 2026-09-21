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
    // ETP-5431 — marca 3 is seeded so SWIFT-BIC is one of the fields the marca calls for;
    // without a marca it would be hidden for a reason unrelated to what this test drives.
    const decl = makeDecl({ tipo_declaracion: 'I', rectificativa: false, bank_sepa: '3' });
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
    // ETP-5431 — marca 3 is seeded so SWIFT-BIC is one of the fields the marca calls for;
    // without a marca it would be hidden for a reason unrelated to what this test drives.
    const decl = makeDecl({ tipo_declaracion: 'I', rectificativa: false, bank_sepa: '3' });
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

// ── ETP-5431 — marca SEPA drives visibility, and hiding never destroys data ───
// The marca restriction is scoped to the Nota 3 case, so these all start from a rectificativa
// with a non-zero box 111 and the cancel/modify-debit flag unmarked.

function identInlineField(labelKey) {
  const label = Array.from(document.querySelectorAll('.fm-aeat-ident-inline-field__label'))
    .find(el => el.textContent.replace(/\*$/, '') === labelKey);
  return label ? label.closest('.fm-aeat-ident-inline-field') : null;
}

function marcaSelect() {
  return identInlineField('fm.ident.bank.sepa').querySelector('select');
}

function setMarca(value) {
  fireEvent.change(marcaSelect(), { target: { value } });
}

function bankTextInput(labelKey) {
  const field = identInlineField(labelKey);
  return field ? field.querySelector('.fm-aeat-ident-inline-field__input') : null;
}

describe('FmModel303Page + FmBoxes303 — marca SEPA reactivity (ETP-5431)', () => {
  // Drives the page into the Nota 3 case and lands on the identificacion tab.
  function renderInNota3(marca) {
    const decl = makeDecl({ tipo_declaracion: 'I', rectificativa: false, bank_sepa: marca });
    render(<FmModel303Page decl={decl} onBack={vi.fn()} onStatusChange={vi.fn()} />);
    fireEvent.click(screen.getByText('fm.page.resultado_final'));
    fireEvent.click(findRectificativaCheckbox());
    setBoxValue(111, 10);
    fireEvent.click(screen.getByText('fm.page.identificacion'));
  }

  it('raising the marca from 1 to 3 reveals the four foreign-bank fields', () => {
    renderInNota3('1');
    expect(identInlineField('fm.ident.bank.nombre')).toBeNull();

    setMarca('3');
    ['fm.ident.bank.nombre', 'fm.ident.bank.direccion', 'fm.ident.bank.ciudad', 'fm.ident.bank.pais']
      .forEach(key => expect(identInlineField(key)).not.toBeNull());
  });

  it('lowering the marca from 3 to 1 hides SWIFT-BIC and the four foreign-bank fields again', () => {
    renderInNota3('3');
    expect(identInlineField('fm.ident.bank.swift_bic')).not.toBeNull();

    setMarca('1');
    ['fm.ident.bank.swift_bic', 'fm.ident.bank.nombre', 'fm.ident.bank.direccion',
      'fm.ident.bank.ciudad', 'fm.ident.bank.pais']
      .forEach(key => expect(identInlineField(key)).toBeNull());
  });

  it('the marca selector and bank_iban stay reachable at every marca', () => {
    renderInNota3('3');
    for (const marca of ['1', '2', '3']) {
      setMarca(marca);
      expect(marcaSelect()).not.toBeNull();
      expect(identInlineField('fm.ident.bank.iban')).not.toBeNull();
    }
  });

  // THE decision this ticket made deliberately (and the reason no dependent-field-clearing
  // callout was added): hiding a field must NOT clear it. The backend already blanks the
  // unused positions when it writes the file, so clearing here would only destroy typed work
  // if the user changes the marca by mistake. A future refactor that "tidies up" the residue
  // by deleting it breaks this test — which is exactly the point.
  it('switching marca 3 -> 1 -> 3 preserves the typed foreign-bank values', () => {
    renderInNota3('3');

    fireEvent.change(bankTextInput('fm.ident.bank.nombre'), { target: { value: 'Banque Cantonale' } });
    fireEvent.change(bankTextInput('fm.ident.bank.direccion'), { target: { value: '12 Rue du Rhone' } });
    fireEvent.change(bankTextInput('fm.ident.bank.ciudad'), { target: { value: 'Geneve' } });
    fireEvent.change(bankTextInput('fm.ident.bank.pais'), { target: { value: 'CH' } });

    setMarca('1');
    expect(identInlineField('fm.ident.bank.nombre')).toBeNull();

    setMarca('3');
    expect(bankTextInput('fm.ident.bank.nombre').value).toBe('Banque Cantonale');
    expect(bankTextInput('fm.ident.bank.direccion').value).toBe('12 Rue du Rhone');
    expect(bankTextInput('fm.ident.bank.ciudad').value).toBe('Geneve');
    expect(bankTextInput('fm.ident.bank.pais').value).toBe('CH');
  });

  it('a typed SWIFT-BIC survives a trip down to marca 1 and back up to marca 2', () => {
    renderInNota3('2');
    fireEvent.change(bankTextInput('fm.ident.bank.swift_bic'), { target: { value: 'BBVAESMMXXX' } });

    setMarca('1');
    expect(identInlineField('fm.ident.bank.swift_bic')).toBeNull();

    setMarca('2');
    expect(bankTextInput('fm.ident.bank.swift_bic').value).toBe('BBVAESMMXXX');
  });

  // The select's own placeholder (value '') is distinct from every declared option: it is what
  // an untouched field holds, and it must trigger no escalation at all.
  it('selecting the placeholder hides every marca-gated field without clearing them', () => {
    renderInNota3('3');
    fireEvent.change(bankTextInput('fm.ident.bank.ciudad'), { target: { value: 'Geneve' } });

    setMarca('');
    ['fm.ident.bank.swift_bic', 'fm.ident.bank.nombre', 'fm.ident.bank.direccion',
      'fm.ident.bank.ciudad', 'fm.ident.bank.pais']
      .forEach(key => expect(identInlineField(key)).toBeNull());

    setMarca('3');
    expect(bankTextInput('fm.ident.bank.ciudad').value).toBe('Geneve');
  });

  it('the marca select renders four options: its own placeholder plus the three marcas', () => {
    renderInNota3('3');
    const options = Array.from(marcaSelect().querySelectorAll('option'));
    expect(options.map(o => o.value)).toEqual(['', '1', '2', '3']);
    // The placeholder is the ONLY empty-valued choice — there is no separate "0" option.
    expect(options.filter(o => o.value === '')).toHaveLength(1);
    expect(options.map(o => o.textContent)).toEqual([
      'fm.ident.decl.placeholder',
      'fm.ident.bank.sepa.spain',
      'fm.ident.bank.sepa.eu_sepa',
      'fm.ident.bank.sepa.rest_of_world',
    ]);
  });
});
