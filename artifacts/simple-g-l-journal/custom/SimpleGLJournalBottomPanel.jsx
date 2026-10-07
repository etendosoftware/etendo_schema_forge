import { LinesEmptyState } from '@/components/contract-ui';

// The debit/credit balance row lives inside InlineLinesPanel, and this window
// has no notes field, footer tabs or afterTotals — so the bottom section itself
// renders nothing. It exists only to register the lines empty state.
export default function SimpleGLJournalBottomPanel() {
  return null;
}
SimpleGLJournalBottomPanel.showLineTotals = false;

// ETP-5611 — "+ Añadir líneas" is offered only once the journal header is
// saved. Keyed on data.id (not the recordId prop, which can hold the new-record
// route placeholder): before the first save only the message is shown.
export function SimpleGLJournalLinesEmptyState({ data, canAddLine, ...props }) {
  return <LinesEmptyState {...props} data={data} canAddLine={Boolean(data?.id) && canAddLine} />;
}
SimpleGLJournalBottomPanel.linesEmptyState = SimpleGLJournalLinesEmptyState;
