import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import { toast } from 'sonner';
import ReturnToVendorShipmentTable from './ReturnToVendorShipmentTable';
import ReturnToVendorShipmentForm from './ReturnToVendorShipmentForm';
import ReturnToVendorShipmentLineTable from './ReturnToVendorShipmentLineTable';
import ReturnToVendorShipmentLineForm from './ReturnToVendorShipmentLineForm';
import RelatedDocuments from '../../../custom/RelatedDocuments';
import { AttachmentsTab } from '@/components/attachments';
import ReturnToVendorShipmentBottomPanel from '../../../custom/ReturnToVendorShipmentBottomPanel';
import ConfirmWithCreditButton from '@/windows/custom/return-to-vendor-shipment/ConfirmWithCreditButton';
import catalogs from './mockCatalogs';


const breadcrumb = 'Purchases / Return to Vendor Shipment';


// @sf-generated-start summary:returnToVendorShipment
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
  { key: 'etblkpBulkposting', column: 'EM_Etblkp_Bulkposting', type: 'string' },
  { key: 'sourceReceiptDocNo', column: 'sourceReceiptDocNo', type: 'string' },
];

const statusField = 'documentStatus';
// @sf-generated-end summary:returnToVendorShipment

// @sf-generated-start extraBadges:returnToVendorShipment
const extraBadges = [
  { key: 'posted', type: 'statusPill', trueKey: 'postedStatus', falseKey: 'notPostedStatus', visibleWhenCapability: 'showAccountingFields' },
];
// @sf-generated-end extraBadges:returnToVendorShipment

// @sf-generated-start processes:returnToVendorShipment
const processes = [

];
// @sf-generated-end processes:returnToVendorShipment

// @sf-generated-start draftMode:returnToVendorShipment
const draftMode = null;
// @sf-generated-end draftMode:returnToVendorShipment

// @sf-generated-start requiredHeaderFields:returnToVendorShipment
const requiredHeaderFields = ['documentNo', 'businessPartner', 'partnerAddress', 'movementDate', 'warehouse', 'etblkpBulkposting'];
// @sf-generated-end requiredHeaderFields:returnToVendorShipment

