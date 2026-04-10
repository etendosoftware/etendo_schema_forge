import { useState, useReducer, useEffect, useRef, useCallback, useMemo } from 'react';
import { useUI, useMenuLabel } from '@/i18n';
import { toast } from 'sonner';
import { ClipboardList, MoreVertical, TrendingUp, Loader2, ScanBarcode, Search, Mic, Sparkles, Plus, Bell } from 'lucide-react';

import LocaleSwitcher from '@/components/LocaleSwitcher.jsx';
import { UserAvatarButton, UserContextSwitcher } from '@/components/UserContextSwitcher.jsx';
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
  const [showUserContext, setShowUserContext] = useState(false);

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

  if (dataLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="quick-purchase-order-page">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{ui('qpoLoading')}</span>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="quick-purchase-order-page">
        <div className="text-center space-y-2">
          <ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto" />
          <p className="text-sm font-medium text-destructive">{dataError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="quick-purchase-order-page">
      {/* Top bar */}
      <div className="px-6 pt-3 pb-3 shrink-0">
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-xl font-bold text-foreground">{translatedTitle}</h1>
              <button className="text-muted-foreground hover:text-foreground">
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{breadcrumb}</p>
          </div>

          {/* Center: global search */}
          <div className="flex-1 flex justify-center">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={ui('searchPlaceholder')}
                readOnly
                tabIndex={-1}
                className="w-full h-9 rounded-lg border border-border/50 bg-white/60 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors cursor-default"
              />
              <Mic className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            </div>
          </div>

          {/* Right: action icons */}
          <div className="flex items-center gap-1 shrink-0">
            <kbd className="hidden lg:inline-block text-[10px] text-muted-foreground/50 border border-border/50 rounded px-1.5 py-0.5 mr-1">
              F2 &middot; F4 &middot; F12
            </kbd>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Sparkles className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Plus className="h-4 w-4" />
            </button>
            <button className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="h-4 w-4" />
            </button>
            <LocaleSwitcher />
            <UserAvatarButton isOpen={showUserContext} onClick={() => setShowUserContext(v => !v)} />
            {showUserContext && <UserContextSwitcher onClose={() => setShowUserContext(false)} />}
          </div>
        </div>
      </div>

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
            />
            <div className="flex gap-2 items-center">
              <div className="flex-1 relative">
                <ProductSearchBar
                  query={searchQuery}
                  onChange={setSearchQuery}
                  inputRef={productSearchRef}
                />
              </div>
              <div
                title={lastScan ? `${ui('qpoScanDetected')}: ${lastScan}` : ui('qpoScanDetected')}
                className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border transition-all duration-300 ${
                  scanFlash
                    ? 'border-green-400 bg-green-50 text-green-600 scale-110'
                    : 'border-border bg-white text-muted-foreground/40'
                }`}
              >
                <ScanBarcode className="h-4 w-4" />
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
                <TrendingUp className="h-4 w-4" />
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
              />
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
              />
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
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
