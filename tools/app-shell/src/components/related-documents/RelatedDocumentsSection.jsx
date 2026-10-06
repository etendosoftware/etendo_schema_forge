import { useNavigate } from 'react-router-dom';
import { useUI } from '@/i18n';
import DocChip from './DocChip.jsx';
import RelatedDocumentsShell from './RelatedDocumentsShell.jsx';
import { docChipProps } from './docChipTypes.jsx';
import { useRelatedDocuments } from './useRelatedDocuments.js';

/**
 * Form-side "Related documents" section driven by a related-documents definition
 * (salesRelatedDocs.js). The list preview renders the same definition through
 * RelatedDocumentsCard, so both views always list the same documents.
 *
 * The refresh button is only offered when the definition has fetched sources; a
 * definition read entirely from the record has nothing to refetch.
 */
export default function RelatedDocumentsSection({ definition, recordId, record, token, apiBaseUrl, docsRefreshSignal }) {
  const ui = useUI();
  const navigate = useNavigate();
  const { items, loading, refresh } = useRelatedDocuments({
    definition,
    id: recordId,
    record: record ?? null,
    token,
    apiBaseUrl,
    // Bumped by DetailView after a process runs on the record.
    refreshSignal: docsRefreshSignal,
  });
  const refreshable = (definition?.sources ?? []).some(s => typeof s.fetch === 'function');

  return (
    <RelatedDocumentsShell
      loading={loading}
      onRefresh={refreshable ? refresh : undefined}
      data-testid="RelatedDocumentsShell__3224be">
      {items.map(({ type, doc }) => (
        <DocChip
          key={`${type}-${doc.id}`}
          {...docChipProps({ type, doc, ui, navigate })}
          data-testid="DocChip__3224be" />
      ))}
    </RelatedDocumentsShell>
  );
}
