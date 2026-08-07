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
  Check: () => null,
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

describe('FileGenModal', () => {
  const decl = { id: '1', model: '303', year: 2026, period: 'T2', phone: '', contact: '' };

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

  it('renders contact name and phone inputs', () => {
    const { container } = render(<FileGenModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const inputs = container.querySelectorAll('input');
    expect(inputs.length).toBe(2);
  });

  it('pre-fills inputs from decl props', () => {
    const declWithData = { ...decl, phone: '612345678', contact: 'Juan García' };
    const { container } = render(<FileGenModal decl={declWithData} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const inputs = container.querySelectorAll('input');
    // contact is first, phone is second based on source order
    expect(inputs[0].value).toBe('Juan García');
    expect(inputs[1].value).toBe('612345678');
  });

  it('calls onConfirm with entered contact and phone on generate', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<FileGenModal decl={decl} onConfirm={onConfirm} onClose={onClose} />);
    const inputs = container.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: 'Test Contact' } });
    fireEvent.change(inputs[1], { target: { value: '987654321' } });
    const generateBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.filegen.generate'));
    fireEvent.click(generateBtn);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ contact: 'Test Contact', phone: '987654321' })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn();
    render(<FileGenModal decl={decl} onConfirm={vi.fn()} onClose={onClose} />);
    const cancelBtn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.cancel'));
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
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

describe('NewDeclModal', () => {
  it('renders title', () => {
    render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.new_decl.title');
  });

  it('defaults to model 303 when no activeModels prop is passed', () => {
    const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    const select = container.querySelector('select');
    expect(select.value).toBe('303');
  });

  it('legacy fallback (no activeModels prop) offers both 303 and 349, enabled', () => {
    const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    const select = container.querySelector('select');
    const optionValues = Array.from(select.querySelectorAll('option')).map(o => o.value);
    expect(optionValues).toEqual(['303', '349']);
    expect(select.disabled).toBe(false);
    const createBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.create'));
    expect(createBtn.disabled).toBe(false);
    expect(document.body.textContent).not.toContain('fm.new_decl.no_active_models');
  });

  it('calls onConfirm with model, year, period, and draft status', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { container } = render(<NewDeclModal onConfirm={onConfirm} onClose={onClose} />);
    const createBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.create'));
    fireEvent.click(createBtn);
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
    const select = container.querySelector('select');
    const optionValues = Array.from(select.querySelectorAll('option')).map(o => o.value);
    expect(optionValues).toEqual(['349']);
  });

  it('defaults to the first active model when 303 is not active', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': false, '349': true }} />
    );
    const select = container.querySelector('select');
    expect(select.value).toBe('349');
  });

  it('when only 303 is active, offers exactly 303 and creates for it', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <NewDeclModal onConfirm={onConfirm} onClose={onClose} activeModels={{ '303': true, '349': false }} />
    );
    const select = container.querySelector('select');
    const optionValues = Array.from(select.querySelectorAll('option')).map(o => o.value);
    expect(optionValues).toEqual(['303']);
    expect(select.value).toBe('303');
    expect(select.disabled).toBe(false);

    const createBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.create'));
    expect(createBtn.disabled).toBe(false);
    fireEvent.click(createBtn);
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ model: '303', status: 'draft' })
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('when only 349 is active, the period select still lists monthly and quarterly options', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': false, '349': true }} />
    );
    const selects = container.querySelectorAll('select');
    const periodSelect = selects[2]; // model, year, period (in DOM order)
    const optgroups = periodSelect.querySelectorAll('optgroup');
    expect(optgroups.length).toBe(2);
    expect(periodSelect.value).toBe('T1');
  });

  it('disables the select and the Crear button when no model is active', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': false, '349': false }} />
    );
    const select = container.querySelector('select');
    expect(select.disabled).toBe(true);
    const createBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.create'));
    expect(createBtn.disabled).toBe(true);
    expect(document.body.textContent).toContain('fm.new_decl.no_active_models');
  });

  it('does not call onConfirm when no model is active and Crear is clicked', () => {
    const onConfirm = vi.fn();
    const { container } = render(
      <NewDeclModal onConfirm={onConfirm} onClose={vi.fn()} activeModels={{ '303': false, '349': false }} />
    );
    const createBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.create'));
    fireEvent.click(createBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Crear button carries a real disabled attribute, not just disabled styling', () => {
    const { container } = render(
      <NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} activeModels={{ '303': false, '349': false }} />
    );
    const createBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.create'));
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
});
