import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import CustomerReturnTable from './CustomerReturnTable';
import CustomerReturnForm from './CustomerReturnForm';
import CustomerReturnLineTable from './CustomerReturnLineTable';
import CustomerReturnLineForm from './CustomerReturnLineForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import catalogs from './mockCatalogs';

const breadcrumb = 'Sales / Returns';

// @sf-generated-start summary:customerReturn
const summary = [
  { key: 'summedLineAmount', column: 'TotalLines', type: 'amount' },
  { key: 'grandTotalAmount', column: 'GrandTotal', type: 'amount' },
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:customerReturn

// @sf-generated-start processes:customerReturn
const processes = [
  { name: 'Process Return', label: 'Complete Return', style: 'positive', columnName: 'documentAction' },
];
// @sf-generated-end processes:customerReturn

// @sf-generated-start addLineFields:customerReturnLine
const addLineFields = { entry: [], derived: [], hidden: [] };
// @sf-generated-end addLineFields:customerReturnLine

const api = {
  "specName": "return-from-customer",
  "baseUrl": "/sws/neo/return-from-customer",
  "crud": {
    "customerReturn": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/return-from-customer/customerReturn",
      "detailUrl": "/sws/neo/return-from-customer/customerReturn/{id}",
      "supportedFilters": [
        "documentStatus",
        "documentNo",
        "orderDate",
        "businessPartner"
      ]
    },
    "customerReturnLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/return-from-customer/customerReturnLine",
      "detailUrl": "/sws/neo/return-from-customer/customerReturnLine/{id}",
      "supportedFilters": [
        "goodsShipmentLine"
      ]
    }
  },
  "selectors": [
    {
      "entity": "customerReturn",
      "field": "cReturnReasonID",
      "column": "C_Return_Reason_ID",
      "reference": "Return_Reason",
      "inputMode": "search",
      "url": "/sws/neo/return-from-customer/customerReturn/selectors/cReturnReasonID"
    },
    {
      "entity": "customerReturn",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/return-from-customer/customerReturn/selectors/businessPartner"
    },
    {
      "entity": "customerReturn",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BPartner_Location",
      "inputMode": "dependent",
      "url": "/sws/neo/return-from-customer/customerReturn/selectors/partnerAddress"
    },
    {
      "entity": "customerReturn",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "search",
      "url": "/sws/neo/return-from-customer/customerReturn/selectors/warehouse"
    },
    {
      "entity": "customerReturn",
      "field": "salesRepresentative",
      "column": "SalesRep_ID",
      "reference": "User",
      "inputMode": "selector",
      "url": "/sws/neo/return-from-customer/customerReturn/selectors/salesRepresentative"
    },
    {
      "entity": "customerReturnLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/return-from-customer/customerReturnLine/selectors/product"
    },
    {
      "entity": "customerReturnLine",
      "field": "cReturnReasonID",
      "column": "C_Return_Reason_ID",
      "reference": "Return_Reason",
      "inputMode": "search",
      "url": "/sws/neo/return-from-customer/customerReturnLine/selectors/cReturnReasonID"
    },
    {
      "entity": "customerReturnLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/return-from-customer/customerReturnLine/selectors/uOM"
    },
    {
      "entity": "customerReturnLine",
      "field": "tax",
      "column": "C_Tax_ID",
      "reference": "Tax",
      "inputMode": "selector",
      "url": "/sws/neo/return-from-customer/customerReturnLine/selectors/tax"
    },
    {
      "entity": "customerReturnLine",
      "field": "goodsShipmentLine",
      "column": "M_Inoutline_ID",
      "reference": "InOutLine",
      "inputMode": "search",
      "url": "/sws/neo/return-from-customer/customerReturnLine/selectors/goodsShipmentLine"
    }
  ],
  "actions": [
    {
      "entity": "customerReturn",
      "field": "rMReceiveMaterials",
      "column": "RM_ReceiveMaterials",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/rMReceiveMaterials"
    },
    {
      "entity": "customerReturn",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/documentAction"
    },
    {
      "entity": "customerReturn",
      "field": "rMAddOrphanLine",
      "column": "RM_AddOrphanLine",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/rMAddOrphanLine"
    },
    {
      "entity": "customerReturn",
      "field": "rMPickFromShipment",
      "column": "RM_PickFromShipment",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/rMPickFromShipment"
    },
    {
      "entity": "customerReturn",
      "field": "rMCreateInvoice",
      "column": "RM_CreateInvoice",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/rMCreateInvoice"
    },
    {
      "entity": "customerReturn",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/processNow"
    },
    {
      "entity": "customerReturn",
      "field": "copyFrom",
      "column": "CopyFrom",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/copyFrom"
    },
    {
      "entity": "customerReturn",
      "field": "generateTemplate",
      "column": "Generatetemplate",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/generateTemplate"
    },
    {
      "entity": "customerReturn",
      "field": "copyFromPO",
      "column": "CopyFromPO",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/copyFromPO"
    },
    {
      "entity": "customerReturn",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/posted"
    },
    {
      "entity": "customerReturn",
      "field": "calculatePromotions",
      "column": "Calculate_Promotions",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/calculatePromotions"
    },
    {
      "entity": "customerReturn",
      "field": "cancelandreplace",
      "column": "Cancelandreplace",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/cancelandreplace"
    },
    {
      "entity": "customerReturn",
      "field": "confirmcancelandreplace",
      "column": "Confirmcancelandreplace",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/confirmcancelandreplace"
    },
    {
      "entity": "customerReturn",
      "field": "createOrder",
      "column": "Convertquotation",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/createOrder"
    },
    {
      "entity": "customerReturn",
      "field": "createPOLines",
      "column": "Create_POLines",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/createPOLines"
    },
    {
      "entity": "customerReturn",
      "field": "aPRMAddPayment",
      "column": "EM_APRM_AddPayment",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/aPRMAddPayment"
    },
    {
      "entity": "customerReturn",
      "field": "rMPickfromreceipt",
      "column": "RM_Pickfromreceipt",
      "url": "/sws/neo/return-from-customer/customerReturn/{id}/action/rMPickfromreceipt"
    },
    {
      "entity": "customerReturnLine",
      "field": "selectOrderLine",
      "column": "Relate_Orderline",
      "url": "/sws/neo/return-from-customer/customerReturnLine/{id}/action/selectOrderLine"
    },
    {
      "entity": "customerReturnLine",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/return-from-customer/customerReturnLine/{id}/action/explode"
    },
    {
      "entity": "customerReturnLine",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/return-from-customer/customerReturnLine/{id}/action/managePrereservation"
    },
    {
      "entity": "customerReturnLine",
      "field": "manageReservation",
      "column": "Manage_Reservation",
      "url": "/sws/neo/return-from-customer/customerReturnLine/{id}/action/manageReservation"
    }
  ],
  "queryParams": {
    "pagination": {
      "startRow": "_startRow",
      "endRow": "_endRow",
      "default": "0-100"
    },
    "sorting": {
      "param": "_sortBy",
      "example": "_sortBy=return-from-customerDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:CustomerReturnPage
export default function CustomerReturnPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:CustomerReturnPage
  if (recordId) {
    return (
      <DetailView
        entity="customerReturn"
        detailEntity="customerReturnLine"
        Form={CustomerReturnForm}
        DetailTable={CustomerReturnLineTable}
        DetailForm={CustomerReturnLineForm}
        summary={summary}
        statusField={statusField}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Customer Return"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
        notesField="description"
        documentPreview={{ titlePrefix: 'Return', pdfUrl: null }}
        customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}
        api={api}
        hideDeleteWhenComplete
        menuActions={() => []}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="customerReturn"
      Table={CustomerReturnTable}
      entityLabel="Customer Returns"
      windowName={windowName}
      breadcrumb={breadcrumb}
      hideCreate
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:CustomerReturnPage

// @sf-custom-slot section:CustomerReturnPage-custom
