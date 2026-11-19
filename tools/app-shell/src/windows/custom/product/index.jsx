import './productFkResolvers.js';
import './productImportDescriptor.js';
import ProductPage from '@generated/product/generated/web/product/ProductPage';
import ProductCustomTable from './ProductCustomTable';

/* eslint-disable react/prop-types */

// ETP-5696: the sheet shares its row with the 256px image and a fixed 320px stock panel, so on a narrow
// window the header grid is squeezed to a few dozen px and the checkboxes overlap. Give the content column
// a minimum width: the column then scrolls horizontally (as the Price tab already does) instead of
// compressing the form. ETP-5889: padding is `pr-2 pb-2` (what DetailView gives a standard window with a
// sidebar), NOT `px-2`: the form card and the tab wrappers already inset the content 8px on the left, so a
// left padding here stacked a second 8px and pushed the header fields 8px right of the Cancel button.
// ProductMovementsTab relies on this exact padding: `pr-2` for the `-mr-4` bleed of its table, and `pb-2`
// for the `-bottom-2` of its sticky period total (flush with the card's bottom edge).
const PRODUCT_CONTENT_CLASS = 'pr-2 pb-2 [&>*]:min-w-[680px]';

export default function ProductApp({ windowName, recordId, ...props }) {
  return (
    <div className="contents [&_input:not(:disabled):hover]:!bg-[hsl(var(--muted))] [&_textarea:not(:disabled):hover]:!bg-[hsl(var(--muted))] [&_button[role='combobox']:not([disabled]):hover]:!bg-[hsl(var(--muted))]">
      <ProductPage
        windowName={windowName}
        recordId={recordId}
        Table={ProductCustomTable}
        sidebarFormScrollPaddingX={PRODUCT_CONTENT_CLASS}
        // ETP-5889: filled blue Save (dedicated hover token) and blue active tab.
        primarySave="strong"
        tabsActiveAccent="primary"
        {...props}
        data-testid="ProductPage__2c94d0" />
    </div>
  );
}
