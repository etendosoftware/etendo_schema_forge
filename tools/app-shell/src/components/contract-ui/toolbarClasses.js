// Toolbar class strings shared by the record (form view) toolbar and custom windows that follow
// the same Figma toolbar (ETP-5736: General Ledger Configuration). Kept in a leaf module with no
// imports so a custom window can use them without pulling detailViewHelpers.jsx's import graph.

// ETP-5601 — the record (form view) toolbar follows Figma on every window: 8px padding on all
// sides around 40px controls (56px), with a 1px #E8EAEF bottom rule. The rule is an inset shadow,
// not a border, so it is painted inside those 56px instead of adding a 57th pixel. It used to
// vary per window (`toolbarPaddingX`, `toolbarBorderBottom`, `linesLayout`); it no longer does.
export function getLinesToolbarClassName() {
  return 'flex items-center justify-between p-2 shadow-[inset_0_-1px_0_var(--status-neutral-border)]';
}

// Save, process and extra-action buttons: 40px, Figma's text-sm/leading-6 line, 20px icons
// (`[&_svg]:size-5` beats the core Button's `[&_svg]:size-4`).
export function getSaveBtnCls() {
  return 'h-10 gap-2 leading-6 [&_svg]:size-5';
}
