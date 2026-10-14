// @covers artifacts/sales-order/custom/OrderDraftChips.jsx
// @covers artifacts/purchase-order/custom/PurchaseOrderDraftChips.jsx

/**
 * The "Invoiced" chip of the order detail page must show the SAME percentage as the list grid.
 *
 * The grid column is the stored computed column `eTGOInvoiceStatus` (`EM_ETGO_Invoice_Status`,
 * quantity based). The chip used to recompute its own figure from invoice amounts with tax
 * (completed invoices' grand total / order grand total), so one order could read 75 % in the grid
 * and 71 % in the detail. Both twins (sales and purchase) are guarded by the same table.
 */

import { render, screen, act } from '@testing-library/react';

vi.mock('@/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  useUI: () => (key) => key,
}));

import OrderDraftChips from '@generated/sales-order/custom/OrderDraftChips';
import PurchaseOrderDraftChips from '@generated/purchase-order/custom/PurchaseOrderDraftChips';

const json = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

/**
 * `server.invoiceStatus` is what the header get-by-id answers for the stored column; `null`
 * makes that request fail. Invoice lookups (the pre-fix source) always answer with amounts that
 * work out to 71 % of the order total, so a chip still dividing amounts cannot pass by accident.
 */
function installFetchMock(spec, recordId, server) {
  globalThis.fetch = vi.fn((url) => {
    const target = String(url);
    if (target.includes('/lines?')) {
      return json({ response: { data: [{ orderedQuantity: 4, deliveredQuantity: 1 }] } });
    }
    if (target.includes('listInvoices') || target.includes('-invoice/')) {
      return json({ response: { data: [{ documentStatus: 'CO', grandTotalAmount: 710 }] } });
    }
    if (target.endsWith(`/${spec}/header/${recordId}`)) {
      if (server.invoiceStatus == null) return Promise.resolve({ ok: false, status: 500 });
      return json({ response: { data: [{ id: recordId, eTGOInvoiceStatus: server.invoiceStatus }] } });
    }
    return json({ response: { data: [] } });
  });
}

describe.each([
  ['sales-order', OrderDraftChips, 'soAllInvoiced', 'soAllDelivered'],
  ['purchase-order', PurchaseOrderDraftChips, 'poAllInvoiced', 'poAllReceived'],
])('%s draft chips — invoiced percentage source', (spec, Chips, invoicedLabel, deliveredLabel) => {
  const recordId = `${spec}-1`;
  const props = (invoiceStatus) => ({
    data: { id: recordId, documentStatus: 'CO', grandTotalAmount: 1000, eTGOInvoiceStatus: invoiceStatus },
    recordId,
    token: 'tok',
    apiBaseUrl: `/sws/neo/${spec}`,
  });

  it('shows the stored grid column, not a ratio of invoice amounts', async () => {
    installFetchMock(spec, recordId, { invoiceStatus: 75 });

    render(<Chips {...props(75)} />);

    expect(await screen.findByText(`${invoicedLabel} 75%`)).toBeTruthy();
    // The delivered/received chip keeps its own line-quantity source (1 of 4).
    expect(screen.getByText(`${deliveredLabel} 25%`)).toBeTruthy();
  });

  it('re-reads the column when a document is created, without waiting for the page record', async () => {
    const server = { invoiceStatus: 50 };
    installFetchMock(spec, recordId, server);

    // The record handed down by the page stays at 50 for the whole test.
    render(<Chips {...props(50)} />);
    expect(await screen.findByText(`${invoicedLabel} 50%`)).toBeTruthy();

    server.invoiceStatus = 100;
    await act(async () => {
      window.dispatchEvent(new CustomEvent(`${spec}:document-created`));
    });

    expect(await screen.findByText(`${invoicedLabel} 100%`)).toBeTruthy();
  });

  it('falls back to the page record when the header cannot be re-read', async () => {
    installFetchMock(spec, recordId, { invoiceStatus: null });

    render(<Chips {...props(67)} />);

    expect(await screen.findByText(`${invoicedLabel} 67%`)).toBeTruthy();
  });
});
