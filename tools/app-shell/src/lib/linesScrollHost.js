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

/**
 * ETP-5133 follow-up (BUG-1, pass 2) — the one real number growColumnWidth()
 * needs and CSS can't give it: the scroll host's actual `clientWidth`,
 * measured live and kept in sync with a ResizeObserver (side panel
 * open/close, window resize, ...). `host` is the node returned by
 * `useLinesScrollHost` above — pass it straight through. Returns `null`
 * whenever there's no host to measure (see that hook's own comment) —
 * growColumnWidth() falls back to its original calc()-string formula in that
 * case, unchanged.
 *
 * ETP-5133 (BUG-1, pass 3) — `useLayoutEffect`, not `useEffect`, for the
 * same reason `useLinesScrollHost` itself uses one: `host` and this hook's
 * own width state are two independently-updated pieces of state, resolved
 * one effect-flush apart. With both on the passive `useEffect` queue, the
 * render where `host` first turns truthy commits (and can paint) BEFORE
 * this effect gets a chance to run and measure it — so `growColumnWidth()`
 * took the unmeasured fallback for that one frame while the add-row's
 * content was already portaled into the real, possibly-narrow host.
 * Putting both measurements on `useLayoutEffect` lets React fold the whole
 * chain — host resolves → this effect measures its width → colgroup
 * re-renders with the real number — into one synchronous pre-paint pass,
 * exactly like a layout-effect-triggered state update always does; the
 * browser only ever paints the settled result, never the intermediate
 * null-width one.
 *
 * Called unconditionally by its caller (rules of hooks) — `host` is the
 * conditional part, not the hook call itself.
 */
export function useAddRowScrollHostWidth(host) {
  const [widthPx, setWidthPx] = useState(() => host?.clientWidth ?? null);
  useLayoutEffect(() => {
    if (!host) {
      setWidthPx(null);
      return undefined;
    }
    setWidthPx(host.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      setWidthPx(entry ? entry.contentRect.width : host.clientWidth);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, [host]);
  return widthPx;
}

// ── Add-row draft (ETP-5133, QA pass 3) ────────────────────────────────────────────────
// Same sibling pair, same `entity` key, second piece of shared state: the identifier the add-row
// has picked for a no-truncate column (e.g. the product) BEFORE the line is saved. DataTable owns
// the add-row values, InlineLinesPanel owns the header and saved lines; both must size the
// no-truncate column from the same rows (`rowsWithDraft` in linesContentWidth.js), so DataTable
// publishes its draft here and InlineLinesPanel subscribes. Published from a layout effect, like
// the scroll host, so the widened header and the widened add-row paint in the same frame.

const drafts = new Map();
const draftListeners = new Map();

function notifyDraft(key) {
  const draft = drafts.get(key) ?? null;
  for (const fn of draftListeners.get(key) ?? []) fn(draft);
}

/** Publishes the add-row draft row for `key` (`null` clears it). */
export function publishLinesAddRowDraft(key, draft) {
  if (!key) return;
  if ((drafts.get(key) ?? null) === draft) return;
  if (draft) drafts.set(key, draft);
  else drafts.delete(key);
  notifyDraft(key);
}

/**
 * Clears the draft for `key`, but only if `draft` is still the current one — same out-of-order
 * unmount guard as `unregisterLinesScrollHost`.
 */
export function clearLinesAddRowDraft(key, draft) {
  if (!key || drafts.get(key) !== draft) return;
  drafts.delete(key);
  notifyDraft(key);
}

/** Live-subscribes to the add-row draft for `key`; `null` with no key or no draft. */
export function useLinesAddRowDraft(key) {
  const [draft, setDraft] = useState(() => (key ? drafts.get(key) ?? null : null));
  useLayoutEffect(() => {
    if (!key) {
      setDraft(null);
      return undefined;
    }
    setDraft(drafts.get(key) ?? null);
    if (!draftListeners.has(key)) draftListeners.set(key, new Set());
    const set = draftListeners.get(key);
    set.add(setDraft);
    return () => {
      set.delete(setDraft);
      if (set.size === 0) draftListeners.delete(key);
    };
  }, [key]);
  return draft;
}

/**
 * Publishes `draft` for `key` while both are set, and clears it on change/unmount — the producer
 * side (DataTable's add-row), as a hook so its caller stays one line. `key` is null whenever the
 * caller is not the add-row companion table or its add-row is closed, so a cancelled add-row
 * clears the draft and the column falls back to the width `data` alone dictates.
 */
export function usePublishLinesAddRowDraft(key, draft) {
  useLayoutEffect(() => {
    if (!key || !draft) return undefined;
    publishLinesAddRowDraft(key, draft);
    return () => clearLinesAddRowDraft(key, draft);
  }, [key, draft]);
}
