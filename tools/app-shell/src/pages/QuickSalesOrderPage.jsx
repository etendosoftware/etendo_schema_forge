import { useState, useReducer, useEffect, useRef, useCallback, useMemo } from 'react';
import { useUI, useMenuLabel } from '@/i18n';
import { toast } from 'sonner';
import { Receipt, TrendingUp, Loader2, ScanBarcode } from 'lucide-react';
import { useSetPageMeta } from '@/components/layout/PageMetaContext';
import { useFavorites } from '@/components/layout/FavoritesContext';
import CustomerSelector from './quick-sales-order/CustomerSelector.jsx';
import ProductSearchBar from './quick-sales-order/ProductSearchBar.jsx';
import ProductGrid from './quick-sales-order/ProductGrid.jsx';
import CartPanel from './quick-sales-order/CartPanel.jsx';
import PaymentPanel from './quick-sales-order/PaymentPanel.jsx';
import { useQuickSalesData, PAYMENT_METHODS } from '@/hooks/useQuickSalesData.js';
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

export default function QuickSalesOrderPage({ apiBaseUrl }) {
  const ui = useUI();
  const tMenu = useMenuLabel();

  // Real data from Sales Order API
  const {
    products: allProducts,
    customers,
    categories: productCategories,
    topSellers,
    previousOrders,
    customerPriceLists,
    loading: dataLoading,
    error: dataError,
  } = useQuickSalesData(apiBaseUrl);

  // State
  const [cartLines, dispatch] = useReducer(cartReducer, []);
  const [customer, setCustomer] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountTendered, setAmountTendered] = useState(0);
  const [activeTab, setActiveTab] = useState('cart');
  const [showPriority, setShowPriority] = useState(true);
  const [viewMode, setViewMode] = useState('grid');

  // Refs
  const productSearchRef = useRef(null);
  const customerSearchRef = useRef(null);

  // Scanner state
  const [scanFlash, setScanFlash] = useState(false);

  // Set default customer when data loads
  useEffect(() => {
    if (customers.length > 0 && !customer) {
      setCustomer(customers[0]); // Anonymous customer is first
    }
  }, [customers, customer]);

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
      toast.success(ui('qsoScanAdded'), {
        description: product.name,
        duration: 2000,
        position: 'top-right',
      });
    } else {
      setSearchQuery(barcode.trim());
      toast.error(ui('qsoScanNotFound'), {
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
    if (!customer) return new Set();
    const ids = topSellers[customer.id] || [];
    return new Set(ids);
  }, [customer, topSellers]);

  const filteredProducts = useMemo(() => {
    let result = allProducts;

    // Filter by customer's price list, or dedup to one per product when no customer
    const customerPL = customer && !customer.isAnonymous ? customerPriceLists[customer.id] : null;
    if (customerPL) {
      result = result.filter(p => p.priceListVersion === customerPL);
    } else {
      // No specific customer: keep only the first entry per productId
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
  }, [allProducts, searchQuery, category, customer, customerPriceLists]);

  // Add product handler
  const handleAddProduct = useCallback((product) => {
    dispatch({ type: 'ADD_ITEM', product });
    setActiveTab('cart');
    toast.success(ui('qsoProductAdded'), {
      description: product.name,
      duration: 1500,
      position: 'top-right',
    });
  }, [ui]);

  // Repeat order handler
  const handleRepeatOrder = useCallback((order) => {
    dispatch({ type: 'CLEAR_CART' });
    const orderCustomer = customers.find(c => c.id === order.customerId);
    if (orderCustomer) setCustomer(orderCustomer);
    let matched = 0;
    const lines = order.lines || [];
    for (const line of lines) {
      const lineId = (line.productId || '').trim().toUpperCase();
      const product = allProducts.find(p => (p.productId || '').trim().toUpperCase() === lineId);
      if (product) {
        dispatch({ type: 'ADD_ITEM', product, qty: line.qty });
        matched++;
      }
    }
    setActiveTab('cart');
    if (matched === 0 && lines.length > 0) {
      toast.error(ui('qsoRepeatNoProducts'), {
        description: order.documentNo,
        duration: 3000,
        position: 'top-right',
      });
    } else if (matched < lines.length) {
      toast.warning(ui('qsoRepeatPartial'), {
        description: `${matched}/${lines.length}`,
        duration: 3000,
        position: 'top-right',
      });
    } else {
      toast.success(ui('qsoOrderRepeated'), {
        description: order.documentNo,
        duration: 2000,
        position: 'top-right',
      });
    }
  }, [ui, customers, allProducts]);

  // Action handlers
  const handleCreateOrder = useCallback(() => {
    toast.success(ui('qsoOrderCreated'), { position: 'top-right' });
  }, [ui]);

  const handleCreateAndPay = useCallback(() => {
    setShowPayment(prev => !prev);
    setAmountTendered(0);
  }, []);

  const handleConfirmPayment = useCallback(() => {
    toast.success(ui('qsoPaymentCompleted'), { position: 'top-right' });
    dispatch({ type: 'CLEAR_CART' });
    setShowPayment(false);
    setAmountTendered(0);
    // Reset to anonymous customer
    const anon = customers.find(c => c.isAnonymous);
    if (anon) setCustomer(anon);
  }, [ui, customers]);

  const handleCancel = useCallback(() => {
    dispatch({ type: 'CLEAR_CART' });
    setShowPayment(false);
    setAmountTendered(0);
  }, []);

  const handleNewOrder = useCallback(() => {
    dispatch({ type: 'CLEAR_CART' });
    const anon = customers.find(c => c.isAnonymous);
    if (anon) setCustomer(anon);
    setSearchQuery('');
    setCategory('all');
    setShowPayment(false);
    setAmountTendered(0);
    setActiveTab('cart');
  }, [customers]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
          if (showPayment) setShowPayment(false);
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
          customerSearchRef.current?.focus();
          break;
        case 'Escape':
          if (showPayment) setShowPayment(false);
          break;
        case 'F12':
          e.preventDefault();
          handleNewOrder();
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showPayment, handleNewOrder]);

  const translatedTitle = tMenu('Quick Sales Order');
  const breadcrumb = `${tMenu('Proof of Concept')} / ${translatedTitle}`;
  const { toggleFavorite, isFavorite } = useFavorites();
  const favKey = 'quick-sales-order';
  useSetPageMeta({
    title: translatedTitle,
    breadcrumb,
    onAddToFavorites: () => toggleFavorite(favKey, 'Quick Sales Order'),
    isFavorite: isFavorite(favKey),
  }, [isFavorite(favKey)]);

  if (dataLoading) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="quick-sales-order-page">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" data-testid="Loader2__79898e" />
          <span className="text-sm">{ui('qsoLoading')}</span>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="h-full flex items-center justify-center" data-testid="quick-sales-order-page">
        <div className="text-center space-y-2">
          <Receipt
            className="h-10 w-10 text-muted-foreground/30 mx-auto"
            data-testid="Receipt__79898e" />
          <p className="text-sm font-medium text-destructive">{dataError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col" data-testid="quick-sales-order-page">
      {/* Main content: two columns */}
      <div className="flex-1 overflow-hidden bg-muted/10 p-4">
        <div className="h-full grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left panel: products */}
          <div className="lg:col-span-3 flex flex-col gap-3 overflow-auto">
            <CustomerSelector
              selected={customer}
              onSelect={setCustomer}
              customers={customers}
              inputRef={customerSearchRef}
              data-testid="CustomerSelector__79898e" />
            <div className="flex gap-2 items-center">
              <div className="flex-1 relative">
                <ProductSearchBar
                  query={searchQuery}
                  onChange={setSearchQuery}
                  inputRef={productSearchRef}
                  data-testid="ProductSearchBar__79898e" />
              </div>
              <div
                title={lastScan ? `${ui('qsoScanDetected')}: ${lastScan}` : ui('qsoScanDetected')}
                className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border transition-all duration-300 ${
                  scanFlash
                    ? 'border-green-400 bg-green-50 text-green-600 scale-110'
                    : 'border-border bg-white text-muted-foreground/40'
                }`}
              >
                <ScanBarcode className="h-4 w-4" data-testid="ScanBarcode__79898e" />
              </div>
              <button
                onClick={() => setShowPriority(prev => !prev)}
                title={ui('qsoPriority')}
                className={`flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  showPriority
                    ? 'border-amber-400 bg-amber-50 text-amber-600'
                    : 'border-border bg-white text-muted-foreground hover:bg-muted/30'
                }`}
              >
                <TrendingUp className="h-4 w-4" data-testid="TrendingUp__79898e" />
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
                data-testid="ProductGrid__79898e" />
            </div>
          </div>

          {/* Right panel: cart/history + payment */}
          <div className="lg:col-span-2 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col min-h-0">
              <CartPanel
                lines={cartLines}
                dispatch={dispatch}
                onCreateOrder={handleCreateOrder}
                onCreateAndPay={handleCreateAndPay}
                onCancel={handleCancel}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                customerId={customer?.id}
                onRepeatOrder={handleRepeatOrder}
                previousOrders={previousOrders}
                data-testid="CartPanel__79898e" />
              <PaymentPanel
                visible={showPayment}
                grandTotal={grandTotal}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                amountTendered={amountTendered}
                onAmountChange={setAmountTendered}
                onConfirm={handleConfirmPayment}
                onBack={() => setShowPayment(false)}
                methods={PAYMENT_METHODS}
                data-testid="PaymentPanel__79898e" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
