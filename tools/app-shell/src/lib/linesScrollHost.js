/**
 * ETP-5133 — cross-sibling handoff so the inlineEditable lines layout's add-row
 * form becomes a REAL child of the same scrollable element the saved rows
 * scroll in, instead of a second, independently-scrolled lookalike.
 *
 * The generated `*LineTable.jsx` wrapper (produced by generate-frontend.js in
 * schema_forge_core — out of reach from this repo, see docs/repo-topology.md)
 * mounts `InlineLinesPanel` (saved rows, flex layout, owns the ONE horizontal
 * scroll of the grid — `bodyScrollRef` in InlineLinesPanel.jsx) and `DataTable`
 * (`hideHeader`/`hideDataRows`, the add-row form) as SIBLINGS, not
 * parent/child:
 *
 *   <InlineLinesPanel ref={ref} columns={columns} {...props} addRow={undefined} />
 *   <DataTable columns={columns} filters={filters} {...props} hideHeader hideDataRows />
 *
 * Before ETP-5133, the add-row's own scroll wrapper was forced to
 * `overflow-visible` for `linesLayout === 'inlineEditable'` (see DataTable's
 * scroll-container className) — it was never inside InlineLinesPanel's
 * scrolling body, so on any window with enough columns to need horizontal
 * scroll, the saved rows scrolled out from under an add-row that stayed put.
 * Keeping `linesColumnWidth.js` / `linesActionSlot.js` in agreement (their own
 * job, and already correct) cannot fix this: two independently-scrolled
 * elements agreeing on pixel widths still do not share a scroll position.
 *
 * This registry lets DataTable's add-row ask "is a live InlineLinesPanel for
 * this entity currently rendering?" and, if so, grabs the literal DOM node
 * InlineLinesPanel reserves for it (inside its own `overflow-x-auto` body) so
 * `createPortal` can mount the add-row's existing `<table>` there — a REAL
 * child of that one scrollable element, not a positionally-mimicked copy.
 * `entity` is the key because exactly one primary-lines InlineLinesPanel is
 * ever mounted per entity at a time (DetailView only mounts the lines tab's
 * `DetailTable` while that tab is active).
 *
 * When no host is registered — every existing unit test that mounts
 * `DataTable` standalone in this mode, or any future non-InlineLinesPanel
 * consumer of `hideHeader`/`hideDataRows` — `useLinesScrollHost` returns
 * `null` and the caller keeps rendering its own self-contained `<table>` in
 * place. Purely additive: nothing changes for a caller that never has a
 * matching host.
 */
import { useLayoutEffect, useState } from 'react';

const hosts = new Map();
const listeners = new Map();

function notify(key) {
  const node = hosts.get(key) ?? null;
  for (const fn of listeners.get(key) ?? []) fn(node);
}

/**
 * Registers `node` as the live scroll host for `key`. Call from a layout
 * effect (fires before paint, and before a sibling's own effects — see
 * InlineLinesPanel.jsx) so it is visible to a sibling mounting in the same
 * commit.
 */
export function registerLinesScrollHost(key, node) {
  if (!key || !node) return;
  hosts.set(key, node);
  notify(key);
}

/**
 * Clears the registration for `key`, but only if `node` is still the current
 * one — guards against an out-of-order unmount (e.g. React StrictMode's
 * double-invoke) clobbering a newer registration for the same key.
 */
export function unregisterLinesScrollHost(key, node) {
  if (!key) return;
  if (hosts.get(key) === node) {
    hosts.delete(key);
    notify(key);
  }
}

/**
 * Live-subscribes to the current scroll host DOM node for `key`. Returns
 * `null` until (and unless) a sibling InlineLinesPanel registers one for the
 * same entity — safe to call with a `null`/`undefined` key (never
 * subscribes, always returns `null`).
 *
 * ETP-5133 (BUG-1, pass 3) — `useLayoutEffect`, not `useEffect`. The
 * registration side (`InlineLinesPanel`'s `registerLinesScrollHost` call)
 * already fires from a layout effect specifically so it lands before paint
 * and before a sibling's own effects fire in the same commit (see that call
 * site's own comment). A passive `useEffect` here broke that guarantee: it
 * runs strictly AFTER the browser has had a chance to paint the commit where
 * this hook's caller (DataTable) already re-rendered with a truthy `key`,
 * so the caller could observably paint one frame with a resolved key but a
 * still-null host — and, downstream, a `hostWidthPx` that never got the
 * chance to measure it (see DataTable.jsx's own `hostWidthPx` effect,
 * likewise moved to `useLayoutEffect`). Matching the producer's effect type
 * lets React fold the whole node-resolution + width-measurement chain into
 * one synchronous pre-paint pass instead of leaking an intermediate state to
 * the screen.
 */
export function useLinesScrollHost(key) {
  const [node, setNode] = useState(() => (key ? hosts.get(key) ?? null : null));
  useLayoutEffect(() => {
    if (!key) {
      setNode(null);
      return undefined;
    }
    // Pull the current value at subscribe time — a sibling's register() call
    // may already have fired (and notified an empty listener set) before this
    // effect runs, so relying on the push alone could miss it.
    setNode(hosts.get(key) ?? null);
    if (!listeners.has(key)) listeners.set(key, new Set());
    const set = listeners.get(key);
    set.add(setNode);
    return () => {
      set.delete(setNode);
      if (set.size === 0) listeners.delete(key);
    };
  }, [key]);
  return node;
}
