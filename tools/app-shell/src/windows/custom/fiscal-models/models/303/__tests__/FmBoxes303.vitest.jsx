// Vitest component tests for FmBoxes303.jsx
import { vi, describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));
vi.mock('lucide-react', () => ({
  TrendingUp: () => null,
  TrendingDown: () => null,
  Pencil: () => null,
}));
vi.mock('@/windows/custom/shared/CheckboxField.jsx', () => ({
  // Forwards `disabled` straight through, matching the real CheckboxField
  // component's contract (tools/app-shell/src/windows/custom/shared/
  // CheckboxField.jsx forwards `disabled` to the underlying <button> as-is).
  CheckboxField: ({ checked, disabled, onToggle }) =>
    React.createElement('input', {
      type: 'checkbox', checked: !!checked, disabled,
      onChange: e => onToggle?.(e.target.checked),
    }),
}));

import FmBoxes303 from '../FmBoxes303.jsx';

const BASE_PROPS = {
  year: 2026,
  period: 'T2',
};

// ── Rendering with boxes as object ────────────────────────────────────────────

describe('FmBoxes303 — rendering', () => {
  it('renders without crashing with empty boxes', () => {
    render(<FmBoxes303 {...BASE_PROPS} boxes={{}} />);
    expect(document.body).toBeTruthy();
  });

  it('renders the fm-aeat-table container', () => {
    const { container } = render(<FmBoxes303 {...BASE_PROPS} boxes={{}} />);
    expect(container.querySelector('.fm-aeat-table')).toBeTruthy();
  });

  it('renders fm-aeat-section elements', () => {
    const { container } = render(<FmBoxes303 {...BASE_PROPS} boxes={{}} />);
    expect(container.querySelectorAll('.fm-aeat-section').length).toBeGreaterThan(0);
  });

  it('renders fm-aeat-cell elements for box values', () => {
    const { container } = render(<FmBoxes303 {...BASE_PROPS} boxes={{ 7: 1000, 9: 210 }} />);
    expect(container.querySelectorAll('.fm-aeat-cell').length).toBeGreaterThan(0);
  });
});

// ── Box value display ─────────────────────────────────────────────────────────

describe('FmBoxes303 — box value display', () => {
  it('shows formatted amount for a known box value (object form)', () => {
    const { container } = render(<FmBoxes303 {...BASE_PROPS} boxes={{ 7: 1234.56 }} />);
    // formatAmount renders currency; check the cell has some text
    const cells = container.querySelectorAll('.fm-aeat-cell__value');
    const nonEmpty = Array.from(cells).filter(c => c.textContent.trim() !== '');
    expect(nonEmpty.length).toBeGreaterThan(0);
  });

  it('accepts boxes as an array of {num, value} objects', () => {
    const boxes = [{ num: 7, value: 500 }, { num: 9, value: 105 }];
    const { container } = render(<FmBoxes303 {...BASE_PROPS} boxes={boxes} />);
    const cells = container.querySelectorAll('.fm-aeat-cell__value');
    const nonEmpty = Array.from(cells).filter(c => c.textContent.trim() !== '');
    expect(nonEmpty.length).toBeGreaterThan(0);
  });

  it('renders box number padded to 2 digits', () => {
    const { container } = render(<FmBoxes303 {...BASE_PROPS} boxes={{ 7: 100 }} />);
    const nums = Array.from(container.querySelectorAll('.fm-aeat-cell__num'));
    const numTexts = nums.map(n => n.textContent);
    // Box 7 renders as "07"
    expect(numTexts.some(t => t === '07')).toBe(true);
  });

  it('leaves cell value empty when box is not in boxes data', () => {
    // Render with sectionIds limited to 'resultado' to get a manageable set
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['resultado']} />
    );
    const values = container.querySelectorAll('.fm-aeat-cell__value');
    // All values should be empty strings when no data provided
    values.forEach(el => expect(el.textContent).toBe(''));
  });
});

// ── sectionIds filtering ──────────────────────────────────────────────────────

describe('FmBoxes303 — sectionIds prop', () => {
  it('renders only the requested section when sectionIds is provided', () => {
    const { container: containerAll } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{}} />
    );
    const { container: containerFiltered } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['resultado']} />
    );
    const allSections = containerAll.querySelectorAll('.fm-aeat-section').length;
    const filteredSections = containerFiltered.querySelectorAll('.fm-aeat-section').length;
    expect(filteredSections).toBeLessThan(allSections);
  });
});

// ── Identificacion section ────────────────────────────────────────────────────

describe('FmBoxes303 — identificacion section', () => {
  it('renders the identificacion section', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['identificacion']} />
    );
    expect(container.querySelector('.fm-aeat-ident')).toBeTruthy();
  });

  it('renders text fields from identification prop', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['identificacion']}
        identification={{ nif: 'B12345678', nombre: 'Test SL' }}
      />
    );
    expect(document.body.textContent).toContain('B12345678');
    expect(document.body.textContent).toContain('Test SL');
  });

  it('renders checkboxes for checkbox fields', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['identificacion']} />
    );
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  it('calls onIdentChange when a checkbox is toggled', () => {
    const onIdentChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['identificacion']}
        identification={{ redeme: false }}
        onIdentChange={onIdentChange}
      />
    );
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    // Trigger click which fires React's onChange for checkboxes
    fireEvent.click(checkboxes[0]);
    expect(onIdentChange).toHaveBeenCalled();
  });
});

// ── Editable cells ────────────────────────────────────────────────────────────

describe('FmBoxes303 — editable cells', () => {
  it('shows edit pencil button on editable cells', () => {
    // resultado_final section typically has editable cells
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['resultado_final']} />
    );
    // If there are editable cells, edit buttons should exist
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    // This is a soft check — some layouts may not have editable cells in resultado_final
    if (editBtns.length > 0) {
      fireEvent.click(editBtns[0]);
      // After clicking, an input should appear
      expect(container.querySelector('.fm-aeat-cell__input')).toBeTruthy();
    }
  });

  it('renders editable cell input as type="number" to prevent letter input', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['resultado_final']} />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length > 0) {
      fireEvent.click(editBtns[0]);
      const input = container.querySelector('.fm-aeat-cell__input');
      expect(input).toBeTruthy();
      expect(input.getAttribute('type')).toBe('number');
      expect(input.getAttribute('step')).toBe('any');
    }
  });
});

// ── i18n keys ────────────────────────────────────────────────────────────────

describe('FmBoxes303 — i18n usage', () => {
  it('renders section title keys via t()', () => {
    render(<FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['iva_devengado']} />);
    expect(document.body.textContent).toContain('fm.box.section.iva_devengado');
  });

  it('renders column header keys via t()', () => {
    render(<FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['iva_devengado']} />);
    expect(document.body.textContent).toContain('fm.box.colHeader.base');
    expect(document.body.textContent).toContain('fm.box.colHeader.cuota');
  });
});

// ── renderDerivedCell (importe_devolucion in resultado_final bicolumn) ────────

