import { useState, useReducer, useEffect, useRef, useCallback, useMemo } from 'react';
import { useUI, useMenuLabel } from '@/i18n';
import { toast } from 'sonner';
import { ClipboardList, TrendingUp, Loader2, ScanBarcode } from 'lucide-react';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFavorites } from '@/components/layout/FavoritesContext';
import SupplierSelector from './quick-purchase-order/SupplierSelector.jsx';
import ProductSearchBar from './quick-sales-order/ProductSearchBar.jsx';
import ProductGrid from './quick-sales-order/ProductGrid.jsx';
import CartPanel from './quick-purchase-order/CartPanel.jsx';
import SendOrderPanel from './quick-purchase-order/SendOrderPanel.jsx';
import { useQuickPurchaseData, SEND_METHODS } from '@/hooks/useQuickPurchaseData.js';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner.js';

// -- Cart Reducer --------------------------------------------------------------

let lineIdSeq = 0;

function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.find(l => l.product.id === action.product.id);
      if (existing) {
        return state.map(l =>
          l.id === existing.id ? { ...l, qty: l.qty + (action.qty || 1) } : l
        );
      }
      return [...state, {
        id: `line-${++lineIdSeq}`,
        product: action.product,
        qty: action.qty || 1,
        unitPrice: action.product.price,
        taxRate: action.product.taxRate,
      }];
    }
    case 'UPDATE_QTY': {
      if (action.qty <= 0) {
        return state.filter(l => l.id !== action.id);
      }
      return state.map(l =>
        l.id === action.id ? { ...l, qty: action.qty } : l
      );
    }
    case 'UPDATE_PRICE': {
      if (action.price < 0) return state;
      return state.map(l =>
        l.id === action.id ? { ...l, unitPrice: action.price } : l
      );
    }
    case 'REMOVE_ITEM':
      return state.filter(l => l.id !== action.id);
    case 'CLEAR_CART':
      return [];
    default:
      return state;
  }
}

// -- Component -----------------------------------------------------------------

