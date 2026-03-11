import { ListView, DetailView } from '@/components/contract-ui';
import BpLocationTable from './BpLocationTable';
import BpLocationForm from './BpLocationForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'reference', name: 'BP Location' };

export default function App({ token, apiBaseUrl, window, windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="bpLocation"
        Form={BpLocationForm}
        catalogs={catalogs}
        entityLabel="Bp Location"
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
      entity="bpLocation"
      Table={BpLocationTable}
      entityLabel="Bp Locations"
      windowName={windowName}
      token={token}
      apiBaseUrl={apiBaseUrl}
      {...props}
    />
  );
}
