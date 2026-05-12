import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import InternalConsumptionTable from './InternalConsumptionTable';
import InternalConsumptionForm from './InternalConsumptionForm';
import InternalConsumptionLineTable from './InternalConsumptionLineTable';
import InternalConsumptionLineForm from './InternalConsumptionLineForm';
import InternalConsumptionBottomPanel from '../../../custom/InternalConsumptionBottomPanel';
import InternalConsumptionActions from '../../../custom/InternalConsumptionActions';
import catalogs from './mockCatalogs';


const breadcrumb = 'Inventory / Internal Consumption';


// @sf-generated-start summary:internalConsumption
const summary = [

];

const statusField = 'status';
// @sf-generated-end summary:internalConsumption

// @sf-generated-start extraBadges:internalConsumption
const extraBadges = [];
// @sf-generated-end extraBadges:internalConsumption

// @sf-generated-start processes:internalConsumption
const processes = [

];
// @sf-generated-end processes:internalConsumption

// @sf-generated-start draftMode:internalConsumption
const draftMode = null;
// @sf-generated-end draftMode:internalConsumption

// @sf-generated-start requiredHeaderFields:internalConsumption
const requiredHeaderFields = ['movementDate', 'name'];
// @sf-generated-end requiredHeaderFields:internalConsumption

// @sf-generated-start addLineFields:internalConsumptionLine
const addLineFields = {
  entry: [
    { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', defaultValue: '@SQL=SELECT COALESCE(MAX(LINE),0)+10 AS DefaultValue FROM M_INTERNAL_CONSUMPTIONLINE WHERE M_INTERNAL_CONSUMPTION_ID=@M_INTERNAL_CONSUMPTION_ID@' },
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, label: 'Product', reference: 'Product', inputMode: 'search' },
    { key: 'movementQuantity', column: 'MovementQty', type: 'number', required: true, label: 'Movement Quantity', defaultValue: 0 },
    { key: 'storageBin', column: 'M_Locator_ID', type: 'search', required: true, label: 'Warehouse', reference: 'Locator', inputMode: 'search' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:internalConsumptionLine

export const api = {
  "specName": "internal-consumption",
  "baseUrl": "/sws/neo/internal-consumption",
  "crud": {
    "internalConsumption": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/internal-consumption/internalConsumption",
      "detailUrl": "/sws/neo/internal-consumption/internalConsumption/{id}",
      "supportedFilters": [
        "name"
      ]
    },
    "internalConsumptionLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/internal-consumption/internalConsumptionLine",
      "detailUrl": "/sws/neo/internal-consumption/internalConsumptionLine/{id}",
      "supportedFilters": [
        "product"
      ]
    }
  },
  "selectors": [
    {
      "entity": "internalConsumptionLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/internal-consumption/internalConsumptionLine/selectors/product"
    },
    {
      "entity": "internalConsumptionLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/internal-consumption/internalConsumptionLine/selectors/uOM"
    },
    {
      "entity": "internalConsumptionLine",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "Locator",
      "inputMode": "search",
      "url": "/sws/neo/internal-consumption/internalConsumptionLine/selectors/storageBin"
    }
  ],
  "actions": [
    {
      "entity": "internalConsumption",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/internal-consumption/internalConsumption/{id}/action/processNow",
      "processId": "800131",
      "processType": "classic"
    },
    {
      "entity": "internalConsumption",
      "field": "posted",
      "column": "Posted",
      "url": "/sws/neo/internal-consumption/internalConsumption/{id}/action/posted"
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

// @sf-generated-start component:InternalConsumptionPage
export default function InternalConsumptionPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="internalConsumption"
        detailEntity="internalConsumptionLine"
        Form={InternalConsumptionForm}
        DetailTable={InternalConsumptionLineTable}
        DetailForm={InternalConsumptionLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Internal Consumption"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        bottomSection={InternalConsumptionBottomPanel}
        customMenuContent={InternalConsumptionActions}
        requiredHeaderFields={requiredHeaderFields}
        linesLayout="inlineEditable"
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="internalConsumption"
      Table={InternalConsumptionTable}
      entityLabel="Internal Consumption"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      dateFilterKey="movementDate"
      {...props}
    />
  );
}
// @sf-generated-end component:InternalConsumptionPage
