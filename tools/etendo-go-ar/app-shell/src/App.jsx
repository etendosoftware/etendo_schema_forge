import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@etendosoftware/app-shell-core/auth';
import { LocaleProvider } from '@etendosoftware/app-shell-core/i18n';
import OnboardingPage from './pages/OnboardingPage.jsx';
import { buildOnboardingReturnTo } from '@etendosoftware/etendo-go-core/onboarding';

function AuthGuard({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return (
      <Navigate
        to={buildOnboardingReturnTo(location)}
        replace
      />
    );
  }
  return children;
}

function MainApp() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Etendo GO — Argentina</h1>
      <p>Has ingresado al sistema. Esta es la página principal (Dashboard).</p>
    </div>
  );
}

export default function App() {
  const [locale, setLocale] = useState('es_AR');

  return (
    <BrowserRouter>
      <LocaleProvider locale={locale} setLocale={setLocale}>
        <AuthProvider>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/login" element={<Navigate to="/onboarding" replace />} />
            <Route
              path="/*"
              element={
                <AuthGuard>
                  <MainApp />
                </AuthGuard>
              }
            />
          </Routes>
        </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  );
}
