// @covers tools/app-shell/src/components/related-documents/purchaseRelatedDocs.js
// ETP-5527 — the acceptance criterion itself: for the same record, the form's "Related
// documents" section (the real artifacts/<spec>/custom/RelatedDocuments.jsx wrapper) and the
// list preview's RelatedDocumentsCard (given the same shared definition, loading the detail
// record itself as the previews do) show the same documents — same titles, same destinations,
// same order — and offer a refresh button only when the definition has something to refetch.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const navigate = vi.hoisted(() => vi.fn());
const backend = vi.hoisted(() => ({ byCriteria: {}, byId: {}, listInvoices: {} }));

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params?.number == null ? key : `${key} ${params.number}`),
}));
vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ label }) => <span data-testid="status-tag">{label}</span>,
}));
vi.mock('@/components/related-documents/helpers.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchByCriteria: vi.fn(async (spec, entity, field, value) => backend.byCriteria[`${spec}/${entity}?${field}=${value}`] ?? []),
  fetchById: vi.fn(async (spec, entity, id) => backend.byId[`${spec}/${entity}/${id}`] ?? null),
  fetchOriginInvoicesOf: vi.fn((spec) => async ({ record }) => {
    const ids = Array.isArray(record?.originInvoices) ? record.originInvoices.map(o => o?.id).filter(Boolean) : [];
    return ids.map(id => backend.byId[`${spec}/header/${id}`]).filter(Boolean);
  }),
  fetchListInvoices: vi.fn(async (spec, entity, id) => backend.listInvoices[`${spec}/${entity}/${id}`] ?? []),
}));

