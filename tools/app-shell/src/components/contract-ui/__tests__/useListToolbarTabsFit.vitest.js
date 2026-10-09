/**
 * Pure fit decision behind the list toolbar's tab group (ETP-5509): the tab
 * tabs share the main row while the natural widths of every cluster plus the
 * gaps fit the row, and move to a line of their own otherwise. The hook is
 * covered against stubbed element widths and computed styles: `display: contents`
 * recursion, gaps, late filter controls (MutationObserver), the deferred resize
 * re-measure, unmount cleanup and the restored inline style.
 */
// @covers tools/app-shell/src/components/contract-ui/useListToolbarTabsFit.js
import { act, renderHook } from '@testing-library/react';
import {
  computeListToolbarTabsInline,
  LIST_TOOLBAR_TABS_HYSTERESIS_PX,
  useListToolbarTabsFit,
} from '../useListToolbarTabsFit.js';

// tabs 300 + tabs gap 8 + 2 filters (120 + 80) + 1 inner gap 8 + group gap 16 + actions 400 = 932
const BASE = { tabs: 300, tabsGap: 8, leftItems: [120, 80], leftGap: 8, groupGap: 16, actions: 400 };
const REQUIRED = 932;

describe('computeListToolbarTabsInline', () => {
  it('fits when the row is exactly as wide as the required width', () => {
    expect(computeListToolbarTabsInline({ ...BASE, available: REQUIRED })).toBe(true);
  });

  it('does not fit one pixel short of the required width', () => {
    expect(computeListToolbarTabsInline({ ...BASE, available: REQUIRED - 1 })).toBe(false);
  });

  it('counts the minimum gap between the filters and the actions cluster', () => {
    expect(computeListToolbarTabsInline({ ...BASE, groupGap: 0, available: REQUIRED - 16 })).toBe(true);
    expect(computeListToolbarTabsInline({ ...BASE, available: REQUIRED - 16 })).toBe(false);
  });

  it('counts no inner gap for a single filter item', () => {
    expect(computeListToolbarTabsInline({ ...BASE, leftItems: [200], available: REQUIRED - 8 })).toBe(true);
  });

  it('ignores zero-width filter items (nothing rendered, no gap)', () => {
    expect(computeListToolbarTabsInline({ ...BASE, leftItems: [120, 0, 80], available: REQUIRED })).toBe(true);
  });

  it('requires the hysteresis margin to come back inline from the second row', () => {
    expect(computeListToolbarTabsInline({ ...BASE, available: REQUIRED, wasInline: false })).toBe(false);
    expect(computeListToolbarTabsInline({
      ...BASE, available: REQUIRED + LIST_TOOLBAR_TABS_HYSTERESIS_PX, wasInline: false,
    })).toBe(true);
  });
});

// ─── The hook, measuring real elements ──────────────────────────────────────
// jsdom has no layout, so every measured input is stubbed per element:
//   data-w        width returned by getBoundingClientRect
//   data-display  computed `display` (a wrapper set to `contents`)
//   data-gap      computed `columnGap`
//   data-ml       computed `marginLeft`

