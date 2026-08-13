import { useEffect } from 'react';

export function useInvoiceUpdatedListener(specName, recordId, onRefresh) {
  useEffect(() => {
    if (!recordId) return;
    const handleInvoiceUpdated = (event) => {
      if (String(event.detail?.invoiceId) !== String(recordId)) return;
      onRefresh?.();
    };
    const eventName = `${specName}:invoice-updated`;
    window.addEventListener(eventName, handleInvoiceUpdated);
    return () => window.removeEventListener(eventName, handleInvoiceUpdated);
  }, [specName, recordId, onRefresh]);
}
