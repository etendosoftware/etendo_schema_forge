// @covers tools/app-shell/src/windows/custom/goods-receipt/RelatedDocuments.jsx
// ETP-5539 — the form section is a thin wrapper over the shared PURCHASE_RELATED_DOCS
// definition (the chips themselves are covered in purchaseRelatedDocs.vitest.js and, end to
// end against the preview card, in relatedDocumentsParity.vitest.jsx).
const captured = vi.hoisted(() => ({ props: null }));

vi.mock('@/components/related-documents', async (importOriginal) => ({
  ...(await importOriginal()),
  RelatedDocumentsSection: (props) => {
    captured.props = props;
    return <div data-testid="related-documents-section" />;
  },
}));

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PURCHASE_RELATED_DOCS } from '@/components/related-documents';
import RelatedDocuments from '../RelatedDocuments.jsx';

describe('RelatedDocuments (goods-receipt)', () => {
  beforeEach(() => {
    captured.props = null;
  });

  it('renders the shared section with the goods-receipt purchase definition', () => {
    render(<RelatedDocuments recordId="r-1" data={{ id: 'r-1' }} />);
    expect(screen.getByTestId('related-documents-section')).toBeInTheDocument();
    expect(captured.props.definition).toBe(PURCHASE_RELATED_DOCS['goods-receipt']);
  });

  it('forwards record, token, apiBaseUrl and docsRefreshSignal untouched', () => {
    const data = { id: 'r-1', linkedReceipts: [] };
    render(<RelatedDocuments recordId="r-1" data={data} token="tok" apiBaseUrl="/sws/neo/goods-receipt" docsRefreshSignal={3} />);
    expect(captured.props).toMatchObject({
      recordId: 'r-1', record: data, token: 'tok', apiBaseUrl: '/sws/neo/goods-receipt', docsRefreshSignal: 3,
    });
  });

  it('falls back to data.id when recordId is not given', () => {
    render(<RelatedDocuments data={{ id: 'from-data' }} />);
    expect(captured.props.recordId).toBe('from-data');
  });

  it('passes an undefined recordId through when neither recordId nor data exist', () => {
    render(<RelatedDocuments data={undefined} />);
    expect(captured.props.recordId).toBeUndefined();
    expect(captured.props.record).toBeUndefined();
  });
});
