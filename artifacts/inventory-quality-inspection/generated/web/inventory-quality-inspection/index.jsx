import { ListView, DetailView } from '@/components/contract-ui';
import QualityCheckTable from './QualityCheckTable';
import QualityCheckForm from './QualityCheckForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'warehouse', name: 'Inventory Quality Inspection' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="qualityCheck"
        Form={QualityCheckForm}
        catalogs={catalogs}
        entityLabel="Quality Check"
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
      entity="qualityCheck"
      Table={QualityCheckTable}
      entityLabel="Quality Check"
      windowName={windowName}
<<<<<<< HEAD
      window={windowMeta}
=======
>>>>>>> origin/main
      {...props}
    />
  );
}
