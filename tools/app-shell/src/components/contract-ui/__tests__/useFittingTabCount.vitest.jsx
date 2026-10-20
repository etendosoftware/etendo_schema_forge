// @covers tools/app-shell/src/components/contract-ui/useFittingTabCount.js
import { renderHook, act } from '@testing-library/react';
import useFittingTabCount from '../useFittingTabCount.js';

const tabs = Array.from({ length: 6 }, (_, i) => ({ key: `t${i}` }));

// Elements are plain objects: the hook only reads clientWidth, children[].offsetWidth.
function makeRefs({ wrapperWidth, childWidths }) {
  return {
    wrapperRef: { current: { clientWidth: wrapperWidth } },
    measureRef: { current: { children: childWidths.map((w) => ({ offsetWidth: w })) } },
  };
}

let observers;
const OriginalRO = globalThis.ResizeObserver;

function installResizeObserver() {
  observers = [];
  globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; this.observe = vi.fn(); this.disconnect = vi.fn(); observers.push(this); }
  };
}

afterEach(() => {
  globalThis.ResizeObserver = OriginalRO;
  if (OriginalRO === undefined) delete globalThis.ResizeObserver;
});

const run = (refs, activeKey = 't0') =>
  renderHook(() => useFittingTabCount({ ...refs, tabs, activeKey }));

// 6 tab widths of 100 + trailing More width of 50
const WIDTHS = [100, 100, 100, 100, 100, 100, 50];

describe('useFittingTabCount', () => {
  it('falls back to the count-only value (4) without ResizeObserver or layout', () => {
    delete globalThis.ResizeObserver;
    const { result } = run(makeRefs({ wrapperWidth: 0, childWidths: WIDTHS.map(() => 0) }));
    expect(result.current).toBe(4);
  });

  it('falls back to 4 when the wrapper has no width', () => {
    installResizeObserver();
    const { result } = run(makeRefs({ wrapperWidth: 0, childWidths: WIDTHS }));
    expect(result.current).toBe(4);
  });

  it('falls back to 4 when widths are unmeasured', () => {
    installResizeObserver();
    const { result } = run(makeRefs({ wrapperWidth: 300, childWidths: WIDTHS.map(() => 0) }));
    expect(result.current).toBe(4);
  });

  it('returns the fitting count from the measured widths', () => {
    installResizeObserver();
    // 3 visible + More = 350 fits, 4 visible + More = 450 does not
    const { result } = run(makeRefs({ wrapperWidth: 360, childWidths: WIDTHS }));
    expect(result.current).toBe(3);
  });

  it('does nothing when the refs are not attached', () => {
    installResizeObserver();
    const { result } = run({ wrapperRef: { current: null }, measureRef: { current: null } });
    expect(result.current).toBe(4);
  });

  it('re-measures when the observer callback fires', () => {
    installResizeObserver();
    const refs = makeRefs({ wrapperWidth: 1000, childWidths: WIDTHS });
    const { result } = run(refs);
    expect(result.current).toBe(4);
    refs.wrapperRef.current.clientWidth = 260; // 2 visible + More = 250
    act(() => { observers.forEach((o) => o.cb()); });
    expect(result.current).toBe(2);
  });

  it('observes both elements and disconnects on unmount', () => {
    installResizeObserver();
    const refs = makeRefs({ wrapperWidth: 1000, childWidths: WIDTHS });
    const { unmount } = run(refs);
    const live = observers[observers.length - 1];
    expect(live.observe).toHaveBeenCalledWith(refs.wrapperRef.current);
    expect(live.observe).toHaveBeenCalledWith(refs.measureRef.current);
    unmount();
    expect(live.disconnect).toHaveBeenCalled();
  });
});
