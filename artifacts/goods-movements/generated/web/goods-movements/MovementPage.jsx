import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import MovementTable from './MovementTable';
import MovementForm from './MovementForm';
import MovementLineTable from './MovementLineTable';
import MovementLineForm from './MovementLineForm';
import { AttachmentsTab } from '@/components/attachments';
import GoodsMovementsBottomPanel from '../../../custom/GoodsMovementsBottomPanel';
import catalogs from './mockCatalogs';


const breadcrumb = 'Inventory / Goods Movements';


// @sf-generated-start summary:movement
const summary = [
  { key: 'documentNo', column: 'DocumentNo', type: 'string' },
];

const statusField = 'processed';
// @sf-generated-end summary:movement

// @sf-generated-start extraBadges:movement
const extraBadges = [
  { key: 'posted', type: 'statusPill', trueKey: 'postedStatus', falseKey: 'notPostedStatus' },
];
// @sf-generated-end extraBadges:movement

// @sf-generated-start processes:movement
const processes = [

];
// @sf-generated-end processes:movement

// @sf-generated-start draftMode:movement
const draftMode = {
  "enabled": true,
  "processField": "processNow",
  "processValue": "Y",
  "label": "processMovements",
  "completedStatuses": [
    "true"
  ],
  "disableWhenEmpty": true
};
// @sf-generated-end draftMode:movement

// @sf-generated-start requiredHeaderFields:movement
const requiredHeaderFields = ['name', 'movementDate'];
// @sf-generated-end requiredHeaderFields:movement

// @sf-generated-start addLineFields:movementLine
const addLineFields = {
  entry: [
    { key: 'lineNo', column: 'Line', type: 'number', required: true, label: 'Line No.', defaultValue: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM M_MovementLine WHERE M_Movement_ID=@M_Movement_ID@' },
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, label: 'Product', reference: 'Product', inputMode: 'search', lookupDrawer: 'goods-movements-product', lookupTitle: 'Product', onSelectMappings: [{"from":"_aux._LOC","to":"storageBin","labelFrom":["storageBin","storageBin$_identifier","warehouse"]}] },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
    { key: 'movementQuantity', column: 'MovementQty', type: 'number', required: true, label: 'Movement Quantity', defaultValue: 1 },
    { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', required: true, label: 'Storage Bin', reference: 'Locator', inputMode: 'selector' },
    { key: 'newStorageBin', column: 'M_LocatorTo_ID', type: 'selector', required: true, label: 'New Storage Bin', reference: 'Locator', inputMode: 'selector', excludeValueOf: 'storageBin' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:movementLine

export const api = {
  "specName": "goods-movements",
  "baseUrl": "/sws/neo/goods-movements",
  "crud": {
    "movement": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/goods-movements/movement",
      "detailUrl": "/sws/neo/goods-movements/movement/{id}",
      "supportedFilters": [
        "name",
        "movementDate"
      ]
    },
    "movementLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/goods-movements/movementLine",
      "detailUrl": "/sws/neo/goods-movements/movementLine/{id}",
      "supportedFilters": [
        "product"
      ]
    }
  },
  "selectors": [
    {
      "entity": "movementLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/goods-movements/movementLine/selectors/product"
    },
    {
      "entity": "movementLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/goods-movements/movementLine/selectors/uOM"
    },
    {
      "entity": "movementLine",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "Locator",
      "inputMode": "selector",
      "url": "/sws/neo/goods-movements/movementLine/selectors/storageBin"
    },
    {
      "entity": "movementLine",
      "field": "newStorageBin",
      "column": "M_LocatorTo_ID",
      "reference": "Locator",
      "inputMode": "selector",
      "url": "/sws/neo/goods-movements/movementLine/selectors/newStorageBin"
    }
  ],
  "actions": [
    {
      "entity": "movement",
      "field": "moveBetweenLocators",
      "column": "Move_FromTo_Locator",
      "url": "/sws/neo/goods-movements/movement/{id}/action/moveBetweenLocators",
      "processId": "800048",
      "processType": "classic"
    },
    {
      "entity": "movement",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/goods-movements/movement/{id}/action/processNow",
      "processId": "122",
      "processType": "classic"
    },
    {
      "entity": "movement",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/goods-movements/movement/{id}/action/posted"
    },
    {
      "entity": "movement",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/goods-movements/movement/{id}/action/etblkpBulkposting",
      "processId": "57496FB9CF9E4E8F847224017941570E",
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
    "category": "inventory"
  },
  "labelOverrides": {
    "en_US": {
      "Processed": "Status",
      "M_Locator_ID": "Source Warehouse",
      "M_LocatorTo_ID": "Destination Warehouse",
      "MovementQty": "Quantity"
    },
    "es_ES": {
      "Processed": "Estado",
      "M_Locator_ID": "Almacén origen",
      "M_LocatorTo_ID": "Almacén destino",
      "MovementQty": "Cantidad"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:MovementPage
export default function MovementPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="movement"
        detailEntity="movementLine"
        Form={MovementForm}
        DetailTable={MovementLineTable}
        DetailForm={MovementLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Movement"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        hidePrint
        noHeaderBorder
        whiteFormBackground
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "M_Movement", config: {} } }]}
        bottomSection={GoodsMovementsBottomPanel}
        menuActions={({ data, status }) => [
          { key: 'post', label: 'Post', visible: !(data?.posted === 'Y' || data?.posted === true) && (data?.processed === 'Y' || data?.processed === true), labelKey: 'post', successKey: 'documentPosted', neoAction: 'post',  },
          { key: 'unpost', label: 'Unpost', destructive: true, visible: (data?.posted === 'Y' || data?.posted === true), labelKey: 'unpost', successKey: 'documentUnposted', neoAction: 'unpost',  }
        ]}
        draftMode={draftMode}
        requiredHeaderFields={requiredHeaderFields}
        statusEnumLabels={{"true":"statusProcessed","false":"statusDraft"}}
        lockedAlert={{"title":"goodsMovementsLockedTitle","message":"goodsMovementsLockedMessage","actionLabel":"goodsMovementsLockedAction","navigateTo":"/physical-inventory/new"}}
        labelOverrides={labelOverrides}
        linesLayout="inlineEditable"
        sendDocument={{"enabled":false}}
        {...props}
      />
      </>
    );
  }

  return (
    <ListView
      entity="movement"
      Table={MovementTable}
      entityLabel="Goods Movements"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      listViewOptions={{"hideStatusFilter":true}}
      dateFilterKey="movementDate"
      listbarPaddingX="px-2"
      tablePaddingX="px-2"
      hidePrint
      hideLink
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      sendDocument={{"enabled":false}}
      {...props}
    />
  );
}
// @sf-generated-end component:MovementPage
