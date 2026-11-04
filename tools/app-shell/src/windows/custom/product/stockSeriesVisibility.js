import { useState } from 'react';

// Visibility state of the stock chart series (ETP-5908 RF-14 panel, RF-15 modal). A "visible set" is a
// Set of series keys (the warehouse name); null means "every series visible". Every function is pure
// and never returns an empty set: at least one series always stays on screen.

export const DIMMED_OPACITY = 0.25;

/** Concrete visible set: null -> all keys; unknown keys dropped; an empty result falls back to all. */
export function resolveVisible(visible, allKeys) {
  if (!visible) return new Set(allKeys);
  const known = allKeys.filter(k => visible.has(k));
  return new Set(known.length > 0 ? known : allKeys);
}

/** Panel semantics: flips one series, but the last visible one cannot be hidden. */
export function toggleVisible(visible, key, allKeys) {
  const current = resolveVisible(visible, allKeys);
  if (!allKeys.includes(key)) return current;
  if (!current.has(key)) return new Set([...current, key]);
  if (current.size === 1) return current;
  const next = new Set(current);
  next.delete(key);
  return next;
}

/** True when `key` is the only visible series of a chart that has more than one. */
export function isIsolated(visible, key, allKeys) {
  const current = resolveVisible(visible, allKeys);
  return allKeys.length > 1 && current.size === 1 && current.has(key);
}

/** Modal semantics: shows only `key`; a second click on the same series shows all again. */
export function isolate(visible, key, allKeys) {
  const current = resolveVisible(visible, allKeys);
  if (!allKeys.includes(key)) return current;
  if (isIsolated(current, key, allKeys)) return new Set(allKeys);
  return new Set([key]);
}

/** Hover highlight: a hovered HIDDEN series (or none) highlights nothing. */
export const activeHighlight = (hoveredKey, visible) => (hoveredKey != null && visible.has(hoveredKey) ? hoveredKey : null);

/** Opacity of a series (line, area, legend entry) given the highlighted key. */
export const dimmedOpacity = (key, highlight) => (highlight != null && key !== highlight ? DIMMED_OPACITY : 1);

/** Series to draw: visible named ones, plus an unnamed aggregate line (no warehouses) always. */
export const filterVisibleSeries = (series, visible) => series.filter(s => s.name == null || visible.has(s.name));

/**
 * Panel visibility state, owned by the sidebar so Summary and Warehouses tabs share it. It survives
 * period changes and resets when `resetKey` (product id + warehouse set) changes.
 * @returns {[Set<string>, (key: string) => void]} visible set and the toggle handler
 */
export function useSeriesVisibility(resetKey, allKeys) {
  const [state, setState] = useState({ key: resetKey, visible: null });
  const stored = state.key === resetKey ? state.visible : null;
  const toggle = (key) => setState(prev => ({
    key: resetKey,
    visible: toggleVisible(prev.key === resetKey ? prev.visible : null, key, allKeys),
  }));
  return [resolveVisible(stored, allKeys), toggle];
}
