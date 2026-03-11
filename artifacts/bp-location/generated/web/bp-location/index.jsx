import { ListView, DetailView } from '@/components/contract-ui';
import BpLocationTable from './BpLocationTable';
import BpLocationForm from './BpLocationForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'reference', name: 'BP Location' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="bpLocation"
        Form={BpLocationForm}
        catalogs={catalogs}
        entityLabel="Bp Location"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="bpLocation"
      Table={BpLocationTable}
      entityLabel="Bp Location"
      windowName={windowName}
      {...props}
    />
  );
}
