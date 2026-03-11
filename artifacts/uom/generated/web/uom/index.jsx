import { ListView, DetailView } from '@/components/contract-ui';
import UomTable from './UomTable';
import UomForm from './UomForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'reference', name: 'UOM' };

export default function App({ token, apiBaseUrl, window, windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="uom"
        Form={UomForm}
        catalogs={catalogs}
        entityLabel="Uom"
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
      entity="uom"
      Table={UomTable}
      entityLabel="Uoms"
      windowName={windowName}
      token={token}
      apiBaseUrl={apiBaseUrl}
      {...props}
    />
  );
}