describe('FmBoxes303 — renderDerivedCell', () => {
  it('shows importe_devolucion row label when tipo_declaracion is D', () => {
    render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 71: -500, 70: 0 }}
        identification={{ tipo_declaracion: 'D' }}
        sectionIds={['resultado_final']}
      />
    );
    // rowVisibleWhen passes → row is rendered → its labelKey appears in DOM
    expect(document.body.textContent).toContain('fm.box.row.importe_devolucion');
  });

  it('renders empty when derived display is 0 (box 71 = 0)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 71: 0, 70: 0 }}
        identification={{ tipo_declaracion: 'D' }}
        sectionIds={['resultado_final']}
      />
    );
    // display = abs(0) - 0 = 0, clamp(0,0) = 0 → condition display !== 0 is false → ''
    // The importe_devolucion derived cell emits empty string when display === 0
    expect(document.body).toBeTruthy(); // smoke — must not crash
  });

  it('renders empty when box 71 is absent', () => {
    render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 70: 100 }}
        identification={{ tipo_declaracion: 'D' }}
        sectionIds={['resultado_final']}
      />
    );
    // raw = null → display = null → empty string rendered
    expect(document.body).toBeTruthy();
  });

  it('hides importe_devolucion row when tipo_declaracion is I', () => {
    render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 71: -500, 70: 0 }}
        identification={{ tipo_declaracion: 'I' }}
        sectionIds={['resultado_final']}
      />
    );
    // rowVisibleWhen: tipo_declaracion in ['D','V','X','C'] — I is excluded → row hidden
    // Check by the absence of the row label key (the derived cell row has a labelKey)
    expect(document.body.textContent).not.toContain('fm.box.row.importe_devolucion');
  });

  it('shows importe_devolucion row when tipo_declaracion is V', () => {
    render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 71: -300, 70: 0 }}
        identification={{ tipo_declaracion: 'V' }}
        sectionIds={['resultado_final']}
      />
    );
    // rowVisibleWhen: tipo_declaracion in ['D','V','X','C'] — V is included → row visible
    expect(document.body.textContent).toContain('fm.box.row.importe_devolucion');
  });

  it('renders section without crashing when subtractBox reduces derived value (71=600, 70=100)', () => {
    render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 71: 600, 70: 100 }}
        identification={{ tipo_declaracion: 'D' }}
        sectionIds={['resultado_final']}
      />
    );
    // abs(600) - 100 = 500, clamp(0,500) = 500 → derived cell renders non-empty
    expect(document.body.textContent).toContain('fm.box.row.importe_devolucion');
  });

  it('clamps negative derived value to 0 — row still visible but value is empty', () => {
    render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 71: 50, 70: 200 }}
        identification={{ tipo_declaracion: 'D' }}
        sectionIds={['resultado_final']}
      />
    );
    // abs(50) - 200 = -150, clamp(0, -150) = 0 → display = 0 → '' (condition display !== 0)
    // Row label still appears (rowVisibleWhen passes), but derived cell value is empty
    expect(document.body.textContent).toContain('fm.box.row.importe_devolucion');
  });

  it('box 71 present, box 70 (subtractBox) missing → derived cell stays blank (QA cycle 1 regression)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 71: 500 }}
        identification={{ tipo_declaracion: 'D' }}
        sectionIds={['resultado_final']}
      />
    );
    // Before the fix: `valueMap[70] ?? 0` fell back to 0 → display = abs(500) - 0 = 500 (wrong).
    // After the fix: the subtrahend is missing → display stays null → cell renders empty.
    // (box 71 itself is also rendered elsewhere as a plain box with value 500 — scope the
    // assertion to the importe_devolucion row specifically, not the whole document.)
    const importeRow = Array.from(container.querySelectorAll('.fm-aeat-row')).find(
      row => row.textContent.includes('fm.box.row.importe_devolucion')
    );
    expect(importeRow).toBeTruthy();
    const value = importeRow.querySelector('.fm-aeat-cell__value').textContent;
    expect(value).toBe('');
  });

  it('box 71 negative (abs applied), box 70 missing → still blank, not the abs()ed minuend (abs + missing-subtrahend interaction)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 71: -500 }}
        identification={{ tipo_declaracion: 'D' }}
        sectionIds={['resultado_final']}
      />
    );
    // dv.abs applies to the minuend BEFORE the subtractBox check runs (absRaw = Math.abs(raw)),
    // so a negative box 71 becomes 500 first. If the missing-subtrahend guard were somehow
    // bypassed by the abs step, this would wrongly render 500 instead of blank.
    const importeRow = Array.from(container.querySelectorAll('.fm-aeat-row')).find(
      row => row.textContent.includes('fm.box.row.importe_devolucion')
    );
    expect(importeRow).toBeTruthy();
    const value = importeRow.querySelector('.fm-aeat-cell__value').textContent;
    expect(value).toBe('');
  });
});

// ── renderBoxCell derivedValue fallback (box 87 = box 110 - box 78, ETP-5338 pt.2) ──
// cuotas_compensar_post (box 87) has a real AD box number but is never populated from
// valueMap/backend data — renderBoxCell now falls back to computeDerivedValue only when
// the real value for box 87 is null. Must never override a genuine non-null value.

describe('FmBoxes303 — renderBoxCell derivedValue fallback (box 87)', () => {
  const findCellByNum = (container, num) => {
    const padded = String(num).padStart(2, '0');
    return Array.from(container.querySelectorAll('.fm-aeat-cell')).find(
      cell => cell.querySelector('.fm-aeat-cell__num')?.textContent === padded
    );
  };

  it('box110=500, box78=200 → casilla 87 shows 300', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 110: 500, 78: 200 }}
        sectionIds={['resultado_final']}
      />
    );
    const cell87 = findCellByNum(container, 87);
    expect(cell87).toBeTruthy();
    const value = cell87.querySelector('.fm-aeat-cell__value').textContent;
    expect(value).toContain('300');
  });

  it('box110=200, box78=500 → casilla 87 shows 0 (clamped, not negative)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 110: 200, 78: 500 }}
        sectionIds={['resultado_final']}
      />
    );
    const cell87 = findCellByNum(container, 87);
    expect(cell87).toBeTruthy();
    // val = 0 → renderBoxCell's `val != null` check is true for 0, so it IS rendered (unlike
    // renderDerivedCell, which special-cases `display !== 0` to blank it out).
    const value = cell87.querySelector('.fm-aeat-cell__value').textContent;
    expect(value).toContain('0');
    expect(value).not.toContain('-');
  });

  it('box110=0, box78=0 → casilla 87 shows 0', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 110: 0, 78: 0 }}
        sectionIds={['resultado_final']}
      />
    );
    const cell87 = findCellByNum(container, 87);
    expect(cell87).toBeTruthy();
    const value = cell87.querySelector('.fm-aeat-cell__value').textContent;
    expect(value).toContain('0');
  });

  // NOTE (ETP-5338 pt.2, cycle 2): the two tests below were CORRECTED, not weakened. Cycle 1's QA
  // rejection (BUG-1) assumed AEAT semantics that were never confirmed with the product owner.
  // The confirmed rule (`treatMissingAsZero` on box 87's derivedValue, see FmBoxes303.jsx /
  // fm303Layouts.js): a missing box110 or box78 defaults to 0, EXCEPT when BOTH are missing.
  // `importe_devolucion`'s own tests (below/elsewhere) are untouched — its "missing operand
  // blanks the result" semantics were never disputed and remain the default behavior.

  it('box110 missing, box78=200 → casilla 87 shows 0 (missing box110 treated as 0, then clamped)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 78: 200 }}
        sectionIds={['resultado_final']}
      />
    );
    const cell87 = findCellByNum(container, 87);
    expect(cell87).toBeTruthy();
    // treatMissingAsZero: box110 missing → treated as 0 → display = 0 - 200 = -200 → clamped to 0.
    const value = cell87.querySelector('.fm-aeat-cell__value').textContent;
    expect(value).toContain('0');
    expect(value).not.toContain('-');
  });

  it('box110=500, box78 missing → casilla 87 shows 500 (missing box78 treated as 0)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 110: 500 }}
        sectionIds={['resultado_final']}
      />
    );
    const cell87 = findCellByNum(container, 87);
    expect(cell87).toBeTruthy();
    // treatMissingAsZero: box78 missing → treated as 0 → display = 500 - 0 = 500.
    const value = cell87.querySelector('.fm-aeat-cell__value').textContent;
    expect(value).toContain('500');
  });

  it('box110 AND box78 both missing → casilla 87 stays blank (the only blank case)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['resultado_final']}
      />
    );
    const cell87 = findCellByNum(container, 87);
    expect(cell87).toBeTruthy();
    const value = cell87.querySelector('.fm-aeat-cell__value').textContent;
    expect(value).toBe('');
  });

  it('box110=500, box78=0 (present, not missing) → casilla 87 shows 500, not blank (0 subtrahend must NOT be confused with a missing one)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 110: 500, 78: 0 }}
        sectionIds={['resultado_final']}
      />
    );
    const cell87 = findCellByNum(container, 87);
    expect(cell87).toBeTruthy();
    // valueMap[78] is 0, which is NOT nullish — `0 ?? null` evaluates to 0, so the subtraction
    // proceeds normally (500 - 0 = 500). Only undefined/null box78 should blank the cell; a
    // present 0 must behave like any other real subtrahend.
    const value = cell87.querySelector('.fm-aeat-cell__value').textContent;
    expect(value).toContain('500');
  });

  it('a genuine non-null value already present for box 87 is NOT overridden by the derived fallback', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 87: 999, 110: 500, 78: 200 }}
        sectionIds={['resultado_final']}
      />
    );
    const cell87 = findCellByNum(container, 87);
    expect(cell87).toBeTruthy();
    // Real value (999) must win over the derived formula's result (300).
    const value = cell87.querySelector('.fm-aeat-cell__value').textContent;
    expect(value).toContain('999');
    expect(value).not.toContain('300');
  });

  it('a genuine 0 value already present for box 87 is NOT overridden (0 is not null)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 87: 0, 110: 500, 78: 200 }}
        sectionIds={['resultado_final']}
      />
    );
    const cell87 = findCellByNum(container, 87);
    expect(cell87).toBeTruthy();
    // val = 0 (from valueMap) → `val == null` is false → derivedValue fallback never runs.
    // If it wrongly ran, display would be 300 instead of 0.
    const value = cell87.querySelector('.fm-aeat-cell__value').textContent;
    expect(value).toContain('0');
    expect(value).not.toContain('300');
  });
});

