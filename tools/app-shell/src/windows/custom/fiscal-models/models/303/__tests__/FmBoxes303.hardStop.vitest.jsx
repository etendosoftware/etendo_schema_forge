// ETP-5456 — keystroke/paste HARD STOP on amount-cell inputs (FmBoxes303.jsx's `renderCellInput`
// onChange). FINAL behavior (fiscal-advisory correction — an earlier clamp/truncate draft was
// reverted mid-ticket): an out-of-range MANUAL value must be structurally IMPOSSIBLE to type —
// the input simply refuses the keystroke/paste that would push it over, rather than accepting it
// and rounding/truncating/rejecting afterward. Covers both axes:
//   - INTEGER part: refused once it reaches the box's own ceiling (15 digits for a `Num` box or a
//     non-negative `N` box, 14 for a negative `N` box).
//   - DECIMAL part: refused once a 3rd decimal digit would be typed — always exactly 2, regardless
//     of box/sign (manual QA caught a 4-decimal value going through uncaught on box 42 before this
//     guard existed).
// Reaching one ceiling never blocks typing on the other side.
import { vi, describe, it, expect } from 'vitest';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';

vi.mock('@/i18n', () => ({ useUI: () => (key) => key }));
vi.mock('lucide-react', () => ({
  TrendingUp: () => null, TrendingDown: () => null, Pencil: () => null,
}));
vi.mock('@/windows/custom/shared/CheckboxField.jsx', () => ({
  CheckboxField: ({ checked, disabled, onToggle }) =>
    React.createElement('input', {
      type: 'checkbox', checked: !!checked, disabled,
      onChange: e => onToggle?.(e.target.checked),
    }),
}));

import FmBoxes303 from '../FmBoxes303.jsx';

function findCellByNum(container, num) {
  const padded = String(num).padStart(2, '0');
  return Array.from(container.querySelectorAll('.fm-aeat-cell')).find(
    (cell) => cell.querySelector('.fm-aeat-cell__num')?.textContent === padded,
  );
}

function openEditor(container, num) {
  const cell = findCellByNum(container, num);
  const editBtn = cell.querySelector('.fm-aeat-cell__edit-btn');
  fireEvent.click(editBtn);
  return container.querySelector('.fm-aeat-cell__input');
}

describe('FmBoxes303 — keystroke hard-stop, integer digits (ETP-5456)', () => {
  // Box 77 — Num (unsigned), resultado_final section, ceiling always 15 integer digits.
  it('accepts typing up to 15 integer digits on a Num box', () => {
    const { container } = render(
      <FmBoxes303 year={2026} period="T2" boxes={{}} sectionIds={['resultado_final']} onBoxChange={vi.fn()} />
    );
    const input = openEditor(container, 77);
    fireEvent.change(input, { target: { value: '123456789012345' } });
    expect(input.value).toBe('123456789012345');
  });

  it('refuses the 16th integer digit on a Num box — the input value stays at 15 digits', () => {
    const { container } = render(
      <FmBoxes303 year={2026} period="T2" boxes={{}} sectionIds={['resultado_final']} onBoxChange={vi.fn()} />
    );
    const input = openEditor(container, 77);
    fireEvent.change(input, { target: { value: '123456789012345' } });
    fireEvent.change(input, { target: { value: '1234567890123456' } });
    expect(input.value).toBe('123456789012345');
  });

  // Box 42 — N (signed), iva_deducible section ("Compensaciones Régimen Especial A.G. y P."),
  // ceiling 15 positive / 14 negative.
  it('accepts a negative N box up to 14 integer digits', () => {
    const { container } = render(
      <FmBoxes303 year={2026} period="T2" boxes={{}} sectionIds={['iva_deducible']} onBoxChange={vi.fn()} />
    );
    const input = openEditor(container, 42);
    fireEvent.change(input, { target: { value: '-12345678901234' } });
    expect(input.value).toBe('-12345678901234');
  });

  it('refuses the 15th integer digit once a N box is negative', () => {
    const { container } = render(
      <FmBoxes303 year={2026} period="T2" boxes={{}} sectionIds={['iva_deducible']} onBoxChange={vi.fn()} />
    );
    const input = openEditor(container, 42);
    fireEvent.change(input, { target: { value: '-12345678901234' } });
    fireEvent.change(input, { target: { value: '-123456789012345' } });
    expect(input.value).toBe('-12345678901234');
  });

  it('allows the full 15 integer digits on a N box when non-negative (no sign to consume a slot)', () => {
    const { container } = render(
      <FmBoxes303 year={2026} period="T2" boxes={{}} sectionIds={['iva_deducible']} onBoxChange={vi.fn()} />
    );
    const input = openEditor(container, 42);
    fireEvent.change(input, { target: { value: '123456789012345' } });
    expect(input.value).toBe('123456789012345');
  });
});

