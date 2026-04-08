import { useState, useCallback } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import GoodsShipmentTable from './GoodsShipmentTable';
import GoodsShipmentForm from './GoodsShipmentForm';
import GoodsShipmentLineTable from './GoodsShipmentLineTable';
import GoodsShipmentLineForm from './GoodsShipmentLineForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import ReturnWizard from '../../../custom/ReturnWizard';
import catalogs from './mockCatalogs';


const breadcrumb = 'Sales / Goods Shipment';

// @sf-generated-start summary:goodsShipment
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:goodsShipment

// @sf-custom-slot extraBadges:goodsShipment
// @sf-generated-start extraBadges:goodsShipment
const extraBadges = [];
// @sf-generated-end extraBadges:goodsShipment

// @sf-generated-start processes:goodsShipment
const processes = [
  // Complete the shipment
  { name: 'Complete', label: 'Complete', style: 'positive', columnName: 'documentAction',
    displayLogicRaw: "@documentStatus@='DR'" },
  // TODO: "Create Invoice" — wire to invoicefromshipment (process 62250E8866EA4D96A66C309878DC039E, obuiapp)
  // Needs OBUIAPP process with parameter UI. Visible when CO and no invoice exists.
  // On success: navigate to newly created Invoice. Replace with "View Invoice" once exists.
];
// @sf-generated-end processes:goodsShipment

// @sf-generated-start draftMode:goodsShipment
const draftMode = null;
// @sf-generated-end draftMode:goodsShipment

