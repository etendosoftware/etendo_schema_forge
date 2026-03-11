import { ListView, DetailView } from '@/components/contract-ui';
import ProductTable from './ProductTable';
import ProductForm from './ProductForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'reference', name: 'Product' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="product"
        Form={ProductForm}
        catalogs={catalogs}
        entityLabel="Product"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="product"
      Table={ProductTable}
      entityLabel="Product"
      windowName={windowName}
      {...props}
    />
  );
}
