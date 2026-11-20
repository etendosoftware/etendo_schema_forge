import ProductSidebarDividerToggle from './ProductSidebarDividerToggle';

// Inner layout of the product side panel column (the column itself comes from `sidebarClassName` in
// artifacts/product/decisions.json: `relative flex flex-col`, animated width, NO overflow). Split in two layers so
// the divider button can sit on the column border without being clipped:
//   column (overflow visible)  ->  divider button (absolute, on the border) + clip layer
//   clip layer (overflow-hidden) -> scroll layer (overflow-y-auto, FIXED width per state)
// The fixed width keeps the panel content from reflowing while the column width animates; the clip layer just
// reveals or hides it.
const FULL_WIDTH = 'w-[319px] pt-2 pr-4 pb-5'; // 320 column - 1 px border
const STRIP_WIDTH = 'w-[47px] pt-2'; // 48 column - 1 px border

export default function ProductSidebarFrame({ collapsed, onToggle, children }) {
  return (
    <>
      <ProductSidebarDividerToggle
        collapsed={collapsed}
        onToggle={onToggle}
        data-testid="ProductSidebarDividerToggle__1b589e" />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="ProductSidebarClip">
        <div className={`min-h-0 flex-1 shrink-0 overflow-y-auto overflow-x-hidden ${collapsed ? STRIP_WIDTH : FULL_WIDTH}`}>
          {children}
        </div>
      </div>
    </>
  );
}
