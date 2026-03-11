import { ListView, DetailView } from '@/components/contract-ui';
import ActivityTable from './ActivityTable';
import ActivityForm from './ActivityForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'crm', name: 'Activity' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="activity"
        Form={ActivityForm}
        catalogs={catalogs}
        entityLabel="Activity"
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
      entity="activity"
      Table={ActivityTable}
      entityLabel="Activity"
      windowName={windowName}
<<<<<<< HEAD
      window={windowMeta}
=======
>>>>>>> origin/main
      {...props}
    />
  );
}