describe('FmBoxes303 — keystroke hard-stop, decimal digits (ETP-5456, manual QA follow-up)', () => {
  it('accepts up to 2 decimal digits', () => {
    const { container } = render(
      <FmBoxes303 year={2026} period="T2" boxes={{}} sectionIds={['iva_deducible']} onBoxChange={vi.fn()} />
    );
    const input = openEditor(container, 42);
    fireEvent.change(input, { target: { value: '9012345.20' } });
    expect(input.value).toBe('9012345.20');
  });

  it('refuses the 3rd decimal digit — the exact box42 regression manual QA caught ("...9012345.2057")', () => {
    const { container } = render(
      <FmBoxes303 year={2026} period="T2" boxes={{}} sectionIds={['iva_deducible']} onBoxChange={vi.fn()} />
    );
    const input = openEditor(container, 42);
    fireEvent.change(input, { target: { value: '9012345.2' } });
    fireEvent.change(input, { target: { value: '9012345.20' } });
    fireEvent.change(input, { target: { value: '9012345.205' } });
    fireEvent.change(input, { target: { value: '9012345.2057' } });
    expect(input.value).toBe('9012345.20');
  });

  it('reaching the integer ceiling does not block typing the 2 decimal digits afterward', () => {
    const { container } = render(
      <FmBoxes303 year={2026} period="T2" boxes={{}} sectionIds={['resultado_final']} onBoxChange={vi.fn()} />
    );
    const input = openEditor(container, 77);
    fireEvent.change(input, { target: { value: '123456789012345' } }); // at the 15-digit ceiling
    fireEvent.change(input, { target: { value: '123456789012345.3' } });
    fireEvent.change(input, { target: { value: '123456789012345.35' } });
    expect(input.value).toBe('123456789012345.35');
  });

  it('reaching the decimal ceiling does not block extending the integer part further', () => {
    const { container } = render(
      <FmBoxes303 year={2026} period="T2" boxes={{}} sectionIds={['resultado_final']} onBoxChange={vi.fn()} />
    );
    const input = openEditor(container, 77);
    fireEvent.change(input, { target: { value: '123.45' } }); // at the 2-decimal ceiling
    fireEvent.change(input, { target: { value: '1234.45' } });
    expect(input.value).toBe('1234.45');
  });
});

describe('FmBoxes303 — percent cells are exempt from the amount hard-stop (ETP-5456)', () => {
  // Box 89 (territorio_alava), Lon=5 percent — has its OWN separate [0,100] range enforced on
  // commit via clampPercentValue, not this keystroke-level guard.
  it('does not apply the amount-box integer/decimal hard-stop to a percent cell', () => {
    const { container } = render(
      <FmBoxes303
        year={2026}
        period="T4"
        boxes={{ 89: 50 }}
        sectionIds={['tributacion_territorial']}
        onBoxChange={vi.fn()}
      />
    );
    const input = openEditor(container, 89);
    fireEvent.change(input, { target: { value: '150.999' } });
    // Unrestricted at keystroke time — clampPercentValue handles range/decimals on commit
    // (see FmBoxes303.vitest.jsx's "percent cell clamping/rounding" tests).
    expect(input.value).toBe('150.999');
  });
});
