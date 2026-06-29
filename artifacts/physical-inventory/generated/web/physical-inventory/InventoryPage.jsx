import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import InventoryTable from './InventoryTable';
import InventoryForm from './InventoryForm';
import InventoryLineTable from './InventoryLineTable';
import InventoryLineForm from './InventoryLineForm';
import { AttachmentsTab } from '@/components/attachments';
import PhysicalInventoryBottomPanel from '../../../custom/PhysicalInventoryBottomPanel';
import InventoryMenuContent from '../../../custom/InventoryMenuContent';
import catalogs from './mockCatalogs';


const breadcrumb = 'Inventory / Physical Inventory';


// @sf-generated-start summary:inventory
const summary = [
  { key: 'inventoryType', column: 'Inventory_Type', type: 'enum' },
];

const statusField = 'processed';
// @sf-generated-end summary:inventory

// @sf-generated-start extraBadges:inventory
const extraBadges = [

];
// @sf-generated-end extraBadges:inventory

// @sf-generated-start processes:inventory
const processes = [
  { name: 'processNow', label: 'Process Inventory Count', style: 'positive',
    displayLogicRaw: "@Processed@='N'", requiresLines: true },
];
// @sf-generated-end processes:inventory

// @sf-generated-start draftMode:inventory
const draftMode = null;
// @sf-generated-end draftMode:inventory

// @sf-generated-start requiredHeaderFields:inventory
const requiredHeaderFields = ['movementDate', 'name', 'warehouse', 'inventoryType'];
// @sf-generated-end requiredHeaderFields:inventory

// @sf-generated-start addLineFields:inventoryLine
const addLineFields = {
  entry: [
    { key: 'lineNo', column: 'Line', type: 'number', label: 'Line No.', defaultValue: '@SQL=SELECT COALESCE(MAX(Line),0)+10 AS DefaultValue FROM M_InventoryLine WHERE M_Inventory_ID=@M_Inventory_ID@' },
    { key: 'product', column: 'M_Product_ID', type: 'search', required: true, lookup: true, label: 'Product', reference: 'Product', inputMode: 'search', forceCalloutFields: ["quantityCount","bookQuantity"] },
    { key: 'description', column: 'Description', type: 'textarea', label: 'Description' },
    { key: 'quantityCount', column: 'QtyCount', type: 'number', required: true, label: 'User Count' },
  ],
  derived: [
    { key: 'cost', column: 'Cost', type: 'number', label: 'Cost' },
  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:inventoryLine

export const api = {
  "specName": "physical-inventory",
  "baseUrl": "/sws/neo/physical-inventory",
  "crud": {
    "inventory": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/physical-inventory/inventory",
      "detailUrl": "/sws/neo/physical-inventory/inventory/{id}",
      "supportedFilters": [
        "movementDate",
        "warehouse",
        "inventoryType"
      ]
    },
    "inventoryLine": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/physical-inventory/inventoryLine",
      "detailUrl": "/sws/neo/physical-inventory/inventoryLine/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "inventory",
      "field": "warehouse",
      "column": "M_Warehouse_ID",
      "reference": "Warehouse",
      "inputMode": "search",
      "url": "/sws/neo/physical-inventory/inventory/selectors/warehouse"
    },
    {
      "entity": "inventory",
      "field": "project",
      "column": "C_Project_ID",
      "reference": "Project",
      "inputMode": "search",
      "url": "/sws/neo/physical-inventory/inventory/selectors/project"
    },
    {
      "entity": "inventoryLine",
      "field": "product",
      "column": "M_Product_ID",
      "reference": "Product",
      "inputMode": "search",
      "url": "/sws/neo/physical-inventory/inventoryLine/selectors/product"
    },
    {
      "entity": "inventoryLine",
      "field": "storageBin",
      "column": "M_Locator_ID",
      "reference": "Locator",
      "inputMode": "search",
      "url": "/sws/neo/physical-inventory/inventoryLine/selectors/storageBin",
      "context": {
        "required": [
          {
            "param": "M_Warehouse_ID",
            "source": "parentField",
            "field": "warehouse"
          }
        ]
      }
    },
    {
      "entity": "inventoryLine",
      "field": "uOM",
      "column": "C_UOM_ID",
      "reference": "UOM",
      "inputMode": "selector",
      "url": "/sws/neo/physical-inventory/inventoryLine/selectors/uOM"
    }
  ],
  "actions": [
    {
      "entity": "inventory",
      "field": "generateList",
      "column": "GenerateList",
      "url": "/sws/neo/physical-inventory/inventory/{id}/action/generateList",
      "processId": "105",
      "processType": "classic"
    },
    {
      "entity": "inventory",
      "field": "updateQuantities",
      "column": "UpdateQty",
      "url": "/sws/neo/physical-inventory/inventory/{id}/action/updateQuantities",
      "processId": "106",
      "processType": "classic"
    },
    {
      "entity": "inventory",
      "field": "processNow",
      "column": "Processing",
      "url": "/sws/neo/physical-inventory/inventory/{id}/action/processNow",
      "processId": "107",
      "processType": "classic"
    },
    {
      "entity": "inventory",
      "field": "etblkpBulkposting",
      "column": "EM_Etblkp_Bulkposting",
      "url": "/sws/neo/physical-inventory/inventory/{id}/action/etblkpBulkposting",
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
  }
};

// @sf-generated-start component:InventoryPage
export default function InventoryPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="inventory"
        detailEntity="inventoryLine"
        Form={InventoryForm}
        DetailTable={InventoryLineTable}
        DetailForm={InventoryLineForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Inventory"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "M_Inventory", config: {} } }]}
        bottomSection={PhysicalInventoryBottomPanel}
        customMenuContent={InventoryMenuContent}
        menuActions={({ data, status }) => [
          { key: 'post', label: 'Post', visible: !(data?.posted === 'Y' || data?.posted === true) && (data?.processed === 'Y' || data?.processed === true), labelKey: 'post', successKey: 'documentPosted', neoAction: 'post',  }
        ]}
        requiredHeaderFields={requiredHeaderFields}
        linesLayout="inlineEditable"
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="inventory"
      Table={InventoryTable}
      entityLabel="Physical Inventory"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      dateFilterKey="movementDate"
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:InventoryPage
