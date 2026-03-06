import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import LoginPage from './auth/LoginPage.jsx';
import AppLayout from './layout/AppLayout.jsx';
import WindowLoader from './windows/WindowLoader.jsx';
import PreviewPage from './preview/PreviewPage.jsx';
import { buildMenuGroups, buildWindowMap } from './windows/registry.js';
import { createMockFetch } from './lib/mockFetch.js';

const API_BASE_URL = '/etendo_sf/api';

async function loadAllMockData() {
  const modules = await Promise.all([
    import('@generated/sales-order/generated/web/sales-order/mockData.js'),
    import('@generated/business-partner/generated/web/business-partner/mockData.js'),
    import('@generated/warehouse/generated/web/warehouse/mockData.js'),
    import('@generated/price-list/generated/web/price-list/mockData.js'),
    import('@generated/payment-term/generated/web/payment-term/mockData.js'),
    import('@generated/payment-method/generated/web/payment-method/mockData.js'),
    import('@generated/product/generated/web/product/mockData.js'),
    import('@generated/product-category/generated/web/product-category/mockData.js'),
    import('@generated/tax/generated/web/tax/mockData.js'),
    import('@generated/uom/generated/web/uom/mockData.js'),
    import('@generated/user/generated/web/user/mockData.js'),
    import('@generated/requisition/generated/web/requisition/mockData.js'),
    import('@generated/purchase-order/generated/web/purchase-order/mockData.js'),
    import('@generated/goods-receipt/generated/web/goods-receipt/mockData.js'),
    import('@generated/purchase-invoice/generated/web/purchase-invoice/mockData.js'),
    import('@generated/manage-requisitions/generated/web/manage-requisitions/mockData.js'),
    import('@generated/return-to-vendor/generated/web/return-to-vendor/mockData.js'),
    import('@generated/return-to-vendor-shipment/generated/web/return-to-vendor-shipment/mockData.js'),
    import('@generated/landed-cost/generated/web/landed-cost/mockData.js'),
  ]);

  const merged = {};
  for (const mod of modules) {
    for (const [key, value] of Object.entries(mod)) {
      if (key !== 'default') {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function AuthGuard({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes({ menuGroups, windowMap }) {
  const { isAuthenticated } = useAuth();

  if (menuGroups.length === 0) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }

  const firstWindow = menuGroups[0].items[0].name;

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        element={
          <AuthGuard>
            <AppLayout menuGroups={menuGroups} />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to={`/${firstWindow}`} replace />} />
        <Route path="preview" element={<PreviewPage />} />
        <Route
          path=":windowName"
          element={<WindowLoader windowMap={windowMap} apiBaseUrl={API_BASE_URL} />}
        />
      </Route>
    </Routes>
  );
}

export default function App() {
  const [menuGroups] = useState(() => buildMenuGroups());
  const [windowMap] = useState(() => buildWindowMap());

  useEffect(() => {
    if (import.meta.env.VITE_MOCK === 'true') {
      loadAllMockData().then(mockData => {
        const mockFetch = createMockFetch(mockData, API_BASE_URL);
        const originalFetch = window.fetch;
        window.fetch = async (url, opts) => {
          const mockResult = await mockFetch(url, opts);
          if (mockResult !== undefined) return mockResult;
          return originalFetch(url, opts);
        };
      });
    }
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes menuGroups={menuGroups} windowMap={windowMap} />
      </AuthProvider>
    </BrowserRouter>
  );
}
