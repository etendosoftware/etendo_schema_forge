import { useState, useEffect } from 'react';
import { PackageOpen } from 'lucide-react';
import { resolveIdentifier } from '@/lib/resolveIdentifier.js';

function ProductCard({ row, onNavigate, token, apiBaseUrl }) {
  const [imgSrc, setImgSrc] = useState(null);
  const imageId = row.image;
  // apiBaseUrl is e.g. "/sws/neo/product"; image endpoint lives at "/sws/neo/image/{id}"
  const neoBaseUrl = apiBaseUrl.replace(/\/[^/]+$/, '');

  useEffect(() => {
    if (!imageId) return;
    let objectUrl;
    fetch(`${neoBaseUrl}/image/${imageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setImgSrc(objectUrl);
        }
      })
      .catch(() => {});
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageId, token, neoBaseUrl]);

  const categoryLabel = resolveIdentifier(row, 'productCategory');

  return (
    <div
      onClick={() => onNavigate(row.id)}
      className="cursor-pointer border border-border rounded-xl p-3 hover:shadow-md transition-shadow bg-white flex flex-col gap-2"
    >
      <div className="w-full aspect-square bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden">
        {imgSrc ? (
          <img src={imgSrc} alt={row.name} className="w-full h-full object-contain" />
        ) : (
          <PackageOpen size={40} className="text-gray-300" />
        )}
      </div>
      <div className="text-sm font-semibold truncate leading-tight">{row.name}</div>
      {row.searchKey && (
        <div className="text-xs text-muted-foreground truncate">{row.searchKey}</div>
      )}
      {categoryLabel && (
        <div className="text-xs text-gray-400 truncate">{categoryLabel}</div>
      )}
    </div>
  );
}

export default function ProductGallery({ data, onNavigate, token, apiBaseUrl }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <PackageOpen size={48} className="mb-3 text-gray-300" />
        <p className="text-sm">No products found</p>
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
        />
      ))}
    </div>
  );
}