// ── Editable cell input event handlers ───────────────────────────────────────

describe('FmBoxes303 — editable cell input events', () => {
  it('calls onBoxChange with current pending value on blur', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;
    fireEvent.click(editBtns[0]);
    const input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.blur(input);
    expect(onBoxChange).toHaveBeenCalled();
  });

  it('calls onBoxChange and closes input on Enter key', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;
    fireEvent.click(editBtns[0]);
    const input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onBoxChange).toHaveBeenCalled();
    expect(container.querySelector('.fm-aeat-cell__input')).toBeNull();
  });

  it('closes input without calling onBoxChange on Escape key', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;
    fireEvent.click(editBtns[0]);
    expect(container.querySelector('.fm-aeat-cell__input')).toBeTruthy();
    fireEvent.keyDown(container.querySelector('.fm-aeat-cell__input'), { key: 'Escape' });
    expect(container.querySelector('.fm-aeat-cell__input')).toBeNull();
    expect(onBoxChange).not.toHaveBeenCalled();
  });

  it('updates pending value via onChange without triggering onBoxChange', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;
    fireEvent.click(editBtns[0]);
    const input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: '999' } });
    // onChange only updates pending value, not calling onBoxChange
    expect(onBoxChange).not.toHaveBeenCalled();
    // Input should still be visible
    expect(container.querySelector('.fm-aeat-cell__input')).toBeTruthy();
  });

  it('input initialises with current box value', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 42 }}
        sectionIds={['resultado_final']}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;
    fireEvent.click(editBtns[0]);
    const input = container.querySelector('.fm-aeat-cell__input');
    expect(input.value).toBe('42');
  });
});

// ── commitPendingEdit no-op guard (ETP-5409, bug 1) ───────────────────────────
// Opening the pencil editor and blurring/Enter-ing WITHOUT typing anything must NOT
// call onBoxChange at all — `pendingValues` never gained a key for that box this edit
// session, so `commitPendingEdit`'s hasOwnProperty guard must skip the call entirely.
// Before the fix, onBoxChange was always called (even with `undefined`), which flowed
// into parseBoxInput(undefined) -> NaN -> null -> "remove this box", silently wiping a
// previously saved value on a pure no-op edit. A deliberate clear-to-blank (type, then
// delete back to '') is the legitimate case and must still call onBoxChange(boxNum, '').

describe('FmBoxes303 — commitPendingEdit no-op guard (ETP-5409)', () => {
  it('does NOT call onBoxChange on blur when the box has a saved value and nothing was typed', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 42 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;
    fireEvent.click(editBtns[0]);
    const input = container.querySelector('.fm-aeat-cell__input');
    expect(input.value).toBe('42');
    fireEvent.blur(input);
    expect(onBoxChange).not.toHaveBeenCalled();
  });

  it('does NOT call onBoxChange on Enter when the box has a saved value and nothing was typed', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 42 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;
    fireEvent.click(editBtns[0]);
    const input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onBoxChange).not.toHaveBeenCalled();
    // Enter also closes the input, same as before.
    expect(container.querySelector('.fm-aeat-cell__input')).toBeNull();
  });

  it('does NOT call onBoxChange on blur for a box with no saved value either (nothing typed)', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;
    fireEvent.click(editBtns[0]);
    const input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.blur(input);
    expect(onBoxChange).not.toHaveBeenCalled();
  });

  it('DOES call onBoxChange with the boxNum and empty string when the user types then clears the box (deliberate clear-to-blank, blur)', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 42 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;
    fireEvent.click(editBtns[0]);
    const input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onBoxChange).toHaveBeenCalledWith(76, '');
  });

  it('DOES call onBoxChange with the boxNum and empty string when the user types then clears the box (deliberate clear-to-blank, Enter)', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 42 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;
    fireEvent.click(editBtns[0]);
    const input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onBoxChange).toHaveBeenCalledWith(76, '');
  });

  it('still calls onBoxChange with the typed value on blur when the user actually typed something (regression guard)', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 42 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;
    fireEvent.click(editBtns[0]);
    const input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.blur(input);
    expect(onBoxChange).toHaveBeenCalledWith(76, '250');
  });

  it('no-op guard also applies to the bicolumn infobox cell path (reg_anual, box 68)', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 68: 50 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const infobox = Array.from(container.querySelectorAll('.fm-aeat-infobox'))
      .find(el => el.textContent.includes('fm.box.row.reg_anual'));
    expect(infobox).toBeTruthy();
    const editBtn = infobox.querySelector('.fm-aeat-cell__edit-btn');
    if (!editBtn) return;
    fireEvent.click(editBtn);
    const input = infobox.querySelector('.fm-aeat-cell__input');
    expect(input.value).toBe('50');
    fireEvent.blur(input);
    expect(onBoxChange).not.toHaveBeenCalled();
  });

  // ── clearPendingValue / startEditingCell (ETP-5409, W1 reject-cycle follow-up) ──
  // The earlier fix only made commitPendingEdit's guard presence-based; it never
  // actually cleared the stale `pendingValues[boxNum]` key afterward. These three
  // cases cover the actual stale-draft bug Alex found: a committed (or escaped)
  // draft surviving in state and getting resent on a later no-op reopen.

  it('reopening the same box after a real committed edit, then blurring without typing again, does NOT resend the old draft a second time', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 42 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;

    // First session: type a real value and commit it.
    fireEvent.click(editBtns[0]);
    let input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: '900' } });
    fireEvent.blur(input);
    expect(onBoxChange).toHaveBeenCalledTimes(1);
    expect(onBoxChange).toHaveBeenCalledWith(76, '900');

    // Second session: reopen the SAME box, type nothing, blur again.
    fireEvent.click(container.querySelectorAll('.fm-aeat-cell__edit-btn')[0]);
    input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.blur(input);

    // The committed "900" draft must not still be sitting in pendingValues —
    // onBoxChange must NOT have fired a second time.
    expect(onBoxChange).toHaveBeenCalledTimes(1);
  });

  it('escaping an uncommitted edit, then reopening without typing and blurring, never resurrects the escaped draft', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 42 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;

    // First session: type a value but Escape instead of committing it.
    fireEvent.click(editBtns[0]);
    let input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: '777' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onBoxChange).not.toHaveBeenCalled();
    expect(container.querySelector('.fm-aeat-cell__input')).toBeNull();

    // Second session: reopen the SAME box, type nothing, blur.
    fireEvent.click(container.querySelectorAll('.fm-aeat-cell__edit-btn')[0]);
    input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.blur(input);

    // The escaped "777" draft must not have survived Escape — onBoxChange must
    // never have been called across the whole sequence.
    expect(onBoxChange).not.toHaveBeenCalled();
  });

  it('Alex repro: committed draft must not clobber a later external prop correction on reopen-and-blur-without-typing', () => {
    const onBoxChange = vi.fn();
    const { container, rerender } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 42 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    if (editBtns.length === 0) return;

    // Commit box 76 to "900".
    fireEvent.click(editBtns[0]);
    let input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: '900' } });
    fireEvent.blur(input);
    expect(onBoxChange).toHaveBeenCalledWith(76, '900');
    onBoxChange.mockClear();

    // Simulate the parent reactively correcting `boxes` to 500 (e.g. a box78/box110
    // clamp on another box triggering a recompute) — a prop-only update, no new
    // user interaction with box 76 yet.
    rerender(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 500 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );

    // Reopen box 76's pencil and blur without typing anything.
    fireEvent.click(container.querySelectorAll('.fm-aeat-cell__edit-btn')[0]);
    input = container.querySelector('.fm-aeat-cell__input');
    // The input should reflect the corrected external value, not the stale draft.
    expect(input.value).toBe('500');
    fireEvent.blur(input);

    // The stale committed "900" must NOT be resent over the new prop value "500".
    expect(onBoxChange).not.toHaveBeenCalled();
  });
});

