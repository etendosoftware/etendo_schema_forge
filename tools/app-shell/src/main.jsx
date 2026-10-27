import { createRoot } from 'react-dom/client';
import { installNeoRequestDedupe } from './lib/neoRequestDedupe.js';
import { initBrowserObservability } from './lib/observability/browser.js';
import { initFeatureFlags } from './lib/flags/index.js';
import { bootSupportSession } from './lib/supportSession.js';
import { detectBasePath } from './lib/neoBaseUrl.js';

// ETP-5351 — first, before anything can read or report the URL: takes a support ticket out of the
// address bar and decides whether this load is a support session, which keeps product analytics
// from being initialized at all (see lib/supportSession.js).
bootSupportSession({ routerBase: detectBasePath().routerBase });

// ETP-4952 — before anything can issue a request: one network read per resource per page load
// (the NEO session, a record's header, its marked attachment). See lib/neoRequestDedupe.js for
// the allowlist; every other request goes out untouched.
installNeoRequestDedupe();

// Fire-and-forget: never rejects, and flags resolve to their declared defaults
// until (or unless) the provider becomes ready.
const flagsReady = initFeatureFlags();
// Telemetry waits (bounded) for the flags so a provider killed by flag is never started.
initBrowserObservability({ flagsReady });
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
