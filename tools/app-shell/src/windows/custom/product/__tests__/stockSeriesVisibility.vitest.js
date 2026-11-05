/** @covers tools/app-shell/src/windows/custom/product/stockSeriesVisibility.js */
import { describe, it, expect } from 'vitest';
import {
  resolveVisible, toggleVisible, isolate, isIsolated, activeHighlight, dimmedOpacity, filterVisibleSeries, DIMMED_OPACITY,
} from '../stockSeriesVisibility';

const ALL = ['A', 'B', 'C'];
const keys = (set) => [...set].sort();

describe('resolveVisible', () => {
  it('treats null/undefined as every series visible', () => {
    expect(keys(resolveVisible(null, ALL))).toEqual(ALL);
    expect(keys(resolveVisible(undefined, ALL))).toEqual(ALL);
  });
  it('drops unknown keys and falls back to all when nothing known remains (never empty)', () => {
    expect(keys(resolveVisible(new Set(['A', 'Z']), ALL))).toEqual(['A']);
    expect(keys(resolveVisible(new Set(['Z']), ALL))).toEqual(ALL);
    expect(keys(resolveVisible(new Set(), ALL))).toEqual(ALL);
  });
});

describe('toggleVisible', () => {
  it('hides a visible series and shows it again', () => {
    const hidden = toggleVisible(null, 'B', ALL);
    expect(keys(hidden)).toEqual(['A', 'C']);
    expect(keys(toggleVisible(hidden, 'B', ALL))).toEqual(ALL);
  });
  it('never returns an empty set: the last visible series cannot be hidden', () => {
    const one = new Set(['A']);
    expect(keys(toggleVisible(one, 'A', ALL))).toEqual(['A']);
  });
  it('ignores an unknown key and does not mutate its input', () => {
    const vis = new Set(['A', 'B']);
    expect(keys(toggleVisible(vis, 'Z', ALL))).toEqual(['A', 'B']);
    toggleVisible(vis, 'A', ALL);
    expect(keys(vis)).toEqual(['A', 'B']);
  });
  it('is a no-op with a single series', () => {
    expect(keys(toggleVisible(null, 'A', ['A']))).toEqual(['A']);
  });
});

describe('isolate / isIsolated', () => {
  it('shows only the clicked series, and a second click restores all', () => {
    const iso = isolate(null, 'B', ALL);
    expect(keys(iso)).toEqual(['B']);
    expect(isIsolated(iso, 'B', ALL)).toBe(true);
    expect(isIsolated(iso, 'A', ALL)).toBe(false);
    expect(keys(isolate(iso, 'B', ALL))).toEqual(ALL);
  });
  it('isolating another series while one is isolated switches to it', () => {
    expect(keys(isolate(new Set(['B']), 'C', ALL))).toEqual(['C']);
  });
  it('from a partial subset, clicking a member isolates it', () => {
    expect(keys(isolate(new Set(['A', 'B']), 'A', ALL))).toEqual(['A']);
  });
  it('is a no-op with a single series and ignores unknown keys', () => {
    expect(keys(isolate(null, 'A', ['A']))).toEqual(['A']);
    expect(isIsolated(null, 'A', ['A'])).toBe(false);
    expect(keys(isolate(new Set(['A']), 'Z', ALL))).toEqual(['A']);
  });
});

describe('activeHighlight / dimmedOpacity', () => {
  it('highlights only a hovered series that is visible', () => {
    expect(activeHighlight('A', new Set(['A', 'B']))).toBe('A');
    expect(activeHighlight('C', new Set(['A', 'B']))).toBeNull();
    expect(activeHighlight(null, new Set(['A']))).toBeNull();
  });
  it('dims every series but the highlighted one', () => {
    expect(dimmedOpacity('A', 'A')).toBe(1);
    expect(dimmedOpacity('B', 'A')).toBe(DIMMED_OPACITY);
    expect(dimmedOpacity('B', null)).toBe(1);
  });
});

describe('filterVisibleSeries', () => {
  const s = (name) => ({ name, points: [] });
  it('keeps visible named series in order and always keeps an unnamed aggregate', () => {
    expect(filterVisibleSeries([s('A'), s('B'), s('C')], new Set(['C', 'A'])).map(x => x.name)).toEqual(['A', 'C']);
    expect(filterVisibleSeries([s(null)], new Set(['A'])).map(x => x.name)).toEqual([null]);
  });
});
