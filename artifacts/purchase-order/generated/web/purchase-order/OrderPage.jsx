import { ListView, DetailView } from '@/components/contract-ui';
import OrderTable from './OrderTable';
import OrderForm from './OrderForm';
import OrderLineTable from './OrderLineTable';
import catalogs from './mockCatalogs';

const breadcrumb = 'Purchases / Purchase Order';

// @sf-generated-start summary:order
const summary = [
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  { key: 'summedLineAmount', column: 'TotalLines', type: 'amount' },
  { key: 'priceIncludesTax', column: 'IsTaxIncluded', type: 'boolean' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:order

// @sf-generated-start processes:order
const processes = [

];
// @sf-generated-end processes:order

// @sf-generated-start addLineFields:orderLine
const addLineFields = {
  entry: [
    { key: 'lineNo', column: 'Line', type: 'number', required: true, lookup: true },
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, reference: 'Product', inputMode: 'search' },
    { key: 'operativeQuantity', column: 'Aumqty', type: 'text' },
    { key: 'operativeUOM', column: 'C_Aum', type: 'selector', reference: 'UOM', inputMode: 'selector' },
    { key: 'orderedQuantity', column: 'QtyOrdered', type: 'text', required: true },
    { key: 'description', column: 'Description', type: 'textarea' },
    { key: 'project', column: 'C_Project_ID', type: 'search', reference: 'Project', inputMode: 'search' },
    { key: 'asset', column: 'A_Asset_ID', type: 'selector', reference: 'Asset', inputMode: 'selector' },
    { key: 'stDimension', column: 'User1_ID', type: 'selector', reference: 'UserDimension1', inputMode: 'selector' },
    { key: 'ndDimension', column: 'User2_ID', type: 'selector', reference: 'UserDimension2', inputMode: 'selector' },
  ],
  derived: [
    { key: 'unitPrice', column: 'PriceActual', type: 'text' },
    { key: 'grossUnitPrice', column: 'Gross_Unit_Price', type: 'text' },
    { key: 'lineNetAmount', column: 'LineNetAmt', type: 'number' },
    { key: 'tax', column: 'C_Tax_ID', type: 'selector', reference: 'Tax', inputMode: 'selector' },
    { key: 'discount', column: 'Discount', type: 'text' },
    { key: 'taxableAmount', column: 'Taxbaseamt', type: 'number' },
    { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', reference: 'CostCenter', inputMode: 'selector' },
  ],
};
// @sf-generated-end addLineFields:orderLine

const api = {
  "specName": "purchase-order",
  "baseUrl": "/sws/neo/purchase-order",
  "crud": {
    "order": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/order",
      "detailUrl": "/sws/neo/purchase-order/order/{id}",
      "supportedFilters": [
        "documentStatus",
        "orderDate",
        "businessPartner",
        "orderReference"
      ]
    },
    "orderLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/orderLine",
      "detailUrl": "/sws/neo/purchase-order/orderLine/{id}",
      "supportedFilters": []
    },
    "orderLineTax": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/orderLineTax",
      "detailUrl": "/sws/neo/purchase-order/orderLineTax/{id}",
      "supportedFilters": []
    },
    "reservedStock": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/reservedStock",
      "detailUrl": "/sws/neo/purchase-order/reservedStock/{id}",
      "supportedFilters": []
    },
    "basicDiscounts": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/basicDiscounts",
      "detailUrl": "/sws/neo/purchase-order/basicDiscounts/{id}",
      "supportedFilters": []
    },
    "orderTax": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/orderTax",
      "detailUrl": "/sws/neo/purchase-order/orderTax/{id}",
      "supportedFilters": []
    },
    "paymentPlan": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/paymentPlan",
      "detailUrl": "/sws/neo/purchase-order/paymentPlan/{id}",
      "supportedFilters": []
    },
    "paymentDetails": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/purchase-order/paymentDetails",
      "detailUrl": "/sws/neo/purchase-order/paymentDetails/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "order",
      "field": "transactionDocument",
      "column": "C_DocTypeTarget_ID",
      "reference": "DocumentType",
      "url": "/sws/neo/purchase-order/order/selectors/transactionDocument"
    },
    {
      "entity": "order",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "url": "/sws/neo/purchase-order/order/selectors/businessPartner"
    },
    {
      "entity": "order",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "url": "/sws/neo/purchase-order/order/selectors/partnerAddress"
    },
    {
      "entity": "order",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "url": "/sws/neo/purchase-order/order/selectors/warehouse"
    },
    {
      "entity": "order",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "url": "/sws/neo/purchase-order/order/selectors/paymentMethod"
    },
    {
      "entity": "order",
      "field": "paymentTerms",
      "column": "C_PaymentTerm_ID",
      "reference": "PaymentTerm",
      "url": "/sws/neo/purchase-order/order/selectors/paymentTerms"
    },
    {
      "entity": "order",
      "field": "priceList",
      "column": "M_PriceList_ID",
      "reference": "PriceList",
      "url": "/sws/neo/purchase-order/order/selectors/priceList"
    },
    {
      "entity": "order",
      "field": "invoiceAddress",
      "column": "BillTo_ID",
      "reference": "BusinessPartnerLocation",
      "url": "/sws/neo/purchase-order/order/selectors/invoiceAddress"
    },
    {
      "entity": "order",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "url": "/sws/neo/purchase-order/order/selectors/project"
    },
    {
      "entity": "order",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "CostCenter",
      "url": "/sws/neo/purchase-order/order/selectors/costcenter"
    },
    {
      "entity": "order",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "url": "/sws/neo/purchase-order/order/selectors/asset"
    },
    {
      "entity": "order",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "UserDimension1",
      "url": "/sws/neo/purchase-order/order/selectors/stDimension"
    },
    {
      "entity": "order",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "UserDimension2",
      "url": "/sws/neo/purchase-order/order/selectors/ndDimension"
    },
    {
      "entity": "orderLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "url": "/sws/neo/purchase-order/orderLine/selectors/product"
    },
    {
      "entity": "orderLine",
      "field": "operativeUOM",
      "column": "C_Aum",
      "reference": "UOM",
      "url": "/sws/neo/purchase-order/orderLine/selectors/operativeUOM"
    },
    {
      "entity": "orderLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "url": "/sws/neo/purchase-order/orderLine/selectors/uOM"
    },
    {
      "entity": "orderLine",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "url": "/sws/neo/purchase-order/orderLine/selectors/tax"
    },
    {
      "entity": "orderLine",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "url": "/sws/neo/purchase-order/orderLine/selectors/project"
    },
    {
      "entity": "orderLine",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "CostCenter",
      "url": "/sws/neo/purchase-order/orderLine/selectors/costcenter"
    },
    {
      "entity": "orderLine",
      "field": "asset",
      "column": "A_Asset_ID",
      "reference": "Asset",
      "url": "/sws/neo/purchase-order/orderLine/selectors/asset"
    },
    {
      "entity": "orderLine",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "UserDimension1",
      "url": "/sws/neo/purchase-order/orderLine/selectors/stDimension"
    },
    {
      "entity": "orderLine",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "UserDimension2",
      "url": "/sws/neo/purchase-order/orderLine/selectors/ndDimension"
    },
    {
      "entity": "orderLineTax",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "url": "/sws/neo/purchase-order/orderLineTax/selectors/tax"
    },
    {
      "entity": "reservedStock",
      "field": "reservation",
      "column": "M_Reservation_ID",
      "reference": "Reservation",
      "url": "/sws/neo/purchase-order/reservedStock/selectors/reservation"
    },
    {
      "entity": "reservedStock",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "Locator",
      "url": "/sws/neo/purchase-order/reservedStock/selectors/storageBin"
    },
    {
      "entity": "reservedStock",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "url": "/sws/neo/purchase-order/reservedStock/selectors/businessPartner"
    },
    {
      "entity": "basicDiscounts",
      "field": "discount",
      "column": "C_Discount_ID",
      "reference": "Discount",
      "url": "/sws/neo/purchase-order/basicDiscounts/selectors/discount"
    },
    {
      "entity": "orderTax",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "url": "/sws/neo/purchase-order/orderTax/selectors/tax"
    },
    {
      "entity": "paymentPlan",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "url": "/sws/neo/purchase-order/paymentPlan/selectors/paymentMethod"
    },
    {
      "entity": "paymentPlan",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "url": "/sws/neo/purchase-order/paymentPlan/selectors/currency"
    },
    {
      "entity": "paymentDetails",
      "field": "payment",
      "column": "FIN_Payment_ID",
      "reference": "Payment",
      "url": "/sws/neo/purchase-order/paymentDetails/selectors/payment"
    },
    {
      "entity": "paymentDetails",
      "field": "paymentMethod",
      "column": "Fin_Paymentmethod_ID",
      "reference": "PaymentMethod",
      "url": "/sws/neo/purchase-order/paymentDetails/selectors/paymentMethod"
    },
    {
      "entity": "paymentDetails",
      "field": "finFinancialAccountID",
      "column": "Fin_Financial_Account_ID",
      "reference": "FinancialAccount",
      "url": "/sws/neo/purchase-order/paymentDetails/selectors/finFinancialAccountID"
    }
  ],
  "actions": [],
  "queryParams": {
    "pagination": {
      "startRow": "_startRow",
      "endRow": "_endRow",
      "default": "0-100"
    },
    "sorting": {
      "param": "_sortBy",
      "example": "_sortBy=purchase-orderDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:OrderPage
export default function OrderPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:OrderPage
  if (recordId) {
    return (
      <DetailView
        entity="order"
        detailEntity="orderLine"
        Form={OrderForm}
        DetailTable={OrderLineTable}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Order"
        detailLabel="Order Line"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="order"
      Table={OrderTable}
      entityLabel="Orders"
      windowName={windowName}
      breadcrumb={breadcrumb}
      {...props}
    />
  );
}
// @sf-generated-end component:OrderPage

// @sf-custom-slot section:OrderPage-custom
