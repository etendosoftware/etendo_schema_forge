// @covers tools/app-shell/src/lib/linesScrollHost.js
/**
 * The add-row draft registry of `linesScrollHost.js` (ETP-5133, QA pass 3): DataTable's add-row
 * publishes the identifier it picked for a no-truncate column BEFORE save, and the sibling
 * InlineLinesPanel subscribes so both size that column from the same rows. Keyed by `entity`,
 * exactly like the scroll host.
 *
 * The registry is module state, so every test uses its own keys.
 */
import { renderHook, act } from '@testing-library/react';
import {
  publishLinesAddRowDraft, clearLinesAddRowDraft, useLinesAddRowDraft, usePublishLinesAddRowDraft,
} from '../linesScrollHost.js';

let seq = 0;
const freshKey = (name) => `${name}-${++seq}`;

describe('linesScrollHost — add-row draft registry', () => {
  describe('publish / subscribe', () => {
    it('returns null with no key or nothing published', () => {
      expect(renderHook(() => useLinesAddRowDraft(null)).result.current).toBeNull();
      expect(renderHook(() => useLinesAddRowDraft(freshKey('empty'))).result.current).toBeNull();
    });

    it('reads a draft published before it subscribed', () => {
      const key = freshKey('early');
      const draft = { 'product$_identifier': 'Picked early' };
      publishLinesAddRowDraft(key, draft);
      const { result } = renderHook(() => useLinesAddRowDraft(key));
      expect(result.current).toBe(draft);
      act(() => publishLinesAddRowDraft(key, null));
    });

    it('notifies every subscriber of the same key on publish and on clear', () => {
      const key = freshKey('notify');
      const a = renderHook(() => useLinesAddRowDraft(key));
      const b = renderHook(() => useLinesAddRowDraft(key));
      const draft = { 'product$_identifier': 'Monitor' };

      act(() => publishLinesAddRowDraft(key, draft));
      expect(a.result.current).toBe(draft);
      expect(b.result.current).toBe(draft);

      act(() => clearLinesAddRowDraft(key, draft));
      expect(a.result.current).toBeNull();
      expect(b.result.current).toBeNull();
    });

    it('publishing null clears the draft for subscribers', () => {
      const key = freshKey('null');
      const { result } = renderHook(() => useLinesAddRowDraft(key));
      act(() => publishLinesAddRowDraft(key, { 'product$_identifier': 'x' }));
      act(() => publishLinesAddRowDraft(key, null));
      expect(result.current).toBeNull();
    });

    it('ignores a publish with no key', () => {
      expect(() => publishLinesAddRowDraft(null, { 'product$_identifier': 'x' })).not.toThrow();
      expect(renderHook(() => useLinesAddRowDraft(null)).result.current).toBeNull();
    });
  });

  describe('per-entity isolation', () => {
    it('a draft published for one entity never reaches a subscriber of another', () => {
      const lines = freshKey('lines');
      const other = freshKey('other');
      const linesSub = renderHook(() => useLinesAddRowDraft(lines));
      const otherSub = renderHook(() => useLinesAddRowDraft(other));
      const draft = { 'product$_identifier': 'Only for lines' };

      act(() => publishLinesAddRowDraft(lines, draft));
      expect(linesSub.result.current).toBe(draft);
      expect(otherSub.result.current).toBeNull();

      act(() => clearLinesAddRowDraft(lines, draft));
    });

    it('follows the key when the subscriber switches entity', () => {
      const first = freshKey('first');
      const second = freshKey('second');
      const draftA = { 'product$_identifier': 'A' };
      const draftB = { 'product$_identifier': 'B' };
      publishLinesAddRowDraft(first, draftA);
      publishLinesAddRowDraft(second, draftB);

      const { result, rerender } = renderHook(({ key }) => useLinesAddRowDraft(key), { initialProps: { key: first } });
      expect(result.current).toBe(draftA);
      rerender({ key: second });
      expect(result.current).toBe(draftB);
      rerender({ key: null });
      expect(result.current).toBeNull();

      act(() => { clearLinesAddRowDraft(first, draftA); clearLinesAddRowDraft(second, draftB); });
    });
  });

  describe('clearLinesAddRowDraft only removes the current draft', () => {
    it('a stale clear (an older draft) leaves the newer draft in place', () => {
      const key = freshKey('stale');
      const older = { 'product$_identifier': 'Older' };
      const newer = { 'product$_identifier': 'Newer' };
      const { result } = renderHook(() => useLinesAddRowDraft(key));

      act(() => publishLinesAddRowDraft(key, older));
      act(() => publishLinesAddRowDraft(key, newer));
      act(() => clearLinesAddRowDraft(key, older));
      expect(result.current).toBe(newer);

      act(() => clearLinesAddRowDraft(key, newer));
      expect(result.current).toBeNull();
    });

    it('is a no-op with no key', () => {
      expect(() => clearLinesAddRowDraft(null, {})).not.toThrow();
    });
  });

  describe('usePublishLinesAddRowDraft (producer hook)', () => {
    it('publishes while key and draft are set, and clears on unmount', () => {
      const key = freshKey('producer');
      const draft = { 'product$_identifier': 'Producer pick' };
      const sub = renderHook(() => useLinesAddRowDraft(key));

      const producer = renderHook(() => usePublishLinesAddRowDraft(key, draft));
      expect(sub.result.current).toBe(draft);

      act(() => producer.unmount());
      expect(sub.result.current).toBeNull();
    });

    it('replaces the draft when it changes and clears it when the key turns null (add-row closed)', () => {
      const key = freshKey('producer-change');
      const first = { 'product$_identifier': 'First' };
      const second = { 'product$_identifier': 'Second' };
      const sub = renderHook(() => useLinesAddRowDraft(key));

      const producer = renderHook(({ k, d }) => usePublishLinesAddRowDraft(k, d), { initialProps: { k: key, d: first } });
      expect(sub.result.current).toBe(first);

      producer.rerender({ k: key, d: second });
      expect(sub.result.current).toBe(second);

      producer.rerender({ k: null, d: second });
      expect(sub.result.current).toBeNull();
    });

    it('publishes nothing while the draft is null', () => {
      const key = freshKey('producer-null');
      const sub = renderHook(() => useLinesAddRowDraft(key));
      renderHook(() => usePublishLinesAddRowDraft(key, null));
      expect(sub.result.current).toBeNull();
    });
  });
});
