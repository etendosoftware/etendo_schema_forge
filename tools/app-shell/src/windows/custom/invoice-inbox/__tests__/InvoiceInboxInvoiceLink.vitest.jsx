// @covers tools/app-shell/src/windows/custom/invoice-inbox/InvoiceInboxInvoiceLink.jsx
// New file justification: InvoiceInboxInvoiceLink.jsx is a new component with no test.
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InvoiceInboxInvoiceLink, { purchaseInvoicePath, PURCHASE_INVOICE_ROUTE } from '../InvoiceInboxInvoiceLink.jsx';

describe('InvoiceInboxInvoiceLink', () => {
  it('builds the purchase invoice path and encodes the id', () => {
    expect(PURCHASE_INVOICE_ROUTE).toBe('/purchase-invoice');
    expect(purchaseInvoicePath('ABC123')).toBe('/purchase-invoice/ABC123');
    expect(purchaseInvoicePath('a/b c')).toBe('/purchase-invoice/a%2Fb%20c');
  });

  it('inside a router it is a client-side Link to the invoice', () => {
    render(<MemoryRouter><InvoiceInboxInvoiceLink invoiceId="I1" testId="lnk">FC1 · Completada</InvoiceInboxInvoiceLink></MemoryRouter>);
    const link = screen.getByTestId('lnk');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/purchase-invoice/I1');
    expect(link).toHaveTextContent('FC1 · Completada');
  });

  it('outside a router it is a plain anchor', () => {
    render(<InvoiceInboxInvoiceLink invoiceId="I1" testId="lnk" className="c">x</InvoiceInboxInvoiceLink>);
    const link = screen.getByTestId('lnk');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/purchase-invoice/I1');
    expect(link).toHaveClass('c');
  });

  it('a click does not bubble to the row that opens the review panel', () => {
    const onRow = vi.fn();
    render(<MemoryRouter><div onClick={onRow}><InvoiceInboxInvoiceLink invoiceId="I1" testId="lnk">x</InvoiceInboxInvoiceLink></div></MemoryRouter>);
    fireEvent.click(screen.getByTestId('lnk'));
    expect(onRow).not.toHaveBeenCalled();
  });

  it('a plain anchor click does not bubble either', () => {
    const onRow = vi.fn();
    render(<div onClick={onRow}><InvoiceInboxInvoiceLink invoiceId="I1" testId="lnk">x</InvoiceInboxInvoiceLink></div>);
    fireEvent.click(screen.getByTestId('lnk'));
    expect(onRow).not.toHaveBeenCalled();
  });

  it('without an invoice id the children render as plain text, no link', () => {
    render(<InvoiceInboxInvoiceLink invoiceId={null} testId="lnk">FC1</InvoiceInboxInvoiceLink>);
    const el = screen.getByTestId('lnk');
    expect(el.tagName).toBe('SPAN');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