// @sf-generated-start addLineFields:returnToVendorShipmentLine
const addLineFields = {
  entry: [
    { key: 'movementQuantity', column: 'MovementQty', type: 'number', required: true, label: 'Movement Quantity', labels: {"es_ES":"Cant. a devolver","en_US":"Return Qty"}, defaultValue: 0 },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:returnToVendorShipmentLine

export const api = {
  "specName": "return-to-vendor-shipment",
  "baseUrl": "/sws/neo/return-to-vendor-shipment",
  "crud": {
    "returnToVendorShipment": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment",
      "detailUrl": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/{id}",
      "supportedFilters": [
        "documentNo",
        "businessPartner",
        "movementDate",
        "documentStatus"
      ]
    },
    "returnToVendorShipmentLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/return-to-vendor-shipment/returnToVendorShipmentLine",
      "detailUrl": "/sws/neo/return-to-vendor-shipment/returnToVendorShipmentLine/{id}",
      "supportedFilters": [
        "product"
      ]
    }
  },
  "selectors": [
    {
      "entity": "returnToVendorShipment",
      "field": "businessPartner",
      "column": "C_BPartner_ID",
      "reference": "BusinessPartner",
      "inputMode": "search",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/selectors/businessPartner"
    },
    {
      "entity": "returnToVendorShipment",
      "field": "partnerAddress",
      "column": "C_BPartner_Location_ID",
      "reference": "BusinessPartnerLocation",
      "inputMode": "dependent",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/selectors/partnerAddress",
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
      "entity": "returnToVendorShipment",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "search",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/selectors/warehouse"
    },
    {
      "entity": "returnToVendorShipmentLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipmentLine/selectors/product"
    },
    {
      "entity": "returnToVendorShipmentLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "search",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipmentLine/selectors/uOM"
    }
  ],
  "actions": [
    {
      "entity": "returnToVendorShipment",
      "field": "sendMaterials",
      "column": "RM_Shipment_Pickedit",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/{id}/action/sendMaterials",
      "processId": "4AD70293357245AB96E59C2CDB43A35D",
      "processType": "obuiapp"
    },
    {
      "entity": "returnToVendorShipment",
      "field": "createLinesFrom",
      "column": "CreateFrom",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/{id}/action/createLinesFrom"
    },
    {
      "entity": "returnToVendorShipment",
      "field": "generateTo",
      "column": "GenerateTo",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/{id}/action/generateTo",
      "processId": "154",
      "processType": "classic"
    },
    {
      "entity": "returnToVendorShipment",
      "field": "documentAction",
      "column": "DocAction",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/{id}/action/documentAction",
      "processId": "109",
      "processType": "classic"
    },
    {
      "entity": "returnToVendorShipment",
      "field": "calculateFreight",
      "column": "Calculate_Freight",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/{id}/action/calculateFreight",
      "processId": "800141",
      "processType": "classic"
    },
    {
      "entity": "returnToVendorShipment",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
      "processType": "obuiapp"
    },
    {
      "entity": "returnToVendorShipment",
      "field": "receiveMaterials",
      "column": "RM_Receipt_PickEdit",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/{id}/action/receiveMaterials",
      "processId": "5E9F9D7EECC24E4FBB2C60840FF613BE",
      "processType": "obuiapp"
    },
    {
      "entity": "returnToVendorShipment",
      "field": "updateLines",
      "column": "UpdateLines",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/{id}/action/updateLines",
      "processId": "800010",
      "processType": "classic"
    },
    {
      "entity": "returnToVendorShipment",
      "field": "invoicefromshipment",
      "column": "Invoicefromshipment",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/{id}/action/invoicefromshipment",
      "processId": "62250E8866EA4D96A66C309878DC039E",
      "processType": "obuiapp"
    },
    {
      "entity": "returnToVendorShipment",
      "field": "processGoodsJava",
      "column": "Process_Goods_Java",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipment/{id}/action/processGoodsJava",
      "processId": "49DEE812BF0545269781FCEBF2235924",
      "processType": "classic"
    },
    {
      "entity": "returnToVendorShipmentLine",
      "field": "explode",
      "column": "Explode",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipmentLine/{id}/action/explode",
      "processId": "DAE719940FE9463F8A3E3C401BBAFC53",
      "processType": "classic"
    },
    {
      "entity": "returnToVendorShipmentLine",
      "field": "managePrereservation",
      "column": "Manage_Prereservation",
      "url": "/sws/neo/return-to-vendor-shipment/returnToVendorShipmentLine/{id}/action/managePrereservation",
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
  },
  "labelOverrides": {
    "es_ES": {
      "sourceReceiptDocNo": "Albarán origen",
      "MovementQty": "Cant. a devolver",
      "QuantityOrder": "Cant. pedida"
    },
    "en_US": {
      "sourceReceiptDocNo": "Source Receipt",
      "MovementQty": "Return Qty",
      "QuantityOrder": "Ordered Qty"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:ReturnToVendorShipmentPage
export default function ReturnToVendorShipmentPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('273673D2ED914C399A6C51DB758BE0F9');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="273673D2ED914C399A6C51DB758BE0F9" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="returnToVendorShipment"
        detailEntity="returnToVendorShipmentLine"
        Form={ReturnToVendorShipmentForm}
        DetailTable={ReturnToVendorShipmentLineTable}
        DetailForm={ReturnToVendorShipmentLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Return To Vendor Shipment"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hideDeleteWhenComplete
        noHeaderBorder
        notesField="description"
        customTabs={[{ key: 'related', labelKey: 'relatedDocuments', Component: RelatedDocuments }, { key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "M_InOut", config: {} } }]}
        bottomSection={ReturnToVendorShipmentBottomPanel}
        topbarRight={ConfirmWithCreditButton}
        menuActions={({ data, status }) => [
          { key: 'post', label: 'Post', visible: !(data?.posted === 'Y' || data?.posted === true) && (data?.processed === 'Y' || data?.processed === true), labelKey: 'post', successKey: 'documentPosted', neoAction: 'post',  }
        ]}
        requiredHeaderFields={requiredHeaderFields}
        addLineGuard={(_, children) => children.length < 0}
        labelOverrides={labelOverrides}
        linesLayout="inlineEditable"
        sendDocument
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="returnToVendorShipment"
      Table={ReturnToVendorShipmentTable}
      entityLabel="Return to Vendor Shipment"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      dateFilterKey="movementDate"
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      sendDocument
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:ReturnToVendorShipmentPage
