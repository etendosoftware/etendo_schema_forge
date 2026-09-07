/**
 * RequiredMark — visual mandatory-field marker.
 *
 * The same asterisk span the address and contact modals already inline, extracted
 * so LocationEditorModal (ETP-5103) does not add a third copy. Purely presentational:
 * it never drives validation, so a field can carry it while its own gating lives in
 * the form (see `saveDisabled` in LocationEditorModal, `requiredFields` in
 * EntityCreationModal). Render it right after the label text.
 *
 * Extra props are forwarded to the span — the repo-wide data-testid codemod stamps one
 * on every component usage, and it has to reach the DOM to be worth anything. `style`
 * stays after the spread so the marker cannot lose its colour to a caller.
 */
export default function RequiredMark(props) {
  return <span {...props} style={{ color: 'hsl(var(--destructive))', marginLeft: '2px' }}>*</span>;
}
