import { ListView, DetailView } from '@/components/contract-ui';
import ProductCategoryTable from './ProductCategoryTable';
import ProductCategoryForm from './ProductCategoryForm';
import catalogs from './mockCatalogs';

const windowMeta = { category: 'reference', name: 'Product Category' };

export default function App({ windowName, recordId, ...props }) {
  if (recordId) {
    return (
      <DetailView
        entity="productCategory"
        Form={ProductCategoryForm}
        catalogs={catalogs}
        entityLabel="Product Category"
        windowName={windowName}
        recordId={recordId}
        {...props}
      />
    );
  }

  return (
    <ListView
      entity="productCategory"
      Table={ProductCategoryTable}
      entityLabel="Product Category"
      windowName={windowName}
      {...props}
    />
  );
}
