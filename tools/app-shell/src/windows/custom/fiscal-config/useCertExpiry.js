import { useState, useEffect } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { daysUntil } from './certExpiryUtils.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

export { daysUntil };

/**
 * The organization's certificate expiry: `daysLeft` (for the expiry banner) and the raw `validTo`
 * date (for the status panel's "Certificado" row, ETP-5831). `refreshKey` re-reads it — bumped by
 * FiscalConfigPage whenever the certificate is replaced.
 */
export function useCertExpiry(apiBaseUrl, { mockDaysLeft = null, orgId = null, refreshKey = 0 } = {}) {
  const [daysLeft, setDaysLeft] = useState(null);
  const [validTo, setValidTo] = useState(null);
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));

  useEffect(() => {
    if (mockDaysLeft !== null) {
      setDaysLeft(mockDaysLeft);
      return;
    }
    if (!apiBaseUrl || !orgId) {
      setDaysLeft(null);
      setValidTo(null);
      return;
    }
    setDaysLeft(null);
    const controller = new AbortController();
    apiFetch(`/certificate?${new URLSearchParams({ orgId })}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => {
        if (controller.signal.aborted) return;
        if (data?.exists && data?.validTo) {
          setDaysLeft(daysUntil(data.validTo));
          setValidTo(data.validTo);
        } else {
          setDaysLeft(null);
          setValidTo(null);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [apiFetch, mockDaysLeft, apiBaseUrl, orgId, refreshKey]);

  return { daysLeft, validTo };
}
