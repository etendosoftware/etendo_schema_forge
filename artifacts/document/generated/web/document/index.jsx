import { ListView } from '@/components/contract-ui/ListView.jsx';
import { DetailView } from '@/components/contract-ui/DetailView.jsx';
import DocumentTable from './DocumentTable';
import DocumentForm from './DocumentForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'documents', name: 'Document' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="document"
        Form={DocumentForm}
        catalogs={catalogs}
        entityLabel="Document"
        windowName={windowName}
        recordId={recordId}
        window={windowMeta}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="document"
      Table={DocumentTable}
      entityLabel="Document"
      windowName={windowName}
      window={windowMeta}
      {...props}
    />
  );
}
