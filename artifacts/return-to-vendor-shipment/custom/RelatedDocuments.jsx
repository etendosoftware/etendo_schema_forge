import { RelatedDocumentsSection, PURCHASE_RELATED_DOCS } from '@/components/related-documents';

export default function RelatedDocuments({ recordId, data, token, apiBaseUrl, docsRefreshSignal }) {
  return (
    <RelatedDocumentsSection
      definition={PURCHASE_RELATED_DOCS['return-to-vendor-shipment']}
      recordId={recordId ?? data?.id}
      record={data}
      token={token}
      apiBaseUrl={apiBaseUrl}
      docsRefreshSignal={docsRefreshSignal}
      data-testid="RelatedDocumentsSection__776ada" />
  );
}
