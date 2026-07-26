// ETP-4600: shared by both the form selector (CreatableSearchSelect) and the
// inline-table selector (InlineSearchCombo) to decide which side of the
// trigger a dropdown panel should anchor to.
//
// The panel is sized with `max-content`, so its natural width is unknown
// until it's actually in the DOM. This measures each option/create/empty
// button's own scrollWidth (their content width, independent of the panel's
// current maxWidth cap — a `block` element's scrollWidth reflects the text it
// actually contains, not the box it's currently constrained to), takes the
// widest one, and compares it against the space available on each side of
// the trigger (minus a 12px viewport margin) to decide whether the panel
// should flip to anchor from the right instead of the left.
export function shouldAnchorDropdownRight(rootEl, dropdownEl) {
  const rect = rootEl.getBoundingClientRect();
  const spaceRight = window.innerWidth - rect.left - 12;
  const spaceLeft = rect.right - 12;
  const buttons = dropdownEl.querySelectorAll('button');
  let naturalWidth = rect.width;
  buttons.forEach((btn) => {
    if (btn.scrollWidth > naturalWidth) naturalWidth = btn.scrollWidth;
  });
  const overflowsRight = naturalWidth > spaceRight;
  return overflowsRight && spaceLeft > spaceRight;
}
