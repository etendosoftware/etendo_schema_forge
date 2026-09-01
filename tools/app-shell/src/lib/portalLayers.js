/**
 * A click, focus or key event whose target lives inside one of these does not
 * belong to whatever host element contains it in the React tree — portalled
 * content (Radix popovers/dialogs, lookup dropdowns) renders under
 * `document.body`, so it is a DOM sibling of the host, not a DOM descendant,
 * even though React events still bubble through the React tree and reach the
 * host's handlers. Any "did focus/click leave me" check on a host element
 * must exempt these selectors or it will misread a normal interaction with
 * the portalled content as the user leaving the host.
 *
 * Mirrors the selector set `DataTable.jsx`'s `INLINE_ADD_IGNORED_PORTAL_SELECTORS`
 * already uses for the same reason on its inline-add row.
 */
// Deliberately does NOT include `[role="dialog"]`: unlike a page-level inline
// row, this helper is used by rows that live INSIDE the app's own modal
// Dialog, whose DialogContent itself carries `role="dialog"` — every element
// in the row would match `.closest('[role="dialog"]')` via that ancestor,
// making the check always true. Only selectors that identify a NESTED layer
// (rendered via a portal, further down from the row) belong here.
const PORTAL_LAYER_SELECTORS = [
  '[data-radix-popper-content-wrapper]',
  '[data-lookup-dropdown]',
  '[role="listbox"]',
];

/**
 * True when `target` is inside a portalled layer (see selectors above).
 *
 * Deliberately does NOT also check `document.body.style.pointerEvents ===
 * 'none'` the way `DataTable.jsx`'s click-target check does: that shortcut
 * exists there because a POINTER event's `target` can resolve to an ancestor
 * like `<html>` when Radix disables body pointer events for a click-blocking
 * layer. Focus/blur/key events don't have that problem — their target is
 * always the real DOM node that received focus, regardless of body
 * pointer-events CSS. And unlike a page-level inline-add row, a row inside a
 * modal `Dialog` sits behind body-pointer-events:none for the ENTIRE time the
 * dialog is open (that's how Radix's modal Dialog always behaves), so
 * reusing that check here would make this always return `true`, defeating
 * the purpose.
 */
export function isInPortalLayer(target) {
  if (!(target instanceof Element)) return false;
  return PORTAL_LAYER_SELECTORS.some((sel) => target.closest(sel));
}
