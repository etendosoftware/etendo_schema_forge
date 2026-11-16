import { useEffect, useRef } from 'react';
import { trackInvoiceInboxOpened } from '@/lib/productUsageTelemetry.js';

/**
 * ETP-6050 -- records one `invoice_inbox_opened` each time the Invoice Inbox page is shown.
 *
 * The page is a custom window, so the generic `window_opened` of ListView never fires for it and
 * the backend-only `invoice-inbox` flag has no browser-side trail. The page is mounted only while
 * it is on screen (route guard in `index.jsx`), so one opening is one mount: a ref guards against
 * the StrictMode double effect, and re-renders (list refresh, drawer open/close, locale change)
 * never re-run it. Leaving and coming back remounts the page, which is a new opening.
 */
export function useInvoiceInboxOpenedTracking() {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackInvoiceInboxOpened();
  }, []);
}
