import { ListView } from '@/components/contract-ui';
import HeaderTable from '@generated/purchase-order/generated/web/purchase-order/HeaderTable';
import LinesTable from '@generated/purchase-order/generated/web/purchase-order/LinesTable';
import PaymentPlanTable from '@generated/purchase-order/generated/web/purchase-order/PaymentPlanTable';
import PaymentPlanForm from '@generated/purchase-order/generated/web/purchase-order/PaymentPlanForm';
import GeneratedApp from '@generated/purchase-order/generated/web/purchase-order/index.jsx';
import RelatedDocuments from './RelatedDocuments.jsx';
import PurchaseOrderTopbar from './PurchaseOrderTopbar.jsx';

// Simplified list columns aligned with Sales Order visual style
const LIST_COLUMNS = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string', label: 'Document No.' },
  { key: 'orderDate', column: 'DateOrdered', type: 'date', label: 'Order Date' },
  { key: 'businessPartner', column: 'C_BPartner_ID', type: 'string', label: 'Business Partner' },
  { key: 'documentStatus', column: 'DocStatus', type: 'status', label: 'Document Status', display: 'dot' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount', label: 'Total Gross Amount' },
  { key: 'deliveryStatusPurchase', column: 'DeliveryStatusPurchase', type: 'percent', label: 'Delivery Status' },
  { key: 'invoiceStatus', column: 'InvoiceStatus', type: 'percent', label: 'Invoice Status' },
];

// Lines table columns without lineNo
const LINES_COLUMNS = [
  { key: 'product', column: 'M_Product_ID', type: 'string', label: 'Product' },
  { key: 'orderedQuantity', column: 'QtyOrdered', type: 'number', label: 'Ordered Quantity' },
  { key: 'uOM', column: 'C_UOM_ID', type: 'string', label: 'UOM' },
  { key: 'unitPrice', column: 'PriceActual', type: 'number', label: 'Net Unit Price' },
  { key: 'lineNetAmount', column: 'LineNetAmt', type: 'amount', label: 'Line Net Amount' },
  { key: 'tax', column: 'C_Tax_ID', type: 'string', label: 'Tax' },
  { key: 'discount', column: 'Discount', type: 'number', label: 'Discount %' },
];

// Only keep Payment Plan tab (remove Basic Discounts, Line Tax, Prereserved Qty)
const SECONDARY_TABS = [
  { key: 'paymentPlan', label: 'Payment Plan', Table: PaymentPlanTable, Form: PaymentPlanForm },
];

function CustomHeaderTable(props) {
  return <HeaderTable columns={LIST_COLUMNS} {...props} />;
}

function CustomLinesTable(props) {
  return <LinesTable columns={LINES_COLUMNS} {...props} />;
}

export default function PurchaseOrderWindow(props) {
  const { recordId, windowName } = props;

  if (recordId) {
    return (
      <GeneratedApp
        {...props}
        DetailTable={CustomLinesTable}
        secondaryTabs={SECONDARY_TABS}
        notesField="description"
        topbarExtra={PurchaseOrderTopbar}
        customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}
      />
    );
  }

  return (
    <ListView
      entity="header"
      Table={CustomHeaderTable}
      entityLabel="Purchase Order"
      windowName={windowName}
      breadcrumb="Purchases / Purchase Order"
      {...props}
    />
  );
}
