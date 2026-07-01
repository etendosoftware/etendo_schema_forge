import { useMemo, useRef, useLayoutEffect } from 'react';
import { useUI } from '@/i18n';
import { Badge } from '@/components/ui/badge';
import { Plus, TrendingUp, LayoutGrid, List } from 'lucide-react';

const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#06b6d4',
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function ProductGrid({ products, categories: categoriesProp, category, onCategoryChange, onAddProduct, topSellerIds, showPriority, viewMode = 'grid', onViewModeChange }) {
  const ui = useUI();
  const gridRef = useRef(null);
  const positionsRef = useRef(new Map());

  const categories = useMemo(() => {
    if (categoriesProp) return ['all', ...categoriesProp];
    return ['all'];
  }, [categoriesProp]);

  const sorted = useMemo(() => {
    if (!showPriority || !topSellerIds || topSellerIds.size === 0) return products;
    return [...products].sort((a, b) => {
      const aTop = topSellerIds.has(a.productId || a.id) ? 0 : 1;
      const bTop = topSellerIds.has(b.productId || b.id) ? 0 : 1;
      return aTop - bTop;
    });
  }, [products, topSellerIds, showPriority]);

  // FLIP animation: capture positions before render (grid mode only)
  useLayoutEffect(() => {
    if (viewMode !== 'grid') return;
    const grid = gridRef.current;
    if (!grid) return;
    const cards = grid.querySelectorAll('[data-product-id]');
    const oldPositions = positionsRef.current;
    const newPositions = new Map();

    cards.forEach(card => {
      const id = card.dataset.productId;
      const rect = card.getBoundingClientRect();
      newPositions.set(id, { x: rect.left, y: rect.top });

      const old = oldPositions.get(id);
      if (old) {
        const dx = old.x - rect.left;
        const dy = old.y - rect.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          card.style.transform = `translate(${dx}px, ${dy}px)`;
          card.style.transition = 'none';
          requestAnimationFrame(() => {
            card.style.transition = 'transform 350ms cubic-bezier(0.25, 0.8, 0.25, 1)';
            card.style.transform = '';
          });
        }
      }
    });

    positionsRef.current = newPositions;
  }, [sorted, viewMode]);

  let productDisplay;
  if (sorted.length === 0) {
    productDisplay = (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        {ui('qsoNoResults')}
      </div>
    );
  } else if (viewMode === 'list') {
    productDisplay = (
      /* List mode: compact rows */
      (<div className="flex flex-col rounded-lg border border-border bg-white overflow-hidden">
        {sorted.map((product, idx) => {
          const isTop = showPriority && topSellerIds?.has(product.productId || product.id);
          return (
            <button
              key={product.id}
              data-product-id={product.id}
              type="button"
              onClick={() => onAddProduct(product)}
              className={`group flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/40 ${
                idx > 0 ? 'border-t border-border' : ''
              } ${isTop ? 'bg-amber-50/50' : ''}`}
            >
              {/* Small avatar */}
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: getAvatarColor(product.name) }}
              >
                {product.name.charAt(0)}
              </div>
              {/* Name + searchKey */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{product.name}</span>
                  {isTop && (
                    <Badge
                      className="bg-amber-500 hover:bg-amber-500 text-white text-[9px] px-1 py-0 gap-0.5 shrink-0"
                      data-testid="Badge__ff9d59">
                      <TrendingUp className="h-2 w-2" data-testid="TrendingUp__ff9d59" />
                      {ui('qsoTopSeller')}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{product.searchKey}</p>
              </div>
              {/* Price */}
              <span className="text-sm font-bold text-foreground shrink-0">
                {product.price.toFixed(2)} &euro;
              </span>
              {/* Stock badge */}
              {product.stock != null && (
                <Badge
                  variant={product.stock > 0 ? 'secondary' : 'destructive'}
                  className="text-[10px] px-1.5 py-0 shrink-0"
                  data-testid="Badge__ff9d59">
                  {product.stock > 0
                    ? `${product.stock} ${ui('qsoInStock')}`
                    : ui('qsoOutOfStock')
                  }
                </Badge>
              )}
              {/* Add icon on hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                  <Plus className="h-3.5 w-3.5" data-testid="Plus__ff9d59" />
                </div>
              </div>
            </button>
          );
        })}
      </div>)
    );
  } else {
    productDisplay = (
      /* Grid mode: card grid */
      (<div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {sorted.map(product => {
          const isTop = showPriority && topSellerIds?.has(product.productId || product.id);
          return (
            <button
              key={product.id}
              data-product-id={product.id}
              type="button"
              onClick={() => onAddProduct(product)}
              className={`group relative flex flex-col items-start gap-2 rounded-lg border bg-white p-3 text-left hover:shadow-sm transition-[border-color,box-shadow,ring] ${
                isTop
                  ? 'border-amber-300 ring-1 ring-amber-200/50'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              {/* Top seller badge */}
              {isTop && (
                <div className="absolute top-2 left-2 z-10">
                  <Badge
                    className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] px-1.5 py-0 gap-0.5"
                    data-testid="Badge__ff9d59">
                    <TrendingUp className="h-2.5 w-2.5" data-testid="TrendingUp__ff9d59" />
                    {ui('qsoTopSeller')}
                  </Badge>
                </div>
              )}
              {/* Avatar */}
              <div className={`flex w-full items-center gap-2.5 ${isTop ? 'mt-4' : ''}`}>
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
                  style={{ backgroundColor: getAvatarColor(product.name) }}
                >
                  {product.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate leading-tight">{product.name}</p>
                  <p className="text-[11px] text-muted-foreground">{product.searchKey}</p>
                </div>
              </div>
              {/* Price + stock */}
              <div className="flex w-full items-center justify-between">
                <span className="text-base font-bold text-foreground">
                  {product.price.toFixed(2)} &euro;
                </span>
                {product.stock != null && (
                  <Badge
                    variant={product.stock > 0 ? 'secondary' : 'destructive'}
                    className="text-[10px] px-1.5 py-0"
                    data-testid="Badge__ff9d59">
                    {product.stock > 0
                      ? `${product.stock} ${ui('qsoInStock')}`
                      : ui('qsoOutOfStock')
                    }
                  </Badge>
                )}
              </div>
              {/* Hover add icon */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                  <Plus className="h-3.5 w-3.5" data-testid="Plus__ff9d59" />
                </div>
              </div>
            </button>
          );
        })}
      </div>)
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Category filters + view toggle */}
      <div className="flex items-center gap-2">
        <div className="flex flex-wrap gap-1.5 flex-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                category === cat
                  ? 'bg-foreground text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {cat === 'all' ? ui('qsoAllCategories') : cat}
            </button>
          ))}
        </div>
        {onViewModeChange && (
          <div className="flex shrink-0 rounded-lg border border-border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => onViewModeChange('grid')}
              title={ui('qsoGridView')}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" data-testid="LayoutGrid__ff9d59" />
            </button>
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              title={ui('qsoListView')}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="h-3.5 w-3.5" data-testid="List__ff9d59" />
            </button>
          </div>
        )}
      </div>
      {/* Product display */}
      {productDisplay}
    </div>
  );
}
