import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import AbsenceTable from './AbsenceTable';
import AbsenceForm from './AbsenceForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'hr', name: 'Absence' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="absence"
        Form={AbsenceForm}
        catalogs={catalogs}
        entityLabel="Absence"
        windowName={windowName}
        recordId={recordId}
        window={windowMeta}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="absence"
      Table={AbsenceTable}
      entityLabel="Absence"
      windowName={windowName}
      window={windowMeta}
      {...props}
    />
  );
}
