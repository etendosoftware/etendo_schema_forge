import { ListView, DetailView } from '@/components/contract-ui';
import UserTable from './UserTable';
import UserForm from './UserForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'reference', name: 'User' };

export default function App({ token, apiBaseUrl, window, windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="user"
        Form={UserForm}
        catalogs={catalogs}
        entityLabel="User"
        windowName={windowName}
        recordId={recordId}
        token={token}
        apiBaseUrl={apiBaseUrl}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="user"
      Table={UserTable}
      entityLabel="Users"
      windowName={windowName}
      token={token}
      apiBaseUrl={apiBaseUrl}
      {...props}
    />
  );
}
