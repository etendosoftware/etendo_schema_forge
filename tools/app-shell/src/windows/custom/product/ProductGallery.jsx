import { resolveIdentifier } from '@/lib/resolveIdentifier.js';
import { useUI } from '@/i18n';
import { BoxIcon } from './ProductListCells';
import { useProductImage } from './useProductImage';

/* eslint-disable react/prop-types */

function ProductCard({ row, onNavigate, token, apiBaseUrl }) {
  const imgSrc = useProductImage(row.image, token, apiBaseUrl);

  const categoryLabel = resolveIdentifier(row, 'productCategory');

  return (
    <div
      onClick={() => onNavigate(row.id)}
      className="cursor-pointer bg-white border border-[#E8EAEF] rounded-xl p-1 shadow-[0px_1px_2px_rgba(18,18,23,0.05)] flex flex-col hover:shadow-md transition-shadow"
    >
      {/* Image area */}
      <div className="relative w-full h-[180px] rounded-lg overflow-hidden flex-shrink-0 bg-[#E8EAEF]">
        {imgSrc ? (
          <img src={imgSrc} alt={row.name} className="w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <BoxIcon size={64} color="#828FA3" data-testid="BoxIcon__a29533" />
          </div>
        )}
      </div>
      {/* Text area */}
      <div className="flex flex-col p-3 gap-1">
        <span className="text-sm font-semibold text-[#121217] leading-5 truncate">{row.name}</span>
        {row.searchKey && (
          <span className="inline-flex items-center px-2 py-1 bg-[#F5F7F9] rounded-full text-xs text-[#3F3F50] leading-4 w-fit max-w-full truncate">
            {row.searchKey}
          </span>
        )}
        {categoryLabel && (
          <span className="text-sm text-[#555B6D] leading-5 truncate">{categoryLabel}</span>
        )}
      </div>
    </div>
  );
}

export default function ProductGallery({ data, onNavigate, token, apiBaseUrl }) {
  const ui = useUI();
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <BoxIcon size={48} color="#828FA3" data-testid="BoxIcon__a29533" />
        <p className="text-sm mt-3">{ui('noProductsFound')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pt-2">
      {data.map((row) => (
        <ProductCard
          key={row.id}
          row={row}
          onNavigate={onNavigate}
          token={token}
          apiBaseUrl={apiBaseUrl}
          data-testid="ProductCard__a29533" />
      ))}
    </div>
  );
}
