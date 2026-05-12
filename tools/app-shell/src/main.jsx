import { createRoot } from 'react-dom/client';
import { initSentry } from './lib/sentry.js';
import { initRum } from './lib/rum.js';

initSentry();
initRum();
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import App from './App.jsx';
import './index.css';

if (import.meta.env.VITE_APP_TITLE) {
  document.title = import.meta.env.VITE_APP_TITLE;
}

createRoot(document.getElementById('root')).render(
  <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light">
    <App />
    <Toaster position="bottom-right" richColors />
  </ThemeProvider>
);
