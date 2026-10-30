/**
 * ETP-5988 — Sample sales invoice used by Settings → Printable documents to preview a template
 * variant. Fictitious data in the shape `buildInvoiceData` produces, so the preview goes through
 * the same renderer (`renderDocumentHtml`) as a real document.
 */
export const SAMPLE_INVOICE_DATA = {
  companyName: 'Acme Corporation S.L.',
  companyCityLine: '28001 Madrid',
  companyTaxId: 'B12345678',
  companyLogoDataUrl: null,
  documentNo: 'F-2026/0001',
  currencyCode: 'EUR',
  invoiceDate: '2026-01-15',
  paymentTerms: '30 días',
  paymentMethod: 'Transferencia',
  customerName: 'Cliente de ejemplo S.A.',
  hasCustomerAddress: true,
  customerAddressLines: ['Calle Mayor 1', '08001 Barcelona'],
  notes: null,
  lines: [
    { lineNo: 10, productCode: 'PRD-001', productName: 'Servicio de consultoría', quantity: 10, unitPrice: 80, discount: null, taxName: 'IVA 21%', lineTotal: 800 },
    { lineNo: 20, productCode: 'PRD-002', productName: 'Licencia anual', quantity: 1, unitPrice: 450, discount: null, taxName: 'IVA 21%', lineTotal: 450 },
    { lineNo: 30, productCode: 'PRD-003', productName: 'Soporte y mantenimiento', quantity: 2, unitPrice: 125, discount: null, taxName: 'IVA 21%', lineTotal: 250 },
  ],
  netAmount: 1500,
  taxAmount: 315,
  grandTotal: 1815,
  grossAmount: null,
  discountPerProduct: null,
  etgoTotalDiscount: null,
  totalDiscountAmt: null,
  exchangeRate: null,
  orgCurrencyCode: null,
  orgGrandTotal: null,
  rateDecimals: 4,
};
