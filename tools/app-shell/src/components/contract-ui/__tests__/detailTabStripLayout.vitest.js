// @covers tools/app-shell/src/components/contract-ui/detailTabStripLayout.js
import {
  MAX_VISIBLE_TABS,
  MIN_VISIBLE_TABS,
  resolveTabStripLayout,
  computeFittingTabCount,
} from '../detailTabStripLayout.js';

const makeTabs = (n) => Array.from({ length: n }, (_, i) => ({ key: `t${i}` }));
const keys = (entries) => entries.map((e) => e.tab.key);
const indexes = (entries) => entries.map((e) => e.index);

describe('detailTabStripLayout constants', () => {
  it('exposes the ticket limits', () => {
    expect(MAX_VISIBLE_TABS).toBe(4);
    expect(MIN_VISIBLE_TABS).toBe(2);
  });
});

describe('resolveTabStripLayout', () => {
  it.each([0, 1, 3, 4])('shows all %i tabs with nothing hidden', (n) => {
    const { visible, hidden } = resolveTabStripLayout(makeTabs(n), 't0');
    expect(visible).toHaveLength(n);
    expect(hidden).toEqual([]);
  });

  it.each([
    [5, ['t0', 't1', 't2', 't3'], ['t4']],
    [6, ['t0', 't1', 't2', 't3'], ['t4', 't5']],
  ])('with %i tabs: 3 fixed + slot, the rest in the menu in original order', (n, vis, hid) => {
    const { visible, hidden } = resolveTabStripLayout(makeTabs(n), 't0');
    expect(keys(visible)).toEqual(vis);
    expect(keys(hidden)).toEqual(hid);
    expect(indexes(visible)).toEqual([0, 1, 2, 3]);
    expect(indexes(hidden)).toEqual(hid.map((k) => Number(k.slice(1))));
  });

  it('promotes an active hidden tab into the slot and moves the slot tab to the menu', () => {
    const { visible, hidden } = resolveTabStripLayout(makeTabs(6), 't5');
    expect(keys(visible)).toEqual(['t0', 't1', 't2', 't5']);
    expect(keys(hidden)).toEqual(['t3', 't4']);
    expect(visible[3].index).toBe(5);
  });

  it('keeps the menu in original order when promoting a middle hidden tab', () => {
    const { visible, hidden } = resolveTabStripLayout(makeTabs(7), 't5');
    expect(keys(visible)).toEqual(['t0', 't1', 't2', 't5']);
    expect(keys(hidden)).toEqual(['t3', 't4', 't6']);
    expect(indexes(hidden)).toEqual([3, 4, 6]);
  });

  it('restores the original arrangement when a fixed tab is active', () => {
    const { visible, hidden } = resolveTabStripLayout(makeTabs(6), 't1');
    expect(keys(visible)).toEqual(['t0', 't1', 't2', 't3']);
    expect(keys(hidden)).toEqual(['t4', 't5']);
  });

  it('keeps the original slot tab when it is the active one', () => {
    const { visible, hidden } = resolveTabStripLayout(makeTabs(6), 't3');
    expect(keys(visible)).toEqual(['t0', 't1', 't2', 't3']);
    expect(keys(hidden)).toEqual(['t4', 't5']);
  });

  it.each([['nope'], [null], [undefined]])('falls back to the original arrangement for activeKey %s', (k) => {
    const { visible, hidden } = resolveTabStripLayout(makeTabs(6), k);
    expect(keys(visible)).toEqual(['t0', 't1', 't2', 't3']);
    expect(keys(hidden)).toEqual(['t4', 't5']);
  });

  it.each([
    [3, ['t0', 't1', 't2'], ['t3', 't4', 't5']],
    [2, ['t0', 't1'], ['t2', 't3', 't4', 't5']],
  ])('honours maxVisible=%i', (max, vis, hid) => {
    const { visible, hidden } = resolveTabStripLayout(makeTabs(6), 't0', max);
    expect(keys(visible)).toEqual(vis);
    expect(keys(hidden)).toEqual(hid);
  });

  it('promotes the active hidden tab into the slot with a lowered maxVisible', () => {
    const { visible, hidden } = resolveTabStripLayout(makeTabs(6), 't4', 2);
    expect(keys(visible)).toEqual(['t0', 't4']);
    expect(keys(hidden)).toEqual(['t1', 't2', 't3', 't5']);
  });

  it.each([1, 0])('maxVisible=%i still keeps one fixed tab and the slot', (max) => {
    const { visible, hidden } = resolveTabStripLayout(makeTabs(5), 't0', max);
    expect(keys(visible)).toEqual(['t0', 't1']);
    expect(keys(hidden)).toEqual(['t2', 't3', 't4']);
  });
});

