import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  defaultGroupChecked, isSelectableGroup,
} from '@/components/contract-ui/bouncePairs.js';

/**
 * Which automatch suggestions are checked, by `groupKey`.
 *
 * Only what the user changed is stored (`overrides`); everything else reads its default: every
 * transaction group checked, a bounce pair checked only with high confidence (ETP-5581), an
 * ambiguous pair never (it cannot be checked at all).
 *
 * When the suggestions reload, the user's choices are dropped and every group goes back to its
 * default — what the modal always did. While nothing reloads the choices stay, so reopening the
 * modal on the same suggestions (the Automatch button after "Revisar en el panel") finds the checks
 * as they were left; a discard or a restore in the panel reloads the suggestions and so resets them.
 *
 * @param {Array<object>} groups the autoMatch groups
 * @returns {{ isChecked: (group: object) => boolean, toggle: (group: object) => void,
 *   setMany: (groups: Array<object>, checked: boolean) => void }}
 */
export function useAutoMatchSelection(groups) {
  const [overrides, setOverrides] = useState(() => new Map());

  useEffect(() => {
    setOverrides((prev) => (prev.size === 0 ? prev : new Map()));
  }, [groups]);

  const isChecked = useCallback((group) => {
    if (!isSelectableGroup(group)) return false;
    return overrides.has(group.groupKey) ? overrides.get(group.groupKey) : defaultGroupChecked(group);
  }, [overrides]);

  const toggle = useCallback((group) => {
    if (!isSelectableGroup(group)) return;
    setOverrides((prev) => {
      const key = group.groupKey;
      const current = prev.has(key) ? prev.get(key) : defaultGroupChecked(group);
      const next = new Map(prev);
      next.set(key, !current);
      return next;
    });
  }, []);

  const setMany = useCallback((list, checked) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const group of list ?? []) {
        if (isSelectableGroup(group)) next.set(group.groupKey, checked);
      }
      return next;
    });
  }, []);

  return useMemo(() => ({ isChecked, toggle, setMany }), [isChecked, toggle, setMany]);
}

/**
 * The state the automatch modal and the reconciliation panel share around a bounce pair
 * (ETP-5581). Owned by the financial-account detail, which hosts both:
 *
 * - `selection` — the modal's checks ({@link useAutoMatchSelection}), owned here so they outlive a
 *   close of the modal while the suggestions do not reload;
 * - `startReview(group)` — "Revisar en el panel": asks the panel to select the pair's bounce line
 *   (`focus`, consumed by the panel with `consumeFocus`). The host closes the modal; there is no
 *   way back other than the Automatch button, which reopens it;
 * - `dismissedKeys` / `dismiss` — pairs the user said are not a bounce ("No es un rebote"). Nothing
 *   is persisted: they are hidden from the panel and the modal until `clearDismissed`, which the
 *   host calls when the automatch is recomputed (the header refresh). The Automatch button does
 *   NOT clear them: a pair just dismissed in the panel must not reappear in the modal.
 *
 * Leaving the reconciliation (`active` turning false) drops the focus request and forgets the
 * dismissals, so the next visit starts from what the automatch proposes.
 *
 * `panel` bundles what the reconciliation panel needs, as one stable prop.
 *
 * @param {Array<object>} groups the autoMatch groups
 * @param {{ active?: boolean }} [options] `active`: the reconciliation is on screen
 * @returns {object}
 */
export function useAutoMatchReview(groups, { active = true } = {}) {
  const [focus, setFocus] = useState(null);
  const [dismissedKeys, setDismissedKeys] = useState(() => new Set());
  const selection = useAutoMatchSelection(groups);

  useEffect(() => {
    if (active) return;
    setFocus(null);
    setDismissedKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, [active]);

  const startReview = useCallback((group) => {
    const lineId = group?.counterpartLine?.id;
    if (!lineId) return;
    // `seq` makes a second request for the same line a new request.
    setFocus((prev) => ({ lineId, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const consumeFocus = useCallback(() => setFocus(null), []);

  const dismiss = useCallback((groupKey) => {
    if (!groupKey) return;
    setDismissedKeys((prev) => {
      if (prev.has(groupKey)) return prev;
      const next = new Set(prev);
      next.add(groupKey);
      return next;
    });
  }, []);

  const clearDismissed = useCallback(() => {
    setDismissedKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  const panel = useMemo(() => ({
    focus, onFocusConsumed: consumeFocus, dismissedKeys, onDismiss: dismiss,
  }), [focus, consumeFocus, dismissedKeys, dismiss]);

  return {
    selection,
    startReview,
    focus,
    consumeFocus,
    dismissedKeys,
    dismiss,
    clearDismissed,
    panel,
  };
}
