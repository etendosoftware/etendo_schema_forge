import ProductPage from '@generated/product/generated/web/product/ProductPage';
import { SortIcon, RefreshIcon } from '@/components/ui/custom-icons';
import ProductCustomTable from './ProductCustomTable';

/* eslint-disable react/prop-types */

export default function ProductApp({ windowName, recordId, ...props }) {
  return (
    <div className="contents [&_input:not(:disabled):hover]:!bg-[#F5F7F9] [&_textarea:not(:disabled):hover]:!bg-[#F5F7F9] [&_button[role='combobox']:not([disabled]):hover]:!bg-[#F5F7F9]">
      <ProductPage
        windowName={windowName}
        recordId={recordId}
        Table={ProductCustomTable}
        SortIconComponent={SortIcon}
        RefreshIconComponent={RefreshIcon}
        {...props}
        data-testid="ProductPage__2c94d0" />
    </div>
  );
}
