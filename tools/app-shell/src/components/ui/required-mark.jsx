/**
 * RequiredMark — visual mandatory-field marker.
 *
 * The same asterisk span the address and contact modals already inline, extracted
 * so LocationEditorModal (ETP-5103) does not add a third copy. Purely presentational:
 * it never drives validation, so a field can carry it while its own gating lives in
 * the form (see `saveDisabled` in LocationEditorModal, `requiredFields` in
 * EntityCreationModal). Render it right after the label text.
 */
export default function RequiredMark() {
  return <span style={{ color: 'hsl(var(--destructive))', marginLeft: '2px' }}>*</span>;
}
