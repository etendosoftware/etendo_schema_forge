// @covers tools/app-shell/src/hooks/useAutoMatchReview.js
/**
 * `useAutoMatchSelection` / `useAutoMatchReview` — the automatch checks and the "Revisar en el
 * panel" review state shared by the automatch modal and the reconciliation panel (bounce pairs).
 */
import { renderHook, act } from '@testing-library/react';
import { useAutoMatchSelection, useAutoMatchReview } from '../useAutoMatchReview.js';

const TX = { groupKey: 'tx-1', statementLine: { id: 'S1' } };
const HIGH = {
  kind: 'bouncePair', groupKey: 'bp-high', confidence: 'high',
  statementLine: { id: 'O1' }, counterpartLine: { id: 'B1' },
};
const REVIEW = {
  kind: 'bouncePair', groupKey: 'bp-review', confidence: 'review',
  statementLine: { id: 'O2' }, counterpartLine: { id: 'B2' },
};
const AMBIGUOUS = {
  kind: 'bouncePair', groupKey: 'bp-amb', confidence: 'review', ambiguous: true,
  statementLine: null, counterpartLine: { id: 'B3' },
  candidates: [{ line: { id: 'C1' } }, { line: { id: 'C2' } }],
};
const GROUPS = [TX, HIGH, REVIEW, AMBIGUOUS];

describe('useAutoMatchSelection', () => {
  it('starts from the defaults: transaction and high checked, review unchecked, ambiguous never', () => {
    const { result } = renderHook(() => useAutoMatchSelection(GROUPS));
    expect(result.current.isChecked(TX)).toBe(true);
    expect(result.current.isChecked(HIGH)).toBe(true);
    expect(result.current.isChecked(REVIEW)).toBe(false);
    expect(result.current.isChecked(AMBIGUOUS)).toBe(false);
  });

  it('toggles a group against its default, and ignores an ambiguous pair', () => {
    const { result } = renderHook(() => useAutoMatchSelection(GROUPS));
    act(() => result.current.toggle(REVIEW));
    act(() => result.current.toggle(TX));
    act(() => result.current.toggle(AMBIGUOUS));
    expect(result.current.isChecked(REVIEW)).toBe(true);
    expect(result.current.isChecked(TX)).toBe(false);
    expect(result.current.isChecked(AMBIGUOUS)).toBe(false);
    act(() => result.current.toggle(REVIEW));
    expect(result.current.isChecked(REVIEW)).toBe(false);
  });

  it('setMany checks or unchecks every selectable group of the list', () => {
    const { result } = renderHook(() => useAutoMatchSelection(GROUPS));
    act(() => result.current.setMany([HIGH, REVIEW, AMBIGUOUS], true));
    expect(result.current.isChecked(HIGH)).toBe(true);
    expect(result.current.isChecked(REVIEW)).toBe(true);
    expect(result.current.isChecked(AMBIGUOUS)).toBe(false);
    act(() => result.current.setMany([HIGH, REVIEW], false));
    expect(result.current.isChecked(HIGH)).toBe(false);
    expect(result.current.isChecked(REVIEW)).toBe(false);
    expect(result.current.isChecked(TX)).toBe(true);
  });

  it('resets every choice to its default when the groups reload (default behaviour)', () => {
    const { result, rerender } = renderHook(({ groups }) => useAutoMatchSelection(groups), {
      initialProps: { groups: GROUPS },
    });
    act(() => result.current.toggle(REVIEW));
    act(() => result.current.toggle(TX));
    rerender({ groups: [...GROUPS] });
    expect(result.current.isChecked(REVIEW)).toBe(false);
    expect(result.current.isChecked(TX)).toBe(true);
  });

  it('with keepOnReload keeps the choices of the groups still present and drops the gone ones', () => {
    const { result, rerender } = renderHook(
      ({ groups, keep }) => useAutoMatchSelection(groups, { keepOnReload: keep }),
      { initialProps: { groups: GROUPS, keep: true } },
    );
    act(() => result.current.toggle(REVIEW));
    act(() => result.current.toggle(HIGH));
    // HIGH was discarded in the panel: the reload no longer offers it.
    rerender({ groups: [TX, REVIEW, AMBIGUOUS], keep: true });
    expect(result.current.isChecked(REVIEW)).toBe(true);
    // Back again later: the dropped choice is gone, so it reads its default.
    rerender({ groups: GROUPS, keep: true });
    expect(result.current.isChecked(HIGH)).toBe(true);
    expect(result.current.isChecked(REVIEW)).toBe(true);
  });

  it('turning keepOnReload off does not, by itself, reset the choices', () => {
    const { result, rerender } = renderHook(
      ({ groups, keep }) => useAutoMatchSelection(groups, { keepOnReload: keep }),
      { initialProps: { groups: GROUPS, keep: true } },
    );
    act(() => result.current.toggle(REVIEW));
    rerender({ groups: GROUPS, keep: false });
    expect(result.current.isChecked(REVIEW)).toBe(true);
  });
});

