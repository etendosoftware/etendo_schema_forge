// @covers tools/app-shell/src/hooks/useAutoMatchReview.js
/**
 * `useAutoMatchSelection` / `useAutoMatchReview` — the automatch checks and the "Revisar en el
 * panel" state (focus request, "No es un rechazo" dismissals) shared by the automatch modal and the
 * reconciliation panel (bounce pairs).
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

  it('keeps every choice while the groups do not reload (same array)', () => {
    const { result, rerender } = renderHook(({ groups }) => useAutoMatchSelection(groups), {
      initialProps: { groups: GROUPS },
    });
    act(() => result.current.toggle(REVIEW));
    rerender({ groups: GROUPS });
    expect(result.current.isChecked(REVIEW)).toBe(true);
  });
});

describe('useAutoMatchReview', () => {
  it('starts idle, with no focus request and nothing dismissed', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    expect(result.current.focus).toBeNull();
    expect(result.current.dismissedKeys.size).toBe(0);
    // The banner-era state is gone: no review flag, no way back, no count of what remains.
    expect(result.current).not.toHaveProperty('reviewing');
    expect(result.current).not.toHaveProperty('endReview');
    expect(result.current).not.toHaveProperty('remaining');
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
    expect(result.current.focus).toBeNull();
  });

  it('consumeFocus clears the focus request', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    act(() => result.current.startReview(REVIEW));
    act(() => result.current.panel.onFocusConsumed());
    expect(result.current.focus).toBeNull();
  });

  it('keeps the modal checks after "Revisar en el panel" while the suggestions do not reload', () => {
    const { result, rerender } = renderHook(({ groups }) => useAutoMatchReview(groups), {
      initialProps: { groups: GROUPS },
    });
    act(() => result.current.selection.toggle(REVIEW));
    act(() => result.current.startReview(AMBIGUOUS));
    rerender({ groups: GROUPS });
    expect(result.current.selection.isChecked(REVIEW)).toBe(true);
  });

  it('resets the modal checks on a reload, also after "Revisar en el panel"', () => {
    const { result, rerender } = renderHook(({ groups }) => useAutoMatchReview(groups), {
      initialProps: { groups: GROUPS },
    });
    act(() => result.current.selection.toggle(REVIEW));
    act(() => result.current.startReview(AMBIGUOUS));
    rerender({ groups: [...GROUPS] });
    expect(result.current.selection.isChecked(REVIEW)).toBe(false);
  });

  it('resets the modal checks on a reload', () => {
    const { result, rerender } = renderHook(({ groups }) => useAutoMatchReview(groups), {
      initialProps: { groups: GROUPS },
    });
    act(() => result.current.selection.toggle(REVIEW));
    rerender({ groups: [...GROUPS] });
    expect(result.current.selection.isChecked(REVIEW)).toBe(false);
  });

  it('dismiss records a pair; a repeated or empty key changes nothing', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    act(() => result.current.panel.onDismiss('bp-review'));
    const first = result.current.dismissedKeys;
    expect([...first]).toEqual(['bp-review']);
    expect(result.current.panel.dismissedKeys).toBe(first);
    act(() => result.current.dismiss('bp-review'));
    act(() => result.current.dismiss(null));
    expect(result.current.dismissedKeys).toBe(first);
  });

  it('clearDismissed forgets the dismissals, keeping the same set when there are none', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    const empty = result.current.dismissedKeys;
    act(() => result.current.clearDismissed());
    expect(result.current.dismissedKeys).toBe(empty);
    act(() => result.current.dismiss('bp-high'));
    act(() => result.current.clearDismissed());
    expect(result.current.dismissedKeys.size).toBe(0);
  });

  it('tolerates a missing groups array', () => {
    const { result } = renderHook(() => useAutoMatchReview(undefined));
    expect(result.current.selection.isChecked(TX)).toBe(true);
    expect(result.current.dismissedKeys.size).toBe(0);
  });

  it('active=false drops the focus and forgets the dismissals', () => {
    const { result, rerender } = renderHook(({ active }) => useAutoMatchReview(GROUPS, { active }), {
      initialProps: { active: true },
    });
    act(() => result.current.startReview(REVIEW));
    act(() => result.current.dismiss('bp-high'));
    rerender({ active: false });
    expect(result.current.focus).toBeNull();
    expect(result.current.dismissedKeys.size).toBe(0);
  });

  // --- sent_to_panel (ETP-5581 KPI): the pairs "Revisar en el panel" sent during this modal session

  it('startReview records the pair as sent to the panel, once', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    expect(result.current.sentToPanelKeys.size).toBe(0);
    act(() => result.current.startReview(REVIEW));
    const first = result.current.sentToPanelKeys;
    expect([...first]).toEqual(['bp-review']);
    act(() => result.current.startReview(REVIEW));
    expect(result.current.sentToPanelKeys).toBe(first);
    act(() => result.current.startReview(AMBIGUOUS));
    expect([...result.current.sentToPanelKeys]).toEqual(['bp-review', 'bp-amb']);
  });

  it('a group without a bounce line is never recorded as sent to the panel', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    act(() => result.current.startReview(TX));
    expect(result.current.sentToPanelKeys.size).toBe(0);
  });

  it('keeps the pairs sent to the panel while the suggestions do not reload, and forgets them on a reload', () => {
    const { result, rerender } = renderHook(({ groups }) => useAutoMatchReview(groups), {
      initialProps: { groups: GROUPS },
    });
    act(() => result.current.startReview(REVIEW));
    rerender({ groups: GROUPS });
    expect([...result.current.sentToPanelKeys]).toEqual(['bp-review']);
    rerender({ groups: [...GROUPS] });
    expect(result.current.sentToPanelKeys.size).toBe(0);
  });

  it('checking a pair again forgets that it was sent to the panel; unchecking does not', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    act(() => result.current.startReview(HIGH));
    act(() => result.current.startReview(REVIEW));
    // HIGH starts checked: this toggle unchecks it, so it stays "sent to the panel".
    act(() => result.current.selection.toggle(HIGH));
    expect(result.current.sentToPanelKeys.has('bp-high')).toBe(true);
    // REVIEW starts unchecked: this toggle re-checks it.
    act(() => result.current.selection.toggle(REVIEW));
    expect(result.current.selection.isChecked(REVIEW)).toBe(true);
    expect(result.current.sentToPanelKeys.has('bp-review')).toBe(false);
  });

  it('select-all of the pairs forgets them as sent to the panel; unselect-all keeps them', () => {
    const { result } = renderHook(() => useAutoMatchReview(GROUPS));
    act(() => result.current.startReview(REVIEW));
    act(() => result.current.startReview(AMBIGUOUS));
    act(() => result.current.selection.setMany([HIGH, REVIEW, AMBIGUOUS], false));
    expect([...result.current.sentToPanelKeys]).toEqual(['bp-review', 'bp-amb']);
    act(() => result.current.selection.setMany([HIGH, REVIEW, AMBIGUOUS], true));
    // The ambiguous pair cannot be checked, so it is still the panel's.
    expect([...result.current.sentToPanelKeys]).toEqual(['bp-amb']);
  });

  it('active=false forgets the pairs sent to the panel', () => {
    const { result, rerender } = renderHook(({ active }) => useAutoMatchReview(GROUPS, { active }), {
      initialProps: { active: true },
    });
    act(() => result.current.startReview(REVIEW));
    rerender({ active: false });
    expect(result.current.sentToPanelKeys.size).toBe(0);
  });
});
