import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import HeaderTable from './HeaderTable';
import HeaderForm from './HeaderForm';
import LinesTable from './LinesTable';
import LinesForm from './LinesForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import ReturnToVendorShipmentBottomPanel from '../../../custom/ReturnToVendorShipmentBottomPanel';
import catalogs from './mockCatalogs';


const breadcrumb = 'Purchases / Return to Vendor Shipment';


// @sf-generated-start summary:header
const summary = [

];

const statusField = 'documentStatus';
// @sf-generated-end summary:header

// @sf-generated-start extraBadges:header
const extraBadges = [];
// @sf-generated-end extraBadges:header

// @sf-generated-start processes:header
const processes = [
  { name: 'sendMaterials', label: 'Pick/Edit Lines', style: 'positive',
    displayLogicRaw: "@Processed@='N'" },
  { name: 'documentAction', label: 'Process Shipment', style: 'positive',
    displayLogicRaw: "@DocStatus@!'CL'&@DocStatus@!'VO'" },
];
// @sf-generated-end processes:header

// @sf-generated-start draftMode:header
const draftMode = null;
// @sf-generated-end draftMode:header

// @sf-generated-start requiredHeaderFields:header
const requiredHeaderFields = ['businessPartner', 'partnerAddress', 'movementDate', 'accountingDate', 'warehouse', 'documentStatus', 'documentAction'];
// @sf-generated-end requiredHeaderFields:header

