// Mocks before imports
vi.mock('../RelatedDocumentsCard.jsx', () => ({
  default: ({ documentId }) => <div data-testid="related-documents-card">{documentId}</div>,
}));

import { render, screen } from '@testing-library/react';
import ReturnDocStatsPanel from '../ReturnDocStatsPanel.jsx';

const ui = (key) => key;

const baseDoc = {
  id: 'doc-1',
  documentNo: 'RMR-001',
  documentStatus: 'CO',
  'documentStatus$_identifier': 'Completed',
  'warehouse$_identifier': 'Main Warehouse',
};

const baseProps = {
  doc: baseDoc,
  partnerName: 'Acme Corp',
  movementDate: '2024-05-01',
  token: 'token-123',
  apiBaseUrl: 'https://api.example.com',
  ui,
  specs: {},
};

describe('ReturnDocStatsPanel', () => {
  // ── Existing behavior: status badge, doc rows, RelatedDocumentsCard ──────────

  it('renders the doc rows (docNo, contact, warehouse, date)', () => {
    render(<ReturnDocStatsPanel {...baseProps} />);
    expect(screen.getByText('RMR-001')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
    expect(screen.getByText('2024-05-01')).toBeInTheDocument();
  });

  it('renders the status badge using the documentStatus$_identifier fallback', () => {
    render(<ReturnDocStatsPanel {...baseProps} doc={{ ...baseDoc, documentStatus: 'UNKNOWN_CODE', 'documentStatus$_identifier': 'Custom Status' }} />);
    expect(screen.getByText('Custom Status')).toBeInTheDocument();
  });

  it('falls back to a dash for docNo/warehouse when missing', () => {
    render(
      <ReturnDocStatsPanel
        {...baseProps}
        doc={{ id: 'doc-2', documentStatus: 'DR' }}
      />,
    );
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('renders RelatedDocumentsCard with the document id', () => {
    render(<ReturnDocStatsPanel {...baseProps} />);
    const related = screen.getByTestId('related-documents-card');
    expect(related).toBeInTheDocument();
    expect(related).toHaveTextContent('doc-1');
  });

  // ── Billing status (invoiceStatus → invoicePercent) ──────────────────────────

  it('does not render the billing-status row when invoiceStatus is undefined', () => {
    render(<ReturnDocStatsPanel {...baseProps} />);
    expect(screen.queryByText('previewCardInvoicePercent')).not.toBeInTheDocument();
  });

  it('does not render the billing-status row when invoiceStatus is null', () => {
    render(<ReturnDocStatsPanel {...baseProps} doc={{ ...baseDoc, invoiceStatus: null }} />);
    expect(screen.queryByText('previewCardInvoicePercent')).not.toBeInTheDocument();
  });

  it('renders the billing-status row and PercentBar at 0%', () => {
    render(<ReturnDocStatsPanel {...baseProps} doc={{ ...baseDoc, invoiceStatus: 0 }} />);
    expect(screen.getByText('previewCardInvoicePercent')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders the billing-status row and PercentBar at a mid value (45%)', () => {
    render(<ReturnDocStatsPanel {...baseProps} doc={{ ...baseDoc, invoiceStatus: 45 }} />);
    expect(screen.getByText('previewCardInvoicePercent')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('renders the billing-status row and PercentBar at 100%', () => {
    render(<ReturnDocStatsPanel {...baseProps} doc={{ ...baseDoc, invoiceStatus: 100 }} />);
    expect(screen.getByText('previewCardInvoicePercent')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('coerces a string invoiceStatus to a number for the PercentBar', () => {
    render(<ReturnDocStatsPanel {...baseProps} doc={{ ...baseDoc, invoiceStatus: '60' }} />);
    expect(screen.getByText('60%')).toBeInTheDocument();
  });
});
