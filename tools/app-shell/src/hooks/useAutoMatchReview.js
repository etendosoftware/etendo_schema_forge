import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultGroupChecked, isBouncePairGroup, isSelectableGroup,
} from '@/components/contract-ui/bouncePairs.js';

/**
 * Which automatch suggestions are checked, by `groupKey`.
 *
 * Only what the user changed is stored (`overrides`); everything else reads its default: every
 * transaction group checked, a bounce pair checked only with high confidence (ETP-5581), an
 * ambiguous pair never (it cannot be checked at all).
 *
 * When the suggestions reload, the user's choices are dropped and every group goes back to its
 * default — what the modal always did — unless `keepOnReload` is set. That is the "Revisar en el
 * panel" visit: the modal is hidden while the user works in the reconciliation panel, a discard
 * there reloads the suggestions, and coming back must find the checks as they were left. Then only
 * the choices of groups that are gone are dropped.
 *
 * @param {Array<object>} groups the autoMatch groups
 * @param {{ keepOnReload?: boolean }} [options]
 * @returns {{ isChecked: (group: object) => boolean, toggle: (group: object) => void,
 *   setMany: (groups: Array<object>, checked: boolean) => void }}
 */
export function useAutoMatchSelection(groups, { keepOnReload = false } = {}) {
  const [overrides, setOverrides] = useState(() => new Map());
  // Read at reload time only: changing it must not, by itself, reset or prune anything.
  const keepRef = useRef(keepOnReload);
  keepRef.current = keepOnReload;

  useEffect(() => {
    setOverrides((prev) => {
      if (prev.size === 0) return prev;
      if (!keepRef.current) return new Map();
      const present = new Set((groups ?? []).map((g) => g.groupKey));
      const next = new Map([...prev].filter(([key]) => present.has(key)));
      return next.size === prev.size ? prev : next;
    });
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
 * The state the automatch modal and the reconciliation panel share while the user reviews a bounce
 * pair (ETP-5581). Owned by the financial-account detail, which hosts both:
 *
 * - `selection` — the modal's checks ({@link useAutoMatchSelection}), kept while reviewing;
 * - `startReview(group)` — "Revisar en el panel": asks the panel to select the pair's bounce line
 *   (`focus`, consumed by the panel with `consumeFocus`) and starts the review;
 * - `reviewing` — true from "Revisar en el panel" until the modal is closed or applied
 *   (`endReview`); it drives "Volver a las sugerencias (N)";
 * - `dismissedKeys` / `dismiss` — pairs the user said are not a bounce ("No es un rebote"). Nothing
 *   is persisted: they are hidden from the panel and the modal until `clearDismissed`, which the
 *   host calls when the automatch runs again (refreshing, the Automatch button);
 * - `remaining` — the suggestions still offered: transaction groups plus undismissed pairs.
 *
 * Leaving the reconciliation (`active` turning false) ends the review and forgets the dismissals,
 * so the next visit starts from what the automatch proposes.
 *
 * `panel` bundles what the reconciliation panel needs, as one stable prop.
 *
 * @param {Array<object>} groups the autoMatch groups
 * @param {{ active?: boolean }} [options] `active`: the reconciliation is on screen
 * @returns {object}
 */
export function useAutoMatchReview(groups, { active = true } = {}) {
  const [reviewing, setReviewing] = useState(false);
  const [focus, setFocus] = useState(null);
  const [dismissedKeys, setDismissedKeys] = useState(() => new Set());
  const selection = useAutoMatchSelection(groups, { keepOnReload: reviewing });

  useEffect(() => {
    if (active) return;
    setReviewing(false);
    setFocus(null);
    setDismissedKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, [active]);

  const startReview = useCallback((group) => {
    const lineId = group?.counterpartLine?.id;
    if (!lineId) return;
    setReviewing(true);
    // `seq` makes a second request for the same line a new request.
    setFocus((prev) => ({ lineId, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const endReview = useCallback(() => setReviewing(false), []);
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

  const remaining = useMemo(
    () => (groups ?? []).filter((g) => !(isBouncePairGroup(g) && dismissedKeys.has(g.groupKey))).length,
    [groups, dismissedKeys],
  );

  const panel = useMemo(() => ({
    focus, onFocusConsumed: consumeFocus, dismissedKeys, onDismiss: dismiss,
  }), [focus, consumeFocus, dismissedKeys, dismiss]);

  return {
    selection,
    reviewing,
    startReview,
    endReview,
    focus,
    consumeFocus,
    dismissedKeys,
    dismiss,
    clearDismissed,
    remaining,
    panel,
  };
}
