/**
 * ETP-5332 — horizontal-scroll sync across the renderers that draw ONE lines tab.
 *
 * An `inlineEditable` lines tab with an open add-row is painted by two sibling components
 * (see any generated `<Window>Table.jsx`):
 *
 *   <InlineLinesPanel …/>                       ← header strip + saved rows
 *   <DataTable … hideHeader hideDataRows />     ← the "Add …" row
 *
 * They are siblings, so neither can hold the other's scroll position, and once the column
 * set is wider than the tab — Contacts' Persona needs 1464px, Cuenta Bancaria 1968px, and
 * inside the create-contact dialog only ~1134px exist — each one scrolls on its own and the
 * add-row drifts out from under the header above it.
 *
 * ETP-5133 already hit the narrower version of this INSIDE the panel (its sticky header
 * strip cannot share an `overflow-x` box with its rows without silencing `position: sticky`)
 * and solved it by driving the header's `scrollLeft` from the rows' `onScroll`. That fix
 * cannot reach across the sibling boundary, so this module generalizes it: every scroller
 * belonging to the same lines tab joins a group keyed by entity, and any scroll in one is
 * mirrored to the rest.
 *
 * Deliberately a module-level registry rather than a React context: the two consumers have
 * no common ancestor to hang a provider on — the generated table component returns them as
 * a bare fragment — and the same shape is already used by `unsavedChanges.js`.
 */

/** @type {Map<string, Set<HTMLElement>>} */
const groups = new Map();

/**
 * Join `el` to the scroll group named `key` (the lines tab's entity).
 *
 * @param {string} key    the entity name both renderers receive as a prop
 * @param {HTMLElement} el the scrolling wrapper
 * @returns {() => void}  cleanup — always safe to call, and safe to call twice
 */
export function registerLinesScroller(key, el) {
  if (!key || !el) return () => {};

  let group = groups.get(key);
  if (!group) {
    group = new Set();
    groups.set(key, group);
  }

  // Adopt the group's current offset. The add-row table mounts LATER than the panel (only
  // once the user clicks "Add …"), so without this it would appear at scrollLeft 0 under a
  // header that is already scrolled.
  for (const other of group) {
    if (other.scrollLeft) {
      el.scrollLeft = other.scrollLeft;
      break;
    }
  }
  group.add(el);

  const onScroll = () => {
    const { scrollLeft } = el;
    for (const other of group) {
      // The equality check is what stops the echo: assigning `scrollLeft` fires the other
      // element's own scroll event, whose handler then finds every member already in sync
      // and assigns nothing. No flag, no rAF, no loop.
      if (other !== el && other.scrollLeft !== scrollLeft) other.scrollLeft = scrollLeft;
    }
  };

  el.addEventListener('scroll', onScroll);

  return () => {
    el.removeEventListener('scroll', onScroll);
    group.delete(el);
    if (group.size === 0) groups.delete(key);
  };
}

/** Test-only: drop every group so one suite's elements cannot leak into the next. */
export function resetLinesScrollSync() {
  groups.clear();
}
