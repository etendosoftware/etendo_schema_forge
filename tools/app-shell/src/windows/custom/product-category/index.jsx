import ProductCategoryPage from '@generated/product-category/generated/web/product-category/ProductCategoryPage';
import ProductCategoryCustomForm from './ProductCategoryCustomForm';

/* eslint-disable react/prop-types */

export default function ProductCategoryApp({ windowName, recordId, ...props }) {
  return (
    <ProductCategoryPage
      windowName={windowName}
      recordId={recordId}
      Form={ProductCategoryCustomForm}
      {...props}
      data-testid="ProductCategoryPage__162116" />
  );
}
