import { RelatedDocumentsSection, SALES_RELATED_DOCS } from '@/components/related-documents';

/**
 * "Related documents" section of the form. ETP-5527: the documents, criteria, chips
 * and statuses come from the shared definition SALES_RELATED_DOCS['sales-invoice'], the
 * same one the list preview renders, so the form and the preview always match.
 */
export default function RelatedDocuments({ recordId, data, token, apiBaseUrl, docsRefreshSignal }) {
  return (
    <RelatedDocumentsSection
      definition={SALES_RELATED_DOCS['sales-invoice']}
      recordId={recordId ?? data?.id}
      record={data}
      token={token}
      apiBaseUrl={apiBaseUrl}
      docsRefreshSignal={docsRefreshSignal}
      data-testid="RelatedDocumentsSection__f938e6" />
  );
}
