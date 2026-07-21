import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import ConversionRateTable from './ConversionRateTable';
import ConversionRateForm from './ConversionRateForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Conversion Rates';


// @sf-generated-start summary:conversionRate
const summary = [
  { key: 'sMFCRSynced', column: 'EM_SMFCR_Is_Synced', type: 'boolean' },
];

const statusField = null;
// @sf-generated-end summary:conversionRate

// @sf-generated-start extraBadges:conversionRate
const extraBadges = [

];
// @sf-generated-end extraBadges:conversionRate

// @sf-generated-start processes:conversionRate
const processes = [

];
// @sf-generated-end processes:conversionRate

// @sf-generated-start draftMode:conversionRate
const draftMode = null;
// @sf-generated-end draftMode:conversionRate

// @sf-generated-start requiredHeaderFields:conversionRate
const requiredHeaderFields = ['currency', 'toCurrency', 'validFromDate', 'multipleRateBy', 'divideRateBy'];
// @sf-generated-end requiredHeaderFields:conversionRate



export const api = {
  "specName": "conversion-rates",
  "baseUrl": "/sws/neo/conversion-rates",
  "crud": {
    "conversionRate": {
      "get": true,
      "getById": true,
      "post": false,
      "put": false,
      "patch": false,
      "delete": false,
      "listUrl": "/sws/neo/conversion-rates/conversionRate",
      "detailUrl": "/sws/neo/conversion-rates/conversionRate/{id}",
      "supportedFilters": [
        "currency",
        "toCurrency"
      ]
    }
  },
  "selectors": [
    {
      "entity": "conversionRate",
      "field": "currency",
      "column": "C_Currency_ID",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/conversion-rates/conversionRate/selectors/currency"
    },
    {
      "entity": "conversionRate",
      "field": "toCurrency",
      "column": "C_Currency_ID_To",
      "reference": "Currency",
      "inputMode": "selector",
      "url": "/sws/neo/conversion-rates/conversionRate/selectors/toCurrency"
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
      "example": "_sortBy=creationDate desc"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  },
  "window": {
    "category": "finance",
    "readOnly": true
  }
};

// @sf-generated-start component:ConversionRatePage
export default function ConversionRatePage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="conversionRate"
        Form={ConversionRateForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Conversion Rate"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_Conversion_Rate", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        {...props}
      />
      </>
    );
  }

  return (
    <ListView
      entity="conversionRate"
      Table={ConversionRateTable}
      entityLabel="Conversion Rates"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hideCreate
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:ConversionRatePage
