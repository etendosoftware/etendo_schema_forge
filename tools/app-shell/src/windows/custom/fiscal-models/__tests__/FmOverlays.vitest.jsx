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

import { PresentModal, FileGenModal, NewDeclModal, CompareDrawer } from '../FmOverlays.jsx';

// ── PresentModal ──────────────────────────────────────────────────────────────

describe('PresentModal', () => {
  const decl = { id: '1', model: '303', year: 2026, period: 'T2' };

  it('renders dialog with title', () => {
    render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.present.title');
  });

  it('renders all three submission paths', () => {
    render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.present.path.acuse');
    expect(document.body.textContent).toContain('fm.present.path.sin_acuse');
    expect(document.body.textContent).toContain('fm.present.path.otra');
  });

  it('confirm button is disabled when no path is selected', () => {
    const { container } = render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    const confirmBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.confirm_presentation'));
    expect(confirmBtn.disabled).toBe(true);
  });

  it('confirm button becomes enabled when submitted_ext path is selected', () => {
    const { container } = render(<PresentModal decl={decl} onConfirm={vi.fn()} onClose={vi.fn()} />);
    // Find path cards by looking for div with onClick
    const pathCards = container.querySelectorAll('[style*="cursor: pointer"]');
    // Click the "otra" path (last one)
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

// ── CompareDrawer ─────────────────────────────────────────────────────────────

describe('CompareDrawer', () => {
  const decl = {
    period: 'T2', year: 2026,
    boxes: { 1: 10000, 27: 1000, 45: 800, 46: 200, 59: 500, 60: 300 },
    summary: {},
  };
  const prevDecl = {
    period: 'T1', year: 2026,
    boxes: { 1: 8000, 27: 800, 45: 700, 46: 100, 59: 400, 60: 200 },
  };

  it('renders modal title', () => {
    render(<CompareDrawer decl={decl} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.compare.title');
  });

  it('shows prevLabel and currLabel in subtitle', () => {
    render(<CompareDrawer decl={decl} prevDecl={prevDecl} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('T1 2026');
    expect(document.body.textContent).toContain('T2 2026');
  });

  it('falls back to "T1 2026" as prevLabel when prevDecl is not provided', () => {
    render(<CompareDrawer decl={decl} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('T1 2026');
  });

  it('renders all six comparison row labels', () => {
    render(<CompareDrawer decl={decl} prevDecl={prevDecl} onClose={vi.fn()} />);
    ['fm.compare.row.base', 'fm.compare.row.iva_dev', 'fm.compare.row.iva_ded',
      'fm.compare.row.result', 'fm.compare.row.intracom', 'fm.compare.row.exports',
    ].forEach(key => expect(document.body.textContent).toContain(key));
  });

  it('shows ↑ arrow for positive delta', () => {
    // All curr > prev in default decl/prevDecl pair
    render(<CompareDrawer decl={decl} prevDecl={prevDecl} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('↑');
  });

  it('shows ↓ arrow when curr value is lower than prev', () => {
    const declLower = { ...decl, boxes: { ...decl.boxes, 27: 500 } }; // 500 < prev 800
    render(<CompareDrawer decl={declLower} prevDecl={prevDecl} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('↓');
  });

  it('shows — when prev value is zero (undefined percentage)', () => {
    const prevZero = { period: 'T1', year: 2026, boxes: { 1: 0, 27: 0, 45: 0, 46: 0, 59: 0, 60: 0 } };
    render(<CompareDrawer decl={decl} prevDecl={prevZero} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('—');
  });

  it('shows dev_improved insight when current IVA devengado exceeds previous', () => {
    // boxes[27]=1000 > prevDecl.boxes[27]=800 → devImproved true
    render(<CompareDrawer decl={decl} prevDecl={prevDecl} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.compare.insight.dev_improved');
  });

  it('shows dev_fell insight when current IVA devengado is lower', () => {
    const declLower = { ...decl, boxes: { ...decl.boxes, 27: 500 } }; // 500 < 800
    render(<CompareDrawer decl={declLower} prevDecl={prevDecl} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.compare.insight.dev_fell');
  });

  it('shows result_higher insight when |curr result| exceeds |prev result|', () => {
    // |boxes[46]=200| > |prevDecl.boxes[46]=100| → resultImproved true
    render(<CompareDrawer decl={decl} prevDecl={prevDecl} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.compare.insight.result_higher');
  });

  it('shows result_lower insight when |curr result| does not exceed |prev result|', () => {
    const declLowerResult = { ...decl, boxes: { ...decl.boxes, 46: 50 } }; // |50| < |100|
    render(<CompareDrawer decl={declLowerResult} prevDecl={prevDecl} onClose={vi.fn()} />);
    expect(document.body.textContent).toContain('fm.compare.insight.result_lower');
  });

  it('calls onClose when × header button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<CompareDrawer decl={decl} onClose={onClose} />);
    const closeBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('✕'));
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when overlay backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<CompareDrawer decl={decl} onClose={onClose} />);
    fireEvent.click(container.querySelector('.fm-modal-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not propagate click from modal body to overlay', () => {
    const onClose = vi.fn();
    const { container } = render(<CompareDrawer decl={decl} onClose={onClose} />);
    fireEvent.click(container.querySelector('.fm-config-modal'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when footer close button is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<CompareDrawer decl={decl} onClose={onClose} />);
    const closeBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('fm.action.close'));
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

  it('defaults to model 303', () => {
    const { container } = render(<NewDeclModal onConfirm={vi.fn()} onClose={vi.fn()} />);
    const select = container.querySelector('select');
    expect(select.value).toBe('303');
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
});
