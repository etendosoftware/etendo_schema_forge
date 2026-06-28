import { useEffect } from 'react';
import { ListView, DetailView } from '@/components/contract-ui';
import AccountTable from './AccountTable';
import AccountForm from './AccountForm';
import catalogs from './mockCatalogs';


const breadcrumb = 'Accounting / Chart of Accounts';


// @sf-generated-start summary:account
const summary = [
  { key: 'isActive', column: 'IsActive', type: 'boolean' },
];

const statusField = null;
// @sf-generated-end summary:account

// @sf-generated-start extraBadges:account
const extraBadges = [

];
// @sf-generated-end extraBadges:account

// @sf-generated-start processes:account
const processes = [

];
// @sf-generated-end processes:account

// @sf-generated-start draftMode:account
const draftMode = null;
// @sf-generated-end draftMode:account

// @sf-generated-start requiredHeaderFields:account
const requiredHeaderFields = ['code', 'name', 'accountType', 'isActive'];
// @sf-generated-end requiredHeaderFields:account



// @sf-generated-start component:AccountPage
export default function AccountPage({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="account"
        Form={AccountForm}
        summary={summary}
        statusField={statusField}
        extraBadges={extraBadges}
        processes={processes}
        catalogs={catalogs}
        entityLabel="Account"
        windowName={windowName}
        recordId={recordId}
        breadcrumb={breadcrumb}
        requiredHeaderFields={requiredHeaderFields}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="account"
      Table={AccountTable}
      entityLabel="Chart of Accounts"
      windowName={windowName}
      breadcrumb={breadcrumb}
      rowQuickActions={{}}
      {...props}
    />
  );
}
// @sf-generated-end component:AccountPage
