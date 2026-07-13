import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import TaxTable from './TaxTable';
import TaxForm from './TaxForm';
import AccountingTable from './AccountingTable';
import AccountingForm from './AccountingForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Settings / Tax';


// @sf-generated-start summary:tax
const summary = [

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
const requiredHeaderFields = ['name', 'rate', 'docTaxAmount', 'baseAmount', 'applicableTo', 'validFrom'];
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
      "delete": true,
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
      "delete": true,
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
      "IsActive": "Activo",
      "Description": "Descripción"
    },
    "en_US": {
      "Name": "Name",
      "Rate": "Rate",
      "SOPOType": "Sales/Purchase Type",
      "ValidFrom": "Valid From",
      "IsActive": "Active",
      "Description": "Description"
    }
  }
};


const labelOverrides = api.labelOverrides;
// @sf-generated-start component:TaxPage
export default function TaxPage({ windowName, recordId, ...props }) {
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
        hidePrint
        hideMoreMenu
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_Tax", config: {} } }]}
        requiredHeaderFields={requiredHeaderFields}
        labelOverrides={labelOverrides}
        {...props}
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
      hideMoreMenu
      labelOverrides={labelOverrides}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:TaxPage