describe('computeFittingTabCount', () => {
  const tabs = makeTabs(6);
  const widths = [100, 100, 100, 100, 100, 100];
  const base = { widths, moreWidth: 50, tabs, activeKey: 't0' };

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['NaN', NaN],
    ['0', 0],
    ['negative', -10],
  ])('returns max while the available width is %s', (_l, available) => {
    expect(computeFittingTabCount({ ...base, available })).toBe(MAX_VISIBLE_TABS);
  });

  it('returns max for Infinity-free generous widths and for Infinity', () => {
    expect(computeFittingTabCount({ ...base, available: 10_000 })).toBe(4);
    // Infinity is not finite: treated as unknown geometry
    expect(computeFittingTabCount({ ...base, available: Infinity })).toBe(4);
  });

  it('returns max when widths do not match the tabs or are all zero', () => {
    expect(computeFittingTabCount({ ...base, widths: [100], available: 120 })).toBe(4);
    expect(computeFittingTabCount({ ...base, widths: [0, 0, 0, 0, 0, 0], available: 120 })).toBe(4);
  });

  it('shrinks 4 -> 3 -> 2 as the available width shrinks, counting More when something is hidden', () => {
    // 4 visible + More = 450; 3 visible + More = 350; 2 visible + More = 250
    expect(computeFittingTabCount({ ...base, available: 450 })).toBe(4);
    expect(computeFittingTabCount({ ...base, available: 449 })).toBe(3);
    expect(computeFittingTabCount({ ...base, available: 350 })).toBe(3);
    expect(computeFittingTabCount({ ...base, available: 349 })).toBe(2);
  });

  it('never goes below MIN_VISIBLE_TABS', () => {
    expect(computeFittingTabCount({ ...base, available: 1 })).toBe(MIN_VISIBLE_TABS);
  });

  it('does not count the More width when nothing is hidden', () => {
    const four = makeTabs(4);
    const r = computeFittingTabCount({
      widths: [100, 100, 100, 100], moreWidth: 999, available: 400, tabs: four, activeKey: 't0',
    });
    expect(r).toBe(4);
  });

  it('sums the width of the promoted active tab, not of the original slot tab', () => {
    const w = [100, 100, 100, 100, 100, 300];
    // n=4 active t5: visible t0,t1,t2,t5 = 600 + More 50 = 650
    expect(computeFittingTabCount({ ...base, widths: w, activeKey: 't5', available: 650 })).toBe(4);
    expect(computeFittingTabCount({ ...base, widths: w, activeKey: 't5', available: 649 })).toBe(3);
    // same available with a fixed active tab still fits 4 (t3 is only 100)
    expect(computeFittingTabCount({ ...base, widths: w, activeKey: 't0', available: 649 })).toBe(4);
  });

  it('respects a custom max and floors at min(MIN, max)', () => {
    expect(computeFittingTabCount({ ...base, available: 1, max: 3 })).toBe(2);
    expect(computeFittingTabCount({ ...base, available: 1, max: 1 })).toBe(1);
    expect(computeFittingTabCount({ ...base, available: 10_000, max: 3 })).toBe(3);
  });
});
