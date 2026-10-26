import './productFkResolvers.js';
import './productImportDescriptor.js';
import ProductPage from '@generated/product/generated/web/product/ProductPage';
import ProductCustomTable from './ProductCustomTable';

/* eslint-disable react/prop-types */

// ETP-5696: the sheet shares its row with the 256px image and a fixed 320px stock panel, so on a narrow
// window the header grid is squeezed to a few dozen px and the checkboxes overlap. Give the content column
// a minimum width: the column then scrolls horizontally (as the Price tab already does) instead of
// compressing the form. Same classes DetailView applies by default for a window with a sidebar (px-2 pb-2).
const PRODUCT_CONTENT_CLASS = 'px-2 pb-2 [&>*]:min-w-[820px]';

export default function ProductApp({ windowName, recordId, ...props }) {
  return (
    <div className="contents [&_input:not(:disabled):hover]:!bg-[hsl(var(--muted))] [&_textarea:not(:disabled):hover]:!bg-[hsl(var(--muted))] [&_button[role='combobox']:not([disabled]):hover]:!bg-[hsl(var(--muted))]">
      <ProductPage
        windowName={windowName}
        recordId={recordId}
        Table={ProductCustomTable}
        sidebarFormScrollPaddingX={PRODUCT_CONTENT_CLASS}
        {...props}
        data-testid="ProductPage__2c94d0" />
    </div>
  );
}
