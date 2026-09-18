import { registerLinesScroller, resetLinesScrollSync } from '../linesScrollSync.js';

/**
 * ETP-5332 — jsdom has no layout engine, so a real `<div>`'s `scrollLeft` always reads back 0
 * no matter what is assigned to it: a test built on real elements would pass vacuously (the
 * "propagated" value and the "untouched" value would both be 0). Instead we use a tiny stub
 * factory that behaves like a real scrollable element for the one thing this module cares
 * about — a settable `scrollLeft` property and a `scroll` event that fires listeners — so the
 * value genuinely round-trips and the anti-echo check is actually observable. This mirrors why
 * the sibling column-width suites only compare declared CSS strings rather than rendering into
 * jsdom.
 */
function createStubElement() {
  const listeners = new Set();
  let scrollLeftValue = 0;
  return {
    get scrollLeft() {
      return scrollLeftValue;
    },
    set scrollLeft(value) {
      scrollLeftValue = value;
      for (const listener of listeners) listener();
    },
    addEventListener(type, listener) {
      if (type === 'scroll') listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === 'scroll') listeners.delete(listener);
    },
    // Test helper: simulate a native scroll event fired by an external driver (e.g. the user
    // dragging the scrollbar) without going through the scrollLeft setter's own listener fan-out.
    fireScroll() {
      for (const listener of listeners) listener();
    },
    __listenerCount() {
      return listeners.size;
    },
  };
}

describe('linesScrollSync', () => {
  beforeEach(() => {
    resetLinesScrollSync();
  });

  describe('registerLinesScroller — invalid input', () => {
    it('returns a no-op cleanup and registers nothing when key is falsy', () => {
      const el = createStubElement();
      const cleanup = registerLinesScroller('', el);
      expect(typeof cleanup).toBe('function');
      expect(() => cleanup()).not.toThrow();
      // The element was never joined to any group, so scrolling it must not throw either.
      expect(() => {
        el.scrollLeft = 50;
      }).not.toThrow();
    });

    it('returns a no-op cleanup and registers nothing when el is falsy', () => {
      const cleanup = registerLinesScroller('contact', null);
      expect(typeof cleanup).toBe('function');
      expect(() => cleanup()).not.toThrow();
    });
  });

  describe('propagation within a group', () => {
    it('propagates scrollLeft from one member to every other member of the same key', () => {
      const a = createStubElement();
      const b = createStubElement();
      const c = createStubElement();
      registerLinesScroller('contact', a);
      registerLinesScroller('contact', b);
      registerLinesScroller('contact', c);

      a.scrollLeft = 120;

      expect(b.scrollLeft).toBe(120);
      expect(c.scrollLeft).toBe(120);
    });

    it('never touches members of a different key', () => {
      const a = createStubElement();
      const other = createStubElement();
      registerLinesScroller('contact', a);
      registerLinesScroller('bank-account', other);

      a.scrollLeft = 300;

      expect(other.scrollLeft).toBe(0);
    });
  });

  describe('late joiner adoption', () => {
    it('a late joiner adopts the group current offset', () => {
      const a = createStubElement();
      registerLinesScroller('contact', a);
      a.scrollLeft = 240;

      const b = createStubElement();
      registerLinesScroller('contact', b);

      expect(b.scrollLeft).toBe(240);
    });

    it('a fresh group (first member) does not adopt any offset', () => {
      const a = createStubElement();
      registerLinesScroller('contact', a);

      expect(a.scrollLeft).toBe(0);
    });
  });

  describe('anti-echo', () => {
    it('does not re-trigger propagation once members are in sync', () => {
      const a = createStubElement();
      const b = createStubElement();
      registerLinesScroller('contact', a);
      registerLinesScroller('contact', b);

      let bScrollEvents = 0;
      b.addEventListener('scroll', () => {
        bScrollEvents += 1;
      });

      a.scrollLeft = 80;

      // b's setter fires its own scroll handler exactly once (the propagation from a). That
      // handler must find every member already equal to 80 and assign nothing further, so no
      // second wave of events is produced — an echoing implementation would trigger it again
      // and again instead of settling after a single pass.
      expect(bScrollEvents).toBe(1);
      expect(a.scrollLeft).toBe(80);
      expect(b.scrollLeft).toBe(80);
    });

    it('does not reassign scrollLeft on the origin element itself', () => {
      const a = createStubElement();
      const b = createStubElement();
      registerLinesScroller('contact', a);
      registerLinesScroller('contact', b);

      let aScrollEvents = 0;
      a.addEventListener('scroll', () => {
        aScrollEvents += 1;
      });

      a.scrollLeft = 55;

      // Only the initial assignment on `a` should have fired its listener — the propagation
      // loop skips `other === el`, so `a` is never reassigned as a side effect of syncing `b`.
      expect(aScrollEvents).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('removes the element from its group so it stops receiving and sending updates', () => {
      const a = createStubElement();
      const b = createStubElement();
      const cleanupA = registerLinesScroller('contact', a);
      registerLinesScroller('contact', b);

      cleanupA();

      b.scrollLeft = 90;
      expect(a.scrollLeft).toBe(0);

      a.scrollLeft = 999;
      expect(b.scrollLeft).toBe(90);
    });

    it('is idempotent — calling cleanup twice does not throw', () => {
      const a = createStubElement();
      const cleanupA = registerLinesScroller('contact', a);

      cleanupA();
      expect(() => cleanupA()).not.toThrow();
    });

    it('a second cleanup call does not disturb a member registered afterward', () => {
      const a = createStubElement();
      const cleanupA = registerLinesScroller('contact', a);
      cleanupA();

      const b = createStubElement();
      registerLinesScroller('contact', b);
      cleanupA();

      b.scrollLeft = 15;
      expect(b.scrollLeft).toBe(15);
    });

    it('drops the group when the last member is cleaned up, so a new member does not inherit a stale offset', () => {
      const a = createStubElement();
      const cleanupA = registerLinesScroller('contact', a);
      a.scrollLeft = 500;

      cleanupA();

      const fresh = createStubElement();
      registerLinesScroller('contact', fresh);

      expect(fresh.scrollLeft).toBe(0);
    });
  });
});
