// Vitest component tests for FmOverlays.jsx — PresentModal and FileGenModal
import { vi, describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('../fiscal-models.css', () => ({}));
vi.mock('@/components/related-documents/helpers.js', () => ({
  neoBase: (u) => u,
}));
vi.mock('lucide-react', () => ({
  Star: () => null, Play: () => null, ArrowUpRight: () => null, Info: () => null,
  OctagonAlert: () => null, TriangleAlert: () => null, X: () => null,
  Check: () => null, ChevronDown: () => null, Search: () => null,
}));
vi.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onChange }) => (
    React.createElement('input', { type: 'checkbox', checked: !!checked, onChange: onChange ?? (() => {}) })
  ),
}));

import { PresentModal, FileGenModal, NewDeclModal } from '../FmOverlays.jsx';

// ── PresentModal ──────────────────────────────────────────────────────────────

describe('PresentModal', () => {
  const decl = { id: '1', model: '303', year: 2026, period: 'T2' };

  it('renders dialog with title', () => {
    render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.present.title');
  });

  it('renders both submission paths (acuse, sin_acuse)', () => {
    render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.present.path.acuse');
    expect(document.body.textContent).toContain('fm.present.path.sin_acuse');
  });

  it('does not render the "Otra Plataforma" (submitted_ext) path option', () => {
    render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.textContent).not.toContain('fm.present.path.otra');
  });

  it('confirm button is disabled when no path is selected', () => {
    const { container } = render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const confirmBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.confirm_presentation'));
    expect(confirmBtn.disabled).toBe(true);
  });

  it('confirm button becomes enabled when the submitted (sin_acuse) path is selected', () => {
    const { container } = render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    // Find path cards by looking for div with onClick
    const pathCards = container.querySelectorAll('[style*="cursor: pointer"]');
    // Click the "sin_acuse"/submitted path (last one — only 2 paths remain)
    fireEvent.click(pathCards[pathCards.length - 1]);
    const confirmBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.confirm_presentation'));
    expect(confirmBtn.disabled).toBe(false);
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={onClose} />);
    const overlay = container.querySelector('.fm-modal-overlay');
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when × button is clicked', () => {
    const onClose = vi.fn();
    render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={onClose} />);
    const closeBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('✕'));
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm with correct status when submitted path is selected and confirmed', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<PresentModal decl={decl} onConfirm={onConfirm} onClose={onClose} />);
    // Select "submitted" (sin_acuse) path — 2nd card
    const pathCards = container.querySelectorAll('[style*="cursor: pointer"]');
    fireEvent.click(pathCards[1]); // submitted (no ack)
    const confirmBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.confirm_presentation'));
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'submitted' })
    );
  });

  it('confirm button stays disabled on the submitted_ack (acuse) path until a file is uploaded', () => {
    const { container } = render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    // Select "acuse" (submitted_ack) path — 1st card.
    const pathCards = container.querySelectorAll('[style*="cursor: pointer"]');
    fireEvent.click(pathCards[0]);
    const confirmBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.confirm_presentation'));
    // canConfirm = path === 'submitted' || (path === 'submitted_ack' && acuseFile) —
    // no file selected yet, so it must remain disabled (not an off-by-one leftover
    // from the removed 3rd path).
    expect(confirmBtn.disabled).toBe(true);
  });

  it('calls onConfirm with status submitted_ack and the uploaded file once a file is attached on the acuse path', () => {
    const onConfirm = vi.fn();
    const { container } = render(<PresentModal decl={decl} onConfirm={onConfirm} onClose={vi.fn()} />);
    const pathCards = container.querySelectorAll('[style*="cursor: pointer"]');
    fireEvent.click(pathCards[0]); // submitted_ack (acuse) path
    const fileInput = container.querySelector('input[type="file"]');
    const file = new File(['dummy'], 'acuse.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    const confirmBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.confirm_presentation'));
    expect(confirmBtn.disabled).toBe(false);
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith({ status: 'submitted_ack', acuseFile: file });
  });

  it('does not propagate click from modal body to overlay', () => {
    const onClose = vi.fn();
    const { container } = render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={onClose} />);
    const modalBody = container.querySelector('.fm-config-modal');
    fireEvent.click(modalBody);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ── FileGenModal ──────────────────────────────────────────────────────────────
// Mirrors the classic "Parámetros de entrada del generador de declaraciones" popup
// (OBTL_TaxReportLauncher) for Modelo 349 — 8 fields total: FileName, Contact, Phone
// (text), Substitutive (checkbox), FormerStatement, RepresentativeTaxId (text),
// Navarra, Guipuzcoa (checkbox) — rendered in that exact order, matching classic's
// `OBTL_Tax_Report_Parameter.sequenceNumber` ordering (10/10/20/30/40/80/90/100).

describe('FileGenModal', () => {
  const decl = { id: '1', model: '303', year: 2026, period: 'T2', phone: '', contact: '' };

  // Text inputs render in DOM order: FileName, Contact, Phone, FormerStatement,
  // RepresentativeTaxId. Checkboxes (mocked as <input type="checkbox">) render
  // interleaved: Substitutive (after Phone), Navarra, Guipuzcoa (after RepresentativeTaxId).
  function getFields(container) {
    const all = Array.from(container.querySelectorAll('input'));
    return {
      fileName:           all[0],
      contact:            all[1],
      phone:              all[2],
      substitutive:       all[3],
      formerStatement:    all[4],
      representativeTaxId: all[5],
      navarra:            all[6],
      guipuzcoa:          all[7],
    };
  }

  it('renders title', () => {
    render(<FileGenModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.filegen.title');
  });

  it('shows the declaration reference in description', () => {
    render(<FileGenModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('303');
    expect(document.body.textContent).toContain('2026');
    expect(document.body.textContent).toContain('T2');
  });

  it('renders all 8 fields (5 text inputs + 3 checkboxes)', () => {
    const { container } = render(<FileGenModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).toBe(8);
    const { fileName, substitutive, navarra, guipuzcoa } = getFields(container);
    expect(fileName.type).toBe('text');
    expect(substitutive.type).toBe('checkbox');
    expect(navarra.type).toBe('checkbox');
    expect(guipuzcoa.type).toBe('checkbox');
  });

  it('renders every field label via its i18n key, in classic OBTL_Tax_Report_Parameter order', () => {
    render(<FileGenModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const text = document.body.textContent;
    const keys = [
      'fm.filegen.filename',
      'fm.filegen.contact_name',
      'fm.filegen.contact_phone',
      'fm.filegen.substitutive',
      'fm.filegen.former_statement',
      'fm.filegen.representative_nif',
      'fm.filegen.navarra',
      'fm.filegen.guipuzcoa',
    ];
    for (const key of keys) expect(text).toContain(key);
    // Order matters: each key must appear strictly after the previous one.
    const positions = keys.map(k => text.indexOf(k));
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it('defaults: checkboxes unchecked, new text fields empty; contact/phone stay empty when decl has none', () => {
    const { container } = render(<FileGenModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const f = getFields(container);
    expect(f.fileName.value).toBe('');
    expect(f.contact.value).toBe('');
    expect(f.phone.value).toBe('');
    expect(f.formerStatement.value).toBe('');
    expect(f.representativeTaxId.value).toBe('');
    expect(f.substitutive.checked).toBe(false);
    expect(f.navarra.checked).toBe(false);
    expect(f.guipuzcoa.checked).toBe(false);
  });

  it('pre-fills contact and phone from decl props; other fields stay at their defaults', () => {
    const declWithData = { ...decl, phone: '612345678', contact: 'Juan García' };
    const { container } = render(<FileGenModal decl={declWithData} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const f = getFields(container);
    expect(f.contact.value).toBe('Juan García');
    expect(f.phone.value).toBe('612345678');
    expect(f.fileName.value).toBe('');
    expect(f.formerStatement.value).toBe('');
    expect(f.representativeTaxId.value).toBe('');
  });

  it('calls onConfirm with the complete 8-key payload when nothing is touched (all defaults)', () => {
    // fileName/formerStatement/representativeTaxId go through `field.trim() || undefined`
    // (same pattern as FileGenModal303) — an untouched (empty) field yields `undefined`,
    // never the raw empty string.
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<FileGenModal decl={decl} onConfirm={onConfirm} onClose={onClose} />);
    const generateBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.filegen.generate'));
    fireEvent.click(generateBtn);
    expect(onConfirm).toHaveBeenCalledWith({
      fileName: undefined, phone: '', contact: '', substitutive: false,
      formerStatement: undefined, representativeTaxId: undefined, navarra: false, guipuzcoa: false,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('whitespace-only fileName/formerStatement/representativeTaxId are trimmed to undefined in onConfirm', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<FileGenModal decl={decl} onConfirm={onConfirm} onClose={onClose} />);
    const f = getFields(container);
    fireEvent.change(f.fileName, { target: { value: '   ' } });
    fireEvent.change(f.formerStatement, { target: { value: '   ' } });
    fireEvent.change(f.representativeTaxId, { target: { value: '   ' } });
    const generateBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.filegen.generate'));
    fireEvent.click(generateBtn);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: undefined,
        formerStatement: undefined,
        representativeTaxId: undefined,
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onConfirm with the complete 8-key payload when every field is filled/checked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<FileGenModal decl={decl} onConfirm={onConfirm} onClose={onClose} />);
    const f = getFields(container);
    fireEvent.change(f.fileName, { target: { value: 'my_349_file' } });
    fireEvent.change(f.contact, { target: { value: 'Test Contact' } });
    fireEvent.change(f.phone, { target: { value: '987654321' } });
    fireEvent.click(f.substitutive);
    fireEvent.change(f.formerStatement, { target: { value: '1234567890123' } });
    fireEvent.change(f.representativeTaxId, { target: { value: 'X1234567L' } });
    fireEvent.click(f.navarra);
    fireEvent.click(f.guipuzcoa);
    const generateBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.filegen.generate'));
    fireEvent.click(generateBtn);
    expect(onConfirm).toHaveBeenCalledWith({
      fileName: 'my_349_file',
      phone: '987654321',
      contact: 'Test Contact',
      substitutive: true,
      formerStatement: '1234567890123',
      representativeTaxId: 'X1234567L',
      navarra: true,
      guipuzcoa: true,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onConfirm when cancel is clicked', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<FileGenModal decl={decl} onConfirm={onConfirm} onClose={onClose} />);
    const cancelBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.cancel'));
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

// ── FileGenModal (extra coverage) ────────────────────────────────────────────

describe('FileGenModal (backdrop and header close)', () => {
  const decl = { id: '2', model: '349', year: 2026, period: 'T2', phone: '', contact: '' };

  it('closes when backdrop overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<FileGenModal decl={decl} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(container.querySelector('.fm-modal-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close when modal body is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<FileGenModal decl={decl} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(container.querySelector('.fm-config-modal'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when × header button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<FileGenModal decl={decl} onConfirm={vi.fn()} onClose={onClose} />);
    const closeBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('✕'));
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});

// ── NewDeclModal ──────────────────────────────────────────────────────────────
// "Modelo" and "Año" are both button + dropdown fields (ModelSelectMenu /
// YearSelectMenu), not native <select>s; "Período" is a segmented button grid
// gated by a "Frecuencia" segmented control (quarterly T1..T4 / monthly
// 01..12). Helpers below query that markup instead of select/option/optgroup.

function getModelTrigger(container) {
  return container.querySelector('.fm-newdecl-model-trigger');
}

function openModelMenu(container) {
  fireEvent.click(getModelTrigger(container));
}

function getModelOptions(container) {
  return Array.from(container.querySelectorAll('[role="option"]'));
}

function getModelOption(container, id) {
  return getModelOptions(container).find(o => o.querySelector('.fm-model-badge')?.textContent === id);
}

function getCreateBtn(container) {
  return Array.from(container.querySelectorAll('button'))
    .find(b => b.textContent.includes('fm.new_decl.create_cta'));
}

function getFrequencyBtn(container, key) {
  return Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes(key));
}

function getPeriodBtn(container, period) {
  return Array.from(container.querySelectorAll('.fm-newdecl-period-btn')).find(b => b.textContent.trim().startsWith(period));
}

function getYearTrigger(container) {
  return container.querySelector('.fm-newdecl-year-trigger');
}

function openYearMenu(container) {
  fireEvent.click(getYearTrigger(container));
}

function getYearOptions(container) {
  return Array.from(container.querySelectorAll('.fm-newdecl-year-option'));
}

function getYearOption(container, year) {
  return getYearOptions(container).find(o => o.textContent.trim() === String(year));
}

function selectYear(container, year) {
  openYearMenu(container);
  fireEvent.click(getYearOption(container, year));
}

describe('NewDeclModal', () => {
  it('renders title and subtitle', () => {
    render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.new_decl.title');
    expect(document.body.textContent).toContain('fm.new_decl.subtitle');
  });

  it('renders the Frecuencia field with both quarterly and monthly pills', () => {
    render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.new_decl.frequency');
    expect(document.body.textContent).toContain('fm.new_decl.period_quarterly');
    expect(document.body.textContent).toContain('fm.new_decl.period_monthly');
  });

  it('defaults to model 303 when no activeModels prop is passed', () => {
    const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    const trigger = getModelTrigger(container);
    expect(trigger.querySelector('.fm-model-badge').textContent).toBe('303');
  });

  it('legacy fallback (no activeModels prop) offers both 303 and 349, enabled', () => {
    const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    const trigger = getModelTrigger(container);
    expect(trigger.disabled).toBe(false);
    openModelMenu(container);
    const optionIds = getModelOptions(container).map(o => o.querySelector('.fm-model-badge').textContent);
    expect(optionIds).toEqual(['303', '349']);
    const createBtn = getCreateBtn(container);
    expect(createBtn.disabled).toBe(false);
    expect(document.body.textContent).not.toContain('fm.new_decl.no_active_models');
  });

  it('calls onConfirm with model, year, period, and draft status', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<NewDeclModal onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(getCreateBtn(container));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ model: '303', status: 'draft' })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn();
    render(<NewDeclModal onConfirm={vi.fn()} onClose={onClose} />);
    const cancelBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.cancel'));
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('only lists models that are active in the catalog', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': false, '349': true }} />
    );
    openModelMenu(container);
    const optionIds = getModelOptions(container).map(o => o.querySelector('.fm-model-badge').textContent);
    expect(optionIds).toEqual(['349']);
  });

  it('defaults to the first active model when 303 is not active', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': false, '349': true }} />
    );
    const trigger = getModelTrigger(container);
    expect(trigger.querySelector('.fm-model-badge').textContent).toBe('349');
  });

  it('when only 303 is active, offers exactly 303 and creates for it', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <NewDeclModal onConfirm={onConfirm} onClose={onClose} activeModels={{ '303': true, '349': false }} />
    );
    const trigger = getModelTrigger(container);
    expect(trigger.querySelector('.fm-model-badge').textContent).toBe('303');
    expect(trigger.disabled).toBe(false);
    openModelMenu(container);
    const optionIds = getModelOptions(container).map(o => o.querySelector('.fm-model-badge').textContent);
    expect(optionIds).toEqual(['303']);

    const createBtn = getCreateBtn(container);
    expect(createBtn.disabled).toBe(false);
    fireEvent.click(createBtn);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ model: '303', status: 'draft' })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('when only 349 is active, the Frecuencia field still offers monthly and quarterly, and Período defaults to quarterly T1', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': false, '349': true }} />
    );
    expect(getFrequencyBtn(container, 'fm.new_decl.period_quarterly')).toBeTruthy();
    expect(getFrequencyBtn(container, 'fm.new_decl.period_monthly')).toBeTruthy();
    const periodButtons = Array.from(container.querySelectorAll('.fm-newdecl-period-btn'));
    expect(periodButtons.map(b => b.textContent.trim())).toEqual(['T1', 'T2', 'T3', 'T4']);
    const t1 = getPeriodBtn(container, 'T1');
    expect(t1.getAttribute('aria-pressed')).toBe('true');
  });

  it('switching Frecuencia to monthly swaps the period grid to 01..12 and updates the section hint', () => {
    const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.new_decl.period_section_quarters');
    fireEvent.click(getFrequencyBtn(container, 'fm.new_decl.period_monthly'));
    const periodButtons = Array.from(container.querySelectorAll('.fm-newdecl-period-btn'));
    expect(periodButtons.map(b => b.textContent.trim())).toEqual(
      ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
    );
    expect(document.body.textContent).toContain('fm.new_decl.period_section_months');
    // Switching frequency resets the selected period to that frequency's first value.
    expect(getPeriodBtn(container, '01').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(getFrequencyBtn(container, 'fm.new_decl.period_quarterly'));
    expect(Array.from(container.querySelectorAll('.fm-newdecl-period-btn')).map(b => b.textContent.trim()))
      .toEqual(['T1', 'T2', 'T3', 'T4']);
    expect(document.body.textContent).toContain('fm.new_decl.period_section_quarters');
    expect(getPeriodBtn(container, 'T1').getAttribute('aria-pressed')).toBe('true');
  });

  it('disables the model trigger and the Crear button when no model is active', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': false, '349': false }} />
    );
    const trigger = getModelTrigger(container);
    expect(trigger.disabled).toBe(true);
    const createBtn = getCreateBtn(container);
    expect(createBtn.disabled).toBe(true);
    expect(document.body.textContent).toContain('fm.new_decl.no_active_models');
  });

  it('does not call onConfirm when no model is active and Crear is clicked', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <NewDeclModal onConfirm={onConfirm} onClose={vi.fn()} activeModels={{ '303': false, '349': false }} />
    );
    fireEvent.click(getCreateBtn(container));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Crear button carries a real disabled attribute, not just disabled styling', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': false, '349': false }} />
    );
    const createBtn = getCreateBtn(container);
    // hasAttribute confirms the real DOM `disabled` attribute is set (a11y-relevant,
    // not merely a CSS/visual cue) — a screen reader / keyboard user cannot activate it.
    expect(createBtn.hasAttribute('disabled')).toBe(true);
    expect(createBtn.disabled).toBe(true);
  });

  it('renders without crashing and does not auto-invoke onConfirm when all models are false', () => {
    const onConfirm = vi.fn();
    expect(() =>
      render(
        <NewDeclModal onConfirm={onConfirm} onClose={vi.fn()} activeModels={{ '303': false, '349': false }} />
      )
    ).not.toThrow();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders the create button with the new create_cta label, not the old generic action.create key', () => {
    const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    const createBtn = getCreateBtn(container);
    expect(createBtn).toBeTruthy();
    expect(createBtn.textContent.trim()).toBe('fm.new_decl.create_cta');
    expect(Array.from(container.querySelectorAll('button')).some(b => b.textContent.trim() === 'fm.action.create')).toBe(false);
  });

  it('opening the model dropdown shows one option per active model with its catalog name and desc', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': true, '349': true }} />
    );
    openModelMenu(container);
    const panel = container.querySelector('.fm-newdecl-model-panel');
    expect(panel).toBeTruthy();
    expect(panel.textContent).toContain('fm.catalog.303.name');
    expect(panel.textContent).toContain('fm.catalog.303.desc');
    expect(panel.textContent).toContain('fm.catalog.349.name');
    expect(panel.textContent).toContain('fm.catalog.349.desc');
  });

  it('typing in the model search filters options by model id', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': true, '349': true }} />
    );
    openModelMenu(container);
    const search = container.querySelector('.fm-newdecl-model-search input');
    fireEvent.change(search, { target: { value: '349' } });
    const optionIds = getModelOptions(container).map(o => o.querySelector('.fm-model-badge').textContent);
    expect(optionIds).toEqual(['349']);
  });

  it('typing in the model search filters options by catalog name substring', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': true, '349': true }} />
    );
    openModelMenu(container);
    const search = container.querySelector('.fm-newdecl-model-search input');
    // The mocked i18n returns the raw key ("fm.catalog.303.name"), so a substring
    // of that key exercises the name-based branch of the filter (not the id branch).
    fireEvent.change(search, { target: { value: 'catalog.303' } });
    const optionIds = getModelOptions(container).map(o => o.querySelector('.fm-model-badge').textContent);
    expect(optionIds).toEqual(['303']);
  });

  it('clicking a model option updates the trigger and is used when creating', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <NewDeclModal onConfirm={onConfirm} onClose={vi.fn()} activeModels={{ '303': true, '349': true }} />
    );
    openModelMenu(container);
    fireEvent.click(getModelOption(container, '349'));
    const trigger = getModelTrigger(container);
    expect(trigger.querySelector('.fm-model-badge').textContent).toBe('349');
    // The dropdown closes after selecting an option.
    expect(container.querySelector('.fm-newdecl-model-panel')).toBeNull();

    fireEvent.click(getCreateBtn(container));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ model: '349', status: 'draft' })
    );
  });

  it('selecting a different model resets Período back to the current frequency\'s first value', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <NewDeclModal onConfirm={onConfirm} onClose={vi.fn()} activeModels={{ '303': true, '349': true }} />
    );
    // Move off the default period first, so the reset is actually observable.
    fireEvent.click(getPeriodBtn(container, 'T3'));
    expect(getPeriodBtn(container, 'T3').getAttribute('aria-pressed')).toBe('true');

    openModelMenu(container);
    fireEvent.click(getModelOption(container, '349'));

    expect(getPeriodBtn(container, 'T1').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(getCreateBtn(container));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ model: '349', period: 'T1', status: 'draft' })
    );
  });

  it('selecting a different model resets Período to 01 when Frecuencia is monthly', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': true, '349': true }} />
    );
    fireEvent.click(getFrequencyBtn(container, 'fm.new_decl.period_monthly'));
    fireEvent.click(getPeriodBtn(container, '05'));
    expect(getPeriodBtn(container, '05').getAttribute('aria-pressed')).toBe('true');

    openModelMenu(container);
    fireEvent.click(getModelOption(container, '349'));

    // Frecuencia stays monthly (only the model changed), so the reset value
    // must be the first monthly period, not a hardcoded quarterly 'T1'.
    expect(getPeriodBtn(container, '01').getAttribute('aria-pressed')).toBe('true');
  });

  describe('Año dropdown', () => {
    it('renders the year field as a button + dropdown, not a segmented pill group', () => {
      const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
      const trigger = getYearTrigger(container);
      expect(trigger).toBeTruthy();
      expect(trigger.tagName).toBe('BUTTON');
      expect(container.querySelector('.fm-newdecl-year-panel')).toBeNull();
      // The old segmented markup for Año is gone entirely.
      expect(container.querySelectorAll('.fm-newdecl-segmented__btn').length).toBe(2); // Frecuencia only
    });

    it('opening the dropdown lists every supported year as a plain option with a checkmark on the current one', () => {
      const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
      const currentYear = getYearTrigger(container).textContent.trim();
      openYearMenu(container);
      const options = getYearOptions(container);
      expect(options.length).toBeGreaterThan(0);
      // No chip/badge and no subtitle — unlike ModelSelectMenu's rows.
      options.forEach(o => expect(o.querySelector('.fm-model-badge')).toBeNull());
      const selectedOption = options.find(o => o.className.includes('fm-newdecl-year-option--selected'));
      expect(selectedOption).toBeTruthy();
      expect(selectedOption.textContent.trim()).toBe(currentYear.trim());
      // lucide-react is mocked to `() => null` in this file, so the Check icon
      // itself can't be asserted on here; aria-selected carries the same signal.
      expect(selectedOption.getAttribute('aria-selected')).toBe('true');
    });

    it('clicking a year option updates the trigger, closes the dropdown, and clicking outside also closes it', () => {
      const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
      openYearMenu(container);
      const options = getYearOptions(container);
      const otherYear = options.find(o => !o.className.includes('fm-newdecl-year-option--selected'));
      expect(otherYear).toBeTruthy();
      const otherYearValue = otherYear.textContent.trim();
      fireEvent.click(otherYear);
      expect(getYearTrigger(container).textContent.trim()).toBe(otherYearValue);
      expect(container.querySelector('.fm-newdecl-year-panel')).toBeNull();

      openYearMenu(container);
      expect(container.querySelector('.fm-newdecl-year-panel')).toBeTruthy();
      fireEvent.mouseDown(document.body);
      expect(container.querySelector('.fm-newdecl-year-panel')).toBeNull();
    });

    it('selecting a different year is reflected in the footer preview and the onConfirm payload', () => {
      const onConfirm = vi.fn();
      const { container } = render(<NewDeclModal onConfirm={onConfirm} onClose={vi.fn()} />);
      openYearMenu(container);
      const options = getYearOptions(container);
      const otherYear = Number(options.find(o => !o.className.includes('fm-newdecl-year-option--selected')).textContent.trim());
      fireEvent.click(getYearOption(container, otherYear));

      expect(document.body.textContent).toContain(`fm.new_decl.preview`);
      fireEvent.click(getCreateBtn(container));
      expect(onConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ year: otherYear, status: 'draft' })
      );
    });
  });

  describe('existingDeclarations', () => {
    // The duplicate-declaration banner was removed entirely — an already-declared
    // period is now communicated purely through the disabled button + dot,
    // never through a message. See the dedicated "no banner" test below.
    it('marks a period with an existing declaration for the selected model+year and disables it', () => {
      const { container } = render(
        <NewDeclModal
          onConfirm={vi.fn()}
          onClose={vi.fn()}
          activeModels={{ '303': true, '349': true }}
          existingDeclarations={[{ model: '303', year: 2026, period: 'T1' }]}
        />
      );
      selectYear(container, 2026);
      const t1 = getPeriodBtn(container, 'T1');
      expect(t1.className).toContain('fm-newdecl-period-btn--existing');
      expect(t1.querySelector('.fm-newdecl-period-btn__dot')).toBeTruthy();
      // Real DOM `disabled` attribute — a screen reader / keyboard user cannot
      // select an already-declared period, not just a visual/CSS cue.
      expect(t1.hasAttribute('disabled')).toBe(true);
      expect(t1.disabled).toBe(true);

      // T2 has no existing declaration: no dot, not disabled, and remains
      // selectable; T1 keeps carrying the existing-indicator regardless of the
      // current selection (existence is per-period, not tied to selection).
      const t2 = getPeriodBtn(container, 'T2');
      expect(t2.className).not.toContain('fm-newdecl-period-btn--existing');
      expect(t2.hasAttribute('disabled')).toBe(false);
      fireEvent.click(t2);
      expect(t2.getAttribute('aria-pressed')).toBe('true');
      expect(getPeriodBtn(container, 'T1').className).toContain('fm-newdecl-period-btn--existing');
    });

    it('never disables any period or shows the existing-indicator when existingDeclarations is omitted', () => {
      const { container } = render(
        <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': true, '349': true }} />
      );
      selectYear(container, 2026);
      for (const p of ['T1', 'T2', 'T3', 'T4']) {
        const btn = getPeriodBtn(container, p);
        expect(btn.className).not.toContain('fm-newdecl-period-btn--existing');
        expect(btn.querySelector('.fm-newdecl-period-btn__dot')).toBeNull();
        expect(btn.hasAttribute('disabled')).toBe(false);
      }
    });

    it('clicking a disabled (already-declared) period button does not change the selection', () => {
      const { container: probe } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
      const defaultYear = Number(getYearTrigger(probe).textContent.trim());

      // T3 (not the default T1) is already declared, so the initial selection
      // stays on T1 — this isolates "clicking a disabled button" from the
      // separate auto-jump-away-from-a-disabled-default behavior tested below.
      const { container } = render(
        <NewDeclModal
          onConfirm={vi.fn()}
          onClose={vi.fn()}
          activeModels={{ '303': true, '349': true }}
          existingDeclarations={[{ model: '303', year: defaultYear, period: 'T3' }]}
        />
      );
      expect(getPeriodBtn(container, 'T1').getAttribute('aria-pressed')).toBe('true');

      const t3 = getPeriodBtn(container, 'T3');
      expect(t3.hasAttribute('disabled')).toBe(true);
      fireEvent.click(t3);
      // Native disabled-button behavior: the click never reaches onClick, so
      // the selection is unchanged.
      expect(t3.getAttribute('aria-pressed')).toBe('false');
      expect(getPeriodBtn(container, 'T1').getAttribute('aria-pressed')).toBe('true');
    });

    it('opens with the default selection skipped away from an already-declared period', () => {
      const { container: probe } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
      const defaultYear = Number(getYearTrigger(probe).textContent.trim());

      // T1 (the modal's default period) is already declared for model 303 —
      // the auto-jump effect should move the initial selection to T2 instead
      // of opening on a disabled default.
      const { container } = render(
        <NewDeclModal
          onConfirm={vi.fn()}
          onClose={vi.fn()}
          activeModels={{ '303': true, '349': true }}
          existingDeclarations={[{ model: '303', year: defaultYear, period: 'T1' }]}
        />
      );
      expect(getPeriodBtn(container, 'T1').getAttribute('aria-pressed')).toBe('false');
      expect(getPeriodBtn(container, 'T2').getAttribute('aria-pressed')).toBe('true');
    });

    it('disables the Crear button and shows no message when every period of the current frequency is already declared', () => {
      const { container: probe } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
      const defaultYear = Number(getYearTrigger(probe).textContent.trim());

      const { container } = render(
        <NewDeclModal
          onConfirm={vi.fn()}
          onClose={vi.fn()}
          activeModels={{ '303': true, '349': true }}
          existingDeclarations={['T1', 'T2', 'T3', 'T4'].map(period => (
            { model: '303', year: defaultYear, period }
          ))}
        />
      );
      const createBtn = getCreateBtn(container);
      expect(createBtn.hasAttribute('disabled')).toBe(true);
      expect(createBtn.disabled).toBe(true);
      expect(createBtn.className).not.toContain('fm-btn--save-pill--active');
      // Still no explanatory message for this case — the CTA just goes inert.
      expect(container.textContent).not.toContain('fm.new_decl.duplicate_warning');
      expect(container.textContent).not.toContain('fm.new_decl.no_active_models');
    });

    it('never renders a duplicate-declaration banner, even when a period is already declared', () => {
      const { container } = render(
        <NewDeclModal
          onConfirm={vi.fn()}
          onClose={vi.fn()}
          activeModels={{ '303': true, '349': true }}
          existingDeclarations={[{ model: '303', year: 2026, period: 'T1' }]}
        />
      );
      selectYear(container, 2026);
      expect(container.querySelector('.fm-banner--rich')).toBeNull();
      expect(container.querySelector('.fm-banner--warn')).toBeNull();
      expect(container.textContent).not.toContain('fm.new_decl.duplicate_warning');
    });
  });
});
