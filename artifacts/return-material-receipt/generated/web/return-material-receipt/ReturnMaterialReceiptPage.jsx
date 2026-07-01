import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import ReturnMaterialReceiptTable from './ReturnMaterialReceiptTable';
import ReturnMaterialReceiptForm from './ReturnMaterialReceiptForm';
import ReturnMaterialReceiptLineTable from './ReturnMaterialReceiptLineTable';
import ReturnMaterialReceiptLineForm from './ReturnMaterialReceiptLineForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import { AttachmentsTab } from '@/components/attachments';
import ReturnMaterialReceiptBottomPanel from '../../../custom/ReturnMaterialReceiptBottomPanel';
import ConfirmWithCreditButton from '@/windows/custom/return-material-receipt/ConfirmWithCreditButton';
import catalogs from './mockCatalogs';


const breadcrumb = 'Sales / Return Material Receipt';


// @sf-generated-start summary:returnMaterialReceipt
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'sourceShipmentDocNo', column: 'sourceShipmentDocNo', type: 'string' },
  { key: 'etblkpAccountingstatus', column: 'EM_Etblkp_Accountingstatus', type: 'status' },
  { key: 'etblkpBulkposting', column: 'EM_Etblkp_Bulkposting', type: 'string' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:returnMaterialReceipt

// @sf-generated-start extraBadges:returnMaterialReceipt
const extraBadges = [

];
// @sf-generated-end extraBadges:returnMaterialReceipt

// @sf-generated-start processes:returnMaterialReceipt
const processes = [
  { name: 'etblkpBulkposting', label: 'Bulk Posting', style: 'positive',
    displayLogicRaw: "@Processed@='Y' & @#ShowAcct@='Y'\n" },
];
// @sf-generated-end processes:returnMaterialReceipt

// @sf-generated-start draftMode:returnMaterialReceipt
const draftMode = null;
// @sf-generated-end draftMode:returnMaterialReceipt

// @sf-generated-start requiredHeaderFields:returnMaterialReceipt
const requiredHeaderFields = ['documentNo', 'movementDate', 'businessPartner', 'warehouse', 'partnerAddress', 'etblkpAccountingstatus', 'etblkpBulkposting'];
// @sf-generated-end requiredHeaderFields:returnMaterialReceipt

// @sf-generated-start addLineFields:returnMaterialReceiptLine
const addLineFields = {
  entry: [
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:returnMaterialReceiptLine

export const api = {
  "specName": "return-material-receipt",
  "baseUrl": "/sws/neo/return-material-receipt",
  "crud": {
    "returnMaterialReceipt": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/return-material-receipt/returnMaterialReceipt",
      "detailUrl": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}",
      "supportedFilters": [
        "documentNo",
        "movementDate",
        "businessPartner",
        "documentStatus"
      ]
    },
    "returnMaterialReceiptLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/return-material-receipt/returnMaterialReceiptLine",
      "detailUrl": "/sws/neo/return-material-receipt/returnMaterialReceiptLine/{id}",
      "supportedFilters": [
        "product"
      ]
    }
  },
  "selectors": [
    {
      "entity": "returnMaterialReceipt",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/selectors/businessPartner"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "search",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/selectors/warehouse"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/selectors/partnerAddress",
      "context": {
        "required": [
          {
            "param": "C_BPartner_ID",
            "source": "field",
            "field": "businessPartner"
          }
        ]
      }
    },
    {
      "entity": "returnMaterialReceiptLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceiptLine/selectors/product"
    },
    {
      "entity": "returnMaterialReceiptLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "search",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceiptLine/selectors/uOM"
    },
    {
      "entity": "returnMaterialReceiptLine",
      "field": "salesOrderLine",
      "column": "C_OrderLine_ID",
      "reference": "OrderLine",
      "inputMode": "search",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceiptLine/selectors/salesOrderLine"
    }
  ],
  "actions": [
    {
      "entity": "returnMaterialReceipt",
      "field": "receiveMaterials",
      "column": "RM_Receipt_PickEdit",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/receiveMaterials",
      "processId": "5E9F9D7EECC24E4FBB2C60840FF613BE",
      "processType": "obuiapp"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/createLinesFrom"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/documentAction",
      "processId": "109",
      "processType": "classic"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/posted"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "calculateFreight",
      "column": "Calculate_Freight",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/calculateFreight",
      "processId": "800141",
      "processType": "classic"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "sendMaterials",
      "column": "RM_Shipment_Pickedit",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/sendMaterials",
      "processId": "4AD70293357245AB96E59C2CDB43A35D",
      "processType": "obuiapp"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/generateTo",
      "processId": "154",
      "processType": "classic"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "updateLines",
      "column": "UpdateLines",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/updateLines",
      "processId": "800010",
      "processType": "classic"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "invoicefromshipment",
      "column": "Invoicefromshipment",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/invoicefromshipment",
      "processId": "62250E8866EA4D96A66C309878DC039E",
      "processType": "obuiapp"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "processGoodsJava",
      "column": "Process_Goods_Java",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/processGoodsJava",
      "processId": "49DEE812BF0545269781FCEBF2235924",
      "processType": "classic"
    },
    {
      "entity": "returnMaterialReceipt",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceipt/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "returnMaterialReceiptLine",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceiptLine/{id}/action/explode",
      "processId": "DAE719940FE9463F8A3E3C401BBAFC53",
      "processType": "classic"
    },
    {
      "entity": "returnMaterialReceiptLine",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/return-material-receipt/returnMaterialReceiptLine/{id}/action/managePrereservation",
      "processId": "70E42AD47E5F4698A9ACCCAF3EB72B9E",
      "processType": "obuiapp"
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
      "example": "_sortBy=creationDate desc"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  },
  "window": {
    "category": "sales"
  },
  "labelOverrides": {
    "es_ES": {
      "sourceShipmentDocNo": "Albarán origen",
      "movementQuantity": "Cant. a devolver",
      "orderQuantity": "Cant. entregada original"
    },
    "en_US": {
      "sourceShipmentDocNo": "Source Shipment",
      "movementQuantity": "Return Qty",
      "orderQuantity": "Original Delivered Qty"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:ReturnMaterialReceiptPage
export default function ReturnMaterialReceiptPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="returnMaterialReceipt"
        detailEntity="returnMaterialReceiptLine"
        Form={ReturnMaterialReceiptForm}
        DetailTable={ReturnMaterialReceiptLineTable}
        DetailForm={ReturnMaterialReceiptLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Return Material Receipt"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hideDeleteWhenComplete
        noHeaderBorder
        notesField="description"
        customTabs={[{ key: 'related', labelKey: 'relatedDocuments', Component: RelatedDocuments }, { key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "M_InOut", config: {} } }]}
        bottomSection={ReturnMaterialReceiptBottomPanel}
        topbarRight={ConfirmWithCreditButton}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        linesLayout="inlineEditable"
        sendDocument
        {...props}
      />
      </>
    );
  }

  return (
    <ListView
      entity="returnMaterialReceipt"
      Table={ReturnMaterialReceiptTable}
      entityLabel="Return Material Receipt"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      dateFilterKey="movementDate"
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      sendDocument
      {...props}
    />
  );
}
// @sf-generated-end component:ReturnMaterialReceiptPage
