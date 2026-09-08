import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { HighlightProvider, useHighlight } from '../HighlightContext.jsx';

/**
 * ETP-5211 — highlight state for the Copilot's `highlight_element` tool.
 *
 * Exactly one element is highlighted at a time. That single-slot rule is what
 * makes each tool call atomic while letting the model chain calls so the
 * sequence reads to the user as a guided tour — so "the second call replaces
 * the first" is a contract, not an implementation detail.
 */

const wrapper = ({ children }) => <HighlightProvider>{children}</HighlightProvider>;

const created = [];

function makeElement(id) {
  const element = document.createElement('div');
  element.id = id;
  document.body.appendChild(element);
  created.push(element);
  return element;
}

describe('HighlightProvider', () => {
  afterEach(() => {
    // Only our own nodes: React Testing Library removes its container itself.
    created.splice(0).forEach(element => element.remove());
  });

  it('starts with nothing highlighted', () => {
    const { result } = renderHook(() => useHighlight(), { wrapper });
    expect(result.current.element).toBeNull();
    expect(result.current.note).toBe('');
  });

  it('exposes the highlighted element and its note', () => {
    const element = makeElement('a');
    const { result } = renderHook(() => useHighlight(), { wrapper });
    act(() => result.current.highlight({ element, note: 'This is the partner' }));
    expect(result.current.element).toBe(element);
    expect(result.current.note).toBe('This is the partner');
  });

  it('defaults the note to an empty string', () => {
    const element = makeElement('a');
    const { result } = renderHook(() => useHighlight(), { wrapper });
    act(() => result.current.highlight({ element }));
    expect(result.current.note).toBe('');
  });

  it('coerces a non-string note to an empty string', () => {
    const element = makeElement('a');
    const { result } = renderHook(() => useHighlight(), { wrapper });
    act(() => result.current.highlight({ element, note: { text: 'nope' } }));
    expect(result.current.note).toBe('');
  });

  it('replaces the previous highlight instead of stacking a second one', () => {
    const first = makeElement('first');
    const second = makeElement('second');
    const { result } = renderHook(() => useHighlight(), { wrapper });
    act(() => result.current.highlight({ element: first, note: 'one' }));
    act(() => result.current.highlight({ element: second, note: 'two' }));
    expect(result.current.element).toBe(second);
    expect(result.current.note).toBe('two');
  });

  it('clears the highlight on clearHighlight', () => {
    const element = makeElement('a');
    const { result } = renderHook(() => useHighlight(), { wrapper });
    act(() => result.current.highlight({ element, note: 'one' }));
    act(() => result.current.clearHighlight());
    expect(result.current.element).toBeNull();
    expect(result.current.note).toBe('');
  });

  it('clears the highlight when called without an element', () => {
    const element = makeElement('a');
    const { result } = renderHook(() => useHighlight(), { wrapper });
    act(() => result.current.highlight({ element, note: 'one' }));
    act(() => result.current.highlight());
    expect(result.current.element).toBeNull();
  });

  describe('durationMs', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('auto-clears after the requested duration', () => {
      const element = makeElement('a');
      const { result } = renderHook(() => useHighlight(), { wrapper });
      act(() => result.current.highlight({ element, note: 'one', durationMs: 3000 }));
      act(() => vi.advanceTimersByTime(2999));
      expect(result.current.element).toBe(element);
      act(() => vi.advanceTimersByTime(1));
      expect(result.current.element).toBeNull();
    });

    it('cancels the pending timer when a second highlight replaces the first', () => {
      // Otherwise the first call's expiry would wipe the SECOND highlight
      // mid-tour, which is exactly the chained-call case this tool is for.
      const first = makeElement('first');
      const second = makeElement('second');
      const { result } = renderHook(() => useHighlight(), { wrapper });
      act(() => result.current.highlight({ element: first, durationMs: 1000 }));
      act(() => result.current.highlight({ element: second }));
      expect(vi.getTimerCount()).toBe(0);
      act(() => vi.advanceTimersByTime(5000));
      expect(result.current.element).toBe(second);
    });

    it('cancels the pending timer on clearHighlight', () => {
      const element = makeElement('a');
      const { result } = renderHook(() => useHighlight(), { wrapper });
      act(() => result.current.highlight({ element, durationMs: 1000 }));
      act(() => result.current.clearHighlight());
      expect(vi.getTimerCount()).toBe(0);
    });

    it('cancels the pending timer on unmount', () => {
      const element = makeElement('a');
      const { result, unmount } = renderHook(() => useHighlight(), { wrapper });
      act(() => result.current.highlight({ element, durationMs: 1000 }));
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });

    it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, '3000'])(
      'keeps the highlight indefinitely for durationMs=%s',
      durationMs => {
        const element = makeElement('a');
        const { result } = renderHook(() => useHighlight(), { wrapper });
        act(() => result.current.highlight({ element, durationMs }));
        expect(vi.getTimerCount()).toBe(0);
        act(() => vi.advanceTimersByTime(60_000));
        expect(result.current.element).toBe(element);
      }
    );
  });
});

describe('useHighlight outside a provider', () => {
  it('degrades to a no-op instead of crashing the Copilot', () => {
    const { result } = renderHook(() => useHighlight());
    expect(result.current.element).toBeNull();
    expect(result.current.note).toBe('');
    expect(() => result.current.highlight({ element: makeElement('a'), note: 'x' })).not.toThrow();
    expect(() => result.current.clearHighlight()).not.toThrow();
    expect(result.current.element).toBeNull();
  });

  it('returns a referentially stable value across renders', () => {
    const { result, rerender } = renderHook(() => useHighlight());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