describe('useAutoMatchReview', () => {
  it('starts idle, with nothing dismissed and every suggestion remaining', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    expect(result.current.reviewing).toBe(false);
    expect(result.current.focus).toBeNull();
    expect(result.current.dismissedKeys.size).toBe(0);
    expect(result.current.remaining).toBe(4);
    expect(result.current.panel).toEqual({
      focus: null,
      onFocusConsumed: result.current.consumeFocus,
      dismissedKeys: result.current.dismissedKeys,
      onDismiss: result.current.dismiss,
    });
  });

  it('startReview focuses the pair bounce line with an increasing seq', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    act(() => result.current.startReview(AMBIGUOUS));
    expect(result.current.reviewing).toBe(true);
    expect(result.current.focus).toEqual({ lineId: 'B3', seq: 1 });
    expect(result.current.panel.focus).toEqual({ lineId: 'B3', seq: 1 });
    // A second request for the same line is a new request.
    act(() => result.current.startReview(AMBIGUOUS));
    expect(result.current.focus).toEqual({ lineId: 'B3', seq: 2 });
  });

  it('ignores startReview for a group without a bounce line', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    act(() => result.current.startReview(TX));
    act(() => result.current.startReview(null));
    expect(result.current.reviewing).toBe(false);
    expect(result.current.focus).toBeNull();
  });

  it('consumeFocus clears the focus request and endReview ends the review', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    act(() => result.current.startReview(REVIEW));
    act(() => result.current.panel.onFocusConsumed());
    expect(result.current.focus).toBeNull();
    expect(result.current.reviewing).toBe(true);
    act(() => result.current.endReview());
    expect(result.current.reviewing).toBe(false);
  });

  it('keeps the modal checks across a reload while reviewing', () => {
    const { result, rerender } = renderHook(({ groups }) => useAutoMatchReview(groups), {
      initialProps: { groups: GROUPS },
    });
    act(() => result.current.selection.toggle(REVIEW));
    act(() => result.current.startReview(AMBIGUOUS));
    rerender({ groups: [...GROUPS] });
    expect(result.current.selection.isChecked(REVIEW)).toBe(true);
  });

  it('resets the modal checks on a reload outside a review', () => {
    const { result, rerender } = renderHook(({ groups }) => useAutoMatchReview(groups), {
      initialProps: { groups: GROUPS },
    });
    act(() => result.current.selection.toggle(REVIEW));
    rerender({ groups: [...GROUPS] });
    expect(result.current.selection.isChecked(REVIEW)).toBe(false);
  });

  it('dismiss hides a pair from remaining; a repeated or empty key changes nothing', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    act(() => result.current.panel.onDismiss('bp-review'));
    const first = result.current.dismissedKeys;
    expect([...first]).toEqual(['bp-review']);
    expect(result.current.remaining).toBe(3);
    act(() => result.current.dismiss('bp-review'));
    act(() => result.current.dismiss(null));
    expect(result.current.dismissedKeys).toBe(first);
  });

  it('never counts a dismissed key against a transaction group', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    act(() => result.current.dismiss('tx-1'));
    expect(result.current.remaining).toBe(4);
  });

  it('clearDismissed forgets the dismissals, keeping the same set when there are none', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    const empty = result.current.dismissedKeys;
    act(() => result.current.clearDismissed());
    expect(result.current.dismissedKeys).toBe(empty);
    act(() => result.current.dismiss('bp-high'));
    act(() => result.current.clearDismissed());
    expect(result.current.dismissedKeys.size).toBe(0);
    expect(result.current.remaining).toBe(4);
  });

  it('counts remaining over a missing groups array as 0', () => {
    const { result } = renderHook(() => useAutoMatchReview(undefined));
    expect(result.current.remaining).toBe(0);
  });

  it('active=false ends the review, drops the focus and forgets the dismissals', () => {
    const { result, rerender } = renderHook(({ active }) => useAutoMatchReview(GROUPS, { active }), {
      initialProps: { active: true },
    });
    act(() => result.current.startReview(REVIEW));
    act(() => result.current.dismiss('bp-high'));
    rerender({ active: false });
    expect(result.current.reviewing).toBe(false);
    expect(result.current.focus).toBeNull();
    expect(result.current.dismissedKeys.size).toBe(0);
  });
});