describe('useListToolbarTabsFit', () => {
  let rectCalls;

  const el = (attrs = {}, children = []) => {
    const node = document.createElement('div');
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(`data-${k}`, String(v)));
    children.forEach((c) => node.appendChild(c));
    return node;
  };

  // row [tabs][left][actions]; returns the four measured elements.
  const buildToolbar = ({ row = {}, tabs = {}, left = {}, leftChildren = [], actions = {} }) => {
    const tabsEl = el(tabs);
    const leftEl = el(left, leftChildren);
    const actionsEl = el(actions);
    const rowEl = el(row, [tabsEl, leftEl, actionsEl]);
    document.body.appendChild(rowEl);
    return { rowEl, tabsEl, leftEl, actionsEl };
  };

  const mount = (els) => {
    const hook = renderHook(() => useListToolbarTabsFit(true));
    act(() => {
      hook.result.current.rowRef(els.rowEl);
      hook.result.current.leftRef(els.leftEl);
      hook.result.current.actionsRef(els.actionsEl);
      hook.result.current.tabsRef(els.tabsEl);
    });
    return hook;
  };

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  beforeEach(() => {
    rectCalls = [];
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function stubRect() {
      rectCalls.push({ el: this, width: this.style.width, maxWidth: this.style.maxWidth, flex: this.style.flex });
      const width = Number(this.dataset?.w ?? 0);
      return { width, height: 0, top: 0, left: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
    });
    vi.stubGlobal('getComputedStyle', (node) => ({
      display: node.dataset?.display ?? 'block',
      columnGap: node.dataset?.gap ?? 'normal',
      marginLeft: node.dataset?.ml ?? '0px',
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  describe('display: contents filter wrappers', () => {
    // tabs 300 + actions 400 = 700 on a 1000 row: two 200px controls inside a
    // `contents` wrapper bring the total to 1100, so the tabs must wrap. Measured as
    // one box, the wrapper reads 0 and the tabs would wrongly stay inline.
    const wrapperWith = (display) => el({ display }, [el({ w: 200 }), el({ w: 200 })]);

    it('sums the children of a display: contents wrapper as flex items', () => {
      const els = buildToolbar({
        row: { w: 1000 }, tabs: { w: 300 }, actions: { w: 400 }, leftChildren: [wrapperWith('contents')],
      });
      const { result } = mount(els);
      expect(result.current.tabsInline).toBe(false);
    });

    it('recurses through nested display: contents wrappers', () => {
      const nested = el({ display: 'contents' }, [wrapperWith('contents')]);
      const els = buildToolbar({
        row: { w: 1000 }, tabs: { w: 300 }, actions: { w: 400 }, leftChildren: [nested],
      });
      const { result } = mount(els);
      expect(result.current.tabsInline).toBe(false);
    });

    it('measures a wrapper with a box of its own as a single item', () => {
      const els = buildToolbar({
        row: { w: 1000 }, tabs: { w: 300 }, actions: { w: 400 }, leftChildren: [wrapperWith('flex')],
      });
      const { result } = mount(els);
      // The flex wrapper itself measures 0 (no data-w), its children are not summed.
      expect(result.current.tabsInline).toBe(true);
    });
  });

  describe('gaps read from the computed style', () => {
    // tabs 300 + tabsGap 8 + filter 100 + groupGap (8 row gap + 8 margin) + actions 400 = 824
    const withGaps = (rowWidth) => buildToolbar({
      row: { w: rowWidth, gap: '8px' },
      tabs: { w: 300 },
      actions: { w: 400, ml: '8px' },
      left: { gap: '8px' },
      leftChildren: [el({ w: 100 })],
    });

    it('fits when the row covers the widths plus the 16px group gap and the tabs gap', () => {
      const { result } = mount(withGaps(824));
      expect(result.current.tabsInline).toBe(true);
    });

    it('wraps when the row covers the widths but not the gaps', () => {
      const { result } = mount(withGaps(823));
      expect(result.current.tabsInline).toBe(false);
    });

    it('counts the filters cluster gap between two filter items', () => {
      const els = buildToolbar({
        row: { w: 908, gap: '8px' },
        tabs: { w: 300 },
        actions: { w: 400, ml: '8px' },
        left: { gap: '8px' },
        // 824 + second filter 76 + inner gap 8 = 908
        leftChildren: [el({ w: 100 }), el({ w: 76 })],
      });
      expect(mount(els).result.current.tabsInline).toBe(true);
      document.body.innerHTML = '';
      const tight = buildToolbar({
        row: { w: 907, gap: '8px' },
        tabs: { w: 300 },
        actions: { w: 400, ml: '8px' },
        left: { gap: '8px' },
        leftChildren: [el({ w: 100 }), el({ w: 76 })],
      });
      expect(mount(tight).result.current.tabsInline).toBe(false);
    });
  });

  describe('observers', () => {
    let resizeObservers;

    beforeEach(() => {
      resizeObservers = [];
      vi.stubGlobal('ResizeObserver', class {
        constructor(callback) {
          this.callback = callback;
          this.observed = [];
          this.disconnect = vi.fn(() => { this.observed = []; });
          resizeObservers.push(this);
        }
        observe(target) { this.observed.push(target); }
      });
    });

    it('re-measures when a filter control appears late inside a contents wrapper', async () => {
      const wrapper = el({ display: 'contents' }, [el({ w: 100 })]);
      const els = buildToolbar({
        row: { w: 1000 }, tabs: { w: 300 }, actions: { w: 400 }, leftChildren: [wrapper],
      });
      const { result } = mount(els);
      expect(result.current.tabsInline).toBe(true);

      const late = el({ w: 250 });
      await act(async () => {
        wrapper.appendChild(late);
        await Promise.resolve();
        await nextFrame();
      });

      expect(result.current.tabsInline).toBe(false);
      // The late control is now observed for its own size changes.
      expect(resizeObservers[0].observed).toContain(late);
    });

    it('brings the tabs back when a filter control is removed', async () => {
      const big = el({ w: 400 });
      const els = buildToolbar({
        row: { w: 1000 }, tabs: { w: 300 }, actions: { w: 400 }, leftChildren: [big],
      });
      const { result } = mount(els);
      expect(result.current.tabsInline).toBe(false);

      await act(async () => {
        big.remove();
        await Promise.resolve();
        await nextFrame();
      });

      expect(result.current.tabsInline).toBe(true);
    });

    it('defers the resize re-measure to the next animation frame', async () => {
      const els = buildToolbar({ row: { w: 1000 }, tabs: { w: 300 }, actions: { w: 400 } });
      const { result } = mount(els);
      expect(result.current.tabsInline).toBe(true);

      els.rowEl.dataset.w = '600';
      act(() => { resizeObservers[0].callback([]); });
      // Nothing measured inside the observer callback itself.
      expect(result.current.tabsInline).toBe(true);

      await act(async () => { await nextFrame(); });
      expect(result.current.tabsInline).toBe(false);
    });

    it('cancels the pending frame and disconnects both observers on unmount', async () => {
      const disconnectMutation = vi.spyOn(MutationObserver.prototype, 'disconnect');
      const cancelFrame = vi.spyOn(globalThis, 'cancelAnimationFrame');
      const els = buildToolbar({ row: { w: 1000 }, tabs: { w: 300 }, actions: { w: 400 } });
      const { unmount } = mount(els);

      act(() => { resizeObservers[0].callback([]); });
      const callsBeforeUnmount = rectCalls.length;
      cancelFrame.mockClear();
      unmount();

      expect(cancelFrame).toHaveBeenCalled();
      expect(resizeObservers[0].disconnect).toHaveBeenCalled();
      expect(disconnectMutation).toHaveBeenCalled();

      // The scheduled measure never runs.
      await nextFrame();
      expect(rectCalls.length).toBe(callsBeforeUnmount);
    });
  });

  describe('natural width measurement', () => {
    it('measures each element at max-content and restores its original inline style', () => {
      const els = buildToolbar({ row: { w: 1000 }, tabs: { w: 300 }, actions: { w: 400 } });
      const original = 'width: 50%; flex: 1 1 0%; max-width: 200px;';
      els.tabsEl.style.cssText = original;
      const before = els.tabsEl.style.cssText;

      mount(els);

      const tabsReads = rectCalls.filter((c) => c.el === els.tabsEl);
      expect(tabsReads.length).toBeGreaterThan(0);
      expect(tabsReads[0]).toMatchObject({ width: 'max-content', maxWidth: 'none' });
      expect(tabsReads[0].flex).toMatch(/^(none|0 0 auto)$/);
      expect(els.tabsEl.style.cssText).toBe(before);
    });

    it('leaves an element with no inline style with no inline style', () => {
      const els = buildToolbar({ row: { w: 1000 }, tabs: { w: 300 }, actions: { w: 400 } });
      mount(els);
      expect(els.actionsEl.getAttribute('style') ?? '').toBe('');
    });
  });

  it('keeps the current placement when the row has no width to measure', () => {
    const els = buildToolbar({ row: { w: 0 }, tabs: { w: 300 }, actions: { w: 400 } });
    expect(mount(els).result.current.tabsInline).toBe(true);
  });

  it('reports no inline tabs when disabled, without measuring', () => {
    const els = buildToolbar({ row: { w: 1000 }, tabs: { w: 300 }, actions: { w: 400 } });
    const { result } = renderHook(() => useListToolbarTabsFit(false));
    act(() => {
      result.current.rowRef(els.rowEl);
      result.current.leftRef(els.leftEl);
      result.current.actionsRef(els.actionsEl);
      result.current.tabsRef(els.tabsEl);
    });
    expect(result.current.tabsInline).toBe(false);
    expect(rectCalls).toHaveLength(0);
  });
});