// @sf-generated-start addLineFields:goodsShipmentLine
const addLineFields = {
  entry: [
    { key: 'product', column: 'M_Product_ID', type: 'search', lookup: true, label: 'Product', reference: 'Product', inputMode: 'search' },
    { key: 'movementQuantity', column: 'MovementQty', type: 'number', required: true, label: 'Movement Quantity' },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:goodsShipmentLine

const api = {
  "specName": "goods-shipment",
  "baseUrl": "/sws/neo/goods-shipment",
  "crud": {
    "goodsShipment": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/goods-shipment/goodsShipment",
      "detailUrl": "/sws/neo/goods-shipment/goodsShipment/{id}",
      "supportedFilters": [
        "documentNo",
        "warehouse",
        "businessPartner",
        "movementDate",
        "documentStatus"
      ]
    },
    "goodsShipmentLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/goods-shipment/goodsShipmentLine",
      "detailUrl": "/sws/neo/goods-shipment/goodsShipmentLine/{id}",
      "supportedFilters": [
        "product"
      ]
    }
  },
  "selectors": [
    {
      "entity": "goodsShipment",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "search",
      "url": "/sws/neo/goods-shipment/goodsShipment/selectors/warehouse"
    },
    {
      "entity": "goodsShipment",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/goods-shipment/goodsShipment/selectors/businessPartner"
    },
    {
      "entity": "goodsShipment",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/goods-shipment/goodsShipment/selectors/partnerAddress"
    },
    {
      "entity": "goodsShipmentLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/goods-shipment/goodsShipmentLine/selectors/product"
    }
  ],
  "actions": [
    {
      "entity": "goodsShipment",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/goods-shipment/goodsShipment/{id}/action/createLinesFrom"
    },
    {
      "entity": "goodsShipment",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/goods-shipment/goodsShipment/{id}/action/documentAction",
      "processId": "109",
      "processType": "classic"
    },
    {
      "entity": "goodsShipment",
      "field": "processGoodsJava",
      "column": "Process_Goods_Java",
      "url": "/sws/neo/goods-shipment/goodsShipment/{id}/action/processGoodsJava",
      "processId": "49DEE812BF0545269781FCEBF2235924",
      "processType": "classic"
    },
    {
      "entity": "goodsShipment",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/goods-shipment/goodsShipment/{id}/action/posted"
    },
    {
      "entity": "goodsShipment",
      "field": "calculateFreight",
      "column": "Calculate_Freight",
      "url": "/sws/neo/goods-shipment/goodsShipment/{id}/action/calculateFreight",
      "processId": "800141",
      "processType": "classic"
    },
    {
      "entity": "goodsShipment",
      "field": "invoicefromshipment",
      "column": "Invoicefromshipment",
      "url": "/sws/neo/goods-shipment/goodsShipment/{id}/action/invoicefromshipment",
      "processId": "62250E8866EA4D96A66C309878DC039E",
      "processType": "obuiapp"
    },
    {
      "entity": "goodsShipment",
      "field": "receiveMaterials",
      "column": "RM_Receipt_PickEdit",
      "url": "/sws/neo/goods-shipment/goodsShipment/{id}/action/receiveMaterials",
      "processId": "5E9F9D7EECC24E4FBB2C60840FF613BE",
      "processType": "obuiapp"
    },
    {
      "entity": "goodsShipment",
      "field": "updateLines",
      "column": "UpdateLines",
      "url": "/sws/neo/goods-shipment/goodsShipment/{id}/action/updateLines",
      "processId": "800010",
      "processType": "classic"
    },
    {
      "entity": "goodsShipment",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/goods-shipment/goodsShipment/{id}/action/generateTo",
      "processId": "154",
      "processType": "classic"
    },
    {
      "entity": "goodsShipment",
      "field": "sendMaterials",
      "column": "RM_Shipment_Pickedit",
      "url": "/sws/neo/goods-shipment/goodsShipment/{id}/action/sendMaterials",
      "processId": "4AD70293357245AB96E59C2CDB43A35D",
      "processType": "obuiapp"
    },
    {
      "entity": "goodsShipmentLine",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/goods-shipment/goodsShipmentLine/{id}/action/explode",
      "processId": "DAE719940FE9463F8A3E3C401BBAFC53",
      "processType": "classic"
    },
    {
      "entity": "goodsShipmentLine",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/goods-shipment/goodsShipmentLine/{id}/action/managePrereservation",
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
      "example": "_sortBy=goods-shipmentDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:GoodsShipmentPage
export default function GoodsShipmentPage({ windowName, recordId, ...props }) {
  // @sf-custom-slot hooks:GoodsShipmentPage
  const [returnWizard, setReturnWizard] = useState({ open: false, data: null, lines: [] });

  const extraActions = useCallback(({ data, children }) => {
    const isCompleted = data?.documentStatus === 'CO';
    if (!isCompleted) return [];
    return [{
      key: 'create-return',
      label: 'Create return',
      className: 'border-border text-muted-foreground hover:text-foreground',
      onClick: () => setReturnWizard({ open: true, data, lines: children || [] }),
    }];
  }, []);

  if (recordId) {
    return (
      <>
        <DetailView
          entity="goodsShipment"
          detailEntity="goodsShipmentLine"
          Form={GoodsShipmentForm}
          DetailTable={GoodsShipmentLineTable}
          DetailForm={GoodsShipmentLineForm}
          summary={summary}
          statusField={statusField}
          extraBadges={extraBadges}
          processes={processes}
          addLineFields={addLineFields}
          catalogs={catalogs}
          entityLabel="Goods Shipment"
          detailLabel="Lines"
          windowName={windowName}
          recordId={recordId}
          breadcrumb={breadcrumb}
          api={api}
          documentPreview={{ titlePrefix: 'Shipment', pdfUrl: null }}
          notesField="description"
          customTabs={[{ key: 'related', label: 'Related Documents', Component: RelatedDocuments }]}
          extraActions={extraActions}
          hideDeleteWhenComplete
        menuActions={({ status }) => [
            { key: 'cancel', label: 'Cancel', destructive: true, visible: status === 'CO', onClick: () => toast('Coming soon') },
          ]}
          {...props}
        />
        <ReturnWizard
          open={returnWizard.open}
          onClose={() => setReturnWizard({ open: false, data: null, lines: [] })}
          shipmentData={returnWizard.data}
          lines={returnWizard.lines}
          token={props.token}
          apiBaseUrl={props.apiBaseUrl}
          onSuccess={(docs) => {
            setReturnWizard({ open: false, data: null, lines: [] });
            // TODO: show toast and refresh related docs
          }}
        />
      </>
    );
  }

  return (
    <ListView
      entity="goodsShipment"
      Table={GoodsShipmentTable}
      entityLabel="Goods Shipments"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:GoodsShipmentPage

// @sf-custom-slot section:GoodsShipmentPage-custom
