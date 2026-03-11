import { ListView, DetailView } from '@/components/contract-ui';
import DealTable from './DealTable';
import DealForm from './DealForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'crm', name: 'Deal' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="deal"
        Form={DealForm}
        catalogs={catalogs}
        entityLabel="Deal"
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
      entity="deal"
      Table={DealTable}
      entityLabel="Deal"
      windowName={windowName}
<<<<<<< HEAD
      window={windowMeta}
=======
>>>>>>> origin/main
      {...props}
    />
  );
}
