import { useMemo, useEffect } from 'react';
import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import { useWindowAccess, WindowAccessGuard } from '@/auth/AuthContext.jsx';
import TaxTable from './TaxTable';
import TaxForm from './TaxForm';
import AccountingTable from './AccountingTable';
import AccountingForm from './AccountingForm';
import TaxSifField from '@/windows/custom/shared/TaxSifField';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / Tax';


// @sf-generated-start summary:tax
const summary = [
  { key: 'name', column: 'Name', type: 'string' },
  { key: 'validFrom', column: 'ValidFrom', type: 'date' },
  { key: 'rate', column: 'Rate', type: 'number' },
  { key: 'applicableTo', column: 'SOPOType', type: 'enum' },
  { key: 'docTaxAmount', column: 'DocTaxAmount', type: 'enum' },
  { key: 'baseAmount', column: 'BaseAmount', type: 'enum' },
];

const statusField = null;
// @sf-generated-end summary:tax

// @sf-generated-start extraBadges:tax
const extraBadges = [

];
// @sf-generated-end extraBadges:tax

// @sf-generated-start processes:tax
const processes = [

];
// @sf-generated-end processes:tax

// @sf-generated-start draftMode:tax
const draftMode = null;
// @sf-generated-end draftMode:tax

// @sf-generated-start requiredHeaderFields:tax
const requiredHeaderFields = ['name', 'validFrom', 'rate', 'applicableTo', 'docTaxAmount', 'baseAmount'];
// @sf-generated-end requiredHeaderFields:tax

// @sf-generated-start addLineFields:accounting
const addLineFields = {
  entry: [
    { key: 'taxDue', column: 'T_Due_Acct', type: 'selector', required: true, label: 'Tax Due', reference: 'ValidCombination', inputMode: 'selector' },
    { key: 'taxCredit', column: 'T_Credit_Acct', type: 'selector', required: true, label: 'Tax Credit', reference: 'ValidCombination', inputMode: 'selector' },
  ],
  derived: [

  ],
  hidden: [
    { key: 'accountingSchema', fromSibling: 'accountingSchema' },
  ],
};
// @sf-generated-end addLineFields:accounting

export const api = {
  "specName": "tax-rate",
  "baseUrl": "/sws/neo/tax-rate",
  "crud": {
    "tax": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": false,
      "listUrl": "/sws/neo/tax-rate/tax",
      "detailUrl": "/sws/neo/tax-rate/tax/{id}",
      "supportedFilters": [
        "name"
      ]
    },
    "accounting": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": false,
      "listUrl": "/sws/neo/tax-rate/accounting",
      "detailUrl": "/sws/neo/tax-rate/accounting/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "accounting",
      "field": "taxDue",
      "column": "T_Due_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/tax-rate/accounting/selectors/taxDue"
    },
    {
      "entity": "accounting",
      "field": "taxCredit",
      "column": "T_Credit_Acct",
      "reference": "ValidCombination",
      "inputMode": "selector",
      "url": "/sws/neo/tax-rate/accounting/selectors/taxCredit"
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
    "category": "settings"
  },
  "labelOverrides": {
    "es_ES": {
      "Name": "Nombre",
      "Rate": "Índice",
      "SOPOType": "Tipo venta/compra",
      "ValidFrom": "Válido desde",
      "Description": "Descripción"
    },
    "en_US": {
      "Name": "Name",
      "Rate": "Rate",
      "SOPOType": "Sales/Purchase Type",
      "ValidFrom": "Valid From",
      "Description": "Description"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:TaxPage
export default function TaxPage({ windowName, recordId, ...props }) {
  const windowAccessTier = useWindowAccess('137');
  const effectiveWindow = useMemo(() => (
    windowAccessTier === 'read-only' ? { ...(props.window || {}), readOnly: true } : props.window
  ), [windowAccessTier, props.window]);
  if (windowAccessTier === 'none') {
    return <WindowAccessGuard windowId="137" />;
  }
  if (recordId) {
    return (
      <>
      <DetailView
        entity="tax"
        detailEntity="accounting"
        Form={TaxForm}
        DetailTable={AccountingTable}
        DetailForm={AccountingForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Tax"
        detailLabel="Accounting"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        formFooter={TaxSifField}
        hideDeleteButton
        hidePrint
        hideMoreMenu
        noHeaderBorder
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_Tax", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        addLineGuard={(_, children) => children.length < 1}
        labelOverrides={labelOverrides}
        {...props} window={effectiveWindow}
      />
      </>
    );
  }

  return (
    <ListView
      entity="tax"
      Table={TaxTable}
      entityLabel="Tax Rate"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hidePrint
      hideCreate
      hideMoreMenu
      labelOverrides={labelOverrides}
      rowQuickActions={{"hideDeleteButton":true}}
      {...props} window={effectiveWindow}
    />
  );
}
// @sf-generated-end component:TaxPage
