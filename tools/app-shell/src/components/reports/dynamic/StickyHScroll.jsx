import { useEffect, useId, useRef, useState } from 'react';
import { registerLinesScroller } from '@/lib/linesScrollSync.js';

/**
 * Horizontal scroller whose scrollbar stays pinned to the viewport bottom (ETP-6239).
 * The wide table scrolls in its own box, so a tall table pushes that box's scrollbar off-screen.
 * A proxy strip right after it (`sticky bottom-0`, same scrollWidth through a spacer) is mirrored
 * both ways with the box via `linesScrollSync`; the box's own bar is hidden while the proxy shows.
 * Screen only: the proxy is `print:hidden`. Keyboard, trackpad and shift-wheel still scroll the box.
 */
export default function StickyHScroll({ children, 'data-testid': testId = 'StickyHScroll' }) {
  const key = `dynamic-report-scroll-${useId()}`;
  const boxRef = useRef(null);
  const proxyRef = useRef(null);
  const [width, setWidth] = useState(0); // 0 = no horizontal overflow, proxy hidden

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const measure = () => setWidth(box.scrollWidth > box.clientWidth + 1 ? box.scrollWidth : 0);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(box);
    if (box.firstElementChild) ro?.observe(box.firstElementChild); // the table grows with its columns
    return () => ro?.disconnect();
  }, [children]);

  useEffect(() => {
    if (!width || !proxyRef.current) return undefined;
    const offBox = registerLinesScroller(key, boxRef.current);
    const offProxy = registerLinesScroller(key, proxyRef.current);
    return () => { offBox(); offProxy(); };
  }, [width, key]);

  return (
    <>
      <div
        ref={boxRef}
        className="overflow-x-auto"
        style={width ? { scrollbarWidth: 'none' } : undefined}
        data-testid="DynamicReportTable__scroll"
      >
        {children}
      </div>
      {width > 0 && (
        <div
          ref={proxyRef}
          className="sticky bottom-0 z-20 h-3 overflow-x-auto bg-card print:hidden"
          aria-hidden="true"
          data-testid={`${testId}__proxy`}
        >
          <div style={{ width, height: 1 }} />
        </div>
      )}
    </>
  );
}
