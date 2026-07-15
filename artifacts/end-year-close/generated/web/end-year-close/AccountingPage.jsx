import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import AccountingTable from './AccountingTable';
import AccountingForm from './AccountingForm';
import { AttachmentsTab } from '@/components/attachments';
import catalogs from './mockCatalogs';


const breadcrumb = 'Finance / End Year Close';


// @sf-generated-start summary:accounting
const summary = [
  { key: 'type', column: 'Factaccttype', type: 'enum' },
  { key: 'account', column: 'Account_ID', type: 'string' },
  { key: 'debit', column: 'Debit', type: 'amount' },
  { key: 'credit', column: 'Credit', type: 'amount' },
  { key: 'description', column: 'description', type: 'string' },
];

const statusField = null;
// @sf-generated-end summary:accounting

// @sf-generated-start extraBadges:accounting
const extraBadges = [

];
// @sf-generated-end extraBadges:accounting

// @sf-generated-start processes:accounting
const processes = [

];
// @sf-generated-end processes:accounting

// @sf-generated-start draftMode:accounting
const draftMode = null;
// @sf-generated-end draftMode:accounting

// @sf-generated-start requiredHeaderFields:accounting
const requiredHeaderFields = [];
// @sf-generated-end requiredHeaderFields:accounting



export const api = {
  "specName": "end-year-close",
  "baseUrl": "/sws/neo/end-year-close",
  "crud": {
    "accounting": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/end-year-close/accounting",
      "detailUrl": "/sws/neo/end-year-close/accounting/{id}",
      "supportedFilters": []
    }
  },
  "selectors": [],
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

// @sf-generated-start component:AccountingPage
export default function AccountingPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <>
      <DetailView
        entity="accounting"
        Form={AccountingForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Accounting"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "FinancialMgmtAccountingFactEndYearHQL", config: {} } }]}
        {...props}
      />
      </>
    );
  }

  return (
    <ListView
      entity="accounting"
      Table={AccountingTable}
      entityLabel="End Year Close"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:AccountingPage
