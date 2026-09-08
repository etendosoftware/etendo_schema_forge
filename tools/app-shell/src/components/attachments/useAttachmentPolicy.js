import { useEffect, useState } from 'react';
import { useApiFetch } from '@/auth/useApiFetch.js';
import { FALLBACK_ATTACHMENT_POLICY, resolveAttachmentPolicy } from './attachmentPolicy';

/**
 * Reads the server-owned attachments upload policy (max size + accepted types).
 *
 * Renders with the built-in fallback until the fetch resolves — the same defaults the
 * backend enforces, so the dropzone is never briefly wrong — then re-renders with the
 * real policy. The fetch itself is cached for the whole session by
 * `resolveAttachmentPolicy`, so mounting this in twenty tabs costs one request.
 *
 * @param {object} params
 * @param {string} [params.apiBaseUrl] - Spec URL or API root; the spec segment is stripped.
 * @param {string} [params.token]      - Bearer token, when the caller holds one explicitly.
 * @param {boolean} [params.enabled]   - Gate the fetch (e.g. only when the tab is active).
 * @returns {object} The policy: `{ maxSizeMB, allowedMimeTypes, allowedExtensions, typeGroups, degraded }`.
 */
export function useAttachmentPolicy({ apiBaseUrl, token, enabled = true } = {}) {
  // Same normalization as useAttachments: apiBaseUrl may be a full spec URL
  // (http://host/sws/neo/sales-order) and this endpoint is transversal.
  const base = apiBaseUrl ? apiBaseUrl.split('/sws/neo/')[0] : '';
  const apiFetch = useApiFetch(base);
  const [policy, setPolicy] = useState(FALLBACK_ATTACHMENT_POLICY);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    resolveAttachmentPolicy(apiFetch, { token }).then((resolved) => {
      if (!cancelled) setPolicy(resolved);
    });
    return () => { cancelled = true; };
  }, [apiFetch, token, enabled]);

  return policy;
}
