import { ListView, DetailView } from '@/components/contract-ui';
import AccountTable from './AccountTable';
import AccountForm from './AccountForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'accounting', name: 'Chart of Accounts' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="account"
        Form={AccountForm}
        catalogs={catalogs}
        entityLabel="Account"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="account"
      Table={AccountTable}
      entityLabel="Account"
      windowName={windowName}
      {...props}
    />
  );
}