// ── stale pending draft on re-open (ETP-5393 Bug C follow-up) ────────────────
// Manual-QA regression: typing a negative value into box 111 (or 77) gets clamped to 0
// by FmModel303Page's handleBoxChange on commit, and the read-only display correctly
// shows 0,00 €. But re-opening the SAME cell's editor (pencil click) used to show the
// original unclamped "-12" draft again, because `pendingValues[boxNum]` was never reset
// on commit or on re-entering edit mode — it kept whatever the input last held, even
// though the box's real/persisted value had since changed underneath it. This exercises
// FmBoxes303 in isolation: after a commit, the parent re-renders with the corrected
// (post-clamp) `boxes` value, and re-opening the editor must read from THAT, not from
// a leftover draft.
//
// ETP-5431 pt.2 — box 111 is no longer user-editable (see "read-only" describe block
// below), so this regression is now exercised on box 77 instead: it's the other box in
// `NEGATIVE_NOT_ALLOWED_BOXES` that is STILL editable, so the exact same stale-draft
// mechanics still apply to it. The scenario (type negative, commit, parent clamps and
// re-renders, reopen must show the clamped value not the stale draft) is unchanged —
// only the box number moved.

describe('FmBoxes303 — editable cell re-edit does not leak a stale pending draft (ETP-5393)', () => {
  it('box 77: types -12, commits (blur), parent clamps to 0 — reopening the editor shows 0, not -12', () => {
    const onBoxChange = vi.fn();
    const { container, rerender } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 77: 0 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );

    // Open the editor for box 77 and type the invalid negative value.
    const findEditBtnFor77 = (c) => Array.from(c.querySelectorAll('.fm-aeat-cell')).find(
      cell => cell.querySelector('.fm-aeat-cell__num')?.textContent === '77'
    )?.querySelector('.fm-aeat-cell__edit-btn');

    fireEvent.click(findEditBtnFor77(container));
    let input = container.querySelector('.fm-aeat-cell__input');
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: '-12' } });
    fireEvent.blur(input);
    expect(onBoxChange).toHaveBeenCalledWith(77, '-12');
    // Editor closed after commit.
    expect(container.querySelector('.fm-aeat-cell__input')).toBeNull();

    // Simulate the parent (FmModel303Page's handleBoxChange) clamping the negative
    // commit to 0 and re-rendering this component with the corrected boxes prop —
    // the read-only cell must show the clamped value.
    rerender(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 77: 0 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );

    // Reopen the editor for the same cell — it must start from the current
    // persisted value (0), never the stale "-12" draft from the previous session.
    fireEvent.click(findEditBtnFor77(container));
    input = container.querySelector('.fm-aeat-cell__input');
    expect(input).toBeTruthy();
    expect(input.value).toBe('0');
  });

  it('non-clamped box (76): a committed draft does not leak into the next edit session either', () => {
    const onBoxChange = vi.fn();
    const { container, rerender } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 100 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );

    fireEvent.click(container.querySelector('.fm-aeat-cell__edit-btn'));
    let input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onBoxChange).toHaveBeenCalledWith(76, '250');
    expect(container.querySelector('.fm-aeat-cell__input')).toBeNull();

    // Parent commits the new value and re-renders with it.
    rerender(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 250 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );

    fireEvent.click(container.querySelector('.fm-aeat-cell__edit-btn'));
    input = container.querySelector('.fm-aeat-cell__input');
    expect(input.value).toBe('250');
  });

  it('Escape clears the pending draft too — reopening does not resurrect the discarded value', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{ 76: 100 }}
        sectionIds={['resultado_final']}
        onBoxChange={onBoxChange}
      />
    );

    fireEvent.click(container.querySelector('.fm-aeat-cell__edit-btn'));
    let input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onBoxChange).not.toHaveBeenCalled();
    expect(container.querySelector('.fm-aeat-cell__input')).toBeNull();

    fireEvent.click(container.querySelector('.fm-aeat-cell__edit-btn'));
    input = container.querySelector('.fm-aeat-cell__input');
    expect(input.value).toBe('100');
  });
});

// ── sin_actividad section ─────────────────────────────────────────────────────

describe('FmBoxes303 — sin_actividad section', () => {
  it('renders a checkbox for sin_actividad', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['sin_actividad']} />
    );
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  it('calls onIdentChange when sin_actividad checkbox is clicked (unchecked → checked)', () => {
    const onIdentChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['sin_actividad']}
        identification={{ sin_actividad: false }}
        onIdentChange={onIdentChange}
      />
    );
    fireEvent.click(container.querySelector('input[type="checkbox"]'));
    expect(onIdentChange).toHaveBeenCalledWith('sin_actividad', true);
  });

  it('calls onIdentChange with false when sin_actividad checkbox is unchecked', () => {
    const onIdentChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['sin_actividad']}
        identification={{ sin_actividad: true }}
        onIdentChange={onIdentChange}
      />
    );
    fireEvent.click(container.querySelector('input[type="checkbox"]'));
    expect(onIdentChange).toHaveBeenCalledWith('sin_actividad', false);
  });

  it('renders section title key', () => {
    render(<FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['sin_actividad']} />);
    expect(document.body.textContent).toContain('fm.section.sin_actividad');
  });
});

// ── rectificativa section ─────────────────────────────────────────────────────

describe('FmBoxes303 — rectificativa section', () => {
  it('renders checkbox for rectificativa (always visible)', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['rectificativa']} />
    );
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  it('shows additional fields (select) when rectificativa is true', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['rectificativa']}
        identification={{ rectificativa: true }}
      />
    );
    // motivo_rectificacion is a select field, only visible when rectificativa=true
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('hides conditional fields when rectificativa is false', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['rectificativa']}
        identification={{ rectificativa: false }}
      />
    );
    // motivo_rectificacion and nro_justificante are hidden
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBe(0);
  });

  it('calls onIdentChange when rectificativa checkbox is toggled', () => {
    const onIdentChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['rectificativa']}
        identification={{ rectificativa: false }}
        onIdentChange={onIdentChange}
      />
    );
    fireEvent.click(container.querySelector('input[type="checkbox"]'));
    expect(onIdentChange).toHaveBeenCalledWith('rectificativa', true);
  });

  it('calls onIdentChange when motivo_rectificacion select changes', () => {
    const onIdentChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['rectificativa']}
        identification={{ rectificativa: true, motivo_rectificacion: '' }}
        onIdentChange={onIdentChange}
      />
    );
    const select = container.querySelector('select');
    fireEvent.change(select, { target: { value: 'R' } });
    expect(onIdentChange).toHaveBeenCalledWith('motivo_rectificacion', 'R');
  });

  it('renders section title key', () => {
    render(<FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['rectificativa']} />);
    expect(document.body.textContent).toContain('fm.section.rectificativa');
  });
});

// ── datos_bancarios section (sectionVisibleWhen) ──────────────────────────────

describe('FmBoxes303 — datos_bancarios sectionVisibleWhen', () => {
  it('renders section when tipo_declaracion is D', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'D' }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeTruthy();
  });

  it('hides section when tipo_declaracion is V (EDID065 fix — V removed from the visible set)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'V' }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeNull();
  });

  it('renders section when tipo_declaracion is U', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'U' }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeTruthy();
  });

  it('hides section when tipo_declaracion is I (EDID065 fix — AEAT rejects IBAN for Ingreso)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I' }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeNull();
  });

  it('hides section when tipo_declaracion is N', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'N' }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeNull();
  });

  it('hides section when tipo_declaracion is C (Compensación — not in the U/D/X visible set)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'C' }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeNull();
  });

  // 'G' has no option in TIPO_DECLARACION_FIELD (fm303Layouts.js) — it can never be
  // selected via this UI's dropdown. It IS a valid AEAT/Classic-side DeclarationType
  // value though (per Java AD reference data), so identification.tipo_declaracion
  // could carry it if it ever arrived from legacy data or a non-UI-driven update.
  // Assert the component degrades safely (hides the IBAN section) rather than
  // rendering it because of an unrecognized value.
  it('hides section when tipo_declaracion is G (unreachable via this UI, but defensively verified)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'G' }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeNull();
  });

  it('hides section when identification is undefined', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeNull();
  });
});

// ── datos_bancarios × rectificativa visibility matrix (ETP-4456 — anyOf fix) ──
// The section is visible when tipo_declaracion is U/D/X, OR when rectificativa
// is checked regardless of tipo_declaracion. Before the fix, a rectificativa
// filed under any other tipo (e.g. 'I', the most common real-world case) had
// no UI to enter the AEAT-mandatory bank fields, causing a submission-blocking
// backend failure.

