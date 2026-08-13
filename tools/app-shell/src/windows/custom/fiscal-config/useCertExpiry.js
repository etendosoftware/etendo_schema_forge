import { useState, useEffect } from 'react';
import { neoBase } from '@/components/related-documents/helpers.js';
import { daysUntil } from './certExpiryUtils.js';
import { useApiFetch } from '@/auth/useApiFetch.js';

export { daysUntil };

export function useCertExpiry(apiBaseUrl, { mockDaysLeft = null, orgId = null } = {}) {
  const [daysLeft, setDaysLeft] = useState(null);
  const apiFetch = useApiFetch(neoBase(apiBaseUrl));

  useEffect(() => {
    if (mockDaysLeft !== null) {
      setDaysLeft(mockDaysLeft);
      return;
    }
    if (!apiBaseUrl || !orgId) {
      setDaysLeft(null);
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
        } else {
          setDaysLeft(null);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [apiFetch, mockDaysLeft, apiBaseUrl, orgId]);

  return { daysLeft };
}
