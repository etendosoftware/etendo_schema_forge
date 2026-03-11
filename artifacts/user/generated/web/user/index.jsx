import { ListView, DetailView } from '@/components/contract-ui';
import UserTable from './UserTable';
import UserForm from './UserForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'reference', name: 'User' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="user"
        Form={UserForm}
        catalogs={catalogs}
        entityLabel="User"
        windowName={windowName}
        recordId={recordId}
<<<<<<< HEAD
        window={windowMeta}
=======
>>>>>>> origin/main
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="user"
      Table={UserTable}
      entityLabel="User"
      windowName={windowName}
<<<<<<< HEAD
      window={windowMeta}
=======
>>>>>>> origin/main
      {...props}
    />
  );
}
