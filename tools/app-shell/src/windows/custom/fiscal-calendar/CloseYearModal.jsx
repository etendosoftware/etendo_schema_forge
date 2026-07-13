import CloseYearConfirmModal from './CloseYearConfirmModal.jsx';

/**
 * Thin wrapper so `menuActions` can reference a distinct `component` value per
 * action (the generator emits one `import <component> from ...` line per
 * menuActions entry with no dedup — two entries pointing at the same
 * component name would produce a duplicate import / duplicate declaration).
 * See CloseYearConfirmModal.jsx for the shared close/undo year confirm UI.
 */
export default function CloseYearModal(props) {
  return <CloseYearConfirmModal direction="close" {...props} />;
}