export default function QuickPurchaseOrderPage({ apiBaseUrl }) {
  const ui = useUI();
  const tMenu = useMenuLabel();

  // Real data from PO API
  const {
    products: allProducts,
    suppliers,
    categories: productCategories,
    topSellers,
    previousOrders,
    supplierPriceLists,
    loading: dataLoading,
    error: dataError,
  } = useQuickPurchaseData(apiBaseUrl);

  // State
  const [cartLines, dispatch] = useReducer(cartReducer, []);
  const [supplier, setSupplier] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [showSend, setShowSend] = useState(false);
  const [sendMethod, setSendMethod] = useState('email');
  const [activeTab, setActiveTab] = useState('cart');
  const [showPriority, setShowPriority] = useState(true);
  const [viewMode, setViewMode] = useState('grid');

  // Refs
  const productSearchRef = useRef(null);
  const supplierSearchRef = useRef(null);

  // Scanner state
  const [scanFlash, setScanFlash] = useState(false);

  const handleBarcodeScan = useCallback((barcode) => {
    const trimmed = barcode.trim().toLowerCase();
    const product = allProducts.find(
      p => p.searchKey && p.searchKey.trim().toLowerCase() === trimmed
    );

    // Flash the scan indicator
    setScanFlash(true);
    setTimeout(() => setScanFlash(false), 1500);

    if (product) {
      dispatch({ type: 'ADD_ITEM', product });
      setActiveTab('cart');
      setSearchQuery('');
      toast.success(ui('qpoScanAdded'), {
        description: product.name,
        duration: 2000,
        position: 'top-right',
      });
    } else {
      setSearchQuery(barcode.trim());
      toast.error(ui('qpoScanNotFound'), {
        description: barcode.trim(),
        duration: 3000,
        position: 'top-right',
      });
    }
  }, [allProducts, ui]);

  const { lastScan, scanCount } = useBarcodeScanner({
    onScan: handleBarcodeScan,
    enabled: !dataLoading && !dataError,
    searchInputRef: productSearchRef,
  });

  // Derived
  const grandTotal = useMemo(() => {
    return cartLines.reduce((acc, l) => acc + l.qty * l.unitPrice * (1 + l.taxRate), 0);
  }, [cartLines]);

  const topSellerIds = useMemo(() => {
    if (!supplier) return new Set();
    const ids = topSellers[supplier.id] || [];
    return new Set(ids);
  }, [supplier, topSellers]);

  const filteredProducts = useMemo(() => {
    let result = allProducts;

    // Filter by supplier's price list, or dedup to one per product when no supplier
    const supplierPL = supplier ? supplierPriceLists[supplier.id] : null;
    if (supplierPL) {
      result = result.filter(p => p.priceListVersion === supplierPL);
    } else {
      // No supplier: keep only the first (cheapest) entry per productId
      const seen = new Set();
      result = result.filter(p => {
        if (seen.has(p.productId)) return false;
        seen.add(p.productId);
        return true;
      });
    }

    if (category !== 'all') {
      result = result.filter(p => p.category === category);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.searchKey.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allProducts, searchQuery, category, supplier, supplierPriceLists]);

  // Add product handler
  const handleAddProduct = useCallback((product) => {
    dispatch({ type: 'ADD_ITEM', product });
    setActiveTab('cart');
    toast.success(ui('qpoProductAdded'), {
      description: product.name,
      duration: 1500,
      position: 'top-right',
    });
  }, [ui]);

  // Repeat order handler
  const handleRepeatOrder = useCallback((order) => {
    dispatch({ type: 'CLEAR_CART' });
    const orderSupplier = suppliers.find(s => s.id === order.supplierId);
    if (orderSupplier) setSupplier(orderSupplier);
    let matched = 0;
    const lines = order.lines || [];
    for (const line of lines) {
      // Normalize UUIDs for comparison (case-insensitive, trimmed)
      const lineId = (line.productId || '').trim().toUpperCase();
      const product = allProducts.find(p => (p.productId || '').trim().toUpperCase() === lineId);
      if (product) {
        dispatch({ type: 'ADD_ITEM', product, qty: line.qty });
        matched++;
      }
    }
    setActiveTab('cart');
    if (matched === 0 && lines.length > 0) {
      toast.error(ui('qpoRepeatNoProducts'), {
        description: order.documentNo,
        duration: 3000,
        position: 'top-right',
      });
    } else if (matched < lines.length) {
      toast.warning(ui('qpoRepeatPartial'), {
        description: `${matched}/${lines.length}`,
        duration: 3000,
        position: 'top-right',
      });
    } else {
      toast.success(ui('qpoOrderRepeated'), {
        description: order.documentNo,
        duration: 2000,
        position: 'top-right',
      });
    }
  }, [ui, suppliers, allProducts]);

  // Action handlers
  const handleCreateOrder = useCallback(() => {
    toast.success(ui('qpoOrderCreated'), { position: 'top-right' });
  }, [ui]);

  const handleSendOrder = useCallback(() => {
    setShowSend(prev => !prev);
  }, []);

  const handleConfirmSend = useCallback(() => {
    toast.success(ui('qpoOrderSent'), { position: 'top-right' });
    dispatch({ type: 'CLEAR_CART' });
    setShowSend(false);
    setSupplier(null);
  }, [ui]);

  const handleCancel = useCallback(() => {
    dispatch({ type: 'CLEAR_CART' });
    setShowSend(false);
  }, []);

  const handleNewOrder = useCallback(() => {
    dispatch({ type: 'CLEAR_CART' });
    setSupplier(null);
    setSearchQuery('');
    setCategory('all');
    setShowSend(false);
    setActiveTab('cart');
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
          if (showSend) setShowSend(false);
        }
        return;
      }

      switch (e.key) {
        case 'F2':
          e.preventDefault();
          productSearchRef.current?.focus();
          break;
        case 'F4':
          e.preventDefault();
          supplierSearchRef.current?.focus();
          break;
        case 'Escape':
          if (showSend) setShowSend(false);
          break;
        case 'F12':
          e.preventDefault();
          handleNewOrder();
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSend, handleNewOrder]);

  const translatedTitle = tMenu('Quick Purchase Order');
  const breadcrumb = `${tMenu('Purchases')} / ${translatedTitle}`;
  const { toggleFavorite, isFavorite } = useFavorites();
  const favKey = 'quick-purchase-order';
  useSetPageMeta({
    title: translatedTitle,
    breadcrumb,
    onAddToFavorites: () => toggleFavorite(favKey, 'Quick Purchase Order'),
    isFavorite: isFavorite(favKey),
  }, [isFavorite(favKey)]);

  if (dataLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="quick-purchase-order-page">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__835b99" />
          <span className="text-sm">{ui('qpoLoading')}</span>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="quick-purchase-order-page">
        <div className="text-center space-y-2">
          <ClipboardList
            className="h-10 w-10 text-muted-foreground/30 mx-auto"
            data-testid="ClipboardList__835b99" />
          <p className="text-sm font-medium text-destructive">{dataError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="quick-purchase-order-page">
      {/* Main content: two columns */}
      <div className="flex-1 overflow-hidden bg-muted/10 p-4">
        <div className="h-full grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left panel: products */}
          <div className="lg:col-span-3 flex flex-col gap-3 overflow-auto">
            <SupplierSelector
              selected={supplier}
              onSelect={setSupplier}
              suppliers={suppliers}
              inputRef={supplierSearchRef}
              data-testid="SupplierSelector__835b99" />
            <div className="flex gap-2 items-center">
              <div className="flex-1 relative">
                <ProductSearchBar
                  query={searchQuery}
                  onChange={setSearchQuery}
                  inputRef={productSearchRef}
                  data-testid="ProductSearchBar__835b99" />
              </div>
              <div
                title={lastScan ? `${ui('qpoScanDetected')}: ${lastScan}` : ui('qpoScanDetected')}
                className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border transition-all duration-300 ${
                  scanFlash
                    ? 'border-green-400 bg-green-50 text-green-600 scale-110'
                    : 'border-border bg-white text-muted-foreground/40'
                }`}
              >
                <ScanBarcode className="h-4 w-4" data-testid="ScanBarcode__835b99" />
              </div>
              <button
                onClick={() => setShowPriority(prev => !prev)}
                title={ui('qpoPriority')}
                className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  showPriority
                    ? 'border-amber-400 bg-amber-50 text-amber-600'
                    : 'border-border bg-white text-muted-foreground hover:bg-muted/30'
                }`}
              >
                <TrendingUp className="h-4 w-4" data-testid="TrendingUp__835b99" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <ProductGrid
                products={filteredProducts}
                categories={productCategories}
                category={category}
                onCategoryChange={setCategory}
                onAddProduct={handleAddProduct}
                topSellerIds={topSellerIds}
                showPriority={showPriority}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                data-testid="ProductGrid__835b99" />
            </div>
          </div>

          {/* Right panel: cart/history + send */}
          <div className="lg:col-span-2 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col min-h-0">
              <CartPanel
                lines={cartLines}
                dispatch={dispatch}
                onCreateOrder={handleCreateOrder}
                onSendOrder={handleSendOrder}
                onCancel={handleCancel}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                supplierId={supplier?.id}
                onRepeatOrder={handleRepeatOrder}
                previousOrders={previousOrders}
                data-testid="CartPanel__835b99" />
              <SendOrderPanel
                visible={showSend}
                supplier={supplier}
                grandTotal={grandTotal}
                lines={cartLines}
                sendMethod={sendMethod}
                onSendMethodChange={setSendMethod}
                onConfirm={handleConfirmSend}
                onBack={() => setShowSend(false)}
                methods={SEND_METHODS}
                data-testid="SendOrderPanel__835b99" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
