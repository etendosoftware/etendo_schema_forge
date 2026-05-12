import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import MovementTable from './MovementTable';
import MovementForm from './MovementForm';
import MovementLineTable from './MovementLineTable';
import MovementLineForm from './MovementLineForm';
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
const extraBadges = [];
// @sf-generated-end extraBadges:movement

// @sf-generated-start processes:movement
const processes = [
  { name: 'processNow', label: 'Process Movements', style: 'positive',
    displayLogicRaw: "@Processed@='N'", requiresLines: true },
];
// @sf-generated-end processes:movement

// @sf-generated-start draftMode:movement
const draftMode = null;
// @sf-generated-end draftMode:movement

// @sf-generated-start requiredHeaderFields:movement
const requiredHeaderFields = ['name', 'movementDate', 'documentNo'];
// @sf-generated-end requiredHeaderFields:movement

// @sf-generated-start addLineFields:movementLine
const addLineFields = {
  entry: [
    { key: 'lineNo', column: 'Line', type: 'number', required: true, label: 'Line No.', defaultValue: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM M_MovementLine WHERE M_Movement_ID=@M_Movement_ID@' },
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, label: 'Product', reference: 'Product', inputMode: 'search' },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
    { key: 'movementQuantity', column: 'MovementQty', type: 'number', required: true, label: 'Movement Quantity', defaultValue: 1 },
    { key: 'storageBin', column: 'M_Locator_ID', type: 'selector', required: true, label: 'Storage Bin', reference: 'Locator', inputMode: 'selector' },
    { key: 'newStorageBin', column: 'M_LocatorTo_ID', type: 'selector', required: true, label: 'New Storage Bin', reference: 'Locator', inputMode: 'selector' },
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
  }
};

// @sf-generated-start component:MovementPage
export default function MovementPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
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
        bottomSection={GoodsMovementsBottomPanel}
        requiredHeaderFields={requiredHeaderFields}
        linesLayout="inlineEditable"
        {...props}
      />
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
      dateFilterKey="movementDate"
      {...props}
    />
  );
}
// @sf-generated-end component:MovementPage
