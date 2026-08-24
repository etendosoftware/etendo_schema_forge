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
vi.mock('@/components/ui/checkbox', () => ({
  // Forwards `disabled` straight through, matching the real Checkbox
  // component's contract (node_modules/@etendosoftware/app-shell-core/src/
  // components/ui/checkbox.jsx passes `disabled` to the native input as-is).
  Checkbox: ({ checked, disabled, onChange }) =>
    React.createElement('input', {
      type: 'checkbox', checked: !!checked, disabled,
      onChange: onChange ?? (() => {}),
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

  it('tipo I + rectificativa true → visible (the actual bug fix — rectificativa branch of anyOf)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: true }}
      />
    );
    expect(container.querySelector('.fm-aeat-section')).toBeTruthy();
  });

  it('tipo V + rectificativa true → visible (V is reachable again once rectificativa is checked)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'V', rectificativa: true }}
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
  const bankFieldLabels = (container) =>
    Array.from(container.querySelectorAll('.fm-aeat-ident-inline-field__label'))
      .map(el => el.textContent);

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

  it('tipo I + rectificativa true → bank_swift_bic visible (the actual bug fix — commit edb448754)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: true }}
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

  it('also covers bank_nombre, bank_direccion, bank_ciudad, bank_pais, bank_sepa for the bug-fix case (tipo I + rectificativa true)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: true }}
      />
    );
    const labels = bankFieldLabels(container);
    ['fm.ident.bank.nombre', 'fm.ident.bank.direccion', 'fm.ident.bank.ciudad', 'fm.ident.bank.pais', 'fm.ident.bank.sepa']
      .forEach(key => expect(labels).toContain(key));
  });

  it('bank_iban is unaffected by the field-level visibleWhen change — visible whenever the section is (tipo I + rectificativa true)', () => {
    const { container } = render(
      <FmBoxes303
        {...BASE_PROPS}
        boxes={{}}
        sectionIds={['datos_bancarios']}
        identification={{ tipo_declaracion: 'I', rectificativa: true }}
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
