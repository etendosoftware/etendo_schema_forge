import { ListView, DetailView } from '@/components/contract-ui';
import DocumentTable from './DocumentTable';
import DocumentForm from './DocumentForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'documents', name: 'Document' };

export default function App({ token, apiBaseUrl, window, windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="document"
        Form={DocumentForm}
        catalogs={catalogs}
        entityLabel="Document"
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
      entity="document"
      Table={DocumentTable}
      entityLabel="Documents"
      windowName={windowName}
      token={token}
      apiBaseUrl={apiBaseUrl}
      {...props}
    />
  );
}
