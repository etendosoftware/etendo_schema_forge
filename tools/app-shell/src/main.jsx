import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light">
    <App />
    <Toaster position="bottom-right" richColors />
  </ThemeProvider>
);