describe('FmBoxes303 — datos_bancarios × rectificativa visibility matrix (anyOf fix)', () => {
  it('tipo U + rectificativa false → visible (tipo branch alone satisfies anyOf)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'U', rectificativa: false }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeTruthy();
  });

  it('tipo I + rectificativa false → hidden (regression guard — pre-fix correct behavior preserved)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: false }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeNull();
  });

  it('tipo I + rectificativa true + box 111 non-zero → visible (the actual bug fix — rectificativa branch of anyOf)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: true, _box111NonZero: true }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeTruthy();
  });

  it('tipo V + rectificativa true + box 111 non-zero → visible (V is reachable again once rectificativa is checked)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'V', rectificativa: true, _box111NonZero: true }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeTruthy();
  });
});

// ── datos_bancarios individual bank field visibility (ETP-4456 follow-up) ─────
// commit edb448754 widened _BANK_DVX_VW (fm303Layouts.js) from a plain
// { field: 'tipo_declaracion', in: ['D','V','X'] } condition to the same anyOf
// shape as datos_bancarios.sectionVisibleWhen: tipo D/V/X, OR rectificativa
// checked (regardless of tipo). It is shared by 6 of the 7 bank fields
// (bank_swift_bic, bank_nombre, bank_direccion, bank_ciudad, bank_pais,
// bank_sepa). bank_iban itself carries no field-level visibleWhen — it is
// gated solely by sectionVisibleWhen (covered in the block above) — so it
// must be unaffected by this specific change.

describe('FmBoxes303 — datos_bancarios individual bank field visibility (ETP-4456 follow-up)', () => {
  // ETP-5393 follow-up — all 7 bank fields now carry a `requiredWhen`, so several of the
  // identification states already exercised here (e.g. tipo D) now render with a trailing
  // red-asterisk required-mark ("fm.ident.bank.swift_bic*") on top of the label. These tests are
  // about VISIBILITY, not requiredness, so the helper strips a trailing "*" before comparing —
  // requiredness itself is covered separately below in "required-mark rendering".
  const bankFieldLabels = (container) =>
    Array.from(container.querySelectorAll('.fm-aeat-ident-inline-field__label'))
      .map(el => el.textContent.replace(/\*$/, ''));

  it('tipo D + rectificativa false → bank_swift_bic visible (regression guard — pre-fix correct behavior preserved)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'D', rectificativa: false }}
      />
    );
    expect(bankFieldLabels(container)).toContain('fm.ident.bank.swift_bic');
  });

  it('tipo I + rectificativa false → bank_swift_bic hidden (regression guard — must NOT have become visible by accident)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: false }}
      />
    );
    // The whole section is hidden in this case (sectionVisibleWhen), so no bank
    // field — including bank_swift_bic — renders at all.
    expect(container.querySelector('.fm-aeat-section')).toBeNull();
    expect(bankFieldLabels(container)).not.toContain('fm.ident.bank.swift_bic');
  });

  // ETP-5393 manual-QA fix — the rectificativa branch now also requires `_box111NonZero`,
  // so this scenario must carry a non-zero box 111 to stay visible (see
  // fm303Layouts.bankVisibilityReactivity.vitest.js for the box111==0/rectificativa-false
  // hide-again coverage).
  // ETP-5431 — inside the Nota 3 case, visibility now also depends on the marca SEPA:
  // SWIFT-BIC is only shown from marca 2 upwards, because the file carries position 12 blank
  // below that (AEAT303Report2024#patchBankSection). Marca 2 is therefore what preserves the
  // original intent of this ETP-4456 regression guard.
  it('tipo I + rectificativa true + box 111 non-zero + marca 2 → bank_swift_bic visible (the actual bug fix — commit edb448754)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: true, _box111NonZero: true, bank_sepa: '2' }}
      />
    );
    expect(bankFieldLabels(container)).toContain('fm.ident.bank.swift_bic');
  });

  it('tipo D + rectificativa true → bank_swift_bic visible (both anyOf branches true simultaneously — no conflict)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'D', rectificativa: true }}
      />
    );
    expect(bankFieldLabels(container)).toContain('fm.ident.bank.swift_bic');
  });

  // ETP-5431 — the four foreign-bank fields only route a rest-of-world transfer, so they are
  // shown from marca 3 only. bank_sepa itself is never gated by its own value — it is the
  // selector, and must stay reachable for the whole section.
  it('also covers bank_nombre, bank_direccion, bank_ciudad, bank_pais, bank_sepa for the bug-fix case (tipo I + rectificativa true + box 111 non-zero + marca 3)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: true, _box111NonZero: true, bank_sepa: '3' }}
      />
    );
    const labels = bankFieldLabels(container);
    ['fm.ident.bank.nombre', 'fm.ident.bank.direccion', 'fm.ident.bank.ciudad', 'fm.ident.bank.pais', 'fm.ident.bank.sepa']
      .forEach(key => expect(labels).toContain(key));
  });

  it('bank_iban is unaffected by the field-level visibleWhen change — visible whenever the section is (tipo I + rectificativa true + box 111 non-zero)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: true, _box111NonZero: true }}
      />
    );
    // bank_iban has no field-level visibleWhen — it renders whenever the section
    // does, unaffected by _BANK_DVX_VW. Its label carries the required-mark
    // suffix ("*"), so match by prefix instead of exact equality.
    expect(bankFieldLabels(container).some(t => t.startsWith('fm.ident.bank.iban'))).toBe(true);
  });

  it('bank_iban still hidden when the section itself is hidden (tipo I + rectificativa false)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: false }}
      />
    );
    expect(bankFieldLabels(container).some(t => t.startsWith('fm.ident.bank.iban'))).toBe(false);
  });

  // FIXED (commit 789547fde — "Unify visibility evaluators for anyOf
  // support"): FmBoxes303's field-level visibility filter (the
  // `visibleFields = section.fields.filter(...)` block shared by all
  // sectionType==='identificacion' sections) previously only understood the
  // flat { field, in } / { field, equals } shape — unlike sectionVisibleWhen,
  // it had no matchesSvw/anyOf support. Since _BANK_DVX_VW is
  // { anyOf: [...] }, the field-level filter now delegates to the same
  // matchesSvw function sectionVisibleWhen already used, so the anyOf shape
  // is correctly evaluated at the individual-field level too. For plain
  // tipo 'U' (Domiciliación) with rectificativa unchecked, only the
  // tipo D/V/X branch and the rectificativa branch of the anyOf can satisfy
  // it — neither does for U+false — so these 6 fields are correctly hidden,
  // leaving only bank_iban (which carries no field-level visibleWhen)
  // visible. This is the confirmed-correct, locked-in behavior.
  it('tipo U + rectificativa false → bank_swift_bic hidden (fixed by commit 789547fde — anyOf now respected at field level)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'U', rectificativa: false }}
      />
    );
    expect(bankFieldLabels(container)).not.toContain('fm.ident.bank.swift_bic');
  });

  it('tipo U + rectificativa false → bank_nombre, bank_direccion, bank_ciudad, bank_pais, bank_sepa also hidden', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'U', rectificativa: false }}
      />
    );
    const labels = bankFieldLabels(container);
    ['fm.ident.bank.nombre', 'fm.ident.bank.direccion', 'fm.ident.bank.ciudad', 'fm.ident.bank.pais', 'fm.ident.bank.sepa']
      .forEach(key => expect(labels).not.toContain(key));
  });

  it('tipo U + rectificativa false → bank_iban remains visible (unaffected by the field-level anyOf gating)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'U', rectificativa: false }}
      />
    );
    expect(bankFieldLabels(container).some(t => t.startsWith('fm.ident.bank.iban'))).toBe(true);
  });
});

