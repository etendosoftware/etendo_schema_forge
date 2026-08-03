import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
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
        window={windowMeta}
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
      window={windowMeta}
      {...props}
    />
  );
}
