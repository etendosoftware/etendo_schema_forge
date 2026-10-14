// @covers tools/app-shell/src/components/contract-ui/formResponsiveLayout.js
//
// Pure helpers of the header form's responsive layout: the column count follows the
// grid's own width (not the viewport), and the "show more details" split keeps the
// first rows with required fields first.
import { describe, it, expect } from 'vitest';
import { resolveFormColumns, effectiveSpan, partitionInitialRows } from '../formResponsiveLayout.js';

const f = (key, extra = {}) => ({ key, ...extra });

describe('resolveFormColumns', () => {
  it('returns null while the width is unknown, so the static classes stay in charge', () => {
    expect(resolveFormColumns(0)).toBeNull();
    expect(resolveFormColumns(undefined)).toBeNull();
  });

  it('uses 3 columns for a header next to the side panel at 1280x720', () => {
    expect(resolveFormColumns(664)).toBe(3); // rail expanded
    expect(resolveFormColumns(848)).toBe(3); // rail collapsed
  });

  it('uses 2 columns when narrow and 4 when wide', () => {
    expect(resolveFormColumns(400)).toBe(2);
    expect(resolveFormColumns(1100)).toBe(4);
  });
});

describe('effectiveSpan', () => {
  it('clamps a span to the grid column count', () => {
    expect(effectiveSpan(f('d', { span: 4 }), 3)).toBe(3);
    expect(effectiveSpan(f('d', { span: 2 }), 3)).toBe(2);
    expect(effectiveSpan(f('d'), 3)).toBe(1);
  });
});

describe('partitionInitialRows', () => {
  it('hides nothing and keeps the order when the fields fit', () => {
    const fields = [f('a'), f('b', { required: true }), f('c')];
    const res = partitionInitialRows(fields, 3, 2);
    expect(res.hiddenCount).toBe(0);
    expect(res.visible.map(x => x.key)).toEqual(['a', 'b', 'c']);
  });

  it('is inert without a measured column count', () => {
    const fields = Array.from({ length: 10 }, (_, i) => f(`k${i}`));
    expect(partitionInitialRows(fields, null, 2).hiddenCount).toBe(0);
  });

  it('shows two rows with required fields first on overflow', () => {
    const fields = [f('a'), f('b'), f('c', { required: true }), f('d'), f('e'), f('g', { requiredVisual: true }), f('h')];
    const res = partitionInitialRows(fields, 3, 2);
    expect(res.visible.map(x => x.key)).toEqual(['c', 'g', 'a', 'b', 'd', 'e']);
    expect(res.hiddenCount).toBe(1);
    expect(res.ordered.map(x => x.key)).toEqual(['c', 'g', 'a', 'b', 'd', 'e', 'h']);
  });

  it('does not move a required field that is read-only (asterisk hidden)', () => {
    const fields = [f('a'), f('b'), f('c', { required: true }), f('d'), f('e'), f('g', { required: true }), f('h')];
    const res = partitionInitialRows(fields, 3, 2, (x) => x.key === 'c');
    expect(res.ordered.map(x => x.key)).toEqual(['g', 'a', 'b', 'c', 'd', 'e', 'h']);
    const allRo = partitionInitialRows(fields, 3, 2, () => true);
    expect(allRo.ordered.map(x => x.key)).toEqual(['a', 'b', 'c', 'd', 'e', 'g', 'h']);
  });

  it('starts a new row when a spanned field does not fit the rest of the row', () => {
    const fields = [f('a'), f('b'), f('desc', { span: 4 }), f('c'), f('d')];
    // 3 cols: row 1 = a, b ; desc (clamped to 3) does not fit -> row 2 = desc ; c -> row 3 hidden
    const res = partitionInitialRows(fields, 3, 2);
    expect(res.visible.map(x => x.key)).toEqual(['a', 'b', 'desc']);
    expect(res.hiddenCount).toBe(2);
  });
});