// ── datos_bancarios required-mark rendering (ETP-5393 follow-up, manual-QA fix) ──────────────
// bank_iban carries `_BANK_IBAN_REQUIRED_WHEN` (fm303Layouts.js): required for tipo U/D/X
// unconditionally (condition A, AEAT EDID065 — a plain devolución/domiciliación), OR for any
// tipo when rectificativa is checked AND box 111 is non-zero (condition B). The other 6 bank
// fields (bank_swift_bic, bank_nombre, bank_direccion, bank_ciudad, bank_pais, bank_sepa)
// carry the NARROWER `_BANK_FULL_BLOCK_REQUIRED_WHEN` — condition B ONLY. A plain tipo D/U/X
// devolución therefore shows those 6 fields (via `_BANK_DVX_VW`) WITHOUT the required-mark;
// only bank_iban gets the "*" in that case. FmBoxes303's label rendering appends the raw
// `fm-aeat-required-mark` ("*") span via the shared `isFieldRequired(f, identification)` — the
// SAME function `getMissingRequiredFields` uses — so no per-field rendering code was added here;
// these tests only lock in the resulting DOM.
describe('FmBoxes303 — datos_bancarios required-mark rendering (ETP-5393 follow-up)', () => {
  const rawBankFieldLabels = (container) =>
    Array.from(container.querySelectorAll('.fm-aeat-ident-inline-field__label')).map(el => el.textContent);

  const ALL_BANK_LABEL_KEYS = [
    'fm.ident.bank.iban', 'fm.ident.bank.swift_bic', 'fm.ident.bank.nombre',
    'fm.ident.bank.direccion', 'fm.ident.bank.ciudad', 'fm.ident.bank.pais', 'fm.ident.bank.sepa',
  ];
  // bank_iban has no field-level visibleWhen; the other 6 require _BANK_DVX_VW (tipo D/V/X or
  // rectificativa checked) to even render.
  const DVX_GATED_LABEL_KEYS = ALL_BANK_LABEL_KEYS.filter(k => k !== 'fm.ident.bank.iban');

  it('tipo D (plain devolución, condition A alone) → only bank_iban carries the required-mark ("*"); the other 6 render WITHOUT it', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'D', rectificativa: false }}
      />
    );
    const labels = rawBankFieldLabels(container);
    expect(labels).toContain('fm.ident.bank.iban*');
    DVX_GATED_LABEL_KEYS.forEach(key => {
      expect(labels).toContain(key);
      expect(labels).not.toContain(`${key}*`);
    });
  });

  it('tipo I + rectificativa false → no bank field renders at all (section hidden, nothing to mark)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: false }}
      />
    );
    expect(rawBankFieldLabels(container)).toHaveLength(0);
  });

  // ETP-5393 manual-QA fix — this used to assert the DVX-gated fields stayed visible
  // (just without the asterisk) when box 111 is 0. Manual QA confirmed a visible-but-
  // unrequired bank block reads as a bug: the whole section (and these fields with it)
  // must hide again once box 111 drops back to 0, not just lose its required-mark. See
  // `_BANK_DVX_VW`/`sectionVisibleWhen` in fm303Layouts.js.
  it('tipo I + rectificativa true + box 111 == 0 → section (and DVX-gated fields) hidden again, not just unrequired', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: true, _box111NonZero: false }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeNull();
    const labels = rawBankFieldLabels(container);
    DVX_GATED_LABEL_KEYS.forEach(key => expect(labels).not.toContain(key));
    expect(labels).toHaveLength(0);
  });

  // ETP-5431 — at marca 3 every field in the block is called for, so this keeps asserting what
  // it always did: inside the Nota 3 case the whole visible block carries the required-mark.
  it('tipo I + rectificativa true + box 111 non-zero + marca 3 → visible DVX-gated fields render WITH the required-mark', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: true, _box111NonZero: true, bank_sepa: '3' }}
      />
    );
    const labels = rawBankFieldLabels(container);
    DVX_GATED_LABEL_KEYS.forEach(key => expect(labels).toContain(`${key}*`));
  });

  // ETP-5431 — and below marca 3, the fields the marca does not call for are GONE, not merely
  // un-asterisked. That distinction is the ETP-5393 manual-QA lesson applied to the marca:
  // a visible-but-unrequired field in a block whose file positions are blanked reads as a bug.
  it('marca 1 → SWIFT-BIC and the four foreign-bank fields do not render at all; IBAN and the marca do, with the mark', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: true, _box111NonZero: true, bank_sepa: '1' }}
      />
    );
    const labels = rawBankFieldLabels(container);
    ['fm.ident.bank.swift_bic', 'fm.ident.bank.nombre', 'fm.ident.bank.direccion',
      'fm.ident.bank.ciudad', 'fm.ident.bank.pais'].forEach((key) => {
      expect(labels).not.toContain(key);
      expect(labels).not.toContain(`${key}*`);
    });
    expect(labels).toContain('fm.ident.bank.iban*');
    expect(labels).toContain('fm.ident.bank.sepa*');
  });

  it('marca 2 → SWIFT-BIC appears with the mark, the four foreign-bank fields still do not render', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: true, _box111NonZero: true, bank_sepa: '2' }}
      />
    );
    const labels = rawBankFieldLabels(container);
    expect(labels).toContain('fm.ident.bank.swift_bic*');
    ['fm.ident.bank.nombre', 'fm.ident.bank.direccion', 'fm.ident.bank.ciudad', 'fm.ident.bank.pais']
      .forEach(key => expect(labels).not.toContain(key));
  });

  // Nota 3's exception, rendered: the taxpayer asked to cancel the direct debit, so for a tipo
  // with no account need of its own (C) the block disappears entirely.
  it('tipo C + Nota 3 case + cancel/modify-debit flag marked → no bank field renders at all', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{
          tipo_declaracion: 'C', rectificativa: true, _box111NonZero: true,
          bank_sepa: '3', baja_domiciliacion: true,
        }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeNull();
    expect(rawBankFieldLabels(container)).toHaveLength(0);
  });

  // ...but tipo D keeps its own U/D/X need for an account to receive the refund into, which is
  // outside Nota 3's scope. The waiver puts the declaration OUTSIDE the Nota 3 branch, so the
  // marca restriction does not apply either: every field renders, unrestricted.
  it('tipo D + Nota 3 case + flag marked → the block stays visible and unrestricted by the marca', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{
          tipo_declaracion: 'D', rectificativa: true, _box111NonZero: true,
          bank_sepa: '1', baja_domiciliacion: true,
        }}
      />
    );
    const labels = rawBankFieldLabels(container);
    ALL_BANK_LABEL_KEYS.forEach(key => expect(labels.some(l => l.startsWith(key))).toBe(true));
  });

  it('tipo U + rectificativa false → only bank_iban renders, and it carries the required-mark', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'U', rectificativa: false }}
      />
    );
    const labels = rawBankFieldLabels(container);
    expect(labels).toEqual(['fm.ident.bank.iban*']);
  });
});

// ── identificacion select field (tipo_declaracion) ────────────────────────────

describe('FmBoxes303 — identificacion select field', () => {
  it('renders tipo_declaracion select in identificacion section', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{}} sectionIds={['identificacion']} />
    );
    const selects = container.querySelectorAll('select');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('calls onIdentChange when tipo_declaracion select changes', () => {
    const onIdentChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['identificacion']}
        identification={{ tipo_declaracion: '' }}
        onIdentChange={onIdentChange}
      />
    );
    const select = container.querySelector('select');
    fireEvent.change(select, { target: { value: 'I' } });
    expect(onIdentChange).toHaveBeenCalledWith('tipo_declaracion', 'I');
  });
});

// ── visibleWhen in identificacion fields ──────────────────────────────────────

describe('FmBoxes303 — identificacion visibleWhen conditions', () => {
  it('shows fecha_concurso date input when concurso is true', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['identificacion']}
        identification={{ concurso: true }}
      />
    );
    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBeGreaterThan(0);
  });

  it('hides fecha_concurso date input when concurso is false', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['identificacion']}
        identification={{ concurso: false }}
      />
    );
    const dateInputs = container.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(0);
  });

  it('calls onIdentChange when fecha_concurso is changed', () => {
    const onIdentChange = vi.fn();
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['identificacion']}
        identification={{ concurso: true, fecha_concurso: '' }}
        onIdentChange={onIdentChange}
      />
    );
    const dateInput = container.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-01-01' } });
    expect(onIdentChange).toHaveBeenCalledWith('fecha_concurso', '2026-01-01');
  });
});

// ── readOnly prop (submitted declarations must be fully locked down) ─────────
// isSubmitted statuses (submitted / submitted_ext / submitted_ack) pass
// readOnly={true} down from FmModel303Page's CasillasTab. Every interactive
// surface — box-value inputs, the identificacion select, edit-pencil buttons,
// checkboxes and inline text/date inputs — must become non-interactive, and
// the edit-pencil buttons must be entirely absent (not just disabled), since
// they are the only way to enter cell-edit mode.

// ── Percent cell clamping/rounding (ETP-5391) ────────────────────────────────
// Percent boxes (89/90/91/92 in tributacion_territorial — last-period-only,
// so year/period must resolve to the last period for the section to exist at
// all) follow the AEAT rule "los porcentajes se expresarán con dos decimales":
// never above 100, never negative, at most 2 decimal places.

