// Mocks before imports
vi.mock('../RelatedDocumentsCard.jsx', () => ({
  default: ({ documentId }) => <div data-testid="related-documents-card">{documentId}</div>,
}));

// ETP-5124 — EmailsCard is a heavier component (auth-aware fetching, i18n, StatusTag), so it is
// mocked wholesale here, matching RelatedDocumentsCard above: this test file only needs to prove
// ReturnDocStatsPanel forwards (or withholds) the `emailsCard` prop correctly, not EmailsCard's
// own internal behavior — that lives in EmailsCard's own test suite.
vi.mock('../EmailsCard.jsx', () => ({
  default: (props) => (
    <div
      data-testid="emails-card"
      data-document-id={props.documentId}
      data-api-base-url={props.apiBaseUrl}
      data-refresh-signal={props.refreshSignal}
      data-has-on-send={typeof props.onSend === 'function'}
    />
  ),
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

  // ── ETP-5124: emailsCard (opt-in EmailsCard slot) ────────────────────────────

  describe('emailsCard prop', () => {
    it('does not render EmailsCard when emailsCard is omitted', () => {
      render(<ReturnDocStatsPanel {...baseProps} />);
      expect(screen.queryByTestId('emails-card')).not.toBeInTheDocument();
    });

    it('does not render EmailsCard when emailsCard is undefined', () => {
      render(<ReturnDocStatsPanel {...baseProps} emailsCard={undefined} />);
      expect(screen.queryByTestId('emails-card')).not.toBeInTheDocument();
    });

    it('renders EmailsCard with the given props when emailsCard is passed', () => {
      const onSend = () => {};
      render(
        <ReturnDocStatsPanel
          {...baseProps}
          emailsCard={{ documentId: 'doc-1', apiBaseUrl: 'https://api.example.com', refreshSignal: 3, onSend }}
        />,
      );
      const card = screen.getByTestId('emails-card');
      expect(card).toHaveAttribute('data-document-id', 'doc-1');
      expect(card).toHaveAttribute('data-api-base-url', 'https://api.example.com');
      expect(card).toHaveAttribute('data-refresh-signal', '3');
      expect(card).toHaveAttribute('data-has-on-send', 'true');
    });

    it('renders EmailsCard without a send affordance when onSend is omitted (e.g. non-sendable document)', () => {
      render(
        <ReturnDocStatsPanel
          {...baseProps}
          emailsCard={{ documentId: 'doc-1', apiBaseUrl: 'https://api.example.com', refreshSignal: 0 }}
        />,
      );
      expect(screen.getByTestId('emails-card')).toHaveAttribute('data-has-on-send', 'false');
    });
  });
});
