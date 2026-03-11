import { ListView, DetailView } from '@/components/contract-ui';
import TaxTable from './TaxTable';
import TaxForm from './TaxForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'reference', name: 'Tax' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="tax"
        Form={TaxForm}
        catalogs={catalogs}
        entityLabel="Tax"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="tax"
      Table={TaxTable}
      entityLabel="Tax"
      windowName={windowName}
      {...props}
    />
  );
}