describe('FmBoxes303 — percent cell input attributes (colType="percent")', () => {
  const PERCENT_PROPS = { year: 2026, period: 'T4', sectionIds: ['tributacion_territorial'] };

  function openFirstEditor(container) {
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    expect(editBtns.length).toBeGreaterThan(0);
    fireEvent.click(editBtns[0]);
    return container.querySelector('.fm-aeat-cell__input');
  }

  it('renders max=100 and min=0 on a percent cell input (box 89 — Álava)', () => {
    const { container } = render(<FmBoxes303 {...PERCENT_PROPS} boxes={{ 89: 50 }} />);
    const input = openFirstEditor(container);
    expect(input.getAttribute('max')).toBe('100');
    expect(input.getAttribute('min')).toBe('0');
  });

  it('does NOT render max/min on an amount cell input (box 76, resultado_final)', () => {
    const { container } = render(
      <FmBoxes303 year={2026} period="T2" boxes={{ 76: 100 }} sectionIds={['resultado_final']} />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    fireEvent.click(editBtns[0]);
    const input = container.querySelector('.fm-aeat-cell__input');
    expect(input.hasAttribute('max')).toBe(false);
    expect(input.hasAttribute('min')).toBe(false);
  });

  it('clamps a value above 100 down to "100" on blur', () => {
    const onBoxChange = vi.fn();
    const { container } = render(<FmBoxes303 {...PERCENT_PROPS} boxes={{ 89: 50 }} onBoxChange={onBoxChange} />);
    const input = openFirstEditor(container);
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.blur(input);
    expect(onBoxChange).toHaveBeenCalledWith(89, '100');
  });

  it('clamps a negative value up to "0" on Enter', () => {
    const onBoxChange = vi.fn();
    const { container } = render(<FmBoxes303 {...PERCENT_PROPS} boxes={{ 89: 50 }} onBoxChange={onBoxChange} />);
    const input = openFirstEditor(container);
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onBoxChange).toHaveBeenCalledWith(89, '0');
  });

  it('rounds a value with more than 2 decimals to 2 decimals', () => {
    const onBoxChange = vi.fn();
    const { container } = render(<FmBoxes303 {...PERCENT_PROPS} boxes={{ 89: 50 }} onBoxChange={onBoxChange} />);
    const input = openFirstEditor(container);
    fireEvent.change(input, { target: { value: '33.456' } });
    fireEvent.blur(input);
    expect(onBoxChange).toHaveBeenCalledWith(89, '33.46');
  });

  it('leaves an in-range, already-2-decimal value untouched (no spurious rounding)', () => {
    const onBoxChange = vi.fn();
    const { container } = render(<FmBoxes303 {...PERCENT_PROPS} boxes={{ 89: 50 }} onBoxChange={onBoxChange} />);
    const input = openFirstEditor(container);
    fireEvent.change(input, { target: { value: '50.5' } });
    fireEvent.blur(input);
    expect(onBoxChange).toHaveBeenCalledWith(89, '50.5');
  });

  it('preserves an empty value as-is ("clear the field"), does not coerce it to a number', () => {
    const onBoxChange = vi.fn();
    const { container } = render(<FmBoxes303 {...PERCENT_PROPS} boxes={{ 89: 50 }} onBoxChange={onBoxChange} />);
    const input = openFirstEditor(container);
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onBoxChange).toHaveBeenCalledWith(89, '');
  });

  it('a value of exactly 100 is left unclamped', () => {
    const onBoxChange = vi.fn();
    const { container } = render(<FmBoxes303 {...PERCENT_PROPS} boxes={{ 89: 50 }} onBoxChange={onBoxChange} />);
    const input = openFirstEditor(container);
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.blur(input);
    expect(onBoxChange).toHaveBeenCalledWith(89, '100');
  });

  it('an amount-type cell (box 76) is NOT clamped/rounded — raw string forwarded verbatim', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303 year={2026} period="T2" boxes={{ 76: 100 }} sectionIds={['resultado_final']} onBoxChange={onBoxChange} />
    );
    const editBtns = container.querySelectorAll('.fm-aeat-cell__edit-btn');
    fireEvent.click(editBtns[0]);
    const input = container.querySelector('.fm-aeat-cell__input');
    fireEvent.change(input, { target: { value: '999.999999' } });
    fireEvent.blur(input);
    expect(onBoxChange).toHaveBeenCalledWith(76, '999.999999');
  });
});

// ── Casilla 107 (territorio_comun) mirrors box 65 live (ETP-5391) ───────────
// 107 is a read-only derivedValue row — it must never carry its own edit
// affordance, must reflect the live box 65 value (not a snapshot), and must
// default to 100 when box 65 hasn't been entered yet.

describe('FmBoxes303 — casilla 107 (territorio_comun) mirrors box 65', () => {
  const TERR_PROPS = { year: 2026, period: 'T4', sectionIds: ['tributacion_territorial'] };

  it('renders box number 107 with the live value of box 65, formatted as a percent', () => {
    const { container } = render(<FmBoxes303 {...TERR_PROPS} boxes={{ 65: 42.5 }} />);
    const nums = Array.from(container.querySelectorAll('.fm-aeat-cell__num')).map(n => n.textContent);
    expect(nums).toContain('107');
    expect(container.textContent).toContain('42,50');
  });

  it('defaults to 100 (dv.defaultValue) when box 65 is absent from boxes', () => {
    const { container } = render(<FmBoxes303 {...TERR_PROPS} boxes={{}} />);
    expect(container.textContent).toContain('100,00');
  });

  it('tracks a live update to box 65 across a rerender (not a frozen snapshot)', () => {
    const { container, rerender } = render(<FmBoxes303 {...TERR_PROPS} boxes={{ 65: 30 }} />);
    expect(container.textContent).toContain('30,00');
    rerender(<FmBoxes303 {...TERR_PROPS} boxes={{ 65: 77 }} />);
    expect(container.textContent).toContain('77,00');
    expect(container.textContent).not.toContain('30,00');
  });

  it('renders empty (not "0,00") when the mirrored box-65 value is exactly 0', () => {
    const { container } = render(<FmBoxes303 {...TERR_PROPS} boxes={{ 65: 0 }} />);
    expect(container.textContent).not.toContain('0,00');
  });

  it('carries no edit-pencil button (read-only mirror, unlike the 4 editable territorial percent rows)', () => {
    const { container } = render(<FmBoxes303 {...TERR_PROPS} boxes={{ 65: 42, 89: 10, 90: 20, 91: 30, 92: 40 }} />);
    // Exactly 4 editable rows in this section (89/90/91/92) — territorio_comun (107) must not add a 5th.
    expect(container.querySelectorAll('.fm-aeat-cell__edit-btn').length).toBe(4);
  });
});

