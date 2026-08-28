// ETP-4972 — LinesSelectionBar was renamed to SelectionToolbar and rebuilt as
// a true viewport-fixed (not anchor-rect-measured) floating toolbar. This
// re-export shim is kept for one release so any straggler import of the old
// filename keeps resolving; all in-repo call sites were migrated to import
// SelectionToolbar directly. Remove once confirmed nothing still imports this
// path.
export { default } from './SelectionToolbar.jsx';
