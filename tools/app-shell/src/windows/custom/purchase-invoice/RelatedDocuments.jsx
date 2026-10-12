import { RelatedDocumentsSection, PURCHASE_RELATED_DOCS } from '@/components/related-documents';

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl, docsRefreshSignal }) {
  return (
    <RelatedDocumentsSection
      definition={PURCHASE_RELATED_DOCS['purchase-invoice']}
      recordId={recordId ?? data?.id}
      record={data}
      token={token}
      apiBaseUrl={apiBaseUrl}
      docsRefreshSignal={docsRefreshSignal}
      data-testid="RelatedDocumentsSection__bb79ed" />
  );
}