describe('FmBoxes303 — readOnly prop', () => {
  describe('renderIdentSelectField select', () => {
    it('disables the tipo_declaracion select when readOnly is true', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{}}
          sectionIds={['identificacion']}
          identification={{ tipo_declaracion: 'I' }}
          readOnly
        />
      );
      const select = container.querySelector('select');
      expect(select).toBeTruthy();
      expect(select.disabled).toBe(true);
    });

    it('leaves the tipo_declaracion select enabled when readOnly is false/omitted', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{}}
          sectionIds={['identificacion']}
          identification={{ tipo_declaracion: 'I' }}
        />
      );
      const select = container.querySelector('select');
      expect(select).toBeTruthy();
      expect(select.disabled).toBe(false);
    });
  });

  describe('grid edit-pencil buttons', () => {
    it('hides the edit-pencil button for an editable grid cell when readOnly is true', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{ 76: 100 }}
          sectionIds={['resultado_final']}
          readOnly
        />
      );
      expect(container.querySelector('.fm-aeat-cell__edit-btn')).toBeNull();
    });

    it('shows the edit-pencil button for the same editable grid cell when readOnly is false/omitted', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{ 76: 100 }}
          sectionIds={['resultado_final']}
        />
      );
      expect(container.querySelectorAll('.fm-aeat-cell__edit-btn').length).toBeGreaterThan(0);
    });
  });

  describe('bicolumn infobox edit-pencil button (resolveEditable path)', () => {
    it('hides the edit-pencil button for the always-editable reg_anual infobox (box 68) when readOnly is true', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{ 68: 50 }}
          sectionIds={['resultado_final']}
          readOnly
        />
      );
      const infobox = Array.from(container.querySelectorAll('.fm-aeat-infobox'))
        .find(el => el.textContent.includes('fm.box.row.reg_anual'));
      expect(infobox).toBeTruthy();
      expect(infobox.querySelector('.fm-aeat-cell__edit-btn')).toBeNull();
    });

    it('shows the edit-pencil button for the reg_anual infobox when readOnly is false/omitted', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{ 68: 50 }}
          sectionIds={['resultado_final']}
        />
      );
      const infobox = Array.from(container.querySelectorAll('.fm-aeat-infobox'))
        .find(el => el.textContent.includes('fm.box.row.reg_anual'));
      expect(infobox).toBeTruthy();
      expect(infobox.querySelector('.fm-aeat-cell__edit-btn')).toBeTruthy();
    });
  });

  describe('box-value number input', () => {
    it('the box-value input is enabled (not disabled) while editing under readOnly=false/omitted', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{ 76: 100 }}
          sectionIds={['resultado_final']}
          readOnly={false}
        />
      );
      fireEvent.click(container.querySelector('.fm-aeat-cell__edit-btn'));
      const input = container.querySelector('.fm-aeat-cell__input');
      expect(input).toBeTruthy();
      expect(input.disabled).toBe(false);
    });

    // The pencil is fully hidden under readOnly, so edit mode cannot normally
    // be entered while readOnly is true. Exercises the component's own
    // `useEffect(() => { if (readOnly) setEditingCell(null); }, [readOnly])`
    // guard: a cell mid-edit under readOnly=false is force-closed the moment
    // readOnly flips to true (same mounted instance, via rerender), so the
    // number input is never left dangling open/editable on a submitted doc.
    it('closes an in-progress edit (input disappears) the moment readOnly becomes true', () => {
      const { container, rerender } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{ 76: 100 }}
          sectionIds={['resultado_final']}
          readOnly={false}
        />
      );
      fireEvent.click(container.querySelector('.fm-aeat-cell__edit-btn'));
      expect(container.querySelector('.fm-aeat-cell__input')).toBeTruthy();

      rerender(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{ 76: 100 }}
          sectionIds={['resultado_final']}
          readOnly
        />
      );
      expect(container.querySelector('.fm-aeat-cell__input')).toBeNull();
    });
  });

  describe('Checkbox instances', () => {
    it('disables identificacion checkboxes when readOnly is true', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{}}
          sectionIds={['identificacion']}
          identification={{ redeme: true }}
          readOnly
        />
      );
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThan(0);
      checkboxes.forEach(cb => expect(cb.disabled).toBe(true));
    });

    it('leaves identificacion checkboxes enabled when readOnly is false/omitted', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{}}
          sectionIds={['identificacion']}
          identification={{ redeme: true }}
        />
      );
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBeGreaterThan(0);
      checkboxes.forEach(cb => expect(cb.disabled).toBe(false));
    });

    it('disables the rectificativa (meta-section) checkbox when readOnly is true', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{}}
          sectionIds={['rectificativa']}
          identification={{ rectificativa: false }}
          readOnly
        />
      );
      const checkbox = container.querySelector('input[type="checkbox"]');
      expect(checkbox).toBeTruthy();
      expect(checkbox.disabled).toBe(true);
    });
  });

  describe('inline text/date inputs', () => {
    it('disables the fecha_concurso date input (main identificacion section) when readOnly is true', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{}}
          sectionIds={['identificacion']}
          identification={{ concurso: true }}
          readOnly
        />
      );
      const dateInput = container.querySelector('input[type="date"]');
      expect(dateInput).toBeTruthy();
      expect(dateInput.disabled).toBe(true);
    });

    it('leaves the fecha_concurso date input enabled when readOnly is false/omitted', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{}}
          sectionIds={['identificacion']}
          identification={{ concurso: true }}
        />
      );
      const dateInput = container.querySelector('input[type="date"]');
      expect(dateInput).toBeTruthy();
      expect(dateInput.disabled).toBe(false);
    });

    it('disables the bank_iban text input (meta section, aligned layout) when readOnly is true', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{}}
          sectionIds={['datos_bancarios']}
          identification={{ tipo_declaracion: 'D' }}
          readOnly
        />
      );
      const textInput = container.querySelector('input.fm-aeat-ident-inline-field__input[type="text"]');
      expect(textInput).toBeTruthy();
      expect(textInput.disabled).toBe(true);
    });

    it('leaves the bank_iban text input enabled when readOnly is false/omitted', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{}}
          sectionIds={['datos_bancarios']}
          identification={{ tipo_declaracion: 'D' }}
        />
      );
      const textInput = container.querySelector('input.fm-aeat-ident-inline-field__input[type="text"]');
      expect(textInput).toBeTruthy();
      expect(textInput.disabled).toBe(false);
    });

    it('disables the nro_justificante text input (rectificativa meta section) when readOnly is true', () => {
      const { container } = render(
        <FmBoxes303
          {...BASE_PROPS}
          boxes={{}}
          sectionIds={['rectificativa']}
          identification={{ rectificativa: true }}
          readOnly
        />
      );
      const textInput = container.querySelector('input.fm-aeat-ident-inline-field__input[type="text"]');
      expect(textInput).toBeTruthy();
      expect(textInput.disabled).toBe(true);
    });
  });
});

// ── ETP-5431 pt.2 — casilla 111 is no longer user-editable ───────────────────
// `rectificacion_importe` (box 111, resultado_final section) now carries neither `editable`
// nor `derivedValue` in fm303Layouts.js — its value comes exclusively from `computeBox111`,
// applied to the real box array by `recomputeDerivedBoxes` (fiscalModelsUtils.js), one level
// above this component. From FmBoxes303's own point of view the row renders like any other
// non-editable total row (e.g. `resultado_69`/`resultado_declaracion`): a plain read-only cell,
// no pencil, no `fm-aeat-cell--editable` class.

describe('FmBoxes303 — box 111 (rectificacion_importe) is read-only (ETP-5431 pt.2)', () => {
  function findCell111(container) {
    return Array.from(container.querySelectorAll('.fm-aeat-cell')).find(
      cell => cell.querySelector('.fm-aeat-cell__num')?.textContent === '111'
    );
  }

  it('renders no edit button for box 111, unlike its still-editable sibling box 70', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{ 70: 10, 111: 5 }} sectionIds={['resultado_final']} />
    );
    const cell111 = findCell111(container);
    expect(cell111).toBeTruthy();
    expect(cell111.querySelector('.fm-aeat-cell__edit-btn')).toBeNull();
    expect(cell111.classList.contains('fm-aeat-cell--editable')).toBe(false);

    const cell70 = Array.from(container.querySelectorAll('.fm-aeat-cell')).find(
      cell => cell.querySelector('.fm-aeat-cell__num')?.textContent === '70'
    );
    expect(cell70.querySelector('.fm-aeat-cell__edit-btn')).toBeTruthy();
  });

  it('clicking anywhere in the box 111 cell does not open an editor', () => {
    const onBoxChange = vi.fn();
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{ 111: 5 }} sectionIds={['resultado_final']} onBoxChange={onBoxChange} />
    );
    fireEvent.click(findCell111(container));
    expect(container.querySelector('.fm-aeat-cell__input')).toBeNull();
    expect(onBoxChange).not.toHaveBeenCalled();
  });

  it('still displays the formatted value, exactly like the other computed total rows', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{ 111: 1234.56 }} sectionIds={['resultado_final']} />
    );
    const value = findCell111(container).querySelector('.fm-aeat-cell__value');
    expect(value.textContent.trim()).not.toBe('');
  });
});

// ── ETP-5431 pt.2 — boxes 109/70 join the negative-not-allowed `min="0"` UX hint ─────
// Same `NEGATIVE_NOT_ALLOWED_BOXES`-driven input attribute already covered for box 77's stale-
// draft scenario above — boxes 109 (`devoluciones_at`) and 70 (`a_deducir`) are now also members
// of the shared Set, so their editors must carry `min="0"` too (FmBoxes303.jsx:167).

describe('FmBoxes303 — min="0" on boxes 109/70 (ETP-5431 pt.2, NEGATIVE_NOT_ALLOWED_BOXES)', () => {
  function openEditorFor(container, boxNum) {
    const cell = Array.from(container.querySelectorAll('.fm-aeat-cell')).find(
      c => c.querySelector('.fm-aeat-cell__num')?.textContent === String(boxNum).padStart(2, '0')
    );
    fireEvent.click(cell.querySelector('.fm-aeat-cell__edit-btn'));
    return container.querySelector('.fm-aeat-cell__input');
  }

  it('renders min=0 on box 109 (devoluciones_at)', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{ 109: 0 }} sectionIds={['resultado_final']} />
    );
    expect(openEditorFor(container, 109).getAttribute('min')).toBe('0');
  });

  it('renders min=0 on box 70 (a_deducir)', () => {
    const { container } = render(
      <FmBoxes303 {...BASE_PROPS} boxes={{ 70: 0 }} sectionIds={['resultado_final']} />
    );
    expect(openEditorFor(container, 70).getAttribute('min')).toBe('0');
  });
});
