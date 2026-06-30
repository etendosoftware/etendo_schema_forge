import { useState, useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import { toast } from 'sonner';
import ElementValueTable from '../../../custom/AccountTreeView';
import ElementValueForm from './ElementValueForm';
import { AttachmentsTab } from '@/components/attachments';
import NewAccountModal from '../../../custom/NewAccountModal';
import catalogs from './mockCatalogs';


const breadcrumb = 'Accounting / Chart of Accounts';


// @sf-generated-start summary:elementValue
const summary = [
  { key: 'active', column: 'IsActive', type: 'boolean' },
];

const statusField = null;
// @sf-generated-end summary:elementValue

// @sf-generated-start extraBadges:elementValue
const extraBadges = [

];
// @sf-generated-end extraBadges:elementValue

// @sf-generated-start processes:elementValue
const processes = [

];
// @sf-generated-end processes:elementValue

// @sf-generated-start draftMode:elementValue
const draftMode = null;
// @sf-generated-end draftMode:elementValue

// @sf-generated-start requiredHeaderFields:elementValue
const requiredHeaderFields = ['searchKey', 'name', 'accountType', 'active'];
// @sf-generated-end requiredHeaderFields:elementValue



export const api = {
  "specName": "chart-of-accounts",
  "baseUrl": "/sws/neo/chart-of-accounts",
  "crud": {
    "elementValue": {
      "get": true,
      "getById": true,
      "post": true,
      "put": true,
      "patch": true,
      "delete": true,
      "listUrl": "/sws/neo/chart-of-accounts/elementValue",
      "detailUrl": "/sws/neo/chart-of-accounts/elementValue/{id}",
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
    "category": "accounting"
  }
};

// @sf-generated-start component:ElementValuePage
export default function ElementValuePage({ windowName, recordId, ...props }) {
  const [showNewSubAccountMenuModal, setNewSubAccountMenuModal] = useState(false);
  const [newSubAccountMenuContext, setNewSubAccountMenuContext] = useState(null);
  if (recordId) {
    return (
      <>
      <DetailView
        entity="elementValue"
        Form={ElementValueForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Element Value"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
      api={api}
        customTabs={[{ key: 'attachments', labelKey: 'attachments', Component: AttachmentsTab, placement: 'tab', props: { tableName: "C_ElementValue", config: {} } }]}
        menuActions={({ data, status }) => [
          { key: 'newSubAccount', label: 'New Sub-account', labelKey: 'newSubAccount', onClick: () => { setNewSubAccountMenuContext(data ?? null); setNewSubAccountMenuModal(true); }, }
        ]}
        requiredHeaderFields={requiredHeaderFields}
        titleField="searchKey"
        {...props}
      />
      {showNewSubAccountMenuModal && <NewAccountModal isOpen={showNewSubAccountMenuModal} token={props.token} apiBaseUrl={api.baseUrl} currentRecord={newSubAccountMenuContext} onClose={() => setNewSubAccountMenuModal(false)} onSaved={() => { setNewSubAccountMenuModal(false); window.location.reload(); }} />}      </>
    );
  }

  return (
    <ListView
      entity="elementValue"
      Table={ElementValueTable}
      entityLabel="Chart of Accounts"
      windowName={windowName}
      breadcrumb={breadcrumb}
      api={api}
      hideCreate
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:ElementValuePage
