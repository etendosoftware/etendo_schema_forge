import { createRoot } from 'react-dom/client';
import { initBrowserObservability } from './lib/observability/browser.js';

initBrowserObservability();
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import App from './App.jsx';
import './index.css';

if (import.meta.env.VITE_APP_TITLE) {
  document.title = import.meta.env.VITE_APP_TITLE;
}

createRoot(document.getElementById('root')).render(
  <ThemeProvider
    attribute="class"
    defaultTheme="light"
    forcedTheme="light"
    data-testid="ThemeProvider__bc6e1f">
    <App data-testid="App__bc6e1f" />
    <Toaster
      position="bottom-right"
      richColors
      data-testid="Toaster__bc6e1f"
      containerAriaLabel="Notifications"
      toastOptions={{
        classNames: {
          error: 'toast-error',
          success: 'toast-success',
          warning: 'toast-warning',
          info: 'toast-info',
        },
      }}
    />
  </ThemeProvider>
);
