import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import HeaderTable from './HeaderTable';
import HeaderForm from './HeaderForm';
import LinesTable from './LinesTable';
import LinesForm from './LinesForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Configuracion / Payment Term';


// @sf-generated-start summary:header
const summary = [

];

const statusField = null;
// @sf-generated-end summary:header

// @sf-generated-start extraBadges:header
const extraBadges = [];
// @sf-generated-end extraBadges:header

// @sf-generated-start processes:header
const processes = [

];
// @sf-generated-end processes:header

// @sf-generated-start draftMode:header
const draftMode = null;
// @sf-generated-end draftMode:header

// @sf-generated-start addLineFields:lines
const addLineFields = {
  entry: [
    { key: 'lineNo', column: 'Line', type: 'number', required: true, label: 'Line No.' },
    { key: 'percentageDue', column: 'Percentage', type: 'number', required: true, label: 'Percentage Due' },
    { key: 'offsetMonthDue', column: 'FixMonthOffset', type: 'number', label: 'Offset Month Due' },
    { key: 'overduePaymentDaysRule', column: 'NetDays', type: 'number', required: true, label: 'Overdue Payment Days Rule' },
    { key: 'fixedDueDate', column: 'IsDueFixed', type: 'checkbox', required: true, label: 'Fixed Due Date' },
    { key: 'maturityDate1', column: 'FixMonthDay', type: 'number', label: 'Maturity Date 1' },
    { key: 'maturityDate2', column: 'FixMonthDay2', type: 'number', label: 'Maturity Date 2' },
    { key: 'maturityDate3', column: 'Fixmonthday3', type: 'number', label: 'Maturity Date 3' },
    { key: 'paymentMethod', column: 'FIN_Paymentmethod_ID', type: 'selector', label: 'Payment Method', reference: 'Paymentmethod', inputMode: 'selector' },
    { key: 'rest', column: 'Onremainder', type: 'checkbox', required: true, label: 'Rest' },
    { key: 'excludeTax', column: 'Excludetax', type: 'checkbox', required: true, label: 'Exclude Tax' },
    { key: 'overduePaymentDayRule', column: 'NetDay', type: 'select', label: 'Fixed Week Day' },
    { key: 'nextBusinessDay', column: 'IsNextBusinessDay', type: 'checkbox', label: 'Next Business Day' },
  ],
  derived: [

  ],
  hidden: [

  ],
};
// @sf-generated-end addLineFields:lines

const api = {
  "specName": "payment-term",
  "baseUrl": "/sws/neo/payment-term",
  "crud": {
    "header": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-term/header",
      "detailUrl": "/sws/neo/payment-term/header/{id}",
      "supportedFilters": [
        "searchKey",
        "name"
      ]
    },
    "lines": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/payment-term/lines",
      "detailUrl": "/sws/neo/payment-term/lines/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [
    {
      "entity": "lines",
      "field": "paymentMethod",
      "column": "FIN_Paymentmethod_ID",
      "reference": "Paymentmethod",
      "inputMode": "selector",
      "url": "/sws/neo/payment-term/lines/selectors/paymentMethod"
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
      "example": "_sortBy=payment-termDate"
    },
    "filtering": "Use field name as query param: ?fieldName=value",
    "parentFilter": "parentId={id} for child entities"
  }
};

// @sf-generated-start component:HeaderPage
export default function HeaderPage({ windowName, recordId, ...props }) {
  
  if (recordId) {
    return (
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={HeaderForm}
        DetailTable={LinesTable}
        DetailForm={LinesForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        addLineFields={addLineFields}
        catalogs={catalogs}
        entityLabel="Header"
        detailLabel="Lines"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="header"
      Table={HeaderTable}
      entityLabel="Payment Term"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      {...props}
    />
  );
}
// @sf-generated-end component:HeaderPage
