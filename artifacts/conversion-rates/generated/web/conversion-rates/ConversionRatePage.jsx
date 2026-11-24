import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import ConversionRateTable from './ConversionRateTable';
import ConversionRateForm from './ConversionRateForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Currency Conversion';


// @sf-generated-start summary:conversionRate
const summary = [
  { key: 'currency', column: 'C_Currency_ID', type: 'selector' },
  { key: 'validToDate', column: 'ValidTo', type: 'string' },
  { key: 'divideRateBy', column: 'DivideRate', type: 'number' },
  { key: 'sMFCRSynced', column: 'EM_SMFCR_Is_Synced', type: 'boolean' },
];

const statusField = 'etgoRateStatus';
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
const requiredHeaderFields = ['toCurrency', 'validFromDate', 'multipleRateBy'];
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
      "delete": true,
      "listUrl": "/sws/neo/conversion-rates/conversionRate",
      "detailUrl": "/sws/neo/conversion-rates/conversionRate/{id}",
      "supportedFilters": [
        "currency",
        "toCurrency"
      ],
      "methods": [
        "GET",
        "GETBYID",
        "DELETE"
      ]
    }
  },
  "selectors": [
    {
      "entity": "conversionRate",
      "field": "organization",
      "column": "AD_Org_ID",
      "reference": "Org",
      "inputMode": "selector",
      "url": "/sws/neo/conversion-rates/conversionRate/selectors/organization"
    },
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
    "category": "finance"
  }
};

// @sf-generated-start component:ConversionRatePage
export default function ConversionRatePage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('116');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="116" />;
  }
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
        requiredHeaderFields={requiredHeaderFields}
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="conversionRate"
      Table={ConversionRateTable}
      entityLabel="Currency Conversion"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      rowQuickActions={{}}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:ConversionRatePage