// @sf-generated-start addLineFields:lines
const addLineFields = {
  entry: [
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
    { key: 'project', column: 'C_Project_ID', type: 'search', lookup: true, label: 'Project', reference: 'Project', inputMode: 'search' },
    { key: 'costcenter', column: 'C_Costcenter_ID', type: 'selector', label: 'Cost Center', reference: 'Costcenter', inputMode: 'selector' },
    { key: 'stDimension', column: 'User1_ID', type: 'selector', label: '1st Dimension', reference: 'User1', inputMode: 'selector' },
    { key: 'ndDimension', column: 'User2_ID', type: 'selector', label: '2nd Dimension', reference: 'User2', inputMode: 'selector' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:lines

export const api = {
  "specName": "return-to-vendor-shipment",
  "baseUrl": "/sws/neo/return-to-vendor-shipment",
  "crud": {
    "header": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/return-to-vendor-shipment/header",
      "detailUrl": "/sws/neo/return-to-vendor-shipment/header/{id}",
      "supportedFilters": []
    },
    "lines": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/return-to-vendor-shipment/lines",
      "detailUrl": "/sws/neo/return-to-vendor-shipment/lines/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "header",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BPartner",
      "inputMode": "search",
      "url": "/sws/neo/return-to-vendor-shipment/header/selectors/businessPartner"
    },
    {
      "entity": "header",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BPartner_Location",
      "inputMode": "selector",
      "url": "/sws/neo/return-to-vendor-shipment/header/selectors/partnerAddress"
    },
    {
      "entity": "header",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "selector",
      "url": "/sws/neo/return-to-vendor-shipment/header/selectors/warehouse"
    },
    {
      "entity": "header",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/return-to-vendor-shipment/header/selectors/project"
    },
    {
      "entity": "header",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "Costcenter",
      "inputMode": "selector",
      "url": "/sws/neo/return-to-vendor-shipment/header/selectors/costcenter"
    },
    {
      "entity": "header",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "User1",
      "inputMode": "selector",
      "url": "/sws/neo/return-to-vendor-shipment/header/selectors/stDimension"
    },
    {
      "entity": "header",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "User2",
      "inputMode": "selector",
      "url": "/sws/neo/return-to-vendor-shipment/header/selectors/ndDimension"
    },
    {
      "entity": "lines",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/return-to-vendor-shipment/lines/selectors/product"
    },
    {
      "entity": "lines",
      "field": "operativeUOM",
      "column": "C_Aum",
      "reference": "UOM",
      "inputMode": "search",
      "url": "/sws/neo/return-to-vendor-shipment/lines/selectors/operativeUOM"
    },
    {
      "entity": "lines",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/return-to-vendor-shipment/lines/selectors/uOM"
    },
    {
      "entity": "lines",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "Locator",
      "inputMode": "selector",
      "url": "/sws/neo/return-to-vendor-shipment/lines/selectors/storageBin"
    },
    {
      "entity": "lines",
      "field": "salesOrderLine",
      "column": "C_OrderLine_ID",
      "reference": "OrderLine",
      "inputMode": "search",
      "url": "/sws/neo/return-to-vendor-shipment/lines/selectors/salesOrderLine"
    },
    {
      "entity": "lines",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/return-to-vendor-shipment/lines/selectors/project"
    },
    {
      "entity": "lines",
      "field": "costcenter",
      "column": "C_Costcenter_ID",
      "reference": "Costcenter",
      "inputMode": "selector",
      "url": "/sws/neo/return-to-vendor-shipment/lines/selectors/costcenter"
    },
    {
      "entity": "lines",
      "field": "stDimension",
      "column": "User1_ID",
      "reference": "User1",
      "inputMode": "selector",
      "url": "/sws/neo/return-to-vendor-shipment/lines/selectors/stDimension"
    },
    {
      "entity": "lines",
      "field": "ndDimension",
      "column": "User2_ID",
      "reference": "User2",
      "inputMode": "selector",
      "url": "/sws/neo/return-to-vendor-shipment/lines/selectors/ndDimension"
    }
  ],
  "actions": [
    {
      "entity": "header",
      "field": "sendMaterials",
      "column": "RM_Shipment_Pickedit",
      "url": "/sws/neo/return-to-vendor-shipment/header/{id}/action/sendMaterials",
      "processId": "4AD70293357245AB96E59C2CDB43A35D",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/return-to-vendor-shipment/header/{id}/action/createLinesFrom"
    },
    {
      "entity": "header",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/return-to-vendor-shipment/header/{id}/action/generateTo",
      "processId": "154",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/return-to-vendor-shipment/header/{id}/action/documentAction",
      "processId": "109",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/return-to-vendor-shipment/header/{id}/action/posted"
    },
    {
      "entity": "header",
      "field": "calculateFreight",
      "column": "Calculate_Freight",
      "url": "/sws/neo/return-to-vendor-shipment/header/{id}/action/calculateFreight",
      "processId": "800141",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "receiveMaterials",
      "column": "RM_Receipt_PickEdit",
      "url": "/sws/neo/return-to-vendor-shipment/header/{id}/action/receiveMaterials",
      "processId": "5E9F9D7EECC24E4FBB2C60840FF613BE",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "updateLines",
      "column": "UpdateLines",
      "url": "/sws/neo/return-to-vendor-shipment/header/{id}/action/updateLines",
      "processId": "800010",
      "processType": "classic"
    },
    {
      "entity": "header",
      "field": "invoicefromshipment",
      "column": "Invoicefromshipment",
      "url": "/sws/neo/return-to-vendor-shipment/header/{id}/action/invoicefromshipment",
      "processId": "62250E8866EA4D96A66C309878DC039E",
      "processType": "obuiapp"
    },
    {
      "entity": "header",
      "field": "processGoodsJava",
      "column": "Process_Goods_Java",
      "url": "/sws/neo/return-to-vendor-shipment/header/{id}/action/processGoodsJava",
      "processId": "49DEE812BF0545269781FCEBF2235924",
      "processType": "classic"
    },
    {
      "entity": "lines",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/return-to-vendor-shipment/lines/{id}/action/explode",
      "processId": "DAE719940FE9463F8A3E3C401BBAFC53",
      "processType": "classic"
    },
    {
      "entity": "lines",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/return-to-vendor-shipment/lines/{id}/action/managePrereservation",
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
    "category": "purchases"
  }
};

// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={HeaderForm}
        DetailTable={LinesTable}
        DetailForm={LinesForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Header"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        notesField="description"
        customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}
        bottomSection={ReturnToVendorShipmentBottomPanel}
        requiredHeaderFields={requiredHeaderFields}
        linesLayout="inlineEditable"
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="header"
      Table={HeaderTable}
      entityLabel="Return to Vendor Shipment"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      dateFilterKey="movementDate"
      {...props}
    />
  );
}
// @sf-generated-end component:HeaderPage
