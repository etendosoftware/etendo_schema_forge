// @covers tools/app-shell/src/windows/custom/product/useRemainingHeight.js
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { computeRemainingHeight, useRemainingHeight } from '../useRemainingHeight';

const base = { containerTop: 100, containerClientHeight: 600, containerScrollTop: 0, bottomGap: 20, minHeight: 200 };

const mockLayout = (boxTop, clientHeight) => {
  const origRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function rect() {
    const top = this.dataset?.testid === 'box' ? boxTop : 100;
    return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} };
  };
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientHeight });
  return () => { Element.prototype.getBoundingClientRect = origRect; delete HTMLElement.prototype.clientHeight; };
};

describe('computeRemainingHeight', () => {
  it('returns the room left below the box in the column', () => {
    expect(computeRemainingHeight({ ...base, boxTop: 300 })).toBe(380); // 600 - 200 - 20
  });
  it('does not depend on how far the column is scrolled', () => {
    const still = computeRemainingHeight({ ...base, boxTop: 300 });
    const scrolled = computeRemainingHeight({ ...base, boxTop: 250, containerScrollTop: 50 });
    expect(scrolled).toBe(still);
  });
  it('never goes below the minimum height (short viewport, tall header)', () => {
    expect(computeRemainingHeight({ ...base, boxTop: 650 })).toBe(200);
  });
  it('returns null when it cannot be measured', () => {
    expect(computeRemainingHeight({ ...base, boxTop: NaN })).toBeNull();
    expect(computeRemainingHeight({ ...base, boxTop: 300, containerClientHeight: 0 })).toBeNull();
  });
});

function Probe({ active = true, minHeight }) {
  const { ref, style } = useRemainingHeight({ active, minHeight });
  return <div ref={ref} style={style} data-testid="box" />;
}

describe('useRemainingHeight', () => {
  it('bounds the box by the scrolling ancestor', () => {
    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function rect() {
      const top = this.dataset?.testid === 'box' ? 300 : 100;
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} };
    };
    const origCh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
    try {
      render(<div style={{ overflowY: 'auto' }}><Probe /></div>);
      expect(screen.getByTestId('box').style.maxHeight).toBe('380px');
    } finally {
      Element.prototype.getBoundingClientRect = origRect;
      if (origCh) Object.defineProperty(HTMLElement.prototype, 'clientHeight', origCh); else delete HTMLElement.prototype.clientHeight;
    }
  });
  it('leaves the box unconstrained while inactive', () => {
    render(<div style={{ overflowY: 'auto' }}><Probe active={false} /></div>);
    expect(screen.getByTestId('box').style.maxHeight).toBe('');
  });
  it('defaults its generic floor to 200 px when the room left is negative', () => {
    const restore = mockLayout(650, 600);
    try {
      render(<div style={{ overflowY: 'auto' }}><Probe /></div>);
      expect(screen.getByTestId('box').style.maxHeight).toBe('200px');
    } finally { restore(); }
  });
  it('honours an explicit floor (340 for the Movements table)', () => {
    const restore = mockLayout(650, 600);
    try {
      render(<div style={{ overflowY: 'auto' }}><Probe minHeight={340} /></div>);
      expect(screen.getByTestId('box').style.maxHeight).toBe('340px');
    } finally { restore(); }
  });
  it('uses the room left when it is above the floor', () => {
    const restore = mockLayout(150, 700); // 700 - 50 - 20
    try {
      render(<div style={{ overflowY: 'auto' }}><Probe /></div>);
      expect(screen.getByTestId('box').style.maxHeight).toBe('630px');
    } finally { restore(); }
  });
});