import { render, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { SALES_RELATED_DOCS } from '../salesRelatedDocs.js';
import { PURCHASE_RELATED_DOCS } from '../purchaseRelatedDocs.js';
import RelatedDocumentsCard from '@/windows/custom/shared/preview-cards/RelatedDocumentsCard.jsx';
import QuotationForm from '@generated/sales-quotation/custom/RelatedDocuments.jsx';
import OrderForm from '@generated/sales-order/custom/RelatedDocuments.jsx';
import InvoiceForm from '@generated/sales-invoice/custom/RelatedDocuments.jsx';
import ShipmentForm from '@generated/goods-shipment/custom/RelatedDocuments.jsx';
import ReturnForm from '@generated/return-material-receipt/custom/RelatedDocuments.jsx';
import PurchaseOrderForm from '@generated/purchase-order/custom/RelatedDocuments.jsx';
import PurchaseInvoiceForm from '@/windows/custom/purchase-invoice/RelatedDocuments.jsx';
import GoodsReceiptForm from '@/windows/custom/goods-receipt/RelatedDocuments.jsx';
import ReturnToVendorForm from '@generated/return-to-vendor-shipment/custom/RelatedDocuments.jsx';

const doc = (id, documentNo, extra = {}) => ({ id, documentNo, documentStatus: 'CO', ...extra });

// Rows of a rendered section/card: "<destination> | <title>", read by clicking each document.
function readRows(container) {
  return [...container.querySelectorAll('button')]
    .filter((btn) => btn.querySelector('.font-medium'))
    .map((btn) => {
      fireEvent.click(btn);
      return `${navigate.mock.calls.at(-1)[0]} | ${btn.querySelector('.font-medium').textContent}`;
    });
}
const hasRefreshButton = (container) =>
  [...container.querySelectorAll('button')].some((btn) => !btn.querySelector('.font-medium'));

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

describe('Related documents — form section and list preview show the same documents', () => {
  it.each([
    // ETP-5539 — the four purchase documents.
    {
      spec: 'purchase-order',
      Form: PurchaseOrderForm,
      record: { id: 'po1' },
      data: {
        byCriteria: { 'goods-receipt/goodsReceipt?salesOrder=po1': [doc('g1', 'GR-1')] },
        listInvoices: { 'purchase-order/header/po1': [doc('pi1', 'PINV-1')] },
      },
      expected: ['/goods-receipt/g1 | receiptDoc GR-1', '/purchase-invoice/pi1 | invoiceDoc PINV-1'],
      refreshable: true,
    },
    {
      spec: 'purchase-invoice',
      Form: PurchaseInvoiceForm,
      record: {
        id: 'pi1',
        salesOrder: 'po1',
        linkedReceipts: [doc('g1', 'GR-1', { isReturn: false }), doc('r1', 'RTV-1', { isReturn: true })],
        originInvoices: [{ id: 'pi0' }],
      },
      data: {
        byId: {
          'purchase-order/header/po1': doc('po1', 'PO-1'),
          'purchase-invoice/header/pi0': doc('pi0', 'PINV-0'),
        },
      },
      expected: [
        '/purchase-order/po1 | orderDoc PO-1',
        '/goods-receipt/g1 | receiptDoc GR-1',
        '/return-to-vendor-shipment/r1 | returnDoc RTV-1',
        '/purchase-invoice/pi0 | invoiceDoc PINV-0',
      ],
      refreshable: true,
    },
    {
      spec: 'goods-receipt',
      Form: GoodsReceiptForm,
      record: {
        id: 'g1',
        linkedOrders: [doc('po1', 'PO-1')],
        linkedInvoices: [doc('pi1', 'PINV-1')],
        linkedReturns: [doc('r1', 'RTV-1')],
      },
      data: {},
      expected: [
        '/purchase-order/po1 | orderDoc PO-1',
        '/purchase-invoice/pi1 | invoiceDoc PINV-1',
        '/return-to-vendor-shipment/r1 | returnDoc RTV-1',
      ],
      refreshable: false,
    },
    {
      spec: 'return-to-vendor-shipment',
      Form: ReturnToVendorForm,
      record: { id: 'r1', sourceReceipts: [doc('g1', 'GR-1')], returnInvoices: [doc('pi1', 'PINV-1')] },
      data: {},
      expected: ['/goods-receipt/g1 | receiptDoc GR-1', '/purchase-invoice/pi1 | invoiceDoc PINV-1'],
      refreshable: false,
    },
    {
      spec: 'sales-quotation',
      Form: QuotationForm,
      record: { id: 'q1' },
      data: {
        byCriteria: { 'sales-order/header?quotation=q1': [doc('o1', 'SO-1')] },
        listInvoices: { 'sales-quotation/quotation/q1': [doc('i1', 'INV-1')] },
      },
      expected: ['/sales-order/o1 | orderDoc SO-1', '/sales-invoice/i1 | invoiceDoc INV-1'],
      refreshable: true,
    },
    {
      spec: 'sales-order',
      Form: OrderForm,
      record: { id: 'o1', quotation: 'q1' },
      data: {
        byId: { 'sales-quotation/quotation/q1': doc('q1', 'QU-1', { documentStatus: 'CA' }) },
        byCriteria: { 'goods-shipment/goodsShipment?salesOrder=o1': [doc('s1', 'SH-1')] },
        listInvoices: { 'sales-order/header/o1': [doc('i1', 'INV-1')] },
      },
      expected: [
        '/sales-quotation/q1 | quotationDoc QU-1',
        '/goods-shipment/s1 | shipmentDoc SH-1',
        '/sales-invoice/i1 | invoiceDoc INV-1',
      ],
      refreshable: true,
    },
    {
      spec: 'sales-invoice',
      Form: InvoiceForm,
      record: {
        id: 'i1',
        salesOrder: 'o1',
        linkedShipments: [doc('s1', 'SH-1', { isReturn: false }), doc('r1', 'RET-1', { isReturn: true })],
        sourceInvoice: doc('i0', 'INV-0'),
      },
      data: { byId: { 'sales-order/header/o1': doc('o1', 'SO-1') } },
      expected: [
        '/sales-order/o1 | orderDoc SO-1',
        '/goods-shipment/s1 | shipmentDoc SH-1',
        '/return-material-receipt/r1 | returnDoc RET-1',
        '/sales-invoice/i0 | invoiceDoc INV-0',
      ],
      refreshable: true,
    },
    {
      spec: 'goods-shipment',
      Form: ShipmentForm,
      record: {
        id: 's1',
        linkedOrders: [doc('o1', 'SO-1')],
        linkedInvoices: [doc('i1', 'INV-1')],
        returnReceipts: [doc('r1', 'RET-1')],
      },
      data: {},
      expected: [
        '/sales-order/o1 | orderDoc SO-1',
        '/sales-invoice/i1 | invoiceDoc INV-1',
        '/return-material-receipt/r1 | returnDoc RET-1',
      ],
      refreshable: false,
    },
    {
      spec: 'return-material-receipt',
      Form: ReturnForm,
      record: { id: 'r1', sourceShipments: [doc('s1', 'SH-1')], returnInvoices: [doc('i1', 'INV-1')] },
      data: {},
      expected: ['/goods-shipment/s1 | shipmentDoc SH-1', '/sales-invoice/i1 | invoiceDoc INV-1'],
      refreshable: false,
    },
  ])('$spec', async ({ spec, Form, record, data, expected, refreshable }) => {
    const definition = SALES_RELATED_DOCS[spec] ?? PURCHASE_RELATED_DOCS[spec];
    Object.assign(backend, { byCriteria: {}, listInvoices: {}, ...data });
    // The preview only holds the list row: the card loads the detail record by id.
    backend.byId = { ...data.byId, [`${definition.spec}/${definition.entity}/${record.id}`]: record };
    const apiBaseUrl = `/sws/neo/${spec}`;

    const form = render(<Form recordId={record.id} data={record} token="tok" apiBaseUrl={apiBaseUrl} />);
    const preview = render(
      <RelatedDocumentsCard documentId={record.id} token="tok" apiBaseUrl={apiBaseUrl} definition={definition} />,
    );

    await waitFor(() => expect(readRows(form.container)).toEqual(expected));
    await waitFor(() => expect(readRows(preview.container)).toEqual(expected));
    expect(hasRefreshButton(form.container)).toBe(refreshable);
    expect(hasRefreshButton(preview.container)).toBe(refreshable);
  });
});
