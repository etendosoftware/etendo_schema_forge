// @covers tools/app-shell/src/components/reports/dynamic/StickyHScroll.jsx
import { render, screen, act } from '@testing-library/react';
import StickyHScroll from '../StickyHScroll.jsx';
import { resetLinesScrollSync } from '@/lib/linesScrollSync.js';

let observers = [];
beforeEach(() => {
  observers = [];
  resetLinesScrollSync();
  globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; observers.push(this); }
    observe() {}
    disconnect() {}
  };
});

const renderWith = (scrollWidth, clientWidth) => {
  // jsdom has no layout: size the box before the first effect measures it.
  const proto = HTMLElement.prototype;
  const sw = Object.getOwnPropertyDescriptor(proto, 'scrollWidth');
  const cw = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
  Object.defineProperty(proto, 'scrollWidth', { configurable: true, get: () => scrollWidth });
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => clientWidth });
  const out = render(<StickyHScroll><table /></StickyHScroll>);
  if (sw) Object.defineProperty(proto, 'scrollWidth', sw); else delete proto.scrollWidth;
  if (cw) Object.defineProperty(proto, 'clientWidth', cw); else delete proto.clientWidth;
  return out;
};

describe('StickyHScroll', () => {
  it('renders no proxy when the table does not overflow', () => {
    renderWith(500, 500);
    expect(screen.queryByTestId('StickyHScroll__proxy')).toBeNull();
    expect(screen.getByTestId('DynamicReportTable__scroll').style.scrollbarWidth).toBe('');
  });

  it('shows a sticky proxy as wide as the table and hides the box scrollbar on overflow', () => {
    renderWith(1200, 500);
    const proxy = screen.getByTestId('StickyHScroll__proxy');
    expect(proxy.className).toContain('sticky');
    expect(proxy.className).toContain('print:hidden');
    expect(proxy.firstChild.style.width).toBe('1200px');
    expect(screen.getByTestId('DynamicReportTable__scroll').style.scrollbarWidth).toBe('none');
  });

  it('mirrors scrollLeft in both directions', () => {
    renderWith(1200, 500);
    const box = screen.getByTestId('DynamicReportTable__scroll');
    const proxy = screen.getByTestId('StickyHScroll__proxy');
    act(() => { proxy.scrollLeft = 120; proxy.dispatchEvent(new Event('scroll')); });
    expect(box.scrollLeft).toBe(120);
    act(() => { box.scrollLeft = 300; box.dispatchEvent(new Event('scroll')); });
    expect(proxy.scrollLeft).toBe(300);
  });
});
